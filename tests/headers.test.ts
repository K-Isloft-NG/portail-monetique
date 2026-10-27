import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

async function readHeaders() {
  const rules = await nextConfig.headers?.();
  const rule = rules?.find((item) => item.source === "/:path*");
  return new Map((rule?.headers ?? []).map((header) => [header.key, header.value]));
}

describe("en-têtes de sécurité", () => {
  it("s'appliquent à toutes les routes", async () => {
    const rules = await nextConfig.headers?.();
    expect(rules).toHaveLength(1);
    expect(rules?.[0].source).toBe("/:path*");
  });

  it("interdisent l'affichage dans un cadre et la devinette de type", async () => {
    const headers = await readHeaders();
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("limitent le référent et les fonctions du navigateur", async () => {
    const headers = await readHeaders();
    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("Permissions-Policy")).toContain("camera=()");
  });
});
