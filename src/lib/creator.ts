export const CREATOR = {
  name: "G. Jahnavi",
  dateOfBirth: "2-7-2007",
  photo: "/creator.jpg",
} as const;

// Prefix marking a stored assistant message as the creator card. Kept as an
// HTML comment so the readable sentence after it still makes sense as chat
// history when it's sent back to the AI model.
const CREATOR_MARKER = "<!--agrimitra:creator-card-->";

const CREATOR_REPLY_TEXT = {
  en: "AgriMitra AI was created by G. Jahnavi, a B.Tech Computer Science & Engineering student.",
  te: "AgriMitra AIని G. Jahnavi రూపొందించారు. వారు B.Tech కంప్యూటర్ సైన్స్ & ఇంజనీరింగ్ విద్యార్థి.",
} as const;

export function creatorReply(language: "en" | "te"): string {
  return `${CREATOR_MARKER}\n${CREATOR_REPLY_TEXT[language]}`;
}

export function isCreatorReply(content: string): boolean {
  return content.startsWith(CREATOR_MARKER);
}

export function creatorReplyText(content: string): string {
  return content.slice(CREATOR_MARKER.length).trim();
}

const APP_REF = String.raw`(?:you|yourself|u|agri\s*mitra(?:\s*ai)?|(?:this|the|your)\s+(?:app|application|project|website|site|bot|chat\s*bot|platform|ai|assistant|tool|portal|system|software))`;
const MAKE_VERB = String.raw`(?:made|make|built|build|created|create|developed|develop|designed|design|invented|programmed|coded)`;
const CREATOR_NOUN = String.raw`(?:creator|developer|founder|maker|author|owner|designer|programmer)s?`;

const ENGLISH_PATTERNS = [
  // "who made this project", "who created you", "who made this"
  new RegExp(String.raw`\bwho\b.*\b${MAKE_VERB}\s+(?:${APP_REF}|this|it)$`),
  // "who is behind this project"
  new RegExp(String.raw`\bwho\b.*\bbehind\s+(?:${APP_REF}|this|it)$`),
  // "who is the creator", "your developer" — but not "the maker of this pesticide"
  new RegExp(
    String.raw`\b(?:your|ur|the|its)\s+${CREATOR_NOUN}\b(?!\s+of\b(?!\s+${APP_REF}))`,
  ),
  // "creator of this project"
  new RegExp(String.raw`\b${CREATOR_NOUN}\s+of\s+${APP_REF}\b`),
  // "this app is made by whom", "you are made by"
  new RegExp(String.raw`\b${APP_REF}\b.*\b(?:made|built|created|developed|designed)\s+by\b`),
  // "made by whom"
  /^(?:made|built|created|developed|designed)\s+by\s+whom$/,
];

const TE_APP = /ప్రాజెక్ట్|ప్రాజెక్టు|యాప్|అప్లికేషన్|వెబ్‌?సైట్|నిన్ను|నువ్వు|మిమ్మల్ని|బాట్|agrimitra|అగ్రిమిత్ర|అగ్రి మిత్ర/;
const TE_VERB = /తయారు|చేశారు|చేసారు|చేసింది|సృష్టించ|రూపొందించ|నిర్మించ|డెవలప్|అభివృద్ధి/;
const TE_CREATOR_NOUN = /సృష్టికర్త|డెవలపర్|రూపకర్త/;

// Detects "who made this app?"-style questions (English or Telugu) so they
// get the fixed creator card rather than an AI-generated guess.
export function isCreatorQuestion(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .replace(/[‌‍]/g, "")
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized || normalized.length > 120) return false;
  if (ENGLISH_PATTERNS.some((pattern) => pattern.test(normalized))) return true;

  const hasWho = normalized.includes("ఎవరు");
  if (TE_CREATOR_NOUN.test(normalized) && (hasWho || TE_APP.test(normalized))) return true;
  return hasWho && TE_APP.test(normalized) && TE_VERB.test(normalized);
}
