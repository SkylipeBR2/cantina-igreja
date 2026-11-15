import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export const GRANT_SECONDS = 300;
function signature(payload: string) {
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Chave de servidor ausente");
  return createHmac("sha256", secret).update(`admin-users:v1:${payload}`).digest("base64url");
}
export function issueAdminGrant(id: string, sessionId: string, now = Date.now()) {
  if (!sessionId) throw new Error("Sessão inválida");
  const payload = Buffer.from(JSON.stringify({ id, sessionId, expires: now + GRANT_SECONDS * 1000 })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}
export function verifyAdminGrant(token: string, id: string, sessionId: string, now = Date.now()) {
  try {
    if (!sessionId || token.length > 2048) return false;
    const parts = token.split(".");
    if (parts.length !== 2) return false;
    const [payload, supplied] = parts;
    const expected = Buffer.from(signature(payload));
    const actual = Buffer.from(supplied);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
    const grant = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return grant.id === id && grant.sessionId === sessionId && Number.isFinite(grant.expires) && grant.expires > now && grant.expires <= now + GRANT_SECONDS * 1000;
  } catch { return false; }
}
