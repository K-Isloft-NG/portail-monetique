import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), compare: vi.fn(), hash: vi.fn(), createSession: vi.fn(), deleteSession: vi.fn(), readSession: vi.fn(), revoke: vi.fn(), purge: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("bcryptjs", () => ({ compare: mocks.compare, hash: mocks.hash }));
vi.mock("@/lib/session", async (original) => ({
  ...await original<typeof import("@/lib/session")>(),
  createSession: mocks.createSession,
  deleteSession: mocks.deleteSession,
  readSession: mocks.readSession,
}));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));

vi.mock("@/lib/session-store", () => ({ revokeCurrentSession: mocks.revoke, revokeAllSessions: mocks.revoke, purgeExpiredSessions: mocks.purge }));
let authenticate: typeof import("@/lib/auth").authenticate;
let password: string;
let account: Record<string, unknown>;

describe("authentification", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.resetAllMocks();
    ({ authenticate } = await import("@/lib/auth"));
    password = randomBytes(20).toString("hex");
    account = { session_id: "12345678-1234-4123-8123-123456789abc", issued_at: 1000, expires_at: 29800,
      id: 7, login: "compte-test", profile: "client", siren: "100000001",
      mot_de_passe_hash: randomBytes(32).toString("hex"), est_actif: true,
      is_blocked: false, wait_minutes: 0,
    };
    mocks.hash.mockResolvedValue(randomBytes(32).toString("hex"));
    mocks.readSession.mockResolvedValue(null);
    mocks.compare.mockResolvedValue(false);
  });

  it("compare aussi un compte inconnu, avec un secours de coût 10", async () => {
    mocks.query.mockResolvedValueOnce([]);
    expect(await authenticate("inconnu", password)).toEqual({ ok: false, reason: "invalid" });
    expect(mocks.compare).toHaveBeenCalledOnce();
    expect(mocks.hash.mock.calls[0][1]).toBe(10);
    expect(mocks.query).toHaveBeenCalledOnce();
  });
  it("ne donne jamais d'avertissement après deux essais d'un identifiant inconnu", async () => {
    mocks.query.mockResolvedValue([]);
    for (let i = 0; i < 2; i++) {
      expect(await authenticate("inconnu", password)).toEqual({ ok: false, reason: "invalid" });
    }
    expect(mocks.compare).toHaveBeenCalledTimes(2);
    expect(mocks.query).toHaveBeenCalledTimes(2);
    expect(mocks.query.mock.calls.every(([sql]) => sql.startsWith("SELECT"))).toBe(true);
  });

  it("traite de la même façon les refus sur compte inconnu et mauvais mot de passe", async () => {
    mocks.query.mockResolvedValueOnce([]).mockResolvedValueOnce([account]).mockResolvedValueOnce([{ tentatives_echouees: 1 }]);
    const unknown = await authenticate("inconnu", password);
    const incorrect = await authenticate("compte-test", password);
    expect(incorrect).toEqual(unknown);
    expect(mocks.compare).toHaveBeenCalledTimes(2);
  });

  it.each([1, 2, 3, 32767])("interprète le compteur retourné après l'échec %i", async (count) => {
    const blocked = count >= 3;
    mocks.query.mockResolvedValueOnce([account]).mockResolvedValueOnce([{
      tentatives_echouees: Math.min(count, 3), is_blocked: blocked, wait_minutes: blocked ? 15 : 0,
    }]);
    expect(await authenticate("compte-test", password)).toEqual(blocked
      ? { ok: false, reason: "blocked", minutes: 15 }
      : { ok: false, reason: count === 2 ? "warning" : "invalid" });
    const [sql, parameters] = mocks.query.mock.calls[1];
    expect(sql).toContain("LEAST(tentatives_echouees::integer + 1, 3)");
    expect(sql).toContain("WHERE id = $1 AND est_actif = TRUE");
    expect(sql).toContain("AND (bloque_jusqua IS NULL OR bloque_jusqua <= NOW())");
    expect(sql).toContain("WHEN tentatives_echouees >= 2 THEN NOW() + INTERVAL '15 minutes'");
    expect(parameters).toEqual([7]);
  });

  it("attribue un UUID neuf à chaque succès, sans reprendre le formulaire", async () => {
    mocks.compare.mockResolvedValue(true); mocks.query.mockResolvedValue([account]);
    await Promise.all([authenticate("compte-test", password), authenticate("compte-test", password)]);
    const writes = mocks.query.mock.calls.filter(([sql]) => sql.includes("INSERT INTO public.sessions"));
    expect(writes).toHaveLength(2); expect(writes[0][1][2] === writes[1][1][2]).toBe(false);
    expect(writes[0][1][3]).toBe(28800);
  });
  it("remet le compteur à zéro et ne retourne que les données de session", async () => {
    mocks.compare.mockResolvedValue(true);
    mocks.query.mockResolvedValueOnce([account]).mockResolvedValueOnce([account]);
    const result = await authenticate("compte-test", password);
    expect(result).toEqual({ ok: true, session: { sessionId: "12345678-1234-4123-8123-123456789abc", issuedAt: 1000, expiresAt: 29800 }, user: { id: 7, login: "compte-test", profile: "client", siren: "100000001" } });
    expect(mocks.query.mock.calls[1][0]).toContain("SET tentatives_echouees = 0");
    expect(mocks.query.mock.calls[1][1].slice(0, 2)).toEqual([7, account.mot_de_passe_hash]);
    expect(mocks.query.mock.calls[1][1][3]).toBe(28800);
  });

  it.each(["admin", "po"])("accepte un profil %s sans SIREN", async (profile) => {
    mocks.compare.mockResolvedValue(true);
    mocks.query.mockResolvedValueOnce([{ ...account, profile, siren: null }]).mockResolvedValueOnce([{ ...account, profile, siren: null }]);
    const result = await authenticate("compte-test", password);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.user.profile).toBe(profile);
  });

  it("refuse un compte inactif même avec le bon mot de passe", async () => {
    mocks.compare.mockResolvedValue(true);
    mocks.query.mockResolvedValueOnce([{ ...account, est_actif: false }]);
    expect(await authenticate("compte-test", password)).toEqual({ ok: false, reason: "invalid" });
    expect(mocks.compare).toHaveBeenCalledOnce();
    expect(mocks.query).toHaveBeenCalledOnce();
  });

  it("refuse un rattachement incohérent", async () => {
    mocks.compare.mockResolvedValue(true);
    mocks.query.mockResolvedValueOnce([{ ...account, siren: null }]);
    expect(await authenticate("compte-test", password)).toEqual({ ok: false, reason: "invalid" });
    expect(mocks.query).toHaveBeenCalledOnce();
  });

  it("ne renvoie pas de succès si le compte devient inactif pendant la tentative", async () => {
    mocks.compare.mockResolvedValue(true);
    mocks.query.mockResolvedValueOnce([account]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    expect(await authenticate("compte-test", password)).toEqual({ ok: false, reason: "invalid" });
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
    expect(await authenticate("compte-test", value)).toEqual({ ok: false, reason: "invalid" });
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
    mocks.query.mockResolvedValueOnce([account]).mockResolvedValueOnce([account]);
    expect((await authenticate("compte-test", password)).ok).toBe(true);

    mocks.query.mockResolvedValueOnce([account]).mockResolvedValueOnce([{ tentatives_echouees: 1 }]);
    expect(await authenticate("compte-test", randomBytes(20).toString("hex"))).toEqual({ ok: false, reason: "invalid" });
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
    mocks.query.mockResolvedValueOnce([account]).mockResolvedValueOnce([account]);
    const form = loginForm();
    form.set("profile", "admin");
    form.set("siren", "100000002");
    await expect(loginAction({}, form)).rejects.toThrow("REDIRECT:/client");
    expect(mocks.createSession).toHaveBeenCalledWith({ id: 7, login: "compte-test", profile: "client", siren: "100000001" }, { sessionId: "12345678-1234-4123-8123-123456789abc", issuedAt: 1000, expiresAt: 29800 });
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
    mocks.query.mockResolvedValueOnce([account]).mockResolvedValueOnce([account]);
    mocks.createSession.mockRejectedValueOnce(new Error("Configuration absente"));
    expect(await loginAction({}, loginForm())).toEqual({ error: "Connexion indisponible. Réessayez plus tard." });
  });

  it("supprime la session avant la redirection de déconnexion", async () => {
    const { logoutAction } = await import("@/app/login/actions");
    await expect(logoutAction()).rejects.toThrow("REDIRECT:/login");
    expect(mocks.deleteSession).toHaveBeenCalledOnce();
  });

  it.each([true, false])("refuse un compte déjà bloqué sans écriture, comparaison %s", async (matches) => {
    mocks.compare.mockResolvedValue(matches);
    mocks.query.mockResolvedValueOnce([{ ...account, is_blocked: true, wait_minutes: 8 }]);
    expect(await authenticate("compte-test", password)).toEqual({ ok: false, reason: "blocked", minutes: 8 });
    expect(mocks.query).toHaveBeenCalledOnce();
  });

  it.each([true, false])("garde le refus générique du compte inactif, comparaison %s", async (matches) => {
    mocks.compare.mockResolvedValue(matches);
    mocks.query.mockResolvedValueOnce([{ ...account, est_actif: false, is_blocked: true, wait_minutes: 15 }]);
    expect(await authenticate("compte-test", password)).toEqual({ ok: false, reason: "invalid" });
    expect(mocks.query).toHaveBeenCalledOnce();
  });

  it.each([
    ["juste avant quinze minutes", true, 1],
    ["à quinze minutes", false, 0],
    ["juste après quinze minutes", false, 0],
  ])("utilise l'état calculé par la base %s", async (_label, blocked, minutes) => {
    mocks.query.mockResolvedValueOnce([{ ...account, is_blocked: blocked, wait_minutes: minutes }]);
    if (!blocked) mocks.query.mockResolvedValueOnce([{ tentatives_echouees: 1, is_blocked: false, wait_minutes: 0 }]);
    expect(await authenticate("compte-test", password)).toEqual(blocked
      ? { ok: false, reason: "blocked", minutes: 1 }
      : { ok: false, reason: "invalid" });
    expect(mocks.query.mock.calls[0][0]).toContain("GREATEST(1, CEIL(EXTRACT(EPOCH FROM (u.bloque_jusqua - NOW())) / 60)::integer)");
  });

  it("reprend le cycle après expiration sans conserver l'ancien avertissement", async () => {
    mocks.query.mockResolvedValueOnce([account]).mockResolvedValueOnce([{ tentatives_echouees: 1, is_blocked: false, wait_minutes: 0 }])
      .mockResolvedValueOnce([account]).mockResolvedValueOnce([{ tentatives_echouees: 2, is_blocked: false, wait_minutes: 0 }]);
    expect(await authenticate("compte-test", password)).toEqual({ ok: false, reason: "invalid" });
    expect(mocks.query.mock.calls[1][0]).toContain("WHEN bloque_jusqua IS NOT NULL AND bloque_jusqua <= NOW() THEN 1");
    expect(await authenticate("compte-test", password)).toEqual({ ok: false, reason: "warning" });
  });

  it("ne bloque pas rétroactivement une réussite avec un compteur hérité sans échéance", async () => {
    mocks.compare.mockResolvedValue(true);
    mocks.query.mockResolvedValueOnce([{ ...account, tentatives_echouees: 32767, bloque_jusqua: null }])
      .mockResolvedValueOnce([account]);
    expect((await authenticate("compte-test", password)).ok).toBe(true);
  });

  it("ne prolonge pas un blocage pendant plusieurs tentatives", async () => {
    mocks.query.mockResolvedValueOnce([{ ...account, is_blocked: true, wait_minutes: 8 }])
      .mockResolvedValueOnce([{ ...account, is_blocked: true, wait_minutes: 7 }]);
    expect(await authenticate("compte-test", password)).toEqual({ ok: false, reason: "blocked", minutes: 8 });
    expect(await authenticate("compte-test", password)).toEqual({ ok: false, reason: "blocked", minutes: 7 });
    expect(mocks.query.mock.calls.every(([sql]) => !sql.includes("UPDATE"))).toBe(true);
  });

  it("refuse un succès si une autre requête vient de bloquer le compte", async () => {
    mocks.compare.mockResolvedValue(true);
    mocks.query.mockResolvedValueOnce([account]).mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ is_blocked: true, wait_minutes: 15 }]);
    expect(await authenticate("compte-test", password)).toEqual({ ok: false, reason: "blocked", minutes: 15 });
    const sql = mocks.query.mock.calls[1][0];
    expect(sql).toContain("AND (u.bloque_jusqua IS NULL OR u.bloque_jusqua <= NOW())");
    expect(sql).toContain("AND u.mot_de_passe_hash = $2");
  });

  it("relit le blocage après un échec qui n'a pas pu écrire", async () => {
    mocks.query.mockResolvedValueOnce([account]).mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ is_blocked: true, wait_minutes: 14 }]);
    expect(await authenticate("compte-test", password)).toEqual({ ok: false, reason: "blocked", minutes: 14 });
    expect(mocks.query.mock.calls[2][0]).toContain("FROM utilisateurs WHERE id = $1 AND est_actif = TRUE");
  });

  it("utilise l'identité actuelle retournée par l'écriture de succès", async () => {
    mocks.compare.mockResolvedValue(true);
    mocks.query.mockResolvedValueOnce([account]).mockResolvedValueOnce([{ ...account, profile: "po", siren: null }]);
    const result = await authenticate("compte-test", password);
    expect(result.ok && result.user.profile).toBe("po");
    expect(result.ok && result.user.siren).toBeNull();
  });

  it("refuse une identité incohérente retournée au succès", async () => {
    mocks.compare.mockResolvedValue(true);
    mocks.query.mockResolvedValueOnce([account]).mockResolvedValueOnce([{ ...account, siren: null }]);
    expect(await authenticate("compte-test", password)).toEqual({ ok: false, reason: "invalid" });
  });

  it("masque une panne lors de l'incrément", async () => {
    const { loginAction } = await import("@/app/login/actions");
    mocks.query.mockResolvedValueOnce([account]).mockRejectedValueOnce(new Error("Indisponible"));
    expect(await loginAction({}, loginForm())).toEqual({ error: "Connexion indisponible. Réessayez plus tard." });
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it.each([1, 15])("retourne seulement l'attente publique de %i minute(s)", async (minutes) => {
    const { loginAction } = await import("@/app/login/actions");
    mocks.query.mockResolvedValueOnce([{ ...account, is_blocked: true, wait_minutes: minutes }]);
    expect(await loginAction({}, loginForm())).toEqual({
      error: `Compte temporairement bloqué. Réessayez dans ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      warning: false,
    });
    expect(mocks.createSession).not.toHaveBeenCalled();
    expect(mocks.query).toHaveBeenCalledOnce();
  });

  it("traduit le troisième échec en blocage sans avertissement", async () => {
    const { loginAction } = await import("@/app/login/actions");
    mocks.query.mockResolvedValueOnce([account]).mockResolvedValueOnce([{ tentatives_echouees: 3, is_blocked: true, wait_minutes: 15 }]);
    const result = await loginAction({}, loginForm());
    expect(result.warning).toBe(false);
    expect(result.error).toBe("Compte temporairement bloqué. Réessayez dans 15 minutes.");
  });

  it("traduit le deuxième échec en avertissement", async () => {
    const { loginAction } = await import("@/app/login/actions");
    mocks.query.mockResolvedValueOnce([account]).mockResolvedValueOnce([{ tentatives_echouees: 2, is_blocked: false, wait_minutes: 0 }]);
    expect(await loginAction({}, loginForm())).toEqual({ error: "Identifiant ou mot de passe incorrect.", warning: true });
  });

  it("conserve le texte exact de l'avertissement et sa suspension unique", async () => {
    const { AUTH_WARNING } = await import("@/components/LoginForm");
    expect(AUTH_WARNING).toBe("ATTENTION : C'est votre dernier essai… Au prochain échec, le compte sera bloqué pendant 15 minutes.");
    expect((AUTH_WARNING.match(/\u2026/g) ?? []).length).toBe(1);
    expect(AUTH_WARNING).not.toContain("...");
  });

  it("n'expose pas une attente incohérente retournée par le pilote", async () => {
    const { loginAction } = await import("@/app/login/actions");
    mocks.query.mockResolvedValueOnce([{ ...account, is_blocked: true, wait_minutes: 0 }]);
    expect(await loginAction({}, loginForm())).toEqual({ error: "Connexion indisponible. Réessayez plus tard." });
    expect(mocks.createSession).not.toHaveBeenCalled();
  });
});
