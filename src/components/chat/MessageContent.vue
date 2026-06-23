<script setup lang="ts">
import { computed } from "vue";
import { renderMarkdown } from "../../utils/markdown";

const props = defineProps<{
  text: string;
  baseFolder?: string;
}>();

const html = computed(() => renderMarkdown(props.text));

function resolveFilePath(value: string) {
  if (/^[A-Za-z]:[\\/]/.test(value) || value.startsWith("/") || value.startsWith("\\\\")) return value;
  if (!props.baseFolder) return value;
  return `${props.baseFolder.replace(/[\\/]+$/, "")}\\${value.replace(/^@/, "").replace(/[\\/]+/g, "\\")}`;
}

function handleClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  const anchor = target?.closest("a") as HTMLAnchorElement | null;
  if (anchor?.href) {
    event.preventDefault();
    void window.studio.openExternal(anchor.href);
    return;
  }
  const fileButton = target?.closest("[data-file-path]") as HTMLElement | null;
  const filePath = fileButton?.dataset.filePath;
  if (filePath) {
    event.preventDefault();
    void window.studio.openPath(resolveFilePath(filePath));
  }
}
</script>

<template>
  <div class="msg-text markdown-body" @click="handleClick" v-html="html"></div>
</template>
