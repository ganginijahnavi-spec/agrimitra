"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { callEdgeFunction } from "@/lib/functions";
import { createClient } from "@/lib/supabase/server";
import { creatorReply, isCreatorQuestion } from "@/lib/creator";
import type { ChatFunctionResponse } from "@/lib/chat";

export type SendChatMessageResult =
  | { status: "success"; chatId: string; title: string | null; assistantMessage: string }
  | { status: "error"; errorKey: "unauthorized" | "rateLimited" | "unavailable" | "generic" };

type SendChatMessageInput = {
  chatId: string | null;
  message: string;
  language: "en" | "te";
};

export async function sendChatMessageAction(
  input: SendChatMessageInput,
): Promise<SendChatMessageResult> {
  const result = isCreatorQuestion(input.message)
    ? await saveCreatorReply(input)
    : await askAssistant(input);

  if (result.status === "success") {
    const locale = await getLocale();
    revalidatePath(`/${locale}/chat`);
    revalidatePath(`/${locale}/dashboard`);
  }
  return result;
}

async function askAssistant(input: SendChatMessageInput): Promise<SendChatMessageResult> {
  const { data, error, status } = await callEdgeFunction<ChatFunctionResponse>("chat", {
    method: "POST",
    body: { chat_id: input.chatId, message: input.message, language: input.language },
  });

  if (error || !data) {
    const errorKey =
      status === 401
        ? "unauthorized"
        : status === 429
          ? "rateLimited"
          : status === 502
            ? "unavailable"
            : "generic";
    return { status: "error", errorKey };
  }

  return {
    status: "success",
    chatId: data.chat_id,
    title: data.title,
    assistantMessage: data.message.content,
  };
}

// Answers "who made this?" with the fixed creator card instead of asking
// the model, and saves both turns like a normal exchange so the card stays
// in the conversation history. Doesn't count against the daily AI limit.
async function saveCreatorReply(input: SendChatMessageInput): Promise<SendChatMessageResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", errorKey: "unauthorized" };

  const message = input.message.trim();
  let chatId = input.chatId;
  let title: string | null = null;

  if (chatId) {
    const { data: chat } = await supabase
      .from("chats")
      .update({ language: input.language })
      .eq("id", chatId)
      .select("id")
      .maybeSingle();
    if (!chat) return { status: "error", errorKey: "generic" };
  } else {
    title = message.length > 60 ? `${message.slice(0, 57)}...` : message;
    const { data: chat, error } = await supabase
      .from("chats")
      .insert({ user_id: user.id, language: input.language, title })
      .select("id")
      .single();
    if (error || !chat) return { status: "error", errorKey: "generic" };
    chatId = chat.id as string;
  }

  const assistantMessage = creatorReply(input.language);
  const { error } = await supabase.from("chat_messages").insert([
    { chat_id: chatId, user_id: user.id, role: "user", content: message },
    { chat_id: chatId, user_id: user.id, role: "assistant", content: assistantMessage },
  ]);
  if (error) return { status: "error", errorKey: "generic" };

  return { status: "success", chatId, title, assistantMessage };
}
