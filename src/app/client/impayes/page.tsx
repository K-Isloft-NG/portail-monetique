import { workspaceEntries } from "@/components/navigation-espaces";
import LogoutButton from "@/components/LogoutButton";
import EspaceConnecte from "@/components/EspaceConnecte";
import Impayes from "@/components/Impayes";
import { getClientCompany } from "@/lib/access";
import { formatSiren } from "@/lib/format";
import { readUnpaid } from "@/lib/impayes";
import type { TreasuryParams } from "@/lib/tresorerie";

export default async function ClientUnpaidPage({ searchParams }: { searchParams: Promise<TreasuryParams> }) {
  const { session, company } = await getClientCompany();
  const result = await readUnpaid(await searchParams);
  return (
    <EspaceConnecte entry="Impayés" href="/client/impayes" entries={workspaceEntries("client")} identity={company.raison_sociale} detail={`SIREN ${formatSiren(session.siren)}`} logout={<LogoutButton />}>
      <Impayes result={result} basePath="/client/impayes" companyName={company.raison_sociale} />
    </EspaceConnecte>
  );
}
