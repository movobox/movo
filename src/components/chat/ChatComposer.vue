<script setup lang="ts">
import { ChevronDown, Pencil, Play, Square, Trash2 } from "@lucide/vue";
import { useI18n } from "vue-i18n";
import { useStudioStore } from "../../stores/studio";

const studio = useStudioStore();
const { t } = useI18n();
</script>

<template>
  <form class="composer" @submit.prevent="studio.runPrompt">
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

    <textarea
      v-model="studio.activeDraft"
      :dir="studio.draftDir"
      :placeholder="studio.isRunning ? t('nextPlaceholder') : t('placeholder')"
      rows="2"
      @keydown="studio.handleComposerKeydown"
    />

    <div class="composer-bar">
      <div class="bar-left">
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

      <button v-if="studio.isRunning" class="send-btn stop" type="button" :title="t('stopResponse')" :disabled="studio.isStopping" @click="studio.stopRun">
        <Square :size="14" />
      </button>
      <button v-else class="send-btn" type="submit" :disabled="!studio.canRun">
        <Play :size="14" />
      </button>
    </div>
  </form>
</template>
