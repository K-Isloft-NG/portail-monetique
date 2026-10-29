import LogoutButton from "@/components/LogoutButton";
import EspaceConnecte from "@/components/EspaceConnecte";
import Remises from "@/components/Remises";
import { getClientCompany } from "@/lib/access";
import { formatSiren } from "@/lib/format";
import { readRemittances } from "@/lib/remises";
import type { TreasuryParams } from "@/lib/tresorerie";

export default async function ClientRemittancesPage({ searchParams }: { searchParams: Promise<TreasuryParams> }) {
  const { session, company } = await getClientCompany();
  const result = await readRemittances(await searchParams);
  return (
    <EspaceConnecte entry="Remises" href="/client/remises" entries={[{ label: "Trésorerie", href: "/client" }, { label: "Remises", href: "/client/remises" }]} identity={company.raison_sociale} detail={`SIREN ${formatSiren(session.siren)}`} logout={<LogoutButton />}>
      <Remises result={result} basePath="/client/remises" companyName={company.raison_sociale} />
    </EspaceConnecte>
  );
}
