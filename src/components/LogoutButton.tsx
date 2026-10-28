import { logoutAction } from "@/app/login/actions";

export default function LogoutButton() {
  return <form action={logoutAction}><button type="submit" className="button-secondary">Se déconnecter</button></form>;
}
