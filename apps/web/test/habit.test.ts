import { describe, expect, it } from "vitest";
import { reminderIcs } from "../src/lib/habit.ts";

describe("lembrete na agenda", () => {
  const link = "https://ritmo180.onrender.com";

  it("todo dia, na hora escolhida, com aviso", () => {
    const ics = reminderIcs({ time: "19:30", every: "day", title: "Ritmo 180: passos de hoje", text: "Abra o Ritmo 180.", link }, new Date(2026, 10, 20, 10));
    const lines = ics.split("\r\n");
    expect(lines).toContain("DTSTART:20261120T193000");
    expect(lines).toContain("DTEND:20261120T200000");
    expect(lines).toContain("RRULE:FREQ=DAILY");
    expect(lines).toContain("TRIGGER:PT0M");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
  });

  it("para a família, começa no próximo domingo e repete toda semana", () => {
    // 20/11/2026 é sexta-feira; o próximo domingo é 22/11.
    const ics = reminderIcs({ time: "19:00", every: "sunday", title: "Semana, do estudante; resumo", text: "Veja.", link }, new Date(2026, 10, 20, 10));
    expect(ics).toContain("DTSTART:20261122T190000");
    expect(ics).toContain("RRULE:FREQ=WEEKLY;BYDAY=SU");
    expect(ics).toContain("SUMMARY:Semana\\, do estudante\\; resumo");
  });

  it("não passa da meia-noite no fim do evento", () => {
    expect(reminderIcs({ time: "23:50", every: "day", title: "x", text: "y", link }, new Date(2026, 10, 20))).toContain("DTEND:20261120T235900");
  });
});
