"use client";

import { useActionState, useState } from "react";
import { loginAction } from "@/app/login/actions";
import type { LoginState } from "@/lib/auth";

export const AUTH_WARNING = "ATTENTION : C'est votre dernier essai… Au prochain échec, le compte sera bloqué pendant 15 minutes.";

const INITIAL_STATE: LoginState = {};

export default function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, INITIAL_STATE);
  const [visible, setVisible] = useState(false);

  return (
    <form action={action} className="login-form">
      {state.error && (
        <div id="login-error" role="alert" className="login-error">
          <p className="font-semibold">{state.error}</p>
          {state.warning && <p>{AUTH_WARNING}</p>}
        </div>
      )}
      <div>
        <label htmlFor="login">Identifiant</label>
        <input id="login" name="login" autoComplete="username" maxLength={50} required />
      </div>
      <div>
        <label htmlFor="password">Mot de passe</label>
        <div className="password-field">
          <input id="password" name="password" type={visible ? "text" : "password"} autoComplete="current-password" required aria-describedby={state.error ? "login-error" : undefined} />
          <button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"} aria-pressed={visible} aria-controls="password">{visible ? "Masquer" : "Afficher"}</button>
        </div>
      </div>
      <button type="submit" disabled={pending} className="button-primary">{pending ? "Connexion en cours…" : "Se connecter"}</button>
    </form>
  );
}
