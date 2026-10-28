import type { ReactNode } from "react";

export default function BandeauSynthese({ title, children }: { title: string; children?: ReactNode }) {
  return <header className="summary"><h1>{title}</h1>{children && <p>{children}</p>}</header>;
}
