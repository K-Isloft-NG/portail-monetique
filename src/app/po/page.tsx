import LogoutButton from "@/components/LogoutButton";
import { getMerchants } from "@/lib/access";

export default async function PoPage() {
  const { session, merchants } = await getMerchants();

  return (
    <main className="min-h-screen bg-slate-100 px-5 py-10">
      <section className="mx-auto max-w-5xl rounded-2xl border border-slate-200 bg-white p-6 sm:p-10">
        <header className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-sm font-medium text-blue-800">Portail monétique</p>
            <h1 className="mt-3 text-3xl font-semibold text-slate-950">Espace Product Owner</h1>
            <p className="mt-3 text-slate-600">Compte : {session.login}</p>
          </div>
          <LogoutButton />
        </header>
        <div className="mt-10 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="mb-4 text-left text-lg font-semibold text-slate-950">Commerçants</caption>
            <thead className="border-y border-slate-200 bg-slate-50 text-slate-700">
              <tr><th scope="col" className="px-4 py-3">Raison sociale</th><th scope="col" className="px-4 py-3">SIREN</th></tr>
            </thead>
            <tbody>
              {merchants.map((merchant) => (
                <tr key={merchant.numero_siren} className="border-b border-slate-200 text-slate-800">
                  <td className="px-4 py-4">{merchant.raison_sociale}</td>
                  <td className="px-4 py-4 font-mono">{merchant.numero_siren}</td>
                </tr>
              ))}
              {merchants.length === 0 && <tr><td colSpan={2} className="px-4 py-4 text-slate-600">Aucun commerçant enregistré.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
