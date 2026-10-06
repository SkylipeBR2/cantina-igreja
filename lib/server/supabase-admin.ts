import "server-only";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const configuredKeys = [process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.SUPABASE_SECRET_KEY]
  .filter((key): key is string => Boolean(key));

function isPrivilegedKey(key: string) {
  if (key.startsWith("sb_secret_")) return true;
  if (!key.includes(".")) return false;

  try {
    const payload = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString("utf8")) as { role?: unknown };
    return payload.role === "service_role";
  } catch {
    return false;
  }
}

const supabaseKey = configuredKeys.find(isPrivilegedKey);

if (!supabaseUrl) {
  throw new Error("Configure NEXT_PUBLIC_SUPABASE_URL no ambiente do deploy.");
}
if (!supabaseKey) {
  throw new Error("Configure uma chave Supabase de servidor válida em SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_SECRET_KEY; a chave pública não tem acesso aos pedidos.");
}

export const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseKey,
  { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } },
);
