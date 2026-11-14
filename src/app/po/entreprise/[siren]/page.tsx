import { workspaceEntries } from "@/components/navigation-espaces";
import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";
import EspaceConnecte from "@/components/EspaceConnecte";
import Tresorerie from "@/components/Tresorerie";
import { getPoCompany } from "@/lib/access";
import { readTreasury, type TreasuryParams } from "@/lib/tresorerie";

export default async function PoCompanyPage({ params, searchParams }: {
  params: Promise<{ siren: string }>; searchParams: Promise<TreasuryParams>;
}) {
  const { company } = await getPoCompany((await params).siren);
  // Le chemin validé est prioritaire sur tout SIREN ajouté à la requête.
  const result = await readTreasury({ ...await searchParams, siren: company.numero_siren });
  return (
    <EspaceConnecte entry="Trésorerie" href="/po" entries={workspaceEntries("po")} identity="Product Owner" detail="Profil banque" logout={<LogoutButton />}>
      <Tresorerie result={{ ...result, siren: company.numero_siren }} basePath={`/po/entreprise/${company.numero_siren}`} companyName={company.raison_sociale} inactive={!company.est_active} allowNegativeFilter />
      <p className="company-information"><Link href={`/po/entreprise/${company.numero_siren}/remises`} className="text-link">Remises de cette entreprise</Link></p>
      <p className="company-information"><Link href={`/po/entreprise/${company.numero_siren}/impayes?sort=${result.sort.key}&order=${result.sort.order}`} className="text-link">Impayés de cette entreprise</Link></p>
      <p className="company-information"><Link href="/po" className="text-link">Retour à tous les comptes</Link></p>
    </EspaceConnecte>
  );
}
