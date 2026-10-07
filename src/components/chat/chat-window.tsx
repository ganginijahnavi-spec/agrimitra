"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { AlertCircle, Loader2, Mic, Send, Square, Volume2, VolumeX } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { sendChatMessageAction } from "@/lib/actions/chat";
import type { ChatMessage } from "@/lib/chat";
import { useVoiceInput } from "@/hooks/use-voice-input";
import { useTextToSpeech } from "@/hooks/use-text-to-speech";
import { stripMarkdown } from "@/lib/markdown";
import { creatorReplyText, isCreatorReply } from "@/lib/creator";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MessageContent } from "./message-content";
import { CreatorCard } from "./creator-card";

const EXAMPLE_KEYS = ["1", "2", "3", "4", "5"] as const;

export function ChatWindow({
  chatId,
  initialMessages,
  language,
  initialInput,
}: {
  chatId: string | null;
  initialMessages: ChatMessage[];
  language: "en" | "te";
  initialInput?: string;
}) {
  const t = useTranslations("Chat");
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState(initialInput ?? "");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const voice = useVoiceInput(language);
  const tts = useTextToSpeech(language);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isPending]);

  function handleMicClick() {
    if (voice.status === "recording") {
      voice.stop();
      return;
    }
    if (voice.status !== "idle") return;

    voice.start((text) => {
      setInput((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text));
      inputRef.current?.focus();
    });
  }

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isPending) return;

    setErrorKey(null);
    setLastFailedMessage(null);
    setInput("");

    setMessages((prev) => [
      ...prev,
      {
        id: `temp-user-${Date.now()}`,
        role: "user",
        content: trimmed,
        created_at: new Date().toISOString(),
      },
    ]);

    startTransition(async () => {
      const result = await sendChatMessageAction({ chatId, message: trimmed, language });

      if (result.status === "error") {
        setErrorKey(result.errorKey);
        setLastFailedMessage(trimmed);
        return;
      }

      if (!chatId) {
        router.push(`/chat/${result.chatId}`);
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `temp-assistant-${Date.now()}`,
          role: "assistant",
          content: result.assistantMessage,
          created_at: new Date().toISOString(),
        },
      ]);
    });
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    submit(input);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit(input);
    }
  }

  const showEmptyState = messages.length === 0 && !isPending && !input.trim();

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        {showEmptyState ? (
          <div className="mx-auto flex max-w-lg flex-col items-center gap-4 pt-8 text-center">
            <h2 className="text-xl font-semibold text-foreground">{t("emptyTitle")}</h2>
            <p className="text-muted-foreground">{t("emptySubtitle")}</p>
            <div className="grid w-full gap-2 sm:grid-cols-2">
              {EXAMPLE_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => submit(t(`examplePrompts.${key}`))}
                  className="rounded-lg border border-border bg-card px-3 py-2.5 text-left text-sm hover:bg-accent/40"
                >
                  {t(`examplePrompts.${key}`)}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div
            className="mx-auto flex max-w-2xl flex-col gap-4"
            role="log"
            aria-live="polite"
          >
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-card text-card-foreground shadow-sm"
                  }`}
                >
                  {message.role === "assistant" && isCreatorReply(message.content) ? (
                    <CreatorCard />
                  ) : (
                    <MessageContent content={message.content} />
                  )}
                  {message.role === "assistant" && tts.supported && (
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      className="-ml-1.5 mt-1"
                      onClick={() =>
                        tts.speak(
                          message.id,
                          isCreatorReply(message.content)
                            ? creatorReplyText(message.content)
                            : stripMarkdown(message.content),
                        )
                      }
                      aria-label={
                        tts.speakingId === message.id ? t("stopSpeaking") : t("speak")
                      }
                    >
                      {tts.speakingId === message.id ? (
                        <VolumeX className="size-3.5" aria-hidden="true" />
                      ) : (
                        <Volume2 className="size-3.5" aria-hidden="true" />
                      )}
                    </Button>
                  )}
                </div>
              </div>
            ))}

            {isPending && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1.5 rounded-2xl bg-card px-4 py-3 text-muted-foreground shadow-sm">
                  <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-current" />
                  <span className="sr-only">{t("thinking")}</span>
                </div>
              </div>
            )}

            {errorKey && (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                  <span>{t(`errors.${errorKey}`)}</span>
                  {lastFailedMessage && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => submit(lastFailedMessage)}
                    >
                      {t("retry")}
                    </Button>
                  )}
                </AlertDescription>
              </Alert>
            )}

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-border/70 p-3 sm:p-4">
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <label htmlFor="chat-input" className="sr-only">
            {t("inputLabel")}
          </label>
          <textarea
            ref={inputRef}
            id="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              voice.status === "recording"
                ? t("recording")
                : voice.status === "transcribing"
                  ? t("transcribing")
                  : t("inputPlaceholder")
            }
            disabled={voice.status === "transcribing"}
            rows={1}
            className="max-h-32 flex-1 resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
          />
          {voice.isSupported && (
            <Button
              type="button"
              size="icon"
              variant={voice.status === "recording" ? "destructive" : "outline"}
              disabled={voice.status === "transcribing"}
              onClick={handleMicClick}
              aria-label={voice.status === "recording" ? t("micStop") : t("micLabel")}
            >
              {voice.status === "transcribing" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : voice.status === "recording" ? (
                <Square className="size-4" aria-hidden="true" />
              ) : (
                <Mic className="size-4" aria-hidden="true" />
              )}
            </Button>
          )}
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || isPending}
            aria-label={t("send")}
          >
            <Send className="size-4" aria-hidden="true" />
          </Button>
        </div>
        {voice.errorKey && (
          <p
            role="alert"
            className="mx-auto mt-2 max-w-2xl text-center text-xs text-destructive"
          >
            {t(`voiceErrors.${voice.errorKey}`)}
          </p>
        )}
        <p className="mx-auto mt-2 max-w-2xl text-center text-xs text-muted-foreground">
          {t("disclaimer")}
        </p>
      </form>
    </div>
  );
}
