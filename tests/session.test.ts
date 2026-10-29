import { randomBytes } from "node:crypto";
import { SignJWT, decodeJwt } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSession, deleteSession, isSessionData, readSession, signSession, verifySession,
  SESSION_COOKIE_NAME, SESSION_DURATION, type SessionData,
} from "@/lib/session";

const store = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => store }));

const RECORD = () => { const issuedAt = Math.floor(Date.now() / 1000); return { sessionId: "12345678-1234-4123-8123-123456789abc", issuedAt, expiresAt: issuedAt + SESSION_DURATION }; };
const CLIENT: SessionData = { id: 1, login: "compte-test", profile: "client", siren: "100000001" };

async function signedPayload(changes: Record<string, unknown>, algorithm = "HS256") {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ ...CLIENT, sessionId: RECORD().sessionId, iat: now, exp: now + SESSION_DURATION, ...changes })
    .setProtectedHeader({ alg: algorithm })
    .sign(new TextEncoder().encode(process.env.SESSION_SECRET));
}

describe("session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("SESSION_SECRET", randomBytes(32).toString("hex"));
  });

  afterEach(() => vi.unstubAllEnvs());

  it("signe et relit une session limitée à huit heures", async () => {
    const token = await signSession(CLIENT, RECORD());
    expect(await verifySession(token)).toEqual({ ...CLIENT, sessionId: RECORD().sessionId });
    const payload = decodeJwt(token);
    expect(payload.exp! - payload.iat!).toBe(SESSION_DURATION);
  });

  it("écarte les propriétés qui ne font pas partie de la session", async () => {
    const user = { ...CLIENT, mot_de_passe_hash: randomBytes(32).toString("hex") };
    const payload = decodeJwt(await signSession(user, RECORD()));
    expect(Object.keys(payload).sort()).toEqual(["exp", "iat", "id", "login", "profile", "sessionId", "siren"]);
  });

  it("refuse une signature altérée", async () => {
    const parts = (await signSession(CLIENT, RECORD())).split(".");
    parts[2] = (parts[2][0] === "A" ? "B" : "A") + parts[2].slice(1);
    expect(await verifySession(parts.join("."))).toBeNull();
  });

  it("refuse une signature produite avec une autre clé", async () => {
    const token = await signSession(CLIENT, RECORD());
    vi.stubEnv("SESSION_SECRET", randomBytes(32).toString("hex"));
    expect(await verifySession(token)).toBeNull();
  });

  it("refuse une session expirée", async () => {
    const now = Math.floor(Date.now() / 1000);
    expect(await verifySession(await signedPayload({ iat: now - SESSION_DURATION - 1, exp: now - 1 }))).toBeNull();
  });

  it("refuse un autre algorithme de signature", async () => {
    expect(await verifySession(await signedPayload({}, "HS384"))).toBeNull();
  });

  it.each([
    { sessionId: undefined }, { sessionId: "invalide" }, { profile: "autre" }, { siren: "123" }, { profile: "admin", siren: "100000001" },
    { id: 0 }, { login: "" }, { exp: undefined }, { iat: undefined },
    { exp: Math.floor(Date.now() / 1000) + 60 },
  ])("refuse un contenu incohérent (%j)", async (changes) => {
    expect(await verifySession(await signedPayload(changes))).toBeNull();
  });

  it("refuse un texte qui n'est pas un jeton", async () => {
    expect(await verifySession("invalide")).toBeNull();
    expect(await verifySession()).toBeNull();
  });

  it("reconnaît les trois profils et refuse un SIREN sans profil client", () => {
    expect(isSessionData(CLIENT)).toBe(true);
    expect(isSessionData({ ...CLIENT, profile: "po", siren: null })).toBe(true);
    expect(isSessionData({ ...CLIENT, profile: "admin", siren: null })).toBe(true);
    expect(isSessionData({ ...CLIENT, siren: null })).toBe(false);
  });

  it.each([undefined, "", "court"])("refuse une clé absente ou insuffisante sans l'afficher", async (key) => {
    vi.stubEnv("SESSION_SECRET", key);
    await expect(signSession(CLIENT, RECORD())).rejects.toThrow("SESSION_SECRET doit contenir au moins 32 octets.");
    expect(store.set).not.toHaveBeenCalled();
  });

  it.each(["development", "production"])("configure le cookie en %s", async (environment) => {
    vi.stubEnv("NODE_ENV", environment);
    await createSession(CLIENT, RECORD());
    const options = store.set.mock.calls[0][2];
    expect(options).toEqual({ httpOnly: true, secure: environment === "production", sameSite: "lax", path: "/", maxAge: SESSION_DURATION });
    expect(store.set.mock.calls[0][0]).toBe(SESSION_COOKIE_NAME);
    // L'assertion porte sur le contenu vérifié, sans afficher le jeton.
    expect(await verifySession(store.set.mock.calls[0][1])).toEqual({ ...CLIENT, sessionId: RECORD().sessionId });
  });

  it("lit uniquement le cookie de session attendu", async () => {
    store.get.mockReturnValue({ value: await signSession(CLIENT, RECORD()) });
    expect(await readSession()).toEqual({ ...CLIENT, sessionId: RECORD().sessionId });
    expect(store.get).toHaveBeenCalledWith(SESSION_COOKIE_NAME);
  });

  it("supprime le cookie sur le même chemin", async () => {
    await deleteSession();
    const [name, value, options] = store.set.mock.calls[0];
    expect(name).toBe(SESSION_COOKIE_NAME);
    expect(value === "").toBe(true);
    expect(options).toMatchObject({ path: "/", maxAge: 0, expires: new Date(0), httpOnly: true });
  });
});
