import LogoutButton from "@/components/LogoutButton";
import EspaceConnecte from "@/components/EspaceConnecte";
import BandeauSynthese from "@/components/BandeauSynthese";
import Tableau from "@/components/Tableau";
import { formatSiren } from "@/lib/format";
import { getMerchants } from "@/lib/access";

export default async function PoPage() {
  const { session, merchants } = await getMerchants();
  return (
    <EspaceConnecte entry="Commerçants" href="/po" identity="Product Owner" detail="Profil banque" logout={<LogoutButton />}>
      <BandeauSynthese title="Commerçants"><span className="tabular-nums">{merchants.length}</span> {merchants.length === 1 ? "commerçant" : "commerçants"}<span className="block muted">Compte : {session.login}</span></BandeauSynthese>
      <Tableau caption="Commerçants" columns={[{ key: "siren", label: "N° SIREN", numeric: true }, { key: "name", label: "Raison sociale" }]} rows={merchants.map((merchant) => ({ key: merchant.numero_siren, cells: { siren: formatSiren(merchant.numero_siren), name: merchant.raison_sociale } }))} emptyMessage="Aucun commerçant enregistré." />
    </EspaceConnecte>
  );
}
