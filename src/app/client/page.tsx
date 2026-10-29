import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";
import EspaceConnecte from "@/components/EspaceConnecte";
import Tresorerie from "@/components/Tresorerie";
import { formatSiren } from "@/lib/format";
import { getClientCompany } from "@/lib/access";
import { readTreasury, type TreasuryParams } from "@/lib/tresorerie";

export default async function ClientPage({ searchParams }: { searchParams: Promise<TreasuryParams> }) {
  const { session, company } = await getClientCompany();
  const result = await readTreasury(await searchParams);
  return (
    <EspaceConnecte entry="Trésorerie" href="/client" identity={company.raison_sociale} detail={`SIREN ${formatSiren(session.siren)}`} logout={<LogoutButton />}>
      <Tresorerie result={result} basePath="/client" companyName={company.raison_sociale} />
      <p className="company-information"><Link href={`/client/entreprise/${session.siren}`} className="text-link">Informations de l&apos;entreprise</Link></p>
    </EspaceConnecte>
  );
}
