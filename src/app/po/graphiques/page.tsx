import EspaceConnecte from "@/components/EspaceConnecte";
import Graphiques from "@/components/Graphiques";
import LogoutButton from "@/components/LogoutButton";
import { workspaceEntries } from "@/components/navigation-espaces";
import { requireProfile } from "@/lib/access";
import { readCharts } from "@/lib/graphiques";
import type { TreasuryParams } from "@/lib/tresorerie";

export default async function PoChartsPage({ searchParams }: { searchParams: Promise<TreasuryParams> }) {
  await requireProfile("po");
  const result = await readCharts(await searchParams, "po");
  return <EspaceConnecte entry="Graphiques" href="/po/graphiques" entries={workspaceEntries("po")} identity="Product Owner" detail="Profil banque" logout={<LogoutButton />}>
    <Graphiques result={result} basePath="/po/graphiques" />
  </EspaceConnecte>;
}
