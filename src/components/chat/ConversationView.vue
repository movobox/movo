<script setup lang="ts">
import { ArrowDown, Bot, Copy, File, FileEdit, FilePlus, FileSearch, FileText, FolderOpen, ImageIcon, Pencil, RefreshCcw, RotateCcw, Search, Shield, ShieldCheck, Terminal, X } from "@lucide/vue";
import { computed, ref, watchEffect } from "vue";
import { useI18n } from "vue-i18n";
import { useStudioStore } from "../../stores/studio";
import { highlightCode } from "../../utils/highlight";
import MessageContent from "./MessageContent.vue";

const studio = useStudioStore();
const { t } = useI18n();
const imagePreview = ref<{ src: string; name: string; path: string } | null>(null);

const queuedAsMessages = computed(() => {
  return studio.messageQueue.map((q) => ({ id: q.id, text: q.text }));
});

watchEffect(() => {
  for (const message of studio.activeChat?.messages || []) {
    for (const attachment of message.attachments || []) {
      if (attachment.size > 0 && (attachment.kind !== "image" || attachment.previewUrl)) continue;
      void enrichAttachment(attachment);
    }
  }
});

function activityIcon(text: string) {
  const t = text.toLowerCase();
  if (t.includes("write") || t.includes("edit") || t.includes("update") || t.includes("create")) return "write";
  if (t.includes("read") || t.includes("load") || t.includes("open")) return "read";
  if (t.includes("search") || t.includes("grep") || t.includes("find") || t.includes("glob")) return "search";
  if (t.includes("bash") || t.includes("command") || t.includes("running command")) return "terminal";
  if (t.includes("permission")) return "shield";
  if (t.includes("start") || t.includes("step")) return "step";
  if (t.includes("complete") || t.includes("done")) return "done";
  if (t.includes("thinking") || t.includes("thought")) return "step";
  return "default";
}

function activityKind(item: { text: string; detail?: string; code?: string; oldCode?: string; newCode?: string; editFilePath?: string }) {
  const clean = `${item.text}\n${item.detail || ""}`.toLowerCase();
  if (clean.includes("error") || clean.includes("failed")) return "error";
  if (item.oldCode || item.newCode) return "diff";
  if (item.code && /(write|writing|edit|create|creating)/i.test(clean)) return "code-write";
  if (clean.includes("detected from project file changes") && /(creating|moving|rename)/i.test(clean)) return "file-create";
  if (clean.includes("detected from project file changes")) return "file-watch";
  return activityIcon(item.text);
}

function activityStatus(item: { text: string; detail?: string }) {
  const clean = `${item.text}\n${item.detail || ""}`;
  if (/error|failed|failure/i.test(clean)) return { kind: "failed", label: "Failed" };
  if (/Detected from project file changes/i.test(clean)) return { kind: "detected", label: "Detected" };
  if (/successfully|done|complete|Wrote file successfully/i.test(clean)) return { kind: "success", label: "Done" };
  return { kind: "running", label: "Working" };
}

function isFilePath(detail: string) {
  return /[/\\]/.test(detail) && !detail.startsWith("{") && !detail.startsWith("[");
}

function openInExplorer(filePath: string) {
  void window.studio.openPath(filePath);
}

function openImagePreview(attachment: { path: string; name: string; previewUrl?: string; filePreviewUrl?: string }) {
  const src = attachment.previewUrl || attachment.filePreviewUrl;
  if (!src) return;
  imagePreview.value = { src, name: attachment.name, path: attachment.path };
}

function closeImagePreview() {
  imagePreview.value = null;
}

async function enrichAttachment(attachment: { path: string; name: string; kind: "image" | "binary"; mime: string; size: number; previewUrl?: string; filePreviewUrl?: string }) {
  if (!window.studio.inspectFile) return;
  try {
    const info = await window.studio.inspectFile(attachment.path);
    if (!info.ok) return;
    attachment.path = info.path || attachment.path;
    attachment.name = info.name || attachment.name;
    attachment.kind = info.isImage ? "image" : attachment.kind;
    attachment.mime = info.mime || attachment.mime;
    if (Number.isFinite(info.size) && info.size > 0) attachment.size = info.size;
    attachment.previewUrl = info.previewUrl || attachment.previewUrl;
    attachment.filePreviewUrl = info.filePreviewUrl || attachment.filePreviewUrl;
  } catch {}
}

function formatSize(bytes: number) {
  if (!bytes) return "Reading size...";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function hl(code: string, lang: string) {
  return highlightCode(code, lang || "text");
}

function extToLang(filePath: string): string {
  const ext = (filePath.split(".").pop() || "").toLowerCase();
  const map: Record<string, string> = { ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript", vue: "html", py: "python", php: "php", css: "css", scss: "css", json: "json", md: "markdown", html: "html", sh: "bash", bash: "bash", rs: "rust", go: "go", java: "java", rb: "ruby", c: "c", cpp: "cpp", h: "c" };
  return map[ext] || ext;
}

function truncateCode(code: string, maxLines = 40): string {
  const lines = code.split("\n");
  if (lines.length <= maxLines) return code;
  return lines.slice(0, maxLines).join("\n") + `\n... (${lines.length - maxLines} more lines)`;
}

function shouldCollapseActivityDetail(item: { detail?: string; code?: string; oldCode?: string; newCode?: string }) {
  return Boolean(item.detail && (item.code || item.oldCode || item.newCode));
}

function activityDetailParts(detail = "") {
  const target = detail.match(/^Target:\s*(.+)$/im)?.[1]?.trim() || "";
  const path = detail.match(/^Path:\s*(.+)$/im)?.[1]?.trim() || "";
  const detected = /Detected from project file changes while Movo is running/i.test(detail);
  const result = formatVisibleActivityResult(detail.match(/(?:^|\n)Result:\s*\n?([\s\S]*)$/i)?.[1]?.trim() || "");
  const extra = detail
    .replace(/^Target:\s*.+$/im, "")
    .replace(/^Path:\s*.+$/im, "")
    .replace(/Detected from project file changes while Movo is running/ig, "")
    .replace(/(?:^|\n)Result:\s*\n?[\s\S]*$/i, "")
    .trim();
  return { target, path, detected, result, extra };
}

function readDetailParts(detail = "") {
  return {
    path: detail.match(/^Path:\s*(.+)$/im)?.[1]?.trim() || "",
    type: detail.match(/^Type:\s*(.+)$/im)?.[1]?.trim() || "",
    entries: detail.match(/^Entries:\s*(.+)$/im)?.[1]?.trim() || "",
    lines: detail.match(/^Lines:\s*(.+)$/im)?.[1]?.trim() || ""
  };
}

function isReadMetaDetail(detail = "") {
  const meta = readDetailParts(detail);
  return Boolean(meta.path && (meta.lines || meta.entries));
}

function formatVisibleActivityResult(result: string) {
  if (!result) return "";
  if (/^(Wrote file successfully|Edit applied successfully)\.?$/i.test(result.trim())) return "";
  try {
    const parsed = JSON.parse(result);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const value = String((parsed as Record<string, unknown>).value || "").trim();
      if (/^(Wrote file successfully|Edit applied successfully)\.?$/i.test(value)) return "";
    }
  } catch {}
  return result;
}

function activityOpenPath(detail = "") {
  const parts = activityDetailParts(detail);
  return parts.path || parts.target || (isFilePath(detail) ? detail : "");
}
</script>

<template>
  <div class="conversation-shell">
    <div
      :ref="(el) => { studio.messagesEl = el as HTMLElement | null; }"
      class="conversation"
      @scroll.passive="studio.updateScrollState"
    >
      <div v-if="!studio.activeChat?.messages.length" class="empty-state">
        <div class="empty-icon"><Bot :size="48" /></div>
        <h2>{{ t("emptyTitle") }}</h2>
        <p>{{ t("emptyText") }}</p>
        <button class="open-folder-btn" type="button" @click="studio.pickFolder">
          <FolderOpen :size="18" />
          {{ t("chooseFolder") }}
        </button>
      </div>

      <template v-for="(message, msgIdx) in studio.activeChat?.messages" :key="message.id">
        <article class="chat-msg" :class="[message.role, { 'rtl-msg': studio.lineDir(message.text) === 'rtl' }]">
          <div v-if="message.role === 'user'" class="avatar user-av">U</div>
          <div v-else class="avatar ai-av"><Bot :size="15" /></div>
          <div class="msg-body">
            <template v-if="studio.editingMsgId === message.id">
              <textarea
                v-model="studio.editingText"
                class="msg-edit-input"
                rows="3"
                @keydown.escape="studio.cancelEdit"
                @keydown.enter.meta="studio.saveEdit(message)"
                @keydown.enter.ctrl="studio.saveEdit(message)"
              />
              <div class="msg-edit-bar">
                <button class="edit-btn save" type="button" @click="studio.saveEdit(message)">{{ t("permApprove") }}</button>
                <button class="edit-btn cancel" type="button" @click="studio.cancelEdit">{{ t("close") }}</button>
              </div>
            </template>

            <template v-else>
              <MessageContent :text="message.text" :base-folder="studio.activeChat?.folder" />
              <div v-if="message.attachments?.length" class="msg-attachments">
                <button
                  v-for="attachment in message.attachments"
                  :key="attachment.id"
                  class="attachment-card"
                  type="button"
                  :title="attachment.path"
                  @click="attachment.kind === 'image' ? openImagePreview(attachment) : openInExplorer(attachment.path)"
                >
                  <img
                    v-if="attachment.kind === 'image' && (attachment.previewUrl || attachment.filePreviewUrl)"
                    :src="attachment.previewUrl || attachment.filePreviewUrl"
                    :alt="attachment.name"
                    @error="attachment.previewUrl = attachment.filePreviewUrl || ''; enrichAttachment(attachment)"
                  />
                  <div v-else class="attachment-file-icon">
                    <ImageIcon v-if="attachment.kind === 'image'" :size="18" />
                    <File v-else :size="18" />
                  </div>
                  <div class="attachment-meta">
                    <strong>{{ attachment.name }}</strong>
                    <span>{{ attachment.mime || attachment.kind }} - {{ formatSize(attachment.size) }}</span>
                  </div>
                </button>
              </div>
              <div class="msg-actions" :dir="studio.lineDir(message.text) || 'ltr'">
                <button v-if="message.role === 'user'" class="msg-action-btn" type="button" :title="t('editMsg')" @click="studio.startEdit(message)">
                  <Pencil :size="12" />
                </button>
                <button class="msg-action-btn" type="button" :title="t('copyMsg')" @click="studio.copyMessage(message.text)">
                  <Copy :size="12" />
                </button>
                <button
                  v-if="msgIdx < (studio.activeChat?.messages.length || 0) - 1"
                  class="msg-action-btn revert"
                  type="button"
                  :title="t('revertTo')"
                  @click="studio.revertTo(message.id)"
                >
                  <RotateCcw :size="12" />
                </button>
              </div>
            </template>
          </div>
        </article>
      </template>

      <div v-if="studio.isRunning" class="chat-msg assistant streaming">
        <div class="avatar ai-av"><Bot :size="15" /></div>
        <div class="msg-content">
          <template v-if="studio.runTimeline.length">
            <template v-for="(item, tIdx) in studio.runTimeline" :key="tIdx">
              <div v-if="item.kind === 'text' && item.text.trim()" class="streaming-output">
                <MessageContent :text="item.text" :base-folder="studio.activeChat?.folder" />
              </div>
              <div v-else-if="item.kind === 'activity'" class="activity-feed">
                <div class="activity-row" :class="['activity-' + activityIcon(item.text), 'activity-kind-' + activityKind(item)]">
                  <div class="activity-icon">
                    <FileEdit v-if="activityIcon(item.text) === 'write'" :size="13" />
                    <FileText v-else-if="activityIcon(item.text) === 'read'" :size="13" />
                    <FileSearch v-else-if="activityIcon(item.text) === 'search'" :size="13" />
                    <Terminal v-else-if="activityIcon(item.text) === 'terminal'" :size="13" />
                    <Shield v-else-if="activityIcon(item.text) === 'shield'" :size="13" />
                    <Bot v-else-if="activityIcon(item.text) === 'done'" :size="13" />
                    <span v-else class="activity-dot"></span>
                  </div>
                  <div class="activity-info">
                    <div class="activity-heading">
                      <span class="activity-title">{{ item.text }}</span>
                      <span class="activity-status" :class="activityStatus(item).kind">{{ activityStatus(item).label }}</span>
                    </div>
                    <span
                      v-if="item.detail"
                      class="activity-detail"
                      :class="{ 'activity-file-link': Boolean(activityOpenPath(item.detail)), collapsed: shouldCollapseActivityDetail(item) || activityDetailParts(item.detail).detected }"
                      @click="activityOpenPath(item.detail) && openInExplorer(activityOpenPath(item.detail))"
                    >
                      <template v-if="activityDetailParts(item.detail).detected">
                        <span class="activity-inline-target">
                          Path: <code>{{ activityDetailParts(item.detail).path }}</code>
                        </span>
                        <span class="activity-change-note">Detected from project file changes while Movo is running</span>
                      </template>
                      <template v-else-if="isReadMetaDetail(item.detail)">
                        <span class="activity-read-meta">
                          <span>Path <code>{{ readDetailParts(item.detail).path }}</code></span>
                          <span v-if="readDetailParts(item.detail).type">Type <code>{{ readDetailParts(item.detail).type }}</code></span>
                          <span v-if="readDetailParts(item.detail).entries">Entries <code>{{ readDetailParts(item.detail).entries }}</code></span>
                          <span v-if="readDetailParts(item.detail).lines">Lines <code>{{ readDetailParts(item.detail).lines }}</code></span>
                        </span>
                      </template>
                      <template v-else-if="!shouldCollapseActivityDetail(item)">{{ item.detail }}</template>
                      <template v-else>
                        <span v-if="activityDetailParts(item.detail).target" class="activity-inline-target">
                          Target: <code>{{ activityDetailParts(item.detail).target }}</code>
                        </span>
                      </template>
                      <details v-if="shouldCollapseActivityDetail(item) && activityDetailParts(item.detail).extra" class="activity-inline-details">
                        <summary>Details</summary>
                        <pre>{{ activityDetailParts(item.detail).extra }}</pre>
                      </details>
                    </span>
                    <div v-if="item.oldCode || item.newCode" class="activity-diff">
                      <div v-if="item.editFilePath" class="diff-filepath">{{ item.editFilePath }}</div>
                      <div v-if="item.oldCode" class="diff-block diff-removed">
                        <div class="diff-label">- removed</div>
                        <pre class="diff-code"><code v-html="hl(truncateCode(item.oldCode), item.codeLang || extToLang(item.editFilePath || ''))"></code></pre>
                      </div>
                      <div v-if="item.newCode" class="diff-block diff-added">
                        <div class="diff-label">+ added</div>
                        <pre class="diff-code"><code v-html="hl(truncateCode(item.newCode), item.codeLang || extToLang(item.editFilePath || ''))"></code></pre>
                      </div>
                    </div>
                    <div v-else-if="item.code" class="activity-code-block">
                      <pre class="activity-code"><code v-html="hl(truncateCode(item.code), item.codeLang || 'text')"></code></pre>
                    </div>
                    <pre v-if="item.detail && shouldCollapseActivityDetail(item) && activityDetailParts(item.detail).result" class="activity-result">{{ activityDetailParts(item.detail).result }}</pre>
                  </div>
                </div>
              </div>
            </template>
          </template>
          <div v-else class="activity-feed">
            <div class="activity-row">
              <div class="activity-icon"><span class="activity-dot"></span></div>
              <span>{{ t("workingOnIt") }}</span>
            </div>
          </div>

          <div v-for="perm in studio.pendingPermissions" :key="perm.type + perm.target" class="permission-card">
            <div class="perm-header">
              <Shield :size="15" />
              <span>{{ t("permRequested") }}: <strong>{{ perm.type }}</strong></span>
            </div>
            <div class="perm-target">{{ perm.target }}</div>
            <div class="perm-actions">
              <button class="perm-btn approve" type="button" @click="studio.approvePermission(perm.type)">
                <ShieldCheck :size="13" /> {{ t("permApprove") }}
              </button>
              <button class="perm-btn deny" type="button" @click="studio.denyPermission(perm.type)">
                {{ t("permDeny") }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="queuedAsMessages.length" class="queued-messages">
        <div v-for="q in queuedAsMessages" :key="q.id" class="chat-msg user queued-msg">
          <div class="avatar user-av">U</div>
          <div class="msg-body">
            <div class="msg-text queued-text">{{ q.text }}</div>
            <span class="queued-badge">{{ t("queued") || "queued" }}</span>
          </div>
        </div>
      </div>

      <div v-if="studio.interruptedRun && !studio.isRunning" class="interrupt-banner">
        <div class="interrupt-icon"><RefreshCcw :size="16" /></div>
        <div class="interrupt-info">
          <span class="interrupt-title">{{ t("interruptedTitle") }}</span>
          <span class="interrupt-detail">{{ t("interruptedDetail", { attempt: studio.interruptedRun.attempt, max: studio.interruptedRun.maxRetries }) }}</span>
          <span v-if="studio.interruptedRun.stderr" class="interrupt-error">{{ studio.interruptedRun.stderr }}</span>
        </div>
        <div class="interrupt-actions">
          <button class="interrupt-btn resume" type="button" @click="studio.resumeInterruptedRun">
            <RefreshCcw :size="13" /> {{ t("resume") }}
          </button>
          <button class="interrupt-btn dismiss" type="button" @click="studio.dismissInterrupted">
            <X :size="13" />
          </button>
        </div>
      </div>
    </div>

    <button
      v-if="studio.showScrollToBottom"
      class="scroll-bottom-btn"
      type="button"
      :title="t('scrollToBottom')"
      @click="studio.scrollToBottom()"
    >
      <ArrowDown :size="16" />
    </button>

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
  </div>
</template>
