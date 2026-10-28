import LogoutButton from "@/components/LogoutButton";
import EspaceConnecte from "@/components/EspaceConnecte";
import BandeauSynthese from "@/components/BandeauSynthese";
import { requireProfile } from "@/lib/access";

export default async function AdminPage() {
  const session = await requireProfile("admin");
  return (
    <EspaceConnecte entry="Comptes" href="/admin" identity="Administrateur" logout={<LogoutButton />}>
      <BandeauSynthese title="Espace administrateur">Compte : {session.login}</BandeauSynthese>
    </EspaceConnecte>
  );
}
