import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), compare: vi.fn(), hash: vi.fn(), createSession: vi.fn(), deleteSession: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("bcryptjs", () => ({ compare: mocks.compare, hash: mocks.hash }));
vi.mock("@/lib/session", async (original) => ({
  ...await original<typeof import("@/lib/session")>(),
  createSession: mocks.createSession,
  deleteSession: mocks.deleteSession,
}));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));

let authenticate: typeof import("@/lib/auth").authenticate;
let password: string;
let account: Record<string, unknown>;

describe("authentification", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.resetAllMocks();
    ({ authenticate } = await import("@/lib/auth"));
    password = randomBytes(20).toString("hex");
    account = {
      id: 7, login: "compte-test", profile: "client", siren: "100000001",
      mot_de_passe_hash: randomBytes(32).toString("hex"), est_actif: true,
    };
    mocks.hash.mockResolvedValue(randomBytes(32).toString("hex"));
    mocks.compare.mockResolvedValue(false);
  });

  it("compare aussi un compte inconnu, avec un secours de coût 10", async () => {
    mocks.query.mockResolvedValueOnce([]);
    expect(await authenticate("inconnu", password)).toEqual({ ok: false, warning: false });
    expect(mocks.compare).toHaveBeenCalledOnce();
    expect(mocks.hash.mock.calls[0][1]).toBe(10);
    expect(mocks.query).toHaveBeenCalledOnce();
  });

  it("traite de la même façon les refus sur compte inconnu et mauvais mot de passe", async () => {
    mocks.query.mockResolvedValueOnce([]).mockResolvedValueOnce([account]).mockResolvedValueOnce([{ tentatives_echouees: 1 }]);
    const unknown = await authenticate("inconnu", password);
    const incorrect = await authenticate("compte-test", password);
    expect(incorrect).toEqual(unknown);
    expect(mocks.compare).toHaveBeenCalledTimes(2);
  });

  it.each([1, 2, 3, 32767])("utilise le compteur en base après l'échec %i", async (count) => {
    mocks.query.mockResolvedValueOnce([account]).mockResolvedValueOnce([{ tentatives_echouees: count }]);
    expect(await authenticate("compte-test", password)).toEqual({ ok: false, warning: count === 2 });
    const [sql, parameters] = mocks.query.mock.calls[1];
    expect(sql).toContain("LEAST(tentatives_echouees::integer + 1, 32767)");
    expect(sql).toContain("WHERE id = $1 RETURNING");
    expect(parameters).toEqual([7]);
  });

  it("remet le compteur à zéro et ne retourne que les données de session", async () => {
    mocks.compare.mockResolvedValue(true);
    mocks.query.mockResolvedValueOnce([account]).mockResolvedValueOnce([{ id: 7 }]);
    const result = await authenticate("compte-test", password);
    expect(result).toEqual({ ok: true, user: { id: 7, login: "compte-test", profile: "client", siren: "100000001" } });
    expect(mocks.query.mock.calls[1][0]).toContain("SET tentatives_echouees = 0");
    expect(mocks.query.mock.calls[1][1]).toEqual([7]);
  });

  it.each(["admin", "po"])("accepte un profil %s sans SIREN", async (profile) => {
    mocks.compare.mockResolvedValue(true);
    mocks.query.mockResolvedValueOnce([{ ...account, profile, siren: null }]).mockResolvedValueOnce([{ id: 7 }]);
    const result = await authenticate("compte-test", password);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.user.profile).toBe(profile);
  });

  it("refuse un compte inactif même avec le bon mot de passe", async () => {
    mocks.compare.mockResolvedValue(true);
    mocks.query.mockResolvedValueOnce([{ ...account, est_actif: false }]);
    expect(await authenticate("compte-test", password)).toEqual({ ok: false, warning: false });
    expect(mocks.compare).toHaveBeenCalledOnce();
    expect(mocks.query).toHaveBeenCalledOnce();
  });

  it("refuse un rattachement incohérent", async () => {
    mocks.compare.mockResolvedValue(true);
    mocks.query.mockResolvedValueOnce([{ ...account, siren: null }]);
    expect(await authenticate("compte-test", password)).toEqual({ ok: false, warning: false });
    expect(mocks.query).toHaveBeenCalledOnce();
  });

  it("ne renvoie pas de succès si le compte devient inactif pendant la tentative", async () => {
    mocks.compare.mockResolvedValue(true);
    mocks.query.mockResolvedValueOnce([account]).mockResolvedValueOnce([]);
    expect(await authenticate("compte-test", password)).toEqual({ ok: false, warning: false });
  });

  it("sépare le texte de la recherche et les valeurs saisies", async () => {
    const input = "' OR '1'='1";
    mocks.query.mockResolvedValueOnce([]);
    await authenticate(input, password);
    expect(mocks.query.mock.calls[0][0]).toContain("WHERE u.login = $1");
    expect(mocks.query.mock.calls[0][0].includes(input)).toBe(false);
    expect(mocks.query.mock.calls[0][1]).toEqual([input]);
  });

  it.each([undefined, "", "é".repeat(37)])("refuse une saisie de mot de passe invalide sans ignorer bcrypt", async (value) => {
    expect(await authenticate("compte-test", value)).toEqual({ ok: false, warning: false });
    expect(mocks.compare).toHaveBeenCalledOnce();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("ne retourne pas de session si la remise à zéro échoue", async () => {
    mocks.compare.mockResolvedValue(true);
    mocks.query.mockResolvedValueOnce([account]).mockRejectedValueOnce(new Error("Indisponible"));
    await expect(authenticate("compte-test", password)).rejects.toThrow("Indisponible");
  });

  it("authentifie avec une comparaison bcrypt réelle sur une empreinte de coût 10", async () => {
    const bcrypt = await vi.importActual<typeof import("bcryptjs")>("bcryptjs");
    account.mot_de_passe_hash = await bcrypt.hash(password, 10);
    mocks.hash.mockImplementation(bcrypt.hash);
    mocks.compare.mockImplementation(bcrypt.compare);
    mocks.query.mockResolvedValueOnce([account]).mockResolvedValueOnce([{ id: 7 }]);
    expect((await authenticate("compte-test", password)).ok).toBe(true);

    mocks.query.mockResolvedValueOnce([account]).mockResolvedValueOnce([{ tentatives_echouees: 1 }]);
    expect(await authenticate("compte-test", randomBytes(20).toString("hex"))).toEqual({ ok: false, warning: false });
    const fallback = await mocks.hash.mock.results[0].value;
    expect(bcrypt.getRounds(fallback)).toBe(10);
  });

  function loginForm() {
    const form = new FormData();
    form.set("login", "compte-test");
    form.set("password", password);
    return form;
  }

  it("renvoie le même message public aux deux refus sans créer de cookie", async () => {
    const { loginAction } = await import("@/app/login/actions");
    mocks.query.mockResolvedValueOnce([]).mockResolvedValueOnce([account]).mockResolvedValueOnce([{ tentatives_echouees: 1 }]);
    const first = await loginAction({}, loginForm());
    const second = await loginAction({}, loginForm());
    expect(first).toEqual({ error: "Identifiant ou mot de passe incorrect.", warning: false });
    expect(second).toEqual(first);
    expect(mocks.createSession).not.toHaveBeenCalled();
    expect(mocks.deleteSession).toHaveBeenCalledTimes(2);
  });

  it("ignore le profil et le SIREN injectés dans un formulaire", async () => {
    const { loginAction } = await import("@/app/login/actions");
    mocks.compare.mockResolvedValue(true);
    mocks.query.mockResolvedValueOnce([account]).mockResolvedValueOnce([{ id: 7 }]);
    const form = loginForm();
    form.set("profile", "admin");
    form.set("siren", "100000002");
    await expect(loginAction({}, form)).rejects.toThrow("REDIRECT:/client");
    expect(mocks.createSession).toHaveBeenCalledWith({ id: 7, login: "compte-test", profile: "client", siren: "100000001" });
  });

  it("masque les erreurs SQL dans le retour du formulaire", async () => {
    const { loginAction } = await import("@/app/login/actions");
    mocks.query.mockRejectedValueOnce(new Error(randomBytes(32).toString("hex")));
    expect(await loginAction({}, loginForm())).toEqual({ error: "Connexion indisponible. Réessayez plus tard." });
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("refuse la connexion si le cookie ne peut pas être signé", async () => {
    const { loginAction } = await import("@/app/login/actions");
    mocks.compare.mockResolvedValue(true);
    mocks.query.mockResolvedValueOnce([account]).mockResolvedValueOnce([{ id: 7 }]);
    mocks.createSession.mockRejectedValueOnce(new Error("Configuration absente"));
    expect(await loginAction({}, loginForm())).toEqual({ error: "Connexion indisponible. Réessayez plus tard." });
  });

  it("supprime la session avant la redirection de déconnexion", async () => {
    const { logoutAction } = await import("@/app/login/actions");
    await expect(logoutAction()).rejects.toThrow("REDIRECT:/login");
    expect(mocks.deleteSession).toHaveBeenCalledOnce();
  });
});
