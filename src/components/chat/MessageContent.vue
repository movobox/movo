<script setup lang="ts">
import { computed } from "vue";
import { renderMarkdown } from "../../utils/markdown";

const props = defineProps<{
  text: string;
}>();

const html = computed(() => renderMarkdown(props.text));
</script>

<template>
  <div class="msg-text markdown-body" v-html="html"></div>
</template>
