import { beforeEach, describe, expect, it, vi } from "vitest";
import { revokeCurrentSession, revokeAllSessions, purgeExpiredSessions } from "@/lib/session-store";
import { logoutAction, logoutAllAction, loginAction } from "@/app/login/actions";
const mocks = vi.hoisted(() => ({ query: vi.fn(), read: vi.fn(), remove: vi.fn(), authenticate: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/auth", () => ({ authenticate: mocks.authenticate, AUTH_ERROR: "Refus" }));
vi.mock("@/lib/session", async original => ({ ...await original<typeof import("@/lib/session")>(), readSession: mocks.read, deleteSession: mocks.remove, createSession: mocks.create }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error("REDIRECT:" + path); } }));
const session = { id: 7, login: "compte-test", profile: "client" as const, siren: "100000001", sessionId: "12345678-1234-4123-8123-123456789abc" };
describe("révocation des sessions", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.query.mockResolvedValue([]); mocks.read.mockResolvedValue(session); });
  it("limite la révocation courante à son propriétaire", async () => {
    await revokeCurrentSession(session); const [sql, params] = mocks.query.mock.calls[0];
    expect(params).toEqual([session.sessionId, session.id]); expect(sql).toContain("utilisateur_id = $2"); expect(sql).toContain("date_revocation IS NULL");
  });
  it("conditionne la globale à une session et une identité encore valables", async () => {
    await revokeAllSessions(session); const [sql, params] = mocks.query.mock.calls[0];
    expect(params).toEqual([7, session.sessionId, "client", "100000001"]);
    for (const clause of ["current_session.id = $2::uuid", "current_session.date_revocation IS NULL", "current_session.date_expiration > NOW()", "u.est_actif = TRUE", "p.libelle = $3", "IS NOT DISTINCT FROM $4"]) expect(sql).toContain(clause);
  });
  it.each([revokeCurrentSession, revokeAllSessions])("masque une erreur du pilote", async action => {
    mocks.query.mockRejectedValue(new Error("Détail privé")); await expect(action(session)).rejects.toThrow("Déconnexion indisponible. Réessayez.");
  });
  it("borne la purge et ne cible que les anciennes expirations", async () => {
    await purgeExpiredSessions(); const sql = mocks.query.mock.calls[0][0];
    for (const text of ["LIMIT 100", "INTERVAL '1 day'", "FOR UPDATE SKIP LOCKED", "WHERE s.id = old.id"]) expect(sql).toContain(text);
  });
  it("ne fait pas échouer la connexion si la purge échoue", async () => { mocks.query.mockRejectedValue(new Error("Purge indisponible")); await expect(purgeExpiredSessions()).resolves.toBeUndefined(); });
  for (const action of [logoutAction, logoutAllAction]) {
    it("révoque avant effacement et redirection, même si aucune ligne ne revient", async () => {
      await expect(action()).rejects.toThrow("REDIRECT:/login");
      expect(mocks.query).toHaveBeenCalledOnce(); expect(mocks.remove).toHaveBeenCalledOnce();
      expect(mocks.query.mock.invocationCallOrder[0]).toBeLessThan(mocks.remove.mock.invocationCallOrder[0]);
    });
    it("garde le cookie si la révocation n'est pas confirmée", async () => {
      mocks.query.mockRejectedValue(new Error("Indisponible"));
      expect(await action()).toEqual({ error: "Déconnexion indisponible. Réessayez." }); expect(mocks.remove).not.toHaveBeenCalled();
    });
    it("nettoie un cookie absent ou ancien sans SQL non vérifié", async () => {
      mocks.read.mockResolvedValue(null); await expect(action()).rejects.toThrow("REDIRECT:/login"); expect(mocks.query).not.toHaveBeenCalled(); expect(mocks.remove).toHaveBeenCalledOnce();
    });
    it("accepte une répétition sans rétablir de session", async () => {
      for (let i = 0; i < 2; i++) await expect(action()).rejects.toThrow("REDIRECT:/login"); expect(mocks.create).not.toHaveBeenCalled();
    });
  }
  it("révoque l'ancienne connexion avant une nouvelle tentative refusée", async () => {
    mocks.authenticate.mockResolvedValue({ ok: false, reason: "invalid" });
    await loginAction({}, new FormData()); expect(mocks.query.mock.invocationCallOrder[0]).toBeLessThan(mocks.remove.mock.invocationCallOrder[0]);
    expect(mocks.remove.mock.invocationCallOrder[0]).toBeLessThan(mocks.authenticate.mock.invocationCallOrder[0]); expect(mocks.create).not.toHaveBeenCalled();
  });
  it("interrompt une nouvelle tentative si l'ancienne révocation échoue", async () => {
    mocks.query.mockRejectedValue(new Error("Indisponible")); expect(await loginAction({}, new FormData())).toEqual({ error: "Connexion indisponible. Réessayez plus tard." });
    expect(mocks.authenticate).not.toHaveBeenCalled(); expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("un second appel global conserve les conditions qui protègent les nouvelles sessions", async () => {
    await revokeAllSessions(session); await revokeAllSessions(session);
    expect(mocks.query.mock.calls[1][0]).toContain("current_session.date_revocation IS NULL");
  });
});
