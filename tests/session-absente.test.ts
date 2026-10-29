import { randomBytes } from "node:crypto";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { signSession, SESSION_DURATION } from "@/lib/session";
import AdminPage from "@/app/admin/page";
import { createAccountAction } from "@/app/admin/actions";
import { GET } from "@/app/export/tresorerie/route";
const mocks = vi.hoisted(() => ({ query: vi.fn(), token: "" }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: mocks.token }) }) }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error("REDIRECT:" + path); } }));
describe("cookie signé sans session persistante", () => {
  beforeEach(async () => {
    vi.stubEnv("SESSION_SECRET", randomBytes(32).toString("hex")); mocks.query.mockReset(); mocks.query.mockResolvedValue([]);
    const now = Math.floor(Date.now() / 1000);
    mocks.token = await signSession({ id: 1, login: "compte-test", profile: "admin", siren: null }, { sessionId: "12345678-1234-4123-8123-123456789abc", issuedAt: now, expiresAt: now + SESSION_DURATION });
  });
  afterEach(() => vi.unstubAllEnvs());
  it.each([
    () => AdminPage({ searchParams: Promise.resolve({}) }),
    () => createAccountAction({}, new FormData()),
    () => GET(new Request("http://localhost/export/tresorerie?date=invalide")),
  ])("refuse avant toute donnée métier", async action => {
    await expect(action()).rejects.toThrow("REDIRECT:/login"); expect(mocks.query).toHaveBeenCalledOnce();
    const [sql, params] = mocks.query.mock.calls[0]; expect(sql).toContain("JOIN public.sessions"); expect(params).toHaveLength(2);
  });
});
