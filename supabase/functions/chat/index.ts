import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { getAuthenticatedUser } from "../_shared/auth.ts";
import { checkRateLimit } from "../_shared/rateLimit.ts";
import { groqChatCompletion, type GroqMessage } from "../_shared/groq.ts";

const DAILY_CHAT_LIMIT = 50;
const HISTORY_LIMIT = 10;
const MAX_MESSAGE_LENGTH = 2000;

type Profile = {
  full_name: string | null;
  village: string | null;
  district: string | null;
  state: string | null;
  farm_size_acres: number | null;
};

type Crop = {
  crop_name: string;
  variety: string | null;
  sowing_date: string | null;
  expected_harvest_date: string | null;
};

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

  let body: { chat_id?: string | null; message?: string; language?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_body" }, 400);
  }

  const message = body.message?.trim();
  const language = body.language === "te" ? "te" : "en";
  const chatId = body.chat_id || null;

  if (!message) {
    return jsonResponse({ error: "empty_message" }, 400);
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return jsonResponse({ error: "message_too_long" }, 400);
  }

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
  );
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { allowed } = await checkRateLimit(admin, user.id, "chat", DAILY_CHAT_LIMIT);
  if (!allowed) {
    return jsonResponse({ error: "rate_limited" }, 429);
  }

  // Resolve the chat: an existing one (RLS confirms ownership) or a new one.
  let resolvedChatId = chatId;
  let isNewChat = false;

  if (resolvedChatId) {
    const { data: existingChat } = await userClient
      .from("chats")
      .select("id")
      .eq("id", resolvedChatId)
      .maybeSingle();
    if (!existingChat) {
      return jsonResponse({ error: "chat_not_found" }, 404);
    }
  } else {
    const { data: newChat, error: createError } = await userClient
      .from("chats")
      .insert({ user_id: user.id, language })
      .select("id")
      .single();
    if (createError || !newChat) {
      console.error("chat: failed to create chat", createError);
      return jsonResponse({ error: "internal_error" }, 500);
    }
    resolvedChatId = newChat.id;
    isNewChat = true;
  }

  const [{ data: profile }, { data: crops }, { data: history }] = await Promise.all([
    userClient
      .from("profiles")
      .select("full_name, village, district, state, farm_size_acres")
      .eq("id", user.id)
      .single<Profile>(),
    userClient
      .from("crops")
      .select("crop_name, variety, sowing_date, expected_harvest_date")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10)
      .overrideTypes<Crop[]>(),
    userClient
      .from("chat_messages")
      .select("role, content")
      .eq("chat_id", resolvedChatId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT)
      .overrideTypes<{ role: "user" | "assistant"; content: string }[]>(),
  ]);

  const orderedHistory = (history ?? []).slice().reverse();
  const systemPrompt = buildSystemPrompt({ profile: profile ?? null, crops: crops ?? [], language });

  const groqMessages: GroqMessage[] = [
    { role: "system", content: systemPrompt },
    ...orderedHistory.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: message },
  ];

  let assistantReply: string;
  try {
    assistantReply = await groqChatCompletion(groqMessages, { maxTokens: 1024, temperature: 0.5 });
  } catch (error) {
    console.error("chat: groq call failed", error);
    return jsonResponse({ error: "assistant_unavailable" }, 502);
  }

  const { error: insertError } = await userClient.from("chat_messages").insert([
    { chat_id: resolvedChatId, user_id: user.id, role: "user", content: message },
    { chat_id: resolvedChatId, user_id: user.id, role: "assistant", content: assistantReply },
  ]);
  if (insertError) {
    console.error("chat: failed to save messages", insertError);
  }

  // Touch the chat row so its updated_at (and the sidebar's ordering)
  // reflects the latest activity; set a title the first time.
  let title: string | null = null;
  const chatUpdate: Record<string, unknown> = { language };
  if (isNewChat) {
    title = message.length > 60 ? `${message.slice(0, 57)}...` : message;
    chatUpdate.title = title;
  }
  await userClient.from("chats").update(chatUpdate).eq("id", resolvedChatId);

  return jsonResponse(
    {
      chat_id: resolvedChatId,
      title,
      message: { role: "assistant", content: assistantReply },
    },
    200,
  );
});

function buildSystemPrompt(opts: {
  profile: Profile | null;
  crops: Crop[];
  language: "en" | "te";
}): string {
  const { profile, crops, language } = opts;

  const location = [profile?.village, profile?.district, profile?.state]
    .filter(Boolean)
    .join(", ");
  const cropLines = crops.length
    ? crops
        .map(
          (c) =>
            `- ${c.crop_name}${c.variety ? ` (${c.variety})` : ""}${c.sowing_date ? `, sown ${c.sowing_date}` : ""}`,
        )
        .join("\n")
    : "No crops recorded yet.";

  const languageInstruction =
    language === "te"
      ? "Reply in Telugu. Use simple, everyday Telugu a farmer would understand — avoid overly formal or literary words."
      : "Reply in English. Use simple, everyday language a farmer would understand.";

  return `You are AgriMitra AI, a friendly decision-support assistant for Indian farmers. You are NOT a licensed agricultural expert and must never claim to be one.

Safety rules you must always follow:
- If you are unsure, say so plainly. Ask a clarifying question when key details are missing (crop, growth stage, location, symptoms).
- Never promise results, yields, or profits, and never give guaranteed price predictions.
- NEVER state a specific dosage, concentration, application rate, ratio, or mixing instruction for ANY input the farmer would apply to soil, water, or plants — this includes pesticides, fungicides, herbicides, AND fertilizers or nutrients (no NPK ratios, no kg/hectare, no g/m², no ml/litre, no "X g per plant", no spray strengths, nothing numeric). This rule applies even if you are confident, even if asked directly, and even for common products like urea or neem oil. Instead, name the general category (e.g. "a nitrogen fertilizer" or "a copper-based fungicide") and always tell the farmer to confirm the exact product and dose with a local agriculture officer, Krishi Vigyan Kendra (KVK), or a licensed dealer before applying anything.
- For serious or spreading problems, recommend the farmer see a qualified agricultural expert in person.
- Stay focused on agriculture topics. Politely decline unrelated requests and steer the conversation back to farming.
- If asked who made, created or developed you or this app: AgriMitra AI was created by G. Jahnavi, a B.Tech Computer Science & Engineering student. Don't invent any other details about them.
- ${languageInstruction}

Farmer's context (use it naturally, don't just repeat it back):
- Location: ${location || "Not set"}
- Farm size: ${profile?.farm_size_acres ? `${profile.farm_size_acres} acres` : "Not set"}
- Crops:
${cropLines}`;
}
