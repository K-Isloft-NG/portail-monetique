import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";
import { getAuthorizedSiren, requireProfile } from "@/lib/access";

export default async function ClientPage({ searchParams }: { searchParams: Promise<{ siren?: string | string[] }> }) {
  const session = await requireProfile("client");
  const requested = (await searchParams).siren;
  const siren = getAuthorizedSiren(session, Array.isArray(requested) ? "" : requested);

  return (
    <main className="min-h-screen bg-slate-100 px-5 py-10">
      <section className="mx-auto max-w-5xl rounded-2xl border border-slate-200 bg-white p-6 sm:p-10">
        <header className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-sm font-medium text-blue-800">Portail monétique</p>
            <h1 className="mt-3 text-3xl font-semibold text-slate-950">Espace commerçant</h1>
            <p className="mt-3 text-slate-600">Compte : {session.login}</p>
          </div>
          <LogoutButton />
        </header>
        <Link href={`/client/entreprise/${siren}`} className="mt-10 inline-block rounded-lg bg-blue-800 px-5 py-3 font-medium text-white hover:bg-blue-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-800">
          Consulter mon entreprise
        </Link>
      </section>
    </main>
  );
}
