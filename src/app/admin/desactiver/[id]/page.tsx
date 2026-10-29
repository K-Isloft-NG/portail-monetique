import Link from "next/link";
import { notFound } from "next/navigation";
import EspaceConnecte from "@/components/EspaceConnecte";
import BandeauSynthese from "@/components/BandeauSynthese";
import LogoutButton from "@/components/LogoutButton";
import { requireProfile } from "@/lib/access";
import { getAccountForDisable, parseAccountId } from "@/lib/comptes";
import { formatSiren } from "@/lib/format";
import { disableAccountAction } from "@/app/admin/actions";

export default async function DisablePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireProfile("admin");
  const id = parseAccountId((await params).id);
  if (!id) notFound();
  const account = await getAccountForDisable(session.id, id);
  if (!account) notFound();
  return (
    <EspaceConnecte entry="Comptes" href="/admin" identity="Administrateur" logout={<LogoutButton />}>
      <BandeauSynthese title="Désactiver le compte">{account.login}</BandeauSynthese>
      <dl className="company-block"><dt>Identifiant</dt><dd>{account.login}</dd><dt>Raison sociale</dt><dd>{account.raison_sociale}</dd><dt>N° de SIREN</dt><dd>{formatSiren(account.numero_siren)}</dd></dl>
      <p>Ce compte ne pourra plus se connecter. Sa session ouverte perdra son accès à la prochaine page. L&apos;historique des remises et des transactions sera conservé.</p>
      <form action={disableAccountAction} className="account-confirmation"><input type="hidden" name="id" value={account.id} /><button type="submit" className="button-primary">Désactiver le compte</button><Link className="button-secondary" href="/admin">Annuler</Link></form>
    </EspaceConnecte>
  );
}
