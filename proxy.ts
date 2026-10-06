import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const HOME_BY_ROLE: Record<string, string> = {
  admin: "/admin",
  manager: "/admin",
  cashier: "/caixa",
  kitchen: "/cozinha",
  totem: "/totem",
};
const ROUTE_ROLES: Array<{ path: string; roles: string[] }> = [
  { path: "/admin", roles: ["admin", "manager"] },
  { path: "/caixa", roles: ["admin", "manager", "cashier"] },
  { path: "/cozinha", roles: ["admin", "manager", "kitchen"] },
  { path: "/totem", roles: ["totem"] },
];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const redirectWithSession = (path: string) => {
    const redirectResponse = NextResponse.redirect(new URL(path, request.url));
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    for (const header of ["cache-control", "expires", "pragma"]) {
      const value = response.headers.get(header);
      if (value) redirectResponse.headers.set(header, value);
    }
    return redirectResponse;
  };
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookies, headers) {
          cookies.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, { ...options, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" }));
          Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;
  const routeRule = ROUTE_ROLES.find(({ path }) => pathname.startsWith(path));
  const role = typeof user?.app_metadata?.role === "string" ? user.app_metadata.role : "";
  const home = HOME_BY_ROLE[role];

  // A página de login precisa continuar acessível quando existir uma sessão
  // antiga, expirada ou ainda sem cargo configurado.
  if (pathname === "/login") {
    if (user && home) return redirectWithSession(home);
    return response;
  }

  if (!user && routeRule) {
    return redirectWithSession("/login");
  }
  if (user && !home && routeRule) return redirectWithSession("/login?erro=sem-permissao");
  if (user && routeRule && !routeRule.roles.includes(role)) return redirectWithSession(home);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
