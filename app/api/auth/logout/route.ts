import { NextRequest, NextResponse } from "next/server";
import { rejectCrossSiteRequest } from "@/lib/server/request-security";

export async function POST(request: NextRequest) {
  const originError = rejectCrossSiteRequest(request);
  if (originError) return originError;
  const response = NextResponse.json({ sucesso: true });
  request.cookies.getAll().filter(({ name }) => name.startsWith("sb-")).forEach(({ name }) => {
    response.cookies.set(name, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  });
  return response;
}
