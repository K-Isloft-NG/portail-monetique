import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { neon } from "@neondatabase/serverless";
import { query } from "../src/lib/db";

vi.mock("@neondatabase/serverless", () => ({ neon: vi.fn() }));

describe("query", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([undefined, "", "   "])(
    "refuse une configuration absente ou vide (%s) avant de créer le client",
    async (value) => {
      vi.stubEnv("DATABASE_URL", value);

      await expect(query("SELECT 1")).rejects.toThrow(
        "La variable DATABASE_URL est absente ou vide.",
      );
      expect(neon).not.toHaveBeenCalled();
    },
  );

  it("transmet le SQL et ses paramètres séparément sans accès réseau", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://example.invalid/test");
    const execute = vi.fn().mockResolvedValue([{ value: "test" }]);
    // Seule l'interface utilisée est simulée, aucun client réel n'est créé.
    vi.mocked(neon).mockReturnValue({ query: execute } as unknown as ReturnType<typeof neon>);

    const rows = await query("SELECT $1 AS value", ["test"]);

    expect(execute).toHaveBeenCalledExactlyOnceWith("SELECT $1 AS value", ["test"]);
    expect(rows).toEqual([{ value: "test" }]);
  });
});
