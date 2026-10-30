import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";
import EspaceConnecte from "@/components/EspaceConnecte";
import Remises from "@/components/Remises";
import { getPoCompany } from "@/lib/access";
import { readRemittances } from "@/lib/remises";
import type { TreasuryParams } from "@/lib/tresorerie";

export default async function PoCompanyRemittancesPage({ params, searchParams }: {
  params: Promise<{ siren: string }>; searchParams: Promise<TreasuryParams>;
}) {
  const { company } = await getPoCompany((await params).siren);
  // Le chemin validé garde la priorité sur tout SIREN ajouté aux critères.
  const result = await readRemittances({ ...await searchParams, siren: company.numero_siren });
  return (
    <EspaceConnecte entry="Remises" href="/po/remises" entries={[{ label: "Trésorerie", href: "/po" }, { label: "Remises", href: "/po/remises" }, { label: "Impayés", href: "/po/impayes" }]} identity="Product Owner" detail="Profil banque" logout={<LogoutButton />}>
      <p className="remittance-company-link"><Link href={`/po/entreprise/${company.numero_siren}`} className="text-link">Trésorerie de cette entreprise</Link></p>
      <p className="remittance-company-link"><Link href={`/po/entreprise/${company.numero_siren}/impayes`} className="text-link">Impayés de cette entreprise</Link></p>
      <Remises result={{ ...result, siren: company.numero_siren }} basePath={`/po/entreprise/${company.numero_siren}/remises`} companyName={company.raison_sociale} inactive={!company.est_active} />
      <p className="company-information"><Link href="/po/remises" className="text-link">Retour aux remises de toutes les entreprises</Link></p>
    </EspaceConnecte>
  );
}
