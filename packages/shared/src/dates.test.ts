import { describe, expect, it } from "vitest";
import { diaLocal, diasEntre, somarDias } from "./dates";

describe("datas no fuso de São Paulo", () => {
  it("02:00 UTC ainda é o dia anterior em SP", () => {
    expect(diaLocal(new Date("2026-10-30T02:00:00Z"))).toBe("2026-10-29");
  });

  it("soma e diferença de dias", () => {
    expect(somarDias("2026-10-29", 3)).toBe("2026-11-01");
    expect(diasEntre("2026-10-01", "2026-10-31")).toBe(30);
  });
});
