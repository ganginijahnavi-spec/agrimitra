import { CalendarDays, GraduationCap, Sprout } from "lucide-react";
import { useTranslations } from "next-intl";
import { CREATOR } from "@/lib/creator";

export function CreatorCard() {
  const t = useTranslations("Chat.creator");

  return (
    <div className="flex flex-col items-center gap-3 py-1 text-center sm:flex-row sm:items-start sm:text-left">
      {/* eslint-disable-next-line @next/next/no-img-element -- small static photo inside a chat bubble */}
      <img
        src={CREATOR.photo}
        alt={t("photoAlt", { name: CREATOR.name })}
        width={96}
        height={96}
        className="size-24 shrink-0 rounded-full object-cover ring-2 ring-primary/30"
      />
      <div className="min-w-0 space-y-1.5">
        <p className="text-xs font-medium tracking-wide text-primary uppercase">{t("title")}</p>
        <p className="text-lg font-semibold text-foreground">{CREATOR.name}</p>
        <p className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground sm:justify-start">
          <Sprout className="size-4 shrink-0 text-primary" aria-hidden="true" />
          {t("role")}
        </p>
        <p className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground sm:justify-start">
          <GraduationCap className="size-4 shrink-0 text-primary" aria-hidden="true" />
          {t("education")}
        </p>
        <p className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground sm:justify-start">
          <CalendarDays className="size-4 shrink-0 text-primary" aria-hidden="true" />
          {t("dateOfBirth")}: {CREATOR.dateOfBirth}
        </p>
      </div>
    </div>
  );
}
