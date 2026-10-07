import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { getAuthenticatedUser } from "../_shared/auth.ts";
import { checkRateLimit } from "../_shared/rateLimit.ts";
import { groqTranscribe, GroqError } from "../_shared/groq.ts";

const DAILY_TRANSCRIBE_LIMIT = 30;
// Client recordings are capped at 60s of opus-encoded audio (a few hundred
// KB); this ceiling is just a defense-in-depth backstop, well under Groq's
// 25MB free-tier file limit.
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ["audio/webm", "audio/ogg", "audio/mp4", "audio/wav", "audio/mpeg"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const user = await getAuthenticatedUser(req);
  if (!user) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  let body: { audio_base64?: string; mime_type?: string; language?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_body" }, 400);
  }

  const audioBase64 = body.audio_base64?.trim();
  const mimeType = body.mime_type?.split(";")[0]?.trim() ?? "";
  const language = body.language === "te" ? "te" : body.language === "en" ? "en" : undefined;

  if (!audioBase64) {
    return jsonResponse({ error: "empty_audio" }, 400);
  }
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return jsonResponse({ error: "invalid_mime_type" }, 400);
  }
  // Rough pre-check before decoding: base64 is ~4/3 the size of the
  // original bytes.
  if (audioBase64.length > (MAX_AUDIO_BYTES * 4) / 3) {
    return jsonResponse({ error: "audio_too_large" }, 400);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { allowed } = await checkRateLimit(admin, user.id, "transcribe", DAILY_TRANSCRIBE_LIMIT);
  if (!allowed) {
    return jsonResponse({ error: "rate_limited" }, 429);
  }

  let audioBytes: Uint8Array<ArrayBuffer>;
  try {
    const binary = atob(audioBase64);
    audioBytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) audioBytes[i] = binary.charCodeAt(i);
  } catch {
    return jsonResponse({ error: "invalid_body" }, 400);
  }

  if (audioBytes.byteLength === 0) {
    return jsonResponse({ error: "empty_audio" }, 400);
  }
  if (audioBytes.byteLength > MAX_AUDIO_BYTES) {
    return jsonResponse({ error: "audio_too_large" }, 400);
  }

  let text: string;
  try {
    text = await groqTranscribe(audioBytes, mimeType, language);
  } catch (error) {
    console.error("transcribe: groq call failed", error);
    const status = error instanceof GroqError && error.status === 429 ? 429 : 502;
    return jsonResponse(
      { error: status === 429 ? "rate_limited" : "transcription_unavailable" },
      status,
    );
  }

  if (!text) {
    return jsonResponse({ error: "empty_transcription" }, 502);
  }

  return jsonResponse({ text }, 200);
});
