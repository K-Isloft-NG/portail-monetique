"use client";

import { useActionState, useState } from "react";
import { loginAction } from "@/app/login/actions";
import type { LoginState } from "@/lib/auth";

const INITIAL_STATE: LoginState = {};

export default function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, INITIAL_STATE);
  const [visible, setVisible] = useState(false);
  const fieldClass = "mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-slate-950 outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100";

  return (
    <form action={action} className="mt-8 space-y-6">
      <div>
        <label htmlFor="login" className="text-sm font-medium text-slate-800">Identifiant</label>
        <input id="login" name="login" autoComplete="username" maxLength={50} required className={fieldClass} />
      </div>
      <div>
        <div className="flex items-center justify-between gap-4">
          <label htmlFor="password" className="text-sm font-medium text-slate-800">Mot de passe</label>
          <button
            type="button"
            onClick={() => setVisible(!visible)}
            aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
            aria-pressed={visible}
            aria-controls="password"
            className="rounded px-1 text-sm font-medium text-blue-800 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            {visible ? "Masquer" : "Afficher"}
          </button>
        </div>
        <input
          id="password" name="password" type={visible ? "text" : "password"}
          autoComplete="current-password" required
          aria-describedby={state.error ? "login-error" : undefined}
          className={fieldClass}
        />
      </div>
      {state.error && (
        <div id="login-error" role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-950">
          <p>{state.error}</p>
          {state.warning && <p className="mt-2 font-semibold">Attention : la prochaine tentative sera la dernière.</p>}
        </div>
      )}
      <button type="submit" disabled={pending} className="w-full rounded-lg bg-blue-800 px-4 py-3 font-semibold text-white hover:bg-blue-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-800 disabled:cursor-wait disabled:opacity-60">
        {pending ? "Connexion en cours…" : "Se connecter"}
      </button>
    </form>
  );
}
