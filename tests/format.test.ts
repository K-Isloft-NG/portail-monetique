import { describe, expect, it } from "vitest";
import { formatCard, formatMontant, formatSiren } from "@/lib/format";

describe("formats français", () => {
  it("groupe le SIREN et conserve les zéros initiaux", () => {
    expect(formatSiren("100000001")).toBe("100\u00a0000\u00a0001");
    expect(formatSiren("001234567")).toBe("001\u00a0234\u00a0567");
  });
  it.each(["", "123", "abcdefghi", null])("signale un SIREN invalide", (value) => expect(formatSiren(value)).toBe("Non renseigné"));
  it.each([[1234.5, "1\u00a0234,50"], [0, "0,00"], [-84.9, "−84,90"], [1234567.89, "1\u00a0234\u00a0567,89"], ["1234.5", "1\u00a0234,50"], ["-1234.5", "−1\u00a0234,50"]])("formate %s", (value, expected) => expect(formatMontant(value)).toBe(expected));
  it.each(["", "abc", "1,2", Infinity, NaN])("signale un montant invalide", (value) => expect(formatMontant(value)).toBe("Non renseigné"));
  it("conserve une carte masquée et masque une source non masquée", () => {
    const expected = "12345*******5896";
    expect(formatCard(expected)).toBe(expected);
    expect(formatCard("12345" + "0".repeat(7) + "5896")).toBe(expected);
  });
  it.each([undefined, null, "", "12345", "*".repeat(17)])("signale une carte absente ou de longueur incorrecte", value => expect(formatCard(value)).toBe("Non renseigné"));
});
