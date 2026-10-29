import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAccountAction, disableAccountAction, unlockAccountAction } from "@/app/admin/actions";
import { getAdminMessage } from "@/lib/comptes";
import { requireProfile } from "@/lib/access";
import DisablePage from "@/app/admin/desactiver/[id]/page";
import AdminPage from "@/app/admin/page";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("@/components/LogoutButton", () => ({ default: () => null }));
vi.mock("@/components/CreationCompte", () => ({ default: () => null }));
const mocks = vi.hoisted(() => ({ query: vi.fn(), readSession: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/session", async original => ({ ...await original<typeof import("@/lib/session")>(), readSession: mocks.readSession }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: (p: string) => { throw new Error("REDIRECT:" + p); }, notFound: () => { throw new Error("NOT_FOUND"); } }));
const ADMIN = { id: 1, login: "compte-test", profile: "admin", siren: null };
function form(agreement = true) {
  const data = new FormData();
  for (const [k, v] of Object.entries({ siren: "999999990", companyName: "Entreprise fictive", login: "compte-test-client" })) data.set(k, v);
  if (agreement) data.set("agreement", "on");
  return data;
}
describe("action de création d'un compte", () => {
  beforeEach(() => {
    vi.resetAllMocks(); mocks.readSession.mockResolvedValue(ADMIN);
    mocks.query.mockImplementation(async (sql: string) => sql.startsWith("SELECT") ? [{ ...ADMIN, est_actif: true }] : [{ id: 7 }]);
  });
  it.each(["client", "po"])("refuse un profil %s sans écriture", async profile => {
    const session = { ...ADMIN, profile, siren: profile === "client" ? "100000001" : null };
    mocks.readSession.mockResolvedValue(session); mocks.query.mockResolvedValue([{ ...session, est_actif: true }]);
    await expect(createAccountAction({}, form())).rejects.toThrow("REDIRECT:/" + profile);
    expect(mocks.query.mock.calls.every(([sql]) => sql.startsWith("SELECT"))).toBe(true);
  });
  it("refuse un visiteur sans requête", async () => {
    mocks.readSession.mockResolvedValue(null);
    await expect(createAccountAction({}, form())).rejects.toThrow("REDIRECT:/login");
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("refuse un administrateur devenu inactif", async () => {
    mocks.query.mockResolvedValue([{ ...ADMIN, est_actif: false }]);
    await expect(createAccountAction({}, form())).rejects.toThrow("REDIRECT:/login");
  });
  it("refuse l'accord absent et conserve les champs", async () => {
    const result = await createAccountAction({}, form(false));
    expect(result.errors?.agreement).toBeTruthy();
    expect(result.values?.login).toBe("compte-test-client");
    expect(result.password === undefined).toBe(true);
    expect(mocks.query).toHaveBeenCalledOnce();
  });
  it("ne transmet le clair ni en SQL ni dans les paramètres", async () => {
    const result = await createAccountAction({}, form());
    const [sql, params] = mocks.query.mock.calls[1];
    expect(Boolean(result.password)).toBe(true);
    expect(sql.includes(result.password)).toBe(false);
    expect(params.some((v: unknown) => v === result.password)).toBe(false);
    expect(result.values).toBeUndefined();
    expect(mocks.revalidate).toHaveBeenCalledWith("/admin");
  });
  it("ignore un créateur et une date d'accord forgés dans le formulaire", async () => {
    const data = form(); data.set("cree_par", "999"); data.set("accord_po_le", "1900-01-01");
    await createAccountAction({}, data);
    const [sql, params] = mocks.query.mock.calls[1];
    expect(params[0]).toBe(ADMIN.id);
    expect(params.slice(0, 4)).not.toContain("999");
    expect(params).not.toContain("1900-01-01");
    expect(params).toHaveLength(5);
    expect(sql).toContain("e.numero_siren, NOW(), $1");
  });
  it("conserve le mot de passe créé si l'actualisation de la liste échoue", async () => {
    mocks.revalidate.mockImplementation(() => { throw new Error("Actualisation indisponible."); });
    const result = await createAccountAction({}, form());
    expect(Boolean(result.password)).toBe(true);
    expect(result.createdLogin).toBe("compte-test-client");
    expect(result.error).toBeUndefined();
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });
  it.each([null, {}, "id=7"])("refuse un argument de création hors formulaire (%j)", async value => {
    const result = await createAccountAction({}, value as unknown as FormData);
    expect(result.error).toBe("Formulaire invalide. Réessayez.");
    expect(result.password === undefined).toBe(true);
    expect(mocks.query).toHaveBeenCalledOnce();
    expect(mocks.query.mock.calls[0][0]).toMatch(/^SELECT/);
  });
  for (const action of [disableAccountAction, unlockAccountAction]) {
    it("refuse un identifiant répété sans écriture", async () => {
      const data = new FormData(); data.append("id", "7"); data.append("id", "8");
      await expect(action(data)).rejects.toThrow("REDIRECT:/admin?message=unavailable");
      expect(mocks.query).toHaveBeenCalledOnce();
      expect(mocks.query.mock.calls[0][0]).toMatch(/^SELECT/);
    });
    it.each([null, {}, "id=7"])("refuse un argument d'action hors formulaire (%j)", async value => {
      await expect(action(value as unknown as FormData)).rejects.toThrow("REDIRECT:/admin?message=unavailable");
      expect(mocks.query).toHaveBeenCalledOnce();
      expect(mocks.query.mock.calls[0][0]).toMatch(/^SELECT/);
    });
  }
  it.each([null, "29/10/2026"])("affiche la date de l'accord ou Non renseigné (%s)", async agreement => {
    mocks.query.mockResolvedValueOnce([{ ...ADMIN, est_actif: true }]).mockResolvedValueOnce([
      { id: 7, login: "compte-test-client", profile: "client", numero_siren: "999999990", raison_sociale: "Entreprise fictive", est_actif: false, is_blocked: false, state: "Désactivé", accord_po_le: agreement },
    ]);
    const html = renderToStaticMarkup(await AdminPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("Accord du PO");
    expect(html).toContain(agreement ?? "Non renseigné");
  });
  it("limite les actions rendues à l'état et au profil de chaque compte", async () => {
    const base = { numero_siren: "999999990", raison_sociale: "Entreprise fictive", est_actif: true, is_blocked: false, state: "Actif", accord_po_le: null };
    // Un résultat portant l'id de session couvre aussi la protection défensive du rendu.
    const accounts = [
      { ...base, id: ADMIN.id, login: "soi-meme", profile: "client", is_blocked: true, state: "Bloqué" },
      { ...base, id: 7, login: "inactif", profile: "client", est_actif: false, state: "Désactivé" },
      { ...base, id: 8, login: "client-bloque", profile: "client", is_blocked: true, state: "Bloqué" },
      { ...base, id: 9, login: "client-actif", profile: "client", accord_po_le: "29/10/2026" },
      { ...base, id: 10, login: "po-bloque", profile: "po", is_blocked: true, state: "Bloqué" },
      { ...base, id: 11, login: "po-actif", profile: "po" },
    ];
    mocks.query.mockResolvedValueOnce([{ ...ADMIN, est_actif: true }]).mockResolvedValueOnce(accounts);
    const html = renderToStaticMarkup(await AdminPage({ searchParams: Promise.resolve({}) }));
    const rows = html.match(/<tr>[\s\S]*?<\/tr>/g) ?? [];
    const row = (login: string) => rows.find(text => text.includes(">" + login + "<")) ?? "";
    for (const login of ["soi-meme", "inactif", "po-actif"]) {
      expect(row(login)).toContain("Sans action");
      expect(row(login)).not.toMatch(/<button|<a /);
    }
    for (const login of ["client-bloque", "po-bloque"]) {
      expect(row(login)).toContain("Débloquer");
      expect(row(login)).not.toContain("Désactiver");
    }
    expect(row("client-actif")).toContain('href="/admin/desactiver/9"');
    expect(row("client-actif")).not.toContain("Débloquer");
    expect(row("client-actif")).toContain("29/10/2026");
    expect(row("inactif")).toContain("Non renseigné");
    expect(html).toContain("Accord du PO");
    expect(rows.join("")).not.toContain(">Administrateur<");
    expect(mocks.query.mock.calls[1][0]).toContain("WHERE p.libelle IN ('client', 'po')");
  });
  it.each([disableAccountAction, unlockAccountAction])("refuse sa propre cible sans écriture", async action => {
    const data = new FormData(); data.set("id", "1");
    await expect(action(data)).rejects.toThrow("REDIRECT:/admin?message=unavailable");
    expect(mocks.query).toHaveBeenCalledOnce();
  });
  it.each([disableAccountAction, unlockAccountAction])("refuse un autre administrateur avec les conditions SQL", async action => {
    mocks.query.mockResolvedValueOnce([{ ...ADMIN, est_actif: true }]).mockResolvedValueOnce([]);
    const data = new FormData(); data.set("id", "9");
    await expect(action(data)).rejects.toThrow("REDIRECT:/admin?message=unavailable");
    expect(mocks.query.mock.calls[1][0]).toMatch(/p.libelle (?:= 'client'|IN \('client', 'po'\))/);
  });
  for (const action of [disableAccountAction, unlockAccountAction]) {
    it.each(["client", "po"])("refuse l'action à %s", async profile => {
      const session = { ...ADMIN, profile, siren: profile === "client" ? "100000001" : null };
      mocks.readSession.mockResolvedValue(session); mocks.query.mockResolvedValue([{ ...session, est_actif: true }]);
      const data = new FormData(); data.set("id", "7");
      await expect(action(data)).rejects.toThrow("REDIRECT:/" + profile);
      expect(mocks.query).toHaveBeenCalledOnce();
    });
  }
  it("renvoie 404 pour une confirmation d'id invalide sans lecture métier", async () => {
    await expect(DisablePage({ params: Promise.resolve({ id: "abc" }) })).rejects.toThrow("NOT_FOUND");
    expect(mocks.query).toHaveBeenCalledOnce();
  });
  it("refuse immédiatement une session client encore signée mais désactivée", async () => {
    const client = { ...ADMIN, profile: "client", siren: "100000001" };
    mocks.readSession.mockResolvedValue(client);
    mocks.query.mockResolvedValue([{ ...client, est_actif: false }]);
    await expect(requireProfile("client")).rejects.toThrow("REDIRECT:/login");
  });
  it("n'affiche jamais de texte libre ou de message répété depuis l'URL", () => {
    expect(getAdminMessage("Texte libre")).toBeUndefined();
    expect(getAdminMessage(["disabled", "technical"])).toBeUndefined();
    expect(getAdminMessage("disabled")?.error).toBe(false);
  });
  it("refuse si l'acteur perd ses droits avant l'instruction d'écriture", async () => {
    mocks.query.mockResolvedValueOnce([{ ...ADMIN, est_actif: true }]).mockResolvedValueOnce([]);
    const data = new FormData(); data.set("id", "7");
    await expect(unlockAccountAction(data)).rejects.toThrow("REDIRECT:/admin?message=unavailable");
    expect(mocks.query.mock.calls[1][0]).toContain("p.libelle = 'admin' AND u.est_actif = TRUE");
  });
});
