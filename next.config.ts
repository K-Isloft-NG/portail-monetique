import type { NextConfig } from "next";

// En-têtes envoyés avec chaque réponse : ils limitent ce que le navigateur autorise.
const securityHeaders = [
  // Le navigateur ne doit pas deviner le type d'un fichier.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Interdit d'afficher le site dans un cadre d'un autre site (détournement de clic).
  { key: "X-Frame-Options", value: "DENY" },
  // Évite de transmettre l'adresse complète des pages aux autres sites.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Le portail n'a besoin ni de la caméra, ni du micro, ni de la position.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Limiter les objets, cadres et formulaires sans imposer de nonce aux scripts.
  { key: "Content-Security-Policy", value: "base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'" },
  // Sur HTTPS, demander au navigateur de conserver ce choix pendant deux ans.
  { key: "Strict-Transport-Security", value: "max-age=63072000" },
];

const nextConfig: NextConfig = {
  // Éviter d'annoncer le framework dans les réponses.
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
