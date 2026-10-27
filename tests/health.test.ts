import { beforeEach, describe, expect, it, vi } from "vitest";
import { query } from "@/lib/db";
import { GET } from "../src/app/api/health/route";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("répond ok après le contrôle SQL et interdit la mise en cache", async () => {
    vi.mocked(query).mockResolvedValue([{ value: 1 }]);

    const response = await GET();

    expect(query).toHaveBeenCalledExactlyOnceWith("SELECT 1");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("masque le détail de l'erreur et répond indisponible", async () => {
    vi.mocked(query).mockRejectedValue(new Error("Détail interne de connexion"));

    const response = await GET();

    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "erreur" });
  });
});
