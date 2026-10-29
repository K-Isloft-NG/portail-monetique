import LogoutButton from "@/components/LogoutButton";
import EspaceConnecte from "@/components/EspaceConnecte";
import BandeauSynthese from "@/components/BandeauSynthese";
import { requireProfile } from "@/lib/access";
import { getAdminMessage, listAccounts, type ManagedAccount } from "@/lib/comptes";
import Link from "next/link";
import { unlockAccountAction } from "@/app/admin/actions";
import { formatSiren } from "@/lib/format";
import Tableau from "@/components/Tableau";
import CreationCompte from "@/components/CreationCompte";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ message?: string | string[] }> }) {
  const session = await requireProfile("admin");
  const message = getAdminMessage((await searchParams).message);
  let accounts: ManagedAccount[] = [];
  let failed = false;
  try { accounts = await listAccounts(); } catch { failed = true; }
  return (
    <EspaceConnecte entry="Comptes" href="/admin" identity="Administrateur" logout={<LogoutButton />}>
      <BandeauSynthese title="Comptes">{accounts.filter(a => a.est_actif && !a.is_blocked).length} actifs, {accounts.filter(a => !a.est_actif).length} désactivés, {accounts.filter(a => a.is_blocked).length} bloqués</BandeauSynthese>
      {message && <div className={message.error ? "login-error account-errors" : "account-success"} role={message.error ? "alert" : "status"}>{message.text}</div>}
      {failed ? <div className="login-error" role="alert">Liste des comptes indisponible. Réessayez plus tard.</div> : <Tableau caption="Comptes clients et Product Owner" columns={[
        { key: "login", label: "Identifiant" }, { key: "profile", label: "Profil" }, { key: "siren", label: "N° de SIREN" },
        { key: "company", label: "Raison sociale" }, { key: "state", label: "État" }, { key: "agreement", label: "Accord du PO" }, { key: "action", label: "Action" },
      ]} rows={accounts.map(account => ({ key: String(account.id), cells: {
        login: account.login, profile: account.profile === "po" ? "Product Owner" : "Client",
        siren: account.numero_siren ? formatSiren(account.numero_siren) : "Sans objet",
        company: account.raison_sociale ?? "Sans objet", state: account.state,
        agreement: account.accord_po_le ?? "Non renseigné",
        action: account.id === session.id || !account.est_actif ? "Sans action" : account.is_blocked ?
          <form action={unlockAccountAction}><input type="hidden" name="id" value={account.id} /><button type="submit" className="button-secondary">Débloquer</button></form> :
          account.profile === "client" ? <Link href={"/admin/desactiver/" + account.id} className="text-link">Désactiver</Link> : "Sans action",
      } }))} emptyMessage="Aucun compte à afficher." />}
      <CreationCompte />
    </EspaceConnecte>
  );
}
