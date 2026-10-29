"use client";

import { useActionState, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { createAccountAction } from "@/app/admin/actions";
import type { AccountField, CreateAccountState } from "@/lib/comptes";

export default function CreationCompte() {
  const [visible, setVisible] = useState(false);
  async function submit(_previous: CreateAccountState, data: FormData) {
    setVisible(false);
    // Ne jamais renvoyer au serveur l'ancien état contenant le mot de passe initial.
    const result = await createAccountAction({}, data);
    setVisible(Boolean(result.password));
    return result;
  }
  const [state, action, pending] = useActionState(submit, {});
  useEffect(() => {
    // Retirer le bloc avant que le navigateur puisse figer la page dans son historique.
    const hide = () => flushSync(() => setVisible(false));
    window.addEventListener("pagehide", hide);
    window.addEventListener("popstate", hide);
    return () => { window.removeEventListener("pagehide", hide); window.removeEventListener("popstate", hide); };
  }, []);
  function fieldError(name: AccountField) {
    return state.errors?.[name] ? <p id={"error-" + name} className="field-error">{state.errors[name]}</p> : null;
  }
  return (
    <section className="account-create" aria-labelledby="create-title">
      <h2 id="create-title">Créer un compte client</h2>
      {visible && state.password && <div className="account-success initial-password" role="status">
        <p>Compte {state.createdLogin} créé. Mot de passe initial :</p>
        <p><output id="initial-password" className="initial-password-value">{state.password}</output></p>
        <p>Transmettez-le au commerçant par un canal sûr. Il ne sera plus affiché après un rechargement ou un changement de page.</p>
      </div>}
      {state.error && <div className="login-error account-errors" role="alert"><p>{state.error}</p>
        {state.errors && <ul>{Object.entries(state.errors).map(([name, error]) => <li key={name}><a className="text-link" href={"#account-" + name}>{error}</a></li>)}</ul>}
      </div>}
      <form action={action} className="account-form" noValidate key={JSON.stringify(state.values ?? null)}>
        <div><label htmlFor="account-siren">N° de SIREN</label><input id="account-siren" name="siren" inputMode="numeric" defaultValue={state.values?.siren ?? ""} aria-invalid={Boolean(state.errors?.siren)} aria-describedby={state.errors?.siren ? "error-siren" : undefined} />{fieldError("siren")}</div>
        <div><label htmlFor="account-companyName">Raison sociale</label><input id="account-companyName" name="companyName" defaultValue={state.values?.companyName ?? ""} aria-invalid={Boolean(state.errors?.companyName)} aria-describedby={state.errors?.companyName ? "error-companyName" : undefined} />{fieldError("companyName")}</div>
        <div><label htmlFor="account-login">Identifiant</label><input id="account-login" name="login" autoComplete="off" autoCapitalize="none" defaultValue={state.values?.login ?? ""} aria-invalid={Boolean(state.errors?.login)} aria-describedby={state.errors?.login ? "error-login" : undefined} />{fieldError("login")}</div>
        <div><label className="account-agreement" htmlFor="account-agreement"><input id="account-agreement" name="agreement" type="checkbox" defaultChecked={state.values?.agreement ?? false} aria-invalid={Boolean(state.errors?.agreement)} aria-describedby={state.errors?.agreement ? "error-agreement" : undefined} /> Accord du Product Owner</label>{fieldError("agreement")}</div>
        <button className="button-primary" type="submit" disabled={pending}>{pending ? "Création en cours…" : "Créer le compte"}</button>
      </form>
    </section>
  );
}
