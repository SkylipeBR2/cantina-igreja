import { NextRequest, NextResponse } from "next/server";
import { getVerifiedAccount } from "@/lib/server/request-auth";

export async function GET(request: NextRequest) {
  const account = await getVerifiedAccount(request);
  return NextResponse.json({ role: account?.role ?? null }, { status: account ? 200 : 401, headers: { "Cache-Control": "no-store" } });
}
