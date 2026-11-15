import { NextRequest, NextResponse } from "next/server";
import { getVerifiedAccount } from "@/lib/server/request-auth";
import { verifyAdminGrant } from "@/lib/server/admin-grant";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { isUuid, readJsonBody, rejectCrossSiteRequest, rejectRateLimitedRequest } from "@/lib/server/request-security";

const operationalRoles = new Set(["totem", "cantina", "cashier", "kitchen"]);
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
async function authorize(request: NextRequest) {
  const account = await getVerifiedAccount(request);
  if (!account || account.role !== "admin") return json({ erro: "Acesso exclusivo do administrador." }, 403);
  if (!verifyAdminGrant(request.headers.get("x-admin-grant") ?? "", account.id, account.sessionId)) return json({ erro: "Confirme novamente sua senha de administrador." }, 401);
  return rejectRateLimitedRequest(request, `admin-users:${account.id}`, 40, 60_000);
}
export async function GET(request: NextRequest) {
  try {
    const denied = await authorize(request);
    if (denied) return denied;
    const page = Number(request.nextUrl.searchParams.get("page") ?? "1");
    if (!Number.isSafeInteger(page) || page < 1 || page > 10000) return json({ erro: "Página inválida." }, 400);
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 20 });
    if (error) return json({ erro: "Não foi possível carregar os usuários." }, 502);
    return json({ users: data.users.map(user => ({ id: user.id, email: user.email, name: typeof user.user_metadata?.name === "string" ? user.user_metadata.name : "", role: user.app_metadata?.role ?? "", editable: operationalRoles.has(user.app_metadata?.role) })), nextPage: data.nextPage ?? null });
  } catch { return json({ erro: "Não foi possível carregar os usuários." }, 500); }
}
export async function POST(request: NextRequest) {
  const originError = rejectCrossSiteRequest(request);
  if (originError) return originError;
  try {
    const denied = await authorize(request);
    if (denied) return denied;
    const body = await readJsonBody<Record<string, unknown>>(request);
    if (!body || typeof body.name !== "string" || !body.name.trim() || body.name.length > 100 || typeof body.email !== "string" || body.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()) || typeof body.password !== "string" || body.password.length < 12 || body.password.length > 128 || (body.role !== "totem" && body.role !== "cantina")) return json({ erro: "Informe nome, e-mail válido, senha de 12 a 128 caracteres e um acesso permitido." }, 400);
    const { error } = await supabaseAdmin.auth.admin.createUser({ email: body.email.trim().toLowerCase(), password: body.password, email_confirm: true, user_metadata: { name: body.name.trim() }, app_metadata: { role: body.role } });
    if (error) return json({ erro: "Não foi possível cadastrar. Verifique se o e-mail já existe e se a senha atende à política de segurança." }, 400);
    return json({ sucesso: true }, 201);
  } catch { return json({ erro: "Não foi possível cadastrar o usuário." }, 400); }
}
export async function PATCH(request: NextRequest) {
  const originError = rejectCrossSiteRequest(request);
  if (originError) return originError;
  try {
    const denied = await authorize(request);
    if (denied) return denied;
    const body = await readJsonBody<Record<string, unknown>>(request);
    if (!body || !isUuid(body.id) || (body.role !== "totem" && body.role !== "cantina")) return json({ erro: "Usuário ou acesso inválido." }, 400);
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(body.id);
    if (error || !data.user || !operationalRoles.has(data.user.app_metadata.role)) return json({ erro: "Esta conta não pode ser alterada por este formulário." }, 403);
    const result = await supabaseAdmin.auth.admin.updateUserById(body.id, { app_metadata: { role: body.role } });
    if (result.error) return json({ erro: "Não foi possível atualizar o acesso." }, 400);
    return json({ sucesso: true });
  } catch { return json({ erro: "Não foi possível atualizar o acesso." }, 400); }
}
