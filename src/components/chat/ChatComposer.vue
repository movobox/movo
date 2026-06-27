<script setup lang="ts">
import { ChevronDown, File, FileJson, GitFork, ImageIcon, Paperclip, Pencil, Play, Square, Trash2, Upload, X } from "@lucide/vue";
import { computed, nextTick, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useStudioStore } from "../../stores/studio";

const studio = useStudioStore();
const { t } = useI18n();
const dragOver = ref(false);
const inputMirror = ref<HTMLElement | null>(null);
const composerInput = ref<HTMLTextAreaElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const mentionTooltip = ref({ visible: false, text: "", x: 0, y: 0 });
const imagePreview = ref<{ src: string; name: string; path: string } | null>(null);

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
    void attachDroppedFile(file);
  }
}
function attachFiles() {
  fileInput.value?.click();
}

function handleFileInputChange(event: Event) {
  const input = event.target as HTMLInputElement | null;
  const files = input?.files;
  if (!files) return;
  for (const file of files) {
    void attachDroppedFile(file);
  }
  if (input) input.value = "";
}

function sendFromButton() {
  if (studio.isRunning && studio.activeDraft.trim()) {
    studio.queueDraft();
    return;
  }
  void studio.runPrompt();
}

function openImagePreview(attachment: { path: string; name: string; previewUrl?: string; filePreviewUrl?: string }) {
  const src = attachment.previewUrl || attachment.filePreviewUrl;
  if (!src) return;
  imagePreview.value = { src, name: attachment.name, path: attachment.path };
}

function closeImagePreview() {
  imagePreview.value = null;
}

async function attachPath(path: string) {
  const clean = path.trim();
  if (!clean) return;
  const resolved = resolveInputPath(clean);
  try {
    const info = await window.studio.inspectFile?.(resolved);
    if (info?.ok && info.mentionable) {
      insertMentionAtCursor(info.path);
      return;
    }
    if (info?.ok) {
      studio.addDraftAttachment({
        path: info.path,
        name: info.name,
        kind: info.isImage ? "image" : "binary",
        mime: info.mime,
        size: info.size,
        previewUrl: info.previewUrl,
        filePreviewUrl: info.filePreviewUrl
      });
      return;
    }
  } catch {}
  if (isCodeLikePath(resolved)) {
    insertMentionAtCursor(resolved);
    return;
  }
  await studio.attachFile(resolved);
}

function attachInspectedFile(info: {
  ok: boolean;
  path: string;
  name: string;
  isImage: boolean;
  mentionable: boolean;
  mime: string;
  size: number;
  previewUrl?: string;
  filePreviewUrl?: string;
}) {
  if (info.mentionable) {
    insertMentionAtCursor(info.path);
    return;
  }
  studio.addDraftAttachment({
    path: info.path,
    name: info.name,
    kind: info.isImage ? "image" : "binary",
    mime: info.mime,
    size: info.size,
    previewUrl: info.previewUrl,
    filePreviewUrl: info.filePreviewUrl
  });
}

async function attachDroppedFile(file: File) {
  const path = window.studio.getPathForFile?.(file) || (file as any).path || file.name;
  if (!path || typeof path !== "string") return;
  const filePreview = isImageFile(file, path) ? URL.createObjectURL(file) : undefined;
  const hasRealPath = isAbsolutePath(path);
  let resolved = hasRealPath ? path : "";
  if (!resolved && window.studio.saveDroppedFile) {
    try {
      const saved = await window.studio.saveDroppedFile({ name: file.name || "attachment", data: await file.arrayBuffer() });
      if (saved.ok && saved.path) resolved = saved.path;
    } catch {}
  }
  if (!resolved) resolved = path;
  if (isCodeLikePath(resolved)) {
    insertMentionAtCursor(resolved);
    return;
  }
  let inspected = false;
  try {
    const info = await window.studio.inspectFile?.(resolved);
    if (info?.ok) {
      inspected = true;
      studio.addDraftAttachment({
        path: info.path,
        name: info.name || file.name,
        kind: info.isImage || file.type.startsWith("image/") ? "image" : "binary",
        mime: info.mime || file.type || "application/octet-stream",
        size: info.size || file.size,
        previewUrl: filePreview || info.previewUrl,
        filePreviewUrl: info.filePreviewUrl || previewUrlForPath(info.path)
      });
    }
  } catch {}
  if (inspected) return;
  studio.addDraftAttachment({
    path: resolved,
    name: file.name || fileName(resolved),
    kind: isImageFile(file, resolved) ? "image" : "binary",
    mime: file.type || (isImageLikePath(resolved) ? "image/*" : "application/octet-stream"),
    size: file.size,
    previewUrl: filePreview || previewUrlForPath(resolved),
    filePreviewUrl: previewUrlForPath(resolved)
  });
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

function resolveInputPath(path: string) {
  if (isAbsolutePath(path)) return path;
  if (!studio.projectRoot) return path;
  return `${studio.projectRoot.replace(/[\\/]+$/, "")}/${path.replace(/^[\\/]+/, "")}`;
}

function isAbsolutePath(path: string) {
  return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("/") || path.startsWith("\\");
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

const codeLikeExts = new Set([
  "astro", "bat", "c", "cfg", "cmd", "conf", "cpp", "cs", "css", "csv", "cts", "cjs",
  "dart", "env", "go", "h", "hpp", "htm", "html", "ini", "java", "js", "json", "jsx",
  "kt", "less", "log", "lua", "md", "mdx", "mjs", "mts", "php", "pl", "ps1", "py",
  "rb", "rs", "sass", "scss", "sh", "sql", "svelte", "swift", "toml", "ts", "tsx",
  "txt", "vue", "xml", "yaml", "yml"
]);
const codeLikeNames = new Set([".dockerignore", ".editorconfig", ".env", ".env.example", ".gitattributes", ".gitignore", ".npmrc", "Dockerfile", "Makefile", "Procfile", "LICENSE", "README"]);
const imageLikeExts = new Set(["apng", "avif", "bmp", "gif", "jpg", "jpeg", "png", "svg", "webp"]);

function isCodeLikePath(path: string) {
  const name = fileName(path);
  const index = name.lastIndexOf(".");
  const ext = index >= 0 ? name.slice(index + 1).toLowerCase() : "";
  return codeLikeExts.has(ext) || codeLikeNames.has(name);
}

function isImageLikePath(path: string) {
  const name = fileName(path);
  const index = name.lastIndexOf(".");
  const ext = index >= 0 ? name.slice(index + 1).toLowerCase() : "";
  return imageLikeExts.has(ext);
}

function isImageFile(file: File, path: string) {
  return file.type.startsWith("image/") || isImageLikePath(path);
}

function previewUrlForPath(path: string) {
  return isImageLikePath(path) && isAbsolutePath(path) ? `movo-file://preview?path=${encodeURIComponent(path)}` : undefined;
}

function resolveMentionPath(token: string) {
  const attached = studio.droppedFiles.find((file) => file === token || fileName(file) === token);
  if (attached) return attached;
  const project = studio.projectFiles.find((file) => file.path === token || file.name === token);
  return project?.path || token;
}

function formatSize(bytes: number) {
  if (!bytes) return "Reading size...";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
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

    <div v-if="studio.draftAttachments.length" class="attachment-strip">
      <div
        v-for="attachment in studio.draftAttachments"
        :key="attachment.id"
        class="attachment-card"
        :title="attachment.path"
      >
        <img
          v-if="attachment.kind === 'image' && (attachment.previewUrl || attachment.filePreviewUrl)"
          :src="attachment.previewUrl || attachment.filePreviewUrl"
          :alt="attachment.name"
          role="button"
          tabindex="0"
          @error="attachment.previewUrl = attachment.filePreviewUrl || ''; studio.addDraftAttachment(attachment)"
          @click.stop="openImagePreview(attachment)"
          @keydown.enter.stop.prevent="openImagePreview(attachment)"
        />
        <div v-else class="attachment-file-icon">
          <ImageIcon v-if="attachment.kind === 'image'" :size="18" />
          <File v-else :size="18" />
        </div>
        <div class="attachment-meta">
          <strong>{{ attachment.name }}</strong>
          <span>{{ attachment.mime || attachment.kind }} - {{ formatSize(attachment.size) }}</span>
        </div>
        <button type="button" :title="t('deleteChat')" @click="studio.removeAttachment(attachment.id)">
          <X :size="12" />
        </button>
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
        @click="attachPath(file.path)"
      >
        <span>{{ file.name }}</span>
        <small>{{ file.path }}</small>
      </button>
    </div>

    <div class="composer-bar">
      <div class="bar-left">
        <input
          ref="fileInput"
          class="hidden-file-input"
          type="file"
          multiple
          @change="handleFileInputChange"
        />
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

    <div v-if="imagePreview" class="image-lightbox" tabindex="-1" @click.self="closeImagePreview" @keydown.escape="closeImagePreview">
      <div class="image-lightbox-content">
        <button class="image-lightbox-close" type="button" :title="t('close')" @click="closeImagePreview">
          <X :size="16" />
        </button>
        <img :src="imagePreview.src" :alt="imagePreview.name" />
        <div class="image-lightbox-caption">
          <strong>{{ imagePreview.name }}</strong>
          <span>{{ imagePreview.path }}</span>
        </div>
      </div>
    </div>
  </form>
</template>
