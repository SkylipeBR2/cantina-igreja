import { createHash } from "crypto";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { clearRateLimit, readJsonBody, rejectCrossSiteRequest, rejectRateLimitedRequest } from "@/lib/server/request-security";

const HOME_BY_ROLE: Record<string, string> = {
  admin: "/admin",
  manager: "/admin",
  cashier: "/caixa",
  kitchen: "/cozinha",
};

export async function POST(request: NextRequest) {
  const originError = rejectCrossSiteRequest(request);
  if (originError) return originError;
  const addressLimit = rejectRateLimitedRequest(request, "staff-login-address", 30, 10 * 60_000);
  if (addressLimit) return addressLimit;
  try {
    const { email, password } = await readJsonBody<{ email?: unknown; password?: unknown }>(request);
    if (typeof email !== "string" || typeof password !== "string" || !email.trim() || email.length > 254 || !password || password.length > 128) {
      return NextResponse.json({ erro: "Credenciais inválidas" }, { status: 400 });
    }

    const emailDigest = createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
    const loginScope = `staff-login-account:${emailDigest}`;
    const rateLimitError = rejectRateLimitedRequest(request, loginScope, 8, 10 * 60_000);
    if (rateLimitError) return rateLimitError;

    const authCookies = new Map<string, { name: string; value: string; options: CookieOptions }>();
    const authHeaders: Record<string, string> = {};
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (cookies, headers) => {
            cookies.forEach(({ name, value, options }) => {
              request.cookies.set(name, value);
              authCookies.set(name, { name, value, options });
            });
            Object.assign(authHeaders, headers);
          },
        },
      },
    );
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) return NextResponse.json({ erro: "E-mail ou senha inválidos" }, { status: 401 });

    const role = data.user?.app_metadata?.role;
    const destination = typeof role === "string" ? HOME_BY_ROLE[role] : undefined;
    if (!destination) {
      return NextResponse.json(
        { erro: "Esta conta ainda não foi liberada para acessar a equipe." },
        { status: 403 },
      );
    }

    // A credencial correta e autorizada não deve permanecer contabilizada como tentativa de força bruta.
    clearRateLimit(request, loginScope);

    const response = NextResponse.json({ sucesso: true, destino: destination });
    for (const { name, value, options } of authCookies.values()) {
      response.cookies.set(name, value, { ...options, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
    }
    for (const [name, value] of Object.entries(authHeaders)) response.headers.set(name, value);
    return response;
  } catch {
    return NextResponse.json({ erro: "Credenciais inválidas" }, { status: 400 });
  }
}
