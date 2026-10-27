import { redirect } from "next/navigation";

export default function Home() {
  // La connexion sera le point d'entrée commun aux trois profils.
  redirect("/login");
}
