import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { fallbackLocale, setI18nLocale } from "../i18n";
import type { Language } from "../types";

export const useLanguageStore = defineStore("language", () => {
  const locale = ref<Language>(fallbackLocale);
  const direction = computed(() => (locale.value === "fa" ? "rtl" : "ltr"));

  function setLanguage(nextLocale: Language) {
    locale.value = nextLocale;
    setI18nLocale(nextLocale);
  }

  return {
    locale,
    direction,
    setLanguage
  };
});
