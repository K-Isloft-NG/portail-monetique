import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LogoutButton from "@/components/LogoutButton";
const state = vi.hoisted(() => ({ current: {}, all: {}, pending: false, calls: 0 }));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(), useActionState: () => [state.calls++ % 2 === 0 ? state.current : state.all, () => {}, state.pending] }));
describe("boutons de déconnexion", () => {
  beforeEach(() => { state.current = {}; state.all = {}; state.pending = false; state.calls = 0; });
  it.each(["current", "all"] as const)("affiche l'erreur accessible de %s", target => {
    state[target] = { error: "Déconnexion indisponible. Réessayez." };
    const html = renderToStaticMarkup(createElement(LogoutButton));
    expect(html).toContain('role="alert"'); expect(html).toContain("Déconnexion indisponible. Réessayez.");
  });
  it("désactive les deux demandes pendant une opération", () => {
    state.pending = true; const html = renderToStaticMarkup(createElement(LogoutButton)); expect(html.match(/disabled=""/g)).toHaveLength(2);
  });
  it("affiche les deux formulaires et leur aide dans l'ordre", () => {
    const html = renderToStaticMarkup(createElement(LogoutButton));
    expect(html).toContain("Se déconnecter de tous les appareils"); expect(html).toContain("Vous devrez vous reconnecter sur chacun de vos appareils."); expect(html.match(/<form /g)).toHaveLength(2);
    expect(html.indexOf("Se déconnecter</button>")).toBeLessThan(html.indexOf("Se déconnecter de tous les appareils"));
  });
});
