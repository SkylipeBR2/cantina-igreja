import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";

const STAFF_ROLES = new Set(["admin", "manager", "cashier", "kitchen"]);
const TOTEM_ROLES = new Set(["totem"]);

async function getVerifiedAccount(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: () => {},
      },
    },
  );
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  // Never authorize with user_metadata: it is editable by the user.
  const role = typeof user.app_metadata?.role === "string" ? user.app_metadata.role : "";
  return { id: user.id, role };
}

export async function requireStaff(request: NextRequest) {
  const account = await getVerifiedAccount(request);
  return account && STAFF_ROLES.has(account.role) ? account : null;
}

export async function requireTotem(request: NextRequest) {
  const account = await getVerifiedAccount(request);
  return account && TOTEM_ROLES.has(account.role) ? account : null;
}
