import { workspaceEntries } from "@/components/navigation-espaces";
import LogoutButton from "@/components/LogoutButton";
import EspaceConnecte from "@/components/EspaceConnecte";
import Tresorerie from "@/components/Tresorerie";
import { getMerchants } from "@/lib/access";
import { readTreasury, type TreasuryParams } from "@/lib/tresorerie";

export default async function PoPage({ searchParams }: { searchParams: Promise<TreasuryParams> }) {
  const { merchants } = await getMerchants();
  const params = await searchParams;
  const result = await readTreasury(params);
  if (result.error && typeof params.siren === "string" && merchants.some(merchant => merchant.numero_siren === params.siren)) result.siren = params.siren;
  return (
    <EspaceConnecte entry="Trésorerie" href="/po" entries={workspaceEntries("po")} identity="Product Owner" detail="Profil banque" logout={<LogoutButton />}>
      <Tresorerie result={result} basePath="/po" merchants={merchants} allowNegativeFilter />
    </EspaceConnecte>
  );
}
