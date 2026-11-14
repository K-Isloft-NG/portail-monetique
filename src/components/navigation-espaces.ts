export function workspaceEntries(profile: "client" | "po") {
  const path = `/${profile}`;
  return [
    { label: "Trésorerie", href: path },
    { label: "Remises", href: `${path}/remises` },
    { label: "Impayés", href: `${path}/impayes` },
    { label: "Graphiques", href: `${path}/graphiques` },
  ];
}
