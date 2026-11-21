import { describe, expect, it } from "vitest";
import { COMMAND_MODULES, COMMAND_PROTOCOL } from "@ritmo/contracts";

describe("leitura de comando", () => {
  it("tem três módulos, sete movimentos e questões sem repetição", () => {
    expect(COMMAND_MODULES.map((m) => m.id)).toEqual(["L1", "L2", "L3"]);
    expect(COMMAND_PROTOCOL).toHaveLength(7);
    const all = COMMAND_MODULES.flatMap((m) => m.items.map((i) => i.externalId));
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(17);
  });

  it("toda questão explica pelo menos uma alternativa errada", () => {
    for (const m of COMMAND_MODULES) for (const item of m.items) expect(Object.keys(item.traps).length).toBeGreaterThan(0);
  });
});
