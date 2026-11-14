import EspaceConnecte from "@/components/EspaceConnecte";
import Graphiques from "@/components/Graphiques";
import LogoutButton from "@/components/LogoutButton";
import { workspaceEntries } from "@/components/navigation-espaces";
import { getClientCompany } from "@/lib/access";
import { formatSiren } from "@/lib/format";
import { readCharts } from "@/lib/graphiques";
import type { TreasuryParams } from "@/lib/tresorerie";

export default async function ClientChartsPage({ searchParams }: { searchParams: Promise<TreasuryParams> }) {
  const { session, company } = await getClientCompany();
  const result = await readCharts(await searchParams, "client");
  return <EspaceConnecte entry="Graphiques" href="/client/graphiques" entries={workspaceEntries("client")} identity={company.raison_sociale} detail={`SIREN ${formatSiren(session.siren)}`} logout={<LogoutButton />}>
    <Graphiques result={result} basePath="/client/graphiques" companyName={company.raison_sociale} />
  </EspaceConnecte>;
}
