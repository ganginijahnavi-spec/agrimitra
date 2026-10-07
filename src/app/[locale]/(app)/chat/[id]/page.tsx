import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { ChatWindow } from "@/components/chat/chat-window";

export default async function ChatDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const { data: chat } = await supabase
    .from("chats")
    .select("id")
    .eq("id", id)
    .single();

  if (!chat) {
    notFound();
  }

  const { data: messages } = await supabase
    .from("chat_messages")
    .select("id, role, content, created_at")
    .eq("chat_id", id)
    .order("created_at", { ascending: true });

  return (
    <ChatWindow
      key={id}
      chatId={id}
      initialMessages={messages ?? []}
      // Follow the language the app is in right now, not the one the chat
      // started in, so switching to Telugu switches the replies too.
      language={locale === "te" ? "te" : "en"}
    />
  );
}
