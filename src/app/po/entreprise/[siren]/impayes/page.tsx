import { workspaceEntries } from "@/components/navigation-espaces";
import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";
import EspaceConnecte from "@/components/EspaceConnecte";
import Impayes from "@/components/Impayes";
import { getPoCompany } from "@/lib/access";
import { readUnpaid } from "@/lib/impayes";
import type { TreasuryParams } from "@/lib/tresorerie";

export default async function PoCompanyUnpaidPage({ params, searchParams }: {
  params: Promise<{ siren: string }>; searchParams: Promise<TreasuryParams>;
}) {
  const { company } = await getPoCompany((await params).siren);
  // Le chemin autorisé prime sur tout filtre d'entreprise ajouté à l'URL.
  const result = await readUnpaid({ ...await searchParams, siren: company.numero_siren });
  const sortQuery = new URLSearchParams({ sort: result.criteria.sort.key, order: result.criteria.sort.order });
  return (
    <EspaceConnecte entry="Impayés" href="/po/impayes" entries={workspaceEntries("po")} identity="Product Owner" detail="Profil banque" logout={<LogoutButton />}>
      <p className="remittance-company-link"><Link href={`/po/entreprise/${company.numero_siren}?${sortQuery}`} className="text-link">Trésorerie de cette entreprise</Link></p>
      <p className="remittance-company-link"><Link href={`/po/entreprise/${company.numero_siren}/remises?${sortQuery}`} className="text-link">Remises de cette entreprise</Link></p>
      <Impayes result={{ ...result, siren: company.numero_siren }} basePath={`/po/entreprise/${company.numero_siren}/impayes`} companyName={company.raison_sociale} inactive={!company.est_active} />
      <p className="company-information"><Link href={`/po/impayes?${sortQuery}`} className="text-link">Retour aux impayés de toutes les entreprises</Link></p>
    </EspaceConnecte>
  );
}
