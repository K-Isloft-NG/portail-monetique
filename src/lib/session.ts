import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

export type Profile = "admin" | "po" | "client";

type Account = { id: number; login: string };
export type SessionData = Account & (
  | { profile: "client"; siren: string }
  | { profile: "admin" | "po"; siren: null }
);

export type VerifiedSession = SessionData & { sessionId: string };
export type SessionRecord = { sessionId: string; issuedAt: number; expiresAt: number };
export function isSessionId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
export function isSessionRecord(value: SessionRecord): boolean {
  return isSessionId(value.sessionId) && Number.isSafeInteger(value.issuedAt) &&
    Number.isSafeInteger(value.expiresAt) && value.expiresAt - value.issuedAt === SESSION_DURATION;
}

export const SESSION_COOKIE_NAME = "portail_session";
export const SESSION_DURATION = 8 * 60 * 60;
export const PROFILE_PATHS: Record<Profile, string> = {
  admin: "/admin",
  po: "/po",
  client: "/client",
};

export function isSessionData(value: unknown): value is SessionData {
  if (!value || typeof value !== "object") return false;

  const data = value as Record<string, unknown>;
  if (
    !Number.isSafeInteger(data.id) || Number(data.id) <= 0 ||
    typeof data.login !== "string" || !data.login || data.login.length > 50
  ) return false;

  if (data.profile === "client") {
    return typeof data.siren === "string" && /^[0-9]{9}$/.test(data.siren);
  }

  return (data.profile === "admin" || data.profile === "po") && data.siren === null;
}

function getSessionKey() {
  const secret = process.env.SESSION_SECRET;
  const key = new TextEncoder().encode(secret);
  if (!secret?.trim() || key.length < 32) {
    throw new Error("SESSION_SECRET doit contenir au moins 32 octets.");
  }
  return key;
}

export async function signSession(user: SessionData, session: SessionRecord) {
  if (!isSessionData(user) || !isSessionRecord(session)) throw new Error("Contenu de session invalide.");

  // Une liste explicite empêche d'ajouter par erreur une empreinte ou un secret.
  return new SignJWT({ id: user.id, login: user.login, profile: user.profile, siren: user.siren, sessionId: session.sessionId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(session.issuedAt)
    .setExpirationTime(session.expiresAt)
    .sign(getSessionKey());
}

export async function verifySession(token?: string): Promise<VerifiedSession | null> {
  if (!token) return null;
  const key = getSessionKey();

  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ["HS256"],
      requiredClaims: ["iat", "exp"],
    });
    const now = Math.floor(Date.now() / 1000);
    const { iat, exp, sessionId } = payload;
    if (
      !isSessionData(payload) || !isSessionId(sessionId) ||
      typeof iat !== "number" || typeof exp !== "number" ||
      !Number.isSafeInteger(iat) || !Number.isSafeInteger(exp) ||
      iat > now || exp - iat !== SESSION_DURATION
    ) return null;

    return { id: payload.id, login: payload.login, profile: payload.profile, siren: payload.siren, sessionId } as VerifiedSession;
  } catch {
    // Un jeton invalide n'est jamais repris dans une erreur ou un journal.
    return null;
  }
}

function getCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_DURATION,
  };
}

export async function readSession() {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE_NAME)?.value);
}

export async function createSession(user: SessionData, session: SessionRecord) {
  const token = await signSession(user, session);
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, { ...getCookieOptions(),
    maxAge: Math.max(0, Math.min(SESSION_DURATION, session.expiresAt - Math.floor(Date.now() / 1000))),
  });
}

export async function deleteSession() {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, "", {
    ...getCookieOptions(),
    maxAge: 0,
    expires: new Date(0),
  });
}
