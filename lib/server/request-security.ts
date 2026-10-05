import { NextRequest, NextResponse } from "next/server";

type RateLimitWindow = { count: number; resetAt: number };

const localBuckets = new Map<string, RateLimitWindow>();
const MAX_BODY_BYTES = 16 * 1024;
const MAX_RATE_LIMIT_BUCKETS = 10_000;

function clientAddress(request: NextRequest) {
  // Vercel overwrites X-Forwarded-For at its edge. Do not trust it from an
  // arbitrary local/self-hosted client, where it can be chosen by the caller.
  if (process.env.VERCEL === "1") {
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (forwarded && forwarded.length <= 64) return forwarded;
  }
  return "shared";
}

export function rejectCrossSiteRequest(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== request.nextUrl.origin) {
    return NextResponse.json({ erro: "Origem da solicitação não permitida" }, { status: 403 });
  }
  return null;
}

export function rejectRateLimitedRequest(request: NextRequest, scope: string, limit: number, windowMs: number) {
  const now = Date.now();
  const key = `${scope}:${clientAddress(request)}`;
  const bucket = localBuckets.get(key);
  if (!bucket && localBuckets.size >= MAX_RATE_LIMIT_BUCKETS) {
    for (const [bucketKey, value] of localBuckets) {
      if (value.resetAt <= now) localBuckets.delete(bucketKey);
    }
    if (localBuckets.size >= MAX_RATE_LIMIT_BUCKETS) {
      const nextReset = Math.min(...Array.from(localBuckets.values(), (value) => value.resetAt));
      const retryAfter = Math.max(1, Math.ceil((nextReset - now) / 1000));
      return NextResponse.json(
        { erro: "Muitas tentativas. Aguarde um momento e tente novamente." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }
  }
  const active = bucket && bucket.resetAt > now ? bucket : { count: 0, resetAt: now + windowMs };
  active.count += 1;
  localBuckets.set(key, active);

  if (active.count <= limit) return null;
  const retryAfter = Math.max(1, Math.ceil((active.resetAt - now) / 1000));
  return NextResponse.json(
    { erro: "Muitas tentativas. Aguarde um momento e tente novamente." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}

export function clearRateLimit(request: NextRequest, scope: string) {
  localBuckets.delete(`${scope}:${clientAddress(request)}`);
}

export async function readJsonBody<T>(request: NextRequest): Promise<T> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) throw new Error("Corpo da solicitação muito grande");

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) throw new Error("Corpo da solicitação muito grande");
  return JSON.parse(rawBody) as T;
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
