"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/access";
import { AccountError, AccountTechnicalError, createAccount, disableAccount, parseAccountId, unlockAccount, validateAccount, type AccountValues, type CreateAccountState } from "@/lib/comptes";

export async function createAccountAction(_previous: CreateAccountState, form: FormData): Promise<CreateAccountState> {
  // Une action est accessible sans son formulaire : contrôler le profil à chaque appel.
  const session = await requireProfile("admin");
  function field(name: string) {
    const values = form.getAll(name);
    return values.length === 1 && typeof values[0] === "string" ? values[0] : "";
  }
  const values: AccountValues = { siren: field("siren"), companyName: field("companyName"), login: field("login"), agreement: field("agreement") === "on" };
  const errors = validateAccount(values);
  if (Object.keys(errors).length) return { values, errors, error: "Corrigez les champs indiqués." };
  try {
    const created = await createAccount(session.id, values);
    revalidatePath("/admin");
    return { password: created.password, createdLogin: values.login };
  } catch (error) {
    if (error instanceof AccountError) {
      const fieldName = error.code === "siren-exists" ? "siren" : error.code === "login-exists" ? "login" : undefined;
      return { values, error: error.message, errors: fieldName ? { [fieldName]: error.message } : undefined };
    }
    return { values, error: new AccountTechnicalError().message };
  }
}

export async function disableAccountAction(form: FormData) {
  // Ne pas faire confiance au fait que le formulaire était visible à un administrateur.
  const session = await requireProfile("admin");
  const id = form.getAll("id").length === 1 ? parseAccountId(form.get("id")) : null;
  if (!id) redirect("/admin?message=unavailable");
  let message = "disabled";
  try { await disableAccount(session.id, id); revalidatePath("/admin"); }
  catch (error) { message = error instanceof AccountError ? "unavailable" : "technical"; }
  redirect("/admin?message=" + message);
}

export async function unlockAccountAction(form: FormData) {
  // La garde est relue à chaque POST, y compris pour un bouton ancien ou forgé.
  const session = await requireProfile("admin");
  const id = form.getAll("id").length === 1 ? parseAccountId(form.get("id")) : null;
  if (!id) redirect("/admin?message=unavailable");
  let message = "unlocked";
  try { await unlockAccount(session.id, id); revalidatePath("/admin"); }
  catch (error) { message = error instanceof AccountError ? "unavailable" : "technical"; }
  redirect("/admin?message=" + message);
}
