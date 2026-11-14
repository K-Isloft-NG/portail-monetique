import { workspaceEntries } from "@/components/navigation-espaces";
import LogoutButton from "@/components/LogoutButton";
import EspaceConnecte from "@/components/EspaceConnecte";
import Impayes from "@/components/Impayes";
import { getMerchants } from "@/lib/access";
import { readUnpaid } from "@/lib/impayes";
import type { TreasuryParams } from "@/lib/tresorerie";

export default async function PoUnpaidPage({ searchParams }: { searchParams: Promise<TreasuryParams> }) {
  const { merchants } = await getMerchants();
  const params = await searchParams;
  const result = await readUnpaid(params, true);
  // Une erreur de saisie ne conserve qu'une entreprise reconnue dans le filtre.
  if (result.criteria.error && typeof params.siren === "string" && merchants.some(merchant => merchant.numero_siren === params.siren)) result.siren = params.siren;
  return (
    <EspaceConnecte entry="Impayés" href="/po/impayes" entries={workspaceEntries("po")} identity="Product Owner" detail="Profil banque" logout={<LogoutButton />}>
      <Impayes result={result} basePath="/po/impayes" merchants={merchants} />
    </EspaceConnecte>
  );
}
