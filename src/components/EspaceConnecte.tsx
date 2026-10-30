"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";

type Props = { entry: string; href: string; entries?: { label: string; href: string }[]; identity: string; detail?: string; logout: ReactNode; children: ReactNode };

export default function EspaceConnecte({ entry, href, entries, identity, detail, logout, children }: Props) {
  const [open, setOpen] = useState(false);
  // Le serveur fournit seulement les textes déjà autorisés et le contenu rendu.
  return (
    <div className="workspace">
      <aside className="sidebar">
        <div className="sidebar-top">
          <p className="portal-name">Portail monétique</p>
          <button type="button" className="mobile-menu button-secondary" aria-expanded={open} aria-controls="workspace-navigation" onClick={() => setOpen(!open)}>Menu</button>
        </div>
        <div id="workspace-navigation" className={`sidebar-content${open ? " is-open" : ""}`}>
          <nav aria-label="Navigation principale">{(entries ?? [{ label: entry, href }]).map(item => <Link key={item.href} href={item.href} aria-current={item.href === href ? "page" : undefined}>{item.label}</Link>)}</nav>
          <div className="identity"><p>{identity}</p>{detail && <p className="tabular-nums">{detail}</p>}{logout}</div>
        </div>
      </aside>
      <main className="workspace-main">{children}</main>
    </div>
  );
}
