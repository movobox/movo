<script setup lang="ts">
import { ChevronDown, FileJson, FilePlus, GitFork, Paperclip, Pencil, Play, Square, Trash2, Upload, X } from "@lucide/vue";
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { useStudioStore } from "../../stores/studio";

const studio = useStudioStore();
const { t } = useI18n();
const dragOver = ref(false);

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
    if (path && typeof path === "string") studio.attachMentionFile(path);
  }
}
function removeDroppedFile(idx: number) {
  studio.droppedFiles.splice(idx, 1);
}
async function attachFiles() {
  try {
    const files = await window.studio.pickFiles();
    if (!files || !Array.isArray(files)) return;
    for (const f of files) {
      if (f && typeof f === "string") studio.attachMentionFile(f);
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

    <div v-if="studio.droppedFiles.length" class="dropped-files">
      <div v-for="(file, idx) in studio.droppedFiles" :key="file" class="dropped-file">
        <FilePlus :size="11" />
        <span>{{ file.split(/[/\\]/).pop() }}</span>
        <button type="button" class="dropped-file-remove" @click="removeDroppedFile(idx)"><X :size="10" /></button>
      </div>
    </div>

    <textarea
      v-model="studio.activeDraft"
      :dir="studio.draftDir"
      :placeholder="studio.isRunning ? t('nextPlaceholder') : t('placeholder')"
      rows="2"
      @keydown="studio.handleComposerKeydown"
      @input="studio.updateFilePickerFromDraft"
    />

    <div v-if="studio.filePickerOpen && studio.fileSuggestions.length" class="file-picker">
      <button
        v-for="file in studio.fileSuggestions"
        :key="file.path"
        type="button"
        @click="studio.insertContextFile(file.path)"
      >
        <span>{{ file.name }}</span>
        <small>{{ file.path }}</small>
      </button>
    </div>

    <div v-if="studio.selectedContextFiles.length" class="context-file-list">
      <span v-for="file in studio.selectedContextFiles" :key="file">@{{ file }}</span>
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
            <button type="button" @click="studio.selectModel('claude-sonnet-4-20250514')">Claude Sonnet</button>
            <button type="button" @click="studio.selectModel('gpt-4o')">GPT-4o</button>
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
