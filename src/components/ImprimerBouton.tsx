"use client";

export default function ImprimerBouton() {
  return <button type="button" className="button-secondary" onClick={() => window.print()}>Imprimer</button>;
}
