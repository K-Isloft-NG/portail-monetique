import { randomBytes } from "node:crypto";
import { compare, getRounds } from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountError, AccountTechnicalError, createAccount, disableAccount, generateInitialPassword, getAccountForDisable, listAccounts, parseAccountId, unlockAccount, validateAccount, type AccountValues } from "@/lib/comptes";
const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
const VALID: AccountValues = { siren: "999999990", companyName: "Entreprise fictive", login: "compte-test", agreement: true };
describe("gestion des comptes", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.query.mockResolvedValue([{ id: 7 }]); });
  it("accepte les champs valides sans convertir les majuscules", () => {
    expect(validateAccount(VALID)).toEqual({});
    expect(validateAccount({ ...VALID, login: "Compte-test" }).login).toBeTruthy();
  });
  it.each(["12345678", "1234567890", "12345678a"])("refuse le SIREN %s", siren => expect(validateAccount({ ...VALID, siren }).siren).toBeTruthy());
  it.each(["", " ", "a".repeat(21), "Nom\nclient", "\tNom", "Nom\n"])("refuse une raison sociale invalide", companyName => expect(validateAccount({ ...VALID, companyName }).companyName).toBeTruthy());
  it.each(["a", "a".repeat(20), "  Nom  "])("accepte une raison sociale dans les limites", companyName => expect(validateAccount({ ...VALID, companyName }).companyName).toBeUndefined());
  it.each(["\u202eNom", "Nom\u200bclient", "Nom\u2066client", "B\u043eulangerie", "Nom\u00adclient", "Nom\u2028client", "=1+1", "A+ Services", "@Services"])("refuse une raison sociale hors liste blanche (%j)", companyName => expect(validateAccount({ ...VALID, companyName }).companyName).toBeTruthy());
  it.each(["Boulangerie Dupain", "Garage du Centre", "Librairie Horizon", "Pharmacie des Lilas", "Recette Sprint 2", "L’Atelier d’Élodie", "Nom & Cie (2), A/B."])("accepte les noms existants et la ponctuation autorisée (%s)", companyName => expect(validateAccount({ ...VALID, companyName }).companyName).toBeUndefined());
  it("compte les accents décomposés après normalisation", () => {
    expect(validateAccount({ ...VALID, companyName: "Électricité Générale".normalize("NFD") }).companyName).toBeUndefined();
  });
  it("enregistre la forme NFC sans espaces de bord", async () => {
    await createAccount(1, { ...VALID, companyName: " Électricité Générale ".normalize("NFD") });
    expect(mocks.query.mock.calls[0][1][2]).toBe("Électricité Générale");
  });
  it.each(["ab", "a".repeat(51), "nom client", "_compte", "Nom-client"])("refuse l'identifiant invalide %s", login => expect(validateAccount({ ...VALID, login }).login).toBeTruthy());
  it.each(["abc", "a".repeat(50), "1.nom_client-test"])("accepte l'identifiant %s", login => expect(validateAccount({ ...VALID, login }).login).toBeUndefined());
  it("exige l'accord", () => expect(validateAccount({ ...VALID, agreement: false }).agreement).toBeTruthy());
  it.each(["", "0", "-1", "1.5", "abc", "2147483648", null])("refuse un id invalide (%s)", id => expect(parseAccountId(id)).toBeNull());
  it("accepte un entier positif", () => expect(parseAccountId("12")).toBe(12));
  it("génère des valeurs distinctes avec les trois classes et sans caractères ambigus", () => {
    const a = generateInitialPassword(), b = generateInitialPassword();
    expect(a === b).toBe(false);
    for (const password of [a, b]) {
      expect(password.length === 14 && Buffer.byteLength(password) < 72).toBe(true);
      expect(/^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789]+$/.test(password)).toBe(true);
      expect(/[A-Z]/.test(password) && /[a-z]/.test(password) && /[2-9]/.test(password)).toBe(true);
    }
  });
  it("crée en une instruction et ne passe que l'empreinte en SQL", async () => {
    const result = await createAccount(1, { ...VALID, companyName: " Nom " });
    const [sql, params] = mocks.query.mock.calls[0];
    expect(mocks.query).toHaveBeenCalledOnce();
    expect(sql).toContain("WITH actor AS");
    expect(sql).toContain("INSERT INTO entreprises");
    expect(sql).toContain("INSERT INTO utilisateurs");
    expect(sql).toContain("numero_siren, accord_po_le, cree_par");
    expect(sql).toContain("p.id, e.numero_siren, NOW(), $1");
    expect(sql).toContain("FROM actor CROSS JOIN client_profile");
    expect(sql).toContain("p.libelle = 'admin'");
    expect(params.slice(0, 4)).toEqual([1, VALID.siren, "Nom", VALID.login]);
    expect(params.some((value: unknown) => value === result.password)).toBe(false);
    expect(sql.includes(result.password)).toBe(false);
    expect(getRounds(params[4])).toBe(10);
    expect(await compare(result.password, params[4])).toBe(true);
  });
  it("ne tente aucune écriture sur validation refusée", async () => {
    await expect(createAccount(1, { ...VALID, agreement: false })).rejects.toBeInstanceOf(AccountError);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it.each([["entreprises_pkey", "Ce SIREN a déjà un compte."], ["utilisateurs_login_key", "Cet identifiant est déjà utilisé."]])("traduit la contrainte %s sans message du pilote", async (constraint, message) => {
    mocks.query.mockRejectedValue({ code: "23505", constraint, message: randomBytes(16).toString("hex") });
    await expect(createAccount(1, VALID)).rejects.toThrow(message);
  });
  it("masque toute autre erreur technique", async () => {
    mocks.query.mockRejectedValue(new Error("Détail interne"));
    await expect(listAccounts()).rejects.toBeInstanceOf(AccountTechnicalError);
  });
  it("ne lit que les identités avec un état calculé par SQL", async () => {
    await listAccounts();
    const sql = mocks.query.mock.calls[0][0];
    expect(sql).not.toMatch(/mot_de_passe_hash|annonces_tresorerie|remises|transactions|montant/);
    expect(sql).toContain("Europe/Paris");
    expect(sql).toContain("to_char(u.accord_po_le AT TIME ZONE 'Europe/Paris', 'DD/MM/YYYY') AS accord_po_le");
    expect(sql).toContain("bloque_jusqua > NOW()");
    expect(sql).toContain("ORDER BY p.libelle, u.login");
    expect(sql).toContain("WHERE p.libelle IN ('client', 'po')");
  });
  it.each([disableAccount, unlockAccount])("refuse la cible identique à la session sans requête", async action => {
    await expect(action(1, 1)).rejects.toBeInstanceOf(AccountError);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("désactive les deux lignes sans suppression ni table financière", async () => {
    await disableAccount(1, 7);
    const [sql, params] = mocks.query.mock.calls[0];
    expect(params).toEqual([1, 7]);
    expect(sql).toContain("p.libelle = 'client'");
    expect(sql).toContain("u.id <> $1");
    expect(sql).toContain("UPDATE entreprises e SET est_active = FALSE");
    expect(sql).toContain("UPDATE utilisateurs u SET est_actif = FALSE");
    expect(sql).not.toMatch(/DELETE|annonces_tresorerie|remises|transactions/);
  });
  it("débloque seulement un client ou PO actif encore bloqué", async () => {
    await unlockAccount(1, 7);
    const [sql, params] = mocks.query.mock.calls[0];
    expect(params).toEqual([1, 7]);
    expect(sql).toContain("tentatives_echouees = 0, bloque_jusqua = NULL");
    expect(sql).toContain("p.libelle IN ('client', 'po')");
    expect(sql).toContain("u.id <> $1");
    expect(sql).toContain("u.bloque_jusqua > NOW()");
    expect(sql).toContain("u.est_actif = TRUE");
  });
  it.each([disableAccount, unlockAccount])("refuse sans succès inventé si aucune ligne ne revient", async action => {
    mocks.query.mockResolvedValue([]);
    await expect(action(1, 7)).rejects.toBeInstanceOf(AccountError);
  });
  it("exclut la session de la confirmation", async () => {
    expect(await getAccountForDisable(1, 1)).toBeNull();
    expect(mocks.query).not.toHaveBeenCalled();
    await getAccountForDisable(1, 7);
    expect(mocks.query.mock.calls[0][0]).toContain("p.libelle = 'client'");
  });
});
