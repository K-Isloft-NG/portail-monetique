"use client";

import { useActionState } from "react";
import { logoutAction, logoutAllAction, type LogoutState } from "@/app/login/actions";

export default function LogoutButton() {
  const [current, currentAction, currentPending] = useActionState<LogoutState>(logoutAction, {});
  const [all, allAction, allPending] = useActionState<LogoutState>(logoutAllAction, {});
  const pending = currentPending || allPending;
  return <>
    <form action={currentAction}><button type="submit" className="button-secondary" disabled={pending}>Se déconnecter</button></form>
    <form action={allAction}><button type="submit" className="button-secondary" disabled={pending}>Se déconnecter de tous les appareils</button></form>
    <p className="logout-help">Vous devrez vous reconnecter sur chacun de vos appareils.</p>
    {(current.error || all.error) && <p role="alert">{current.error || all.error}</p>}
  </>;
}
