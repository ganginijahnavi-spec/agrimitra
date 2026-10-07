const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const DEFAULT_TIMEOUT_MS = 20_000;

export type GroqMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export class GroqError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "GroqError";
  }
}

// Verified live against api.groq.com on 2026-09-23. A reasoning model:
// low reasoning_effort keeps latency/cost down for a Q&A chatbot and
// leaves enough of max_tokens for the actual answer.
export async function groqChatCompletion(
  messages: GroqMessage[],
  options: { maxTokens?: number; temperature?: number; timeoutMs?: number } = {},
): Promise<string> {
  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) throw new GroqError("GROQ_API_KEY is not configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        messages,
        max_tokens: options.maxTokens ?? 1024,
        temperature: options.temperature ?? 0.5,
        reasoning_effort: "low",
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new GroqError(`Groq request failed: ${response.status} ${body}`, response.status);
    }

    const payload = await response.json();
    const content = payload.choices?.[0]?.message?.content;

    if (typeof content !== "string" || content.trim() === "") {
      throw new GroqError("Groq returned an empty response");
    }

    return content;
  } catch (error) {
    if (error instanceof GroqError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new GroqError("Groq request timed out");
    }
    throw new GroqError(`Groq request failed: ${String(error)}`);
  } finally {
    clearTimeout(timeout);
  }
}

// Verified live against api.groq.com on 2026-09-23. The plan's originally
// specified vision model (meta-llama/llama-4-scout) is no longer listed;
// qwen/qwen3.8-27b is the current vision-capable model with json_object
// support. Note: this model has tight on-demand rate limits (~1000 output
// tokens/min, ~7000 input tokens/min at time of writing) — keep images
// resized and max_tokens modest.
export async function groqVisionAnalysis(
  systemPrompt: string,
  userText: string,
  imageBase64: string,
  mimeType: string,
  options: { maxTokens?: number; timeoutMs?: number } = {},
): Promise<string> {
  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) throw new GroqError("GROQ_API_KEY is not configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "qwen/qwen3.8-27b",
        max_tokens: options.maxTokens ?? 700,
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: userText },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new GroqError(`Groq vision request failed: ${response.status} ${body}`, response.status);
    }

    const payload = await response.json();
    const content = payload.choices?.[0]?.message?.content;

    if (typeof content !== "string" || content.trim() === "") {
      throw new GroqError("Groq vision returned an empty response");
    }

    return content;
  } catch (error) {
    if (error instanceof GroqError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new GroqError("Groq vision request timed out");
    }
    throw new GroqError(`Groq vision request failed: ${String(error)}`);
  } finally {
    clearTimeout(timeout);
  }
}

// Verified live against api.groq.com on 2026-09-23. whisper-large-v3-turbo
// is OpenAI-compatible (multipart /audio/transcriptions), supports the same
// ~99 Whisper languages (including Telugu, "te") via an optional
// ISO-639-1 `language` hint, and is far cheaper/faster than
// whisper-large-v3 with only a small accuracy tradeoff — a good fit for
// short voice messages. Free-tier cap is 25MB per file.
export async function groqTranscribe(
  audioBytes: Uint8Array<ArrayBuffer>,
  mimeType: string,
  language: "en" | "te" | undefined,
  options: { timeoutMs?: number } = {},
): Promise<string> {
  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) throw new GroqError("GROQ_API_KEY is not configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const extension = mimeType.includes("wav")
      ? "wav"
      : mimeType.includes("ogg")
        ? "ogg"
        : mimeType.includes("mp4") || mimeType.includes("m4a")
          ? "m4a"
          : "webm";

    const form = new FormData();
    form.append("file", new Blob([audioBytes], { type: mimeType }), `audio.${extension}`);
    form.append("model", "whisper-large-v3-turbo");
    form.append("response_format", "json");
    if (language) form.append("language", language);

    const response = await fetch(`${GROQ_BASE_URL}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new GroqError(
        `Groq transcription request failed: ${response.status} ${body}`,
        response.status,
      );
    }

    const payload = await response.json();
    const text = payload.text;

    if (typeof text !== "string") {
      throw new GroqError("Groq transcription returned no text");
    }

    return text.trim();
  } catch (error) {
    if (error instanceof GroqError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new GroqError("Groq transcription request timed out");
    }
    throw new GroqError(`Groq transcription request failed: ${String(error)}`);
  } finally {
    clearTimeout(timeout);
  }
}
