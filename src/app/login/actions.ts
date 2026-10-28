"use server";

import { redirect } from "next/navigation";
import { authenticate, AUTH_ERROR, type LoginState } from "@/lib/auth";
import { createSession, deleteSession, PROFILE_PATHS, type SessionData } from "@/lib/session";

export async function loginAction(_previous: LoginState, formData: FormData): Promise<LoginState> {
  let user: SessionData;
  try {
    // Une tentative refusée ne doit pas conserver une ancienne session dans ce navigateur.
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
    await createSession(user);
  } catch {
    return { error: "Connexion indisponible. Réessayez plus tard." };
  }

  // La redirection du framework doit rester hors du traitement des erreurs métier.
  redirect(PROFILE_PATHS[user.profile]);
}

export async function logoutAction() {
  await deleteSession();
  redirect("/login");
}
