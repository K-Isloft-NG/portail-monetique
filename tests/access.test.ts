import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAuthorizedSiren, getClientCompany, getMerchants, requireProfile } from "@/lib/access";
import { PROFILE_PATHS, type Profile, type VerifiedSession } from "@/lib/session";

const mocks = vi.hoisted(() => ({ query: vi.fn(), readSession: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/session", async (original) => ({ ...await original<typeof import("@/lib/session")>(), readSession: mocks.readSession }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); },
  notFound: () => { throw new Error("NOT_FOUND"); },
}));

const CLIENT: VerifiedSession = { sessionId: "12345678-1234-4123-8123-123456789abc", id: 1, login: "compte-test", profile: "client", siren: "100000001" };
const PROFILES: Profile[] = ["admin", "po", "client"];

function sessionFor(profile: Profile): VerifiedSession {
  return profile === "client" ? CLIENT : { ...CLIENT, profile, siren: null };
}

describe("accès", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.readSession.mockResolvedValue(CLIENT);
    mocks.query.mockResolvedValue([{ ...CLIENT, est_actif: true }]);
  });

  it("refuse une absence de session avant toute lecture SQL", async () => {
    mocks.readSession.mockResolvedValue(null);
    await expect(requireProfile("client")).rejects.toThrow("REDIRECT:/login");
    expect(mocks.query).not.toHaveBeenCalled();
  });

  for (const actual of PROFILES) {
    for (const requested of PROFILES) {
      it(`contrôle ${actual} vers ${requested}`, async () => {
        const session = sessionFor(actual);
        mocks.readSession.mockResolvedValue(session);
        mocks.query.mockResolvedValue([{ ...session, est_actif: true }]);
        if (actual === requested) {
          expect(await requireProfile(requested)).toEqual(session);
        } else {
          await expect(requireProfile(requested)).rejects.toThrow(`REDIRECT:${PROFILE_PATHS[actual]}`);
        }
        expect(mocks.query.mock.calls[0][0]).not.toContain("FROM entreprises");
        expect(mocks.query.mock.calls[0][1]).toEqual([session.id, session.sessionId]);
      });
    }
  }

  it.each([{ est_actif: false }, { siren: "100000002" }, { profile: "po", siren: null }])(
    "refuse une identité devenue obsolète (%j)", async (changes) => {
      mocks.query.mockResolvedValue([{ ...CLIENT, est_actif: true, ...changes }]);
      await expect(requireProfile("client")).rejects.toThrow("REDIRECT:/login");
    },
  );

  it("refuse un compte supprimé", async () => {
    mocks.query.mockResolvedValue([]);
    await expect(requireProfile("client")).rejects.toThrow("REDIRECT:/login");
  });

  it("masque les erreurs du pilote dans les pages protégées", async () => {
    mocks.query.mockRejectedValueOnce(new Error("Détail interne"));
    await expect(requireProfile("client")).rejects.toThrow("Lecture des données indisponible.");
  });

  it("renvoie une page introuvable pour une entreprise absente après la garde", async () => {
    mocks.query.mockResolvedValueOnce([{ ...CLIENT, est_actif: true }]).mockResolvedValueOnce([]);
    await expect(getClientCompany(CLIENT.siren)).rejects.toThrow("NOT_FOUND");
  });

  it("obtient le SIREN exclusivement dans la session", () => {
    expect(getAuthorizedSiren(CLIENT)).toBe(CLIENT.siren);
    expect(getAuthorizedSiren(CLIENT, CLIENT.siren)).toBe(CLIENT.siren);
    expect(() => getAuthorizedSiren(CLIENT, "100000002")).toThrow("REDIRECT:/client");
  });

  it.each(["admin", "po"] as const)("refuse de fournir un SIREN au profil %s", (profile) => {
    expect(() => getAuthorizedSiren(sessionFor(profile))).toThrow(`REDIRECT:${PROFILE_PATHS[profile]}`);
  });

  it("filtre la lecture de l'entreprise avec le SIREN autorisé", async () => {
    const company = { numero_siren: CLIENT.siren, raison_sociale: "Entreprise fictive" };
    mocks.query.mockResolvedValueOnce([{ ...CLIENT, est_actif: true }]).mockResolvedValueOnce([company]);
    expect(await getClientCompany(CLIENT.siren)).toEqual({ session: CLIENT, company });
    expect(mocks.query.mock.calls[1][0]).toContain("WHERE numero_siren = $1");
    expect(mocks.query.mock.calls[1][1]).toEqual([CLIENT.siren]);
  });

  it.each([
    ["100000001", "100000002"],
    ["100000002", "100000001"],
  ])("refuse le passage de %s vers %s avant de lire une entreprise", async (ownSiren, foreignSiren) => {
    const session = { ...CLIENT, siren: ownSiren };
    mocks.readSession.mockResolvedValue(session);
    mocks.query.mockResolvedValue([{ ...session, est_actif: true }]);
    await expect(getClientCompany(foreignSiren)).rejects.toThrow("REDIRECT:/client");
    expect(mocks.query).toHaveBeenCalledOnce();
  });

  it("ne renvoie aucune entreprise à l'administrateur", async () => {
    const admin = sessionFor("admin");
    mocks.readSession.mockResolvedValue(admin);
    mocks.query.mockResolvedValue([{ ...admin, est_actif: true }]);
    await expect(getClientCompany("100000001")).rejects.toThrow("REDIRECT:/admin");
    await expect(getMerchants()).rejects.toThrow("REDIRECT:/admin");
    expect(mocks.query.mock.calls.every(([sql]) => !sql.includes("FROM entreprises"))).toBe(true);
  });

  it("réserve au PO la liste complète sans filtre SIREN", async () => {
    const po = sessionFor("po");
    const merchants = [{ numero_siren: "100000001", raison_sociale: "Entreprise fictive" }];
    mocks.readSession.mockResolvedValue(po);
    mocks.query.mockResolvedValueOnce([{ ...po, est_actif: true }]).mockResolvedValueOnce(merchants);
    expect(await getMerchants()).toEqual({ session: po, merchants });
    expect(mocks.query.mock.calls[1][0]).toBe("SELECT numero_siren, raison_sociale FROM entreprises ORDER BY raison_sociale");
  });
});
