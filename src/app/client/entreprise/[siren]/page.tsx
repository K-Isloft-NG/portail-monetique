import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";
import { getClientCompany } from "@/lib/access";

export default async function CompanyPage({ params }: { params: Promise<{ siren: string }> }) {
  const { session, company } = await getClientCompany((await params).siren);

  return (
    <main className="min-h-screen bg-slate-100 px-5 py-10">
      <section className="mx-auto max-w-5xl rounded-2xl border border-slate-200 bg-white p-6 sm:p-10">
        <header className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-sm font-medium text-blue-800">Mon entreprise</p>
            <h1 className="mt-3 text-3xl font-semibold text-slate-950">{company.raison_sociale}</h1>
            <p className="mt-3 text-slate-600">Compte : {session.login}</p>
          </div>
          <LogoutButton />
        </header>
        <dl className="mt-10 rounded-lg border border-slate-200 bg-slate-50 p-5">
          <dt className="text-sm text-slate-600">Numéro SIREN</dt>
          <dd className="mt-2 font-mono text-lg text-slate-950">{company.numero_siren}</dd>
        </dl>
        <Link href="/client" className="mt-8 inline-block text-sm font-medium text-blue-800 underline underline-offset-4">Retour à mon espace</Link>
      </section>
    </main>
  );
}
