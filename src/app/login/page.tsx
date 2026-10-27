import LoginForm from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-5 py-12">
      <section aria-labelledby="login-title" className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10">
        <p className="text-sm font-semibold tracking-wide text-blue-800">PORTAIL MONÉTIQUE</p>
        <h1 id="login-title" className="mt-5 text-3xl font-semibold tracking-tight text-slate-950">Connexion</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">Accédez à votre espace avec vos identifiants.</p>
        <LoginForm />
      </section>
    </main>
  );
}
