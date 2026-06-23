<script setup lang="ts">
import { ChevronDown, FileJson, GitFork, Paperclip, Pencil, Play, Square, Trash2, Upload } from "@lucide/vue";
import { computed, nextTick, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useStudioStore } from "../../stores/studio";

const studio = useStudioStore();
const { t } = useI18n();
const dragOver = ref(false);
const inputMirror = ref<HTMLElement | null>(null);
const composerInput = ref<HTMLTextAreaElement | null>(null);
const mentionTooltip = ref({ visible: false, text: "", x: 0, y: 0 });

function onDragOver(e: DragEvent) {
  e.preventDefault();
  dragOver.value = true;
}
function onDragLeave() {
  dragOver.value = false;
}
function onDrop(e: DragEvent) {
  e.preventDefault();
  dragOver.value = false;
  const files = e.dataTransfer?.files;
  if (!files) return;
  for (const file of files) {
    const path = (file as any).path || file.name;
    if (path && typeof path === "string") insertMentionAtCursor(path);
  }
}
async function attachFiles() {
  try {
    const files = await window.studio.pickFiles();
    if (!files || !Array.isArray(files)) return;
    for (const f of files) {
      if (f && typeof f === "string") insertMentionAtCursor(f);
    }
  } catch (e) {
    console.error("[composer] attachFiles error:", e);
  }
}

function sendFromButton() {
  if (studio.isRunning && studio.activeDraft.trim()) {
    studio.queueDraft();
    return;
  }
  void studio.runPrompt();
}

function insertMentionAtCursor(path: string) {
  const clean = path.trim();
  if (!clean) return;
  if (!studio.droppedFiles.includes(clean)) studio.droppedFiles.push(clean);
  const mention = `@${fileName(clean)}`;
  const input = composerInput.value;
  const value = studio.activeDraft;
  let start = input?.selectionStart ?? value.length;
  const end = input?.selectionEnd ?? start;
  let beforeRaw = value.slice(0, start);
  const afterRaw = value.slice(end);
  const pending = beforeRaw.match(/(^|\s)@[^ \n\r\t`"'<>]*$/);
  if (pending?.index !== undefined) {
    start = pending.index + (pending[1] ? pending[1].length : 0);
    beforeRaw = value.slice(0, start);
  }
  const prefix = beforeRaw && !/[\s\n]$/.test(beforeRaw) ? " " : "";
  const suffix = afterRaw && !/^[\s\n]/.test(afterRaw) ? " " : "";
  const insertion = `${prefix}${mention} `;
  const nextValue = `${beforeRaw}${insertion}${suffix}${afterRaw}`.replace(/[ \t]{3,}/g, " ");
  const nextCursor = beforeRaw.length + insertion.length;
  studio.activeDraft = nextValue;
  studio.filePickerOpen = false;
  studio.filePickerQuery = "";
  void nextTick(() => {
    input?.focus();
    input?.setSelectionRange(nextCursor, nextCursor);
    syncMirrorScroll();
  });
}

const highlightedDraft = computed(() => {
  const source = studio.activeDraft || "";
  const mentionRe = /@[^ \n\r\t`"'<>]+/g;
  let html = "";
  let cursor = 0;
  for (const match of source.matchAll(mentionRe)) {
    const start = match.index || 0;
    const token = match[0];
    const path = resolveMentionPath(token.slice(1));
    html += escapeHtml(source.slice(cursor, start));
    html += `<span class="inline-file-mention" data-mention-path="${escapeHtml(path)}" title="${escapeHtml(path)}">${escapeHtml(token)}</span>`;
    cursor = start + token.length;
  }
  html += escapeHtml(source.slice(cursor));
  return html;
});

const draftMentionTooltip = computed(() => {
  return extractMentions(studio.activeDraft).map(resolveMentionPath).join("\n");
});

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function syncMirrorScroll() {
  if (!inputMirror.value || !composerInput.value) return;
  inputMirror.value.scrollTop = composerInput.value.scrollTop;
  inputMirror.value.scrollLeft = composerInput.value.scrollLeft;
}

function handleComposerKeydown(e: KeyboardEvent) {
  if ((e.key === "Backspace" || e.key === "Delete") && removeMentionFromKey(e)) return;
  studio.handleComposerKeydown(e);
}

function handleComposerPaste(e: ClipboardEvent) {
  const input = composerInput.value;
  const pasted = e.clipboardData?.getData("text/plain");
  if (!input || pasted === undefined) return;
  const cleaned = cleanPastedText(pasted);
  e.preventDefault();
  if (!cleaned) return;

  const value = studio.activeDraft;
  const start = input.selectionStart;
  const end = input.selectionEnd;
  const before = value.slice(0, start);
  const after = value.slice(end);
  const prefix = before && cleaned && !/[\s\n]$/.test(before) && !/^[\s\n.,;:!?)}\]]/.test(cleaned) ? " " : "";
  const suffix = after && cleaned && !/[\s\n]$/.test(cleaned) && !/^[\s\n.,;:!?)}\]]/.test(after) ? " " : "";
  const insertion = `${prefix}${cleaned}${suffix}`;
  const nextValue = `${before}${insertion}${after}`;
  const nextCursor = before.length + insertion.length - suffix.length;
  studio.activeDraft = nextValue;
  void nextTick(() => {
    input.focus();
    input.setSelectionRange(nextCursor, nextCursor);
    studio.updateFilePickerFromDraft();
    syncMirrorScroll();
  });
}

function cleanPastedText(value: string) {
  const normalized = value
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+$/gm, "")
    .replace(/^\n+|\n+$/g, "");

  if (!normalized.includes("\n")) {
    return normalized.trim().replace(/[ \t]{2,}/g, " ");
  }

  return normalized
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function removeMentionFromKey(e: KeyboardEvent) {
  const input = composerInput.value;
  if (!input) return false;
  const value = studio.activeDraft;
  const start = input.selectionStart;
  const end = input.selectionEnd;
  const ranges = getMentionRanges(value);
  let deleteStart = start;
  let deleteEnd = end;

  if (start !== end) {
    const touched = ranges.filter((range) => rangesOverlap(start, end, range.start, range.end));
    if (!touched.length) return false;
    deleteStart = Math.min(start, ...touched.map((range) => range.start));
    deleteEnd = Math.max(end, ...touched.map((range) => range.end));
  } else {
    const current = ranges.find((range) => {
      if (e.key === "Backspace") {
        return (start > range.start && start <= range.end) || isCursorAfterMentionWhitespace(value, start, range);
      }
      return start >= range.start && start < range.end;
    });
    if (!current) return false;
    deleteStart = current.start;
    deleteEnd = current.end;
    if (e.key === "Backspace") deleteEnd = extendOverFollowingSpaces(value, deleteEnd);
  }

  e.preventDefault();
  const removedTokens = ranges
    .filter((range) => rangesOverlap(deleteStart, deleteEnd, range.start, range.end))
    .map((range) => range.token.slice(1));
  const nextValue = `${value.slice(0, deleteStart)}${value.slice(deleteEnd)}`.replace(/[ \t]{2,}/g, " ");
  const nextCursor = Math.min(deleteStart, nextValue.length);
  studio.activeDraft = nextValue;
  removeDroppedFilesForTokens(removedTokens);
  void nextTick(() => {
    input.setSelectionRange(nextCursor, nextCursor);
    input.focus();
    syncMirrorScroll();
  });
  return true;
}

function getMentionRanges(value: string) {
  return Array.from(value.matchAll(/@[^ \n\r\t`"'<>]+/g)).map((match) => ({
    start: match.index || 0,
    end: (match.index || 0) + match[0].length,
    token: match[0],
  }));
}

function rangesOverlap(startA: number, endA: number, startB: number, endB: number) {
  return startA < endB && endA > startB;
}

function isCursorAfterMentionWhitespace(value: string, cursor: number, range: { end: number }) {
  if (cursor <= range.end) return false;
  return /^[ \t]+$/.test(value.slice(range.end, cursor));
}

function extendOverFollowingSpaces(value: string, cursor: number) {
  const match = value.slice(cursor).match(/^[ \t]+/);
  return cursor + (match?.[0].length || 0);
}

function removeDroppedFilesForTokens(tokens: string[]) {
  if (!tokens.length) return;
  studio.droppedFiles = studio.droppedFiles.filter((file) => !tokens.some((token) => file === token || fileName(file) === token));
}

function updateMentionTooltip(e: MouseEvent) {
  const mirror = inputMirror.value;
  if (!mirror) return;
  const target = Array.from(mirror.querySelectorAll<HTMLElement>(".inline-file-mention")).find((el) => {
    const rect = el.getBoundingClientRect();
    return e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
  });
  if (!target) {
    hideMentionTooltip();
    return;
  }
  const text = target.dataset.mentionPath || target.title;
  mentionTooltip.value = { visible: true, text, x: e.clientX, y: e.clientY };
}

function hideMentionTooltip() {
  mentionTooltip.value.visible = false;
}

function extractMentions(value: string) {
  return Array.from(value.matchAll(/@([^ \n\r\t`"'<>]+)/g)).map((match) => match[1]);
}

function fileName(path: string) {
  return path.split(/[/\\]/).filter(Boolean).pop() || path;
}

function resolveMentionPath(token: string) {
  const attached = studio.droppedFiles.find((file) => file === token || fileName(file) === token);
  if (attached) return attached;
  const project = studio.projectFiles.find((file) => file.path === token || file.name === token);
  return project?.path || token;
}
</script>

<template>
  <form class="composer" @submit.prevent="studio.isRunning ? studio.queueDraft() : studio.runPrompt()" @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop">
    <div v-if="dragOver" class="drag-overlay">
      <Paperclip :size="20" />
      <span>{{ t("dropFilesHere") || "Drop files here" }}</span>
    </div>

    <div v-if="studio.isRunning" class="composer-run-status">
      <span class="run-dot"></span>
      <span>{{ studio.isStopping ? t("stoppingResponse") : (studio.isAgentCommandActive ? t("commandRunning") : t("responding")) }}</span>
    </div>

    <div v-if="studio.messageQueue.length > 0" class="queue-list">
      <div v-for="q in studio.messageQueue" :key="q.id" class="queue-item">
        <span class="queue-item-text">{{ q.text }}</span>
        <div class="queue-item-actions">
          <button class="queue-action-btn" type="button" :title="t('editMsg')" @click="studio.editQueued(q.id)">
            <Pencil :size="11" />
          </button>
          <button class="queue-action-btn delete" type="button" :title="t('deleteChat')" @click="studio.deleteQueued(q.id)">
            <Trash2 :size="11" />
          </button>
        </div>
      </div>
    </div>

    <div
      class="composer-input-wrap"
      :dir="studio.draftDir"
      @mousemove="updateMentionTooltip"
      @mouseleave="hideMentionTooltip"
    >
      <div
        ref="inputMirror"
        class="composer-input-mirror"
        aria-hidden="true"
        v-html="highlightedDraft"
      ></div>
      <textarea
        ref="composerInput"
        v-model="studio.activeDraft"
        :dir="studio.draftDir"
        :title="draftMentionTooltip"
        :placeholder="studio.isRunning ? t('nextPlaceholder') : t('placeholder')"
        rows="2"
        @keydown="handleComposerKeydown"
        @paste="handleComposerPaste"
        @input="studio.updateFilePickerFromDraft"
        @scroll="syncMirrorScroll"
      />
      <div
        v-if="mentionTooltip.visible"
        class="mention-path-tooltip"
        :style="{ left: `${mentionTooltip.x}px`, top: `${mentionTooltip.y}px` }"
      >
        {{ mentionTooltip.text }}
      </div>
    </div>

    <div v-if="studio.filePickerOpen && studio.fileSuggestions.length" class="file-picker">
      <button
        v-for="file in studio.fileSuggestions"
        :key="file.path"
        type="button"
        @click="insertMentionAtCursor(file.path)"
      >
        <span>{{ file.name }}</span>
        <small>{{ file.path }}</small>
      </button>
    </div>

    <div class="composer-bar">
      <div class="bar-left">
        <button class="sel-btn icon-label" type="button" title="Attach files" @click="attachFiles">
          <Paperclip :size="12" />
        </button>
        <button class="sel-btn icon-label" type="button" title="Fork session" @click="studio.forkCurrentChat">
          <GitFork :size="12" /> Fork
        </button>
        <button class="sel-btn icon-label" type="button" title="Export session" @click="studio.exportCurrentChat">
          <FileJson :size="12" /> Export
        </button>
        <button class="sel-btn icon-label" type="button" title="Import session" @click="studio.importSession">
          <Upload :size="12" /> Import
        </button>

        <div class="dropdown-wrap">
          <button class="sel-btn" type="button" @click.stop="studio.showAgentMenu = !studio.showAgentMenu">
            {{ studio.appSettings.agent }} <ChevronDown :size="12" />
          </button>
          <div v-if="studio.showAgentMenu" class="dropdown" @click.stop>
            <button type="button" @click="studio.selectAgent('build')">{{ t("build") }}</button>
            <button type="button" @click="studio.selectAgent('plan')">{{ t("plan") }}</button>
            <button type="button" @click="studio.selectAgent('compose')">{{ t("compose") }}</button>
          </div>
        </div>

        <div class="dropdown-wrap">
          <button class="sel-btn" type="button" @click.stop="studio.showModelMenu = !studio.showModelMenu">
            {{ studio.currentModel }} <ChevronDown :size="12" />
          </button>
          <div v-if="studio.showModelMenu" class="dropdown" @click.stop>
            <button type="button" @click="studio.selectModel('')">MiMo Auto</button>
          </div>
        </div>
      </div>

      <button v-if="studio.isRunning && !studio.activeDraft.trim()" class="send-btn stop" type="button" :title="t('stopResponse')" :disabled="studio.isStopping" @click="studio.stopRun">
        <Square :size="14" />
      </button>
      <button v-else class="send-btn" type="button" :disabled="!studio.canRun" @click="sendFromButton">
        <Play :size="14" />
      </button>
    </div>
  </form>
</template>
