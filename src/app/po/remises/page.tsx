import { workspaceEntries } from "@/components/navigation-espaces";
import LogoutButton from "@/components/LogoutButton";
import EspaceConnecte from "@/components/EspaceConnecte";
import Remises from "@/components/Remises";
import { getMerchants } from "@/lib/access";
import { readRemittances } from "@/lib/remises";
import type { TreasuryParams } from "@/lib/tresorerie";

export default async function PoRemittancesPage({ searchParams }: { searchParams: Promise<TreasuryParams> }) {
  const { merchants } = await getMerchants();
  const params = await searchParams;
  const result = await readRemittances(params);
  // Une erreur de saisie conserve seulement un filtre d'entreprise reconnu.
  if (result.criteria.error && typeof params.siren === "string" && merchants.some(merchant => merchant.numero_siren === params.siren)) result.siren = params.siren;
  return (
    <EspaceConnecte entry="Remises" href="/po/remises" entries={workspaceEntries("po")} identity="Product Owner" detail="Profil banque" logout={<LogoutButton />}>
      <Remises result={result} basePath="/po/remises" merchants={merchants} />
    </EspaceConnecte>
  );
}
