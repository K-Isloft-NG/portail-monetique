import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";
import EspaceConnecte from "@/components/EspaceConnecte";
import BandeauSynthese from "@/components/BandeauSynthese";
import { formatSiren } from "@/lib/format";
import { getAuthorizedSiren, requireProfile } from "@/lib/access";

export default async function ClientPage({ searchParams }: { searchParams: Promise<{ siren?: string | string[] }> }) {
  const session = await requireProfile("client");
  const requested = (await searchParams).siren;
  const siren = getAuthorizedSiren(session, Array.isArray(requested) ? "" : requested);
  return (
    <EspaceConnecte entry="Mon entreprise" href="/client" identity={session.login} detail={`SIREN ${formatSiren(session.siren)}`} logout={<LogoutButton />}>
      <BandeauSynthese title="Espace commerçant">Compte : {session.login}</BandeauSynthese>
      <Link href={`/client/entreprise/${siren}`} className="button-primary">Consulter mon entreprise</Link>
    </EspaceConnecte>
  );
}
