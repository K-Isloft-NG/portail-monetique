"use server";

import { redirect } from "next/navigation";
import { authenticate, AUTH_ERROR, type LoginState } from "@/lib/auth";
import { createSession, deleteSession, readSession, PROFILE_PATHS, type SessionData } from "@/lib/session";

import { revokeCurrentSession, revokeAllSessions, purgeExpiredSessions } from "@/lib/session-store";
export type LogoutState = { error?: string };

export async function loginAction(_previous: LoginState, formData: FormData): Promise<LoginState> {
  let user: SessionData;
  try {
    // Une tentative refusée ne doit pas conserver une ancienne session dans ce navigateur.
    const previous = await readSession();
    if (previous) await revokeCurrentSession(previous);
    await deleteSession();
    const result = await authenticate(formData.get("login"), formData.get("password"));
    if (!result.ok) {
      if (result.reason === "blocked") {
        return {
          error: `Compte temporairement bloqué. Réessayez dans ${result.minutes} minute${result.minutes === 1 ? "" : "s"}.`,
          warning: false,
        };
      }
      return { error: AUTH_ERROR, warning: result.reason === "warning" };
    }

    user = result.user;
    await createSession(user, result.session);
    await purgeExpiredSessions();
  } catch {
    return { error: "Connexion indisponible. Réessayez plus tard." };
  }

  // La redirection du framework doit rester hors du traitement des erreurs métier.
  redirect(PROFILE_PATHS[user.profile]);
}

async function logout(all: boolean): Promise<LogoutState> {
  try {
    const session = await readSession();
    if (session) {
      if (all) await revokeAllSessions(session);
      else await revokeCurrentSession(session);
    }
    await deleteSession();
  } catch {
    // Garder le cookie permet de retenter une révocation non confirmée.
    return { error: "Déconnexion indisponible. Réessayez." };
  }
  redirect("/login");
}
export async function logoutAction(): Promise<LogoutState> { return logout(false); }
export async function logoutAllAction(): Promise<LogoutState> { return logout(true); }
