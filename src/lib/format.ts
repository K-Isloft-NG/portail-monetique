// Le SIREN reste une chaîne pour préserver ses éventuels zéros initiaux.
export function formatSiren(value: string | null): string {
  if (typeof value !== "string" || !/^[0-9]{9}$/.test(value)) return "Non renseigné";
  return value.replace(/([0-9]{3})([0-9]{3})([0-9]{3})/, "$1\u00a0$2\u00a0$3");
}

export function formatMontant(value: number | string): string {
  // Une valeur absente ou mal formée ne doit jamais être présentée comme zéro.
  if (typeof value === "string" && !/^-?[0-9]+(?:\.[0-9]+)?$/.test(value.trim())) return "Non renseigné";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "Non renseigné";
  const [integer, decimals] = Math.abs(amount).toFixed(2).split(".");
  const grouped = integer.replace(/\B(?=([0-9]{3})+(?![0-9]))/g, "\u00a0");
  return `${amount < 0 ? "\u2212" : ""}${grouped},${decimals}`;
}

export function formatCard(value?: string | null): string {
  // Le détail ne doit jamais exposer les chiffres centraux, même si la source change.
  if (typeof value !== "string" || value.length !== 16) return "Non renseigné";
  return `${value.slice(0, 5)}*******${value.slice(-4)}`;
}
