import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, proxy } from "../src/proxy";
import { SESSION_COOKIE_NAME } from "@/lib/session";

describe("proxy", () => {
  it.each(["/admin", "/po", "/client", "/client/entreprise/100000001"])("redirige le visiteur sans cookie depuis %s", (path) => {
    const response = proxy(new NextRequest(`http://localhost${path}`));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/login");
  });

  it("laisse le contrôle d'un cookie présent à la garde serveur", () => {
    const request = new NextRequest("http://localhost/client", { headers: { cookie: `${SESSION_COOKIE_NAME}=invalide` } });
    expect(proxy(request).headers.get("x-middleware-next")).toBe("1");
  });

  it("limite le filtre aux trois espaces, sans connexion ni fichiers statiques", () => {
    expect(config.matcher).toEqual(["/admin/:path*", "/po/:path*", "/client/:path*"]);
  });
});
