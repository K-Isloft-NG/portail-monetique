import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";
import EspaceConnecte from "@/components/EspaceConnecte";
import BandeauSynthese from "@/components/BandeauSynthese";
import { formatSiren } from "@/lib/format";
import { getClientCompany } from "@/lib/access";

export default async function CompanyPage({ params }: { params: Promise<{ siren: string }> }) {
  const { session, company } = await getClientCompany((await params).siren);
  return (
    <EspaceConnecte entry="Mon entreprise" href="/client" identity={session.login} detail={`SIREN ${formatSiren(session.siren)}`} logout={<LogoutButton />}>
      <BandeauSynthese title={company.raison_sociale}>Compte : {session.login}</BandeauSynthese>
      <dl className="company-block"><dt>Raison sociale</dt><dd>{company.raison_sociale}</dd><dt className="mt-4">Numéro SIREN</dt><dd className="tabular-nums">{formatSiren(session.siren)}</dd></dl>
      <Link href="/client" className="text-link">Retour à mon espace</Link>
    </EspaceConnecte>
  );
}
