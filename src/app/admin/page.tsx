import LogoutButton from "@/components/LogoutButton";
import { requireProfile } from "@/lib/access";

export default async function AdminPage() {
  const session = await requireProfile("admin");

  return (
    <main className="min-h-screen bg-slate-100 px-5 py-10">
      <section className="mx-auto max-w-5xl rounded-2xl border border-slate-200 bg-white p-6 sm:p-10">
        <header className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-sm font-medium text-blue-800">Portail monétique</p>
            <h1 className="mt-3 text-3xl font-semibold text-slate-950">Espace administrateur</h1>
            <p className="mt-3 text-slate-600">Compte : {session.login}</p>
          </div>
          <LogoutButton />
        </header>
      </section>
    </main>
  );
}
