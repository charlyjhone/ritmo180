import { randomUUID } from "node:crypto";
import { CreateAssignment, FamilyMessageInput, NotifyFamily, ResolveFlag, type Role } from "@ritmo/contracts";
import { HttpError, type ModuleRoutes } from "../../platform/http.ts";
import { audit, requireActor, tenantOf } from "../identity/index.ts";
import { createAssignment } from "../practice/index.ts";
import { networkDashboard } from "./network.ts";
import { schoolDashboard } from "./school.ts";
import { assertGuardianOf, familyChildren, studentDashboard } from "./student.ts";
import { teacherClasses, teacherDashboard } from "./teacher.ts";

const STAFF: Role[] = ["teacher", "coordinator"];

export const insightsRoutes: ModuleRoutes = (app, { db, now }) => {
  app.get("/api/insights/student", async (request) => {
    const actor = requireActor(request, "student");
    return db.tenant(tenantOf(actor), (tx) => studentDashboard(tx, actor, now()));
  });

  app.get("/api/teacher/classes", async (request) => {
    const actor = requireActor(request, ...STAFF);
    return db.tenant(tenantOf(actor), (tx) => teacherClasses(tx, actor));
  });

  app.get<{ Params: { id: string } }>("/api/teacher/classes/:id", async (request) => {
    const actor = requireActor(request, ...STAFF);
    return db.tenant(tenantOf(actor), async (tx) => {
      const dashboard = await teacherDashboard(tx, actor, request.params.id, now());
      await audit(tx, actor, actor.schoolId!, "class.view", request.params.id);
      return dashboard;
    });
  });

  app.post("/api/teacher/assignments", async (request) => {
    const actor = requireActor(request, ...STAFF);
    const input = CreateAssignment.parse(request.body);
    const id = await db.tenant(tenantOf(actor), async (tx) => {
      if (!(await teacherClasses(tx, actor)).some((c) => c.id === input.classId)) throw new HttpError(403, "forbidden", "Esta turma não está atribuída a você.");
      if (input.studentId && !(await tx.query(`SELECT 1 FROM class_students WHERE class_id = $1 AND student_id = $2`, [input.classId, input.studentId])).length) throw new HttpError(400, "bad_student", "Este aluno não está na turma.");
      return createAssignment(tx, { ...input, schoolId: actor.schoolId!, teacherId: actor.id });
    });
    return { id };
  });

  app.post<{ Params: { id: string } }>("/api/teacher/flags/:id", async (request) => {
    const actor = requireActor(request, ...STAFF);
    const { resolution } = ResolveFlag.parse(request.body);
    await db.system(async (tx) => {
      const flag = (await tx.query(`UPDATE item_flags SET status = $2, resolved_by = $3 WHERE id = $1 AND status = 'open' RETURNING item_id`, [request.params.id, resolution, actor.id]))[0];
      if (!flag) throw new HttpError(404, "not_found", "Sinalização não encontrada.");
      if (resolution === "retired") await tx.query(`UPDATE items SET status = 'retired', updated_at = now() WHERE id = $1`, [flag.item_id]);
    });
    return { ok: true };
  });

  app.post("/api/teacher/notify-family", async (request) => {
    const actor = requireActor(request, ...STAFF);
    const { studentId, message } = NotifyFamily.parse(request.body);
    await db.tenant(tenantOf(actor), async (tx) => {
      await tx.query(`INSERT INTO family_messages (id, school_id, student_id, direction, author, body) VALUES ($1,$2,$3,'to_family',$4,$5)`, [randomUUID(), actor.schoolId, studentId, actor.name, message]);
    });
    return { ok: true };
  });

  app.get("/api/insights/school", async (request) => {
    const actor = requireActor(request, "coordinator");
    return db.tenant(tenantOf(actor), (tx) => schoolDashboard(tx, actor.schoolId!, now()));
  });

  app.post<{ Params: { id: string } }>("/api/school/messages/:id/read", async (request) => {
    const actor = requireActor(request, "coordinator");
    await db.tenant(tenantOf(actor), (tx) => tx.query(`UPDATE family_messages SET read_at = $2 WHERE id = $1`, [request.params.id, new Date(now())]));
    return { ok: true };
  });

  app.get("/api/insights/family", async (request) => {
    const actor = requireActor(request, "guardian");
    return db.tenant(tenantOf(actor), (tx) => familyChildren(tx, actor.id, now()));
  });

  app.post("/api/family/messages", async (request) => {
    const actor = requireActor(request, "guardian");
    const { studentId, body } = FamilyMessageInput.parse(request.body);
    await db.tenant(tenantOf(actor), async (tx) => {
      await assertGuardianOf(tx, actor.id, studentId);
      await tx.query(`INSERT INTO family_messages (id, school_id, guardian_id, student_id, direction, author, body) VALUES ($1,$2,$3,$4,'to_school',$5,$6)`, [randomUUID(), actor.schoolId, actor.id, studentId, actor.name, body]);
    });
    return { ok: true };
  });

  app.get("/api/insights/network", async (request) => {
    requireActor(request, "network_admin");
    return db.network((tx) => networkDashboard(tx, now()));
  });
};
