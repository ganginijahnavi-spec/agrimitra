import { createClient } from "@/lib/supabase/server";

export type EdgeFunctionResult<T> =
  | { data: T; error: null; status: number }
  | { data: null; error: string; status: number };

// Calls a Supabase Edge Function with the current user's JWT attached, so
// the function can verify the caller and apply per-user rate limits.
// Server-side only.
// Long enough for the Edge Functions' own 20s Groq timeouts plus overhead,
// so a hung upstream can never freeze a page indefinitely.
const DEFAULT_TIMEOUT_MS = 30_000;

export async function callEdgeFunction<T>(
  functionName: string,
  options: {
    method?: "GET" | "POST";
    searchParams?: Record<string, string | undefined>;
    body?: unknown;
    timeoutMs?: number;
    // Supabase regional invocation, e.g. "ap-south-1" (Mumbai). By default a
    // function runs near the caller — the Vercel server, not the farmer.
    region?: string;
  } = {},
): Promise<EdgeFunctionResult<T>> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return { data: null, error: "unauthorized", status: 401 };
  }

  const url = new URL(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${functionName}`);
  for (const [key, value] of Object.entries(options.searchParams ?? {})) {
    if (value) url.searchParams.set(key, value);
  }

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.region ? { "x-region": options.region } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch {
    return { data: null, error: "network_error", status: 0 };
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    return {
      data: null,
      error: (body?.error as string) ?? "request_failed",
      status: response.status,
    };
  }

  try {
    const data = (await response.json()) as T;
    return { data, error: null, status: response.status };
  } catch {
    return { data: null, error: "network_error", status: 0 };
  }
}
