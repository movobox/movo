import type { Chat, ChatAttachment, ChatMessage } from "../types";

const RTL_RE = /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u0780-\u07BF\u07C0-\u07FF\u08A0-\u08FF\u200F\u202B\u202E\uFB1D-\uFDFF\uFE70-\uFEFF]/;
const LTR_RE = /[A-Za-z]/;

export function uid() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function now() {
  return new Date().toISOString();
}

export function makeChat(title: string, folder = ""): Chat {
  const ts = now();
  return {
    id: uid(),
    title,
    folder,
    messages: [],
    draft: "",
    queuedMessages: [],
    createdAt: ts,
    updatedAt: ts
  };
}

export function makeMessage(role: ChatMessage["role"], text: string, attachments: ChatAttachment[] = []): ChatMessage {
  return { id: uid(), role, text, createdAt: now(), ...(attachments.length ? { attachments } : {}) };
}

export function normalizeChat(chat: Partial<Chat>, fallbackTitle: string): Chat {
  const ts = now();
  return {
    id: chat.id || uid(),
    title: chat.title || fallbackTitle,
    folder: chat.folder || "",
    messages: Array.isArray(chat.messages) ? chat.messages.map((message) => ({
      ...message,
      attachments: Array.isArray(message.attachments) ? message.attachments : undefined
    })) : [],
    draft: chat.draft || "",
    queuedMessages: Array.isArray(chat.queuedMessages) ? chat.queuedMessages : [],
    createdAt: chat.createdAt || ts,
    updatedAt: chat.updatedAt || ts
  };
}

export function lineDir(line: string): "ltr" | "rtl" {
  const trimmed = stripDirectionMarkers(line);
  if (!trimmed) return "ltr";
  for (const char of trimmed) {
    if (RTL_RE.test(char)) return "rtl";
    if (LTR_RE.test(char)) return "ltr";
  }
  return "ltr";
}

export function stripDirectionMarkers(value: string) {
  return value
    .trimStart()
    .replace(/^#{1,6}\s+/, "")
    .replace(/^>\s*/, "")
    .replace(/^[-+*]\s+/, "")
    .replace(/^\[[ xX]\]\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .replace(/^[()[\]{}"'`*_~\s:;,.!?؟،؛\-–—]+/, "")
    .trimStart();
}

export function relativeTime(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const hours = Math.max(1, Math.round(diff / 3_600_000));
  return hours < 24 ? `${hours}h` : `${Math.round(hours / 24)}d`;
}

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}
