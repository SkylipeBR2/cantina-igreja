import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getVerifiedAccount } from "@/lib/server/request-auth";
import { issueAdminGrant, GRANT_SECONDS } from "@/lib/server/admin-grant";
import { readJsonBody, rejectCrossSiteRequest, rejectRateLimitedRequest } from "@/lib/server/request-security";

export async function POST(request: NextRequest) {
  const originError = rejectCrossSiteRequest(request);
  if (originError) return originError;
  try {
    const account = await getVerifiedAccount(request);
    if (!account || account.role !== "admin" || !account.email) return NextResponse.json({ erro: "Somente administradores podem cadastrar usuários." }, { status: 403 });
    const limited = rejectRateLimitedRequest(request, `admin-confirm:${account.id}`, 5, 10 * 60_000);
    if (limited) return limited;
    const body = await readJsonBody<{ password?: unknown }>(request);
    if (!body || typeof body.password !== "string" || !body.password || body.password.length > 128) return NextResponse.json({ erro: "Informe a senha do administrador." }, { status: 400 });
    // Isolated client: never replace the current administrator's cookies/session.
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await client.auth.signInWithPassword({ email: account.email, password: body.password });
    if (error || data.user?.id !== account.id || data.user.app_metadata.role !== "admin") return NextResponse.json({ erro: "Senha incorreta ou confirmação indisponível." }, { status: 401 });
    await client.auth.signOut({ scope: "local" });
    return NextResponse.json({ token: issueAdminGrant(account.id, account.sessionId), expiresIn: GRANT_SECONDS }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ erro: "Não foi possível confirmar a senha." }, { status: 400 });
  }
}
