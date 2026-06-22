import { createI18n } from "vue-i18n";
import type { Language } from "../types";
import { messages, type MessageKey } from "./messages";

export const fallbackLocale: Language = "en";

export const i18n = createI18n({
  legacy: false,
  locale: fallbackLocale,
  fallbackLocale,
  messages
});

export function setI18nLocale(locale: Language) {
  i18n.global.locale.value = locale;
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === "fa" ? "rtl" : "ltr";
}

export function translate(key: MessageKey) {
  return i18n.global.t(key);
}
