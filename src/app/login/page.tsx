import LoginForm from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <main className="login-layout">
      <section className="login-intro" aria-labelledby="portal-title">
        <div>
          <h1 id="portal-title">Portail monétique</h1>
          <p>Consultez vos annonces de trésorerie, vos remises de paiements par carte et vos impayés. Connectez-vous avec l&apos;identifiant et le mot de passe transmis par votre banque.</p>
        </div>
      </section>
      <section className="login-panel" aria-labelledby="login-title">
        <div>
          <h2 id="login-title">Connexion</h2>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
