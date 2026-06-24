<script setup lang="ts">
import { Activity, FolderOpen, Square, TerminalSquare, Wifi, WifiOff } from "@lucide/vue";
import { useI18n } from "vue-i18n";
import { useStudioStore } from "../../stores/studio";

const studio = useStudioStore();
const { t } = useI18n();
</script>

<template>
  <header class="chat-header">
    <h1>{{ studio.activeTitle }}</h1>
    <div class="header-right">
      <div v-if="studio.isRunning && studio.isAgentCommandActive" class="run-indicator">
        <Activity :size="14" />
        <span>{{ studio.isStopping ? t("stoppingResponse") : t("commandRunning") }}</span>
        <button type="button" :title="t('stopResponse')" :disabled="studio.isStopping" @click="studio.stopRun">
          <Square :size="12" />
        </button>
      </div>
      <span v-if="studio.chatSizeInfo" class="chat-size">{{ studio.chatSizeInfo }}</span>
      <span v-if="studio.messageQueue.length > 0" class="queue-badge">{{ studio.messageQueue.length }}</span>
      <button
        class="term-toggle"
        type="button"
        :title="t('openProjectFolder')"
        :disabled="!studio.projectRoot"
        @click="studio.openProjectFolder"
      >
        <FolderOpen :size="17" />
      </button>
      <div class="conn-status" :class="{ ok: !studio.isDisconnected }" :title="studio.isDisconnected ? t('disconnected') : t('connected')">
        <WifiOff v-if="studio.isDisconnected" :size="14" />
        <Wifi v-else :size="14" />
        <span class="conn-label">{{ studio.isDisconnected ? t("disconnected") : t("connected") }}</span>
      </div>
      <span class="status-dot" :class="{ on: studio.cliStatus.installed, running: studio.isRunning }"></span>
      <button class="term-toggle" type="button" @click="studio.showTerminal ? studio.showTerminal = false : studio.openTerminalPanel()" :class="{ active: studio.showTerminal }">
        <TerminalSquare v-if="!studio.showTerminal" :size="18" />
        <Square v-else :size="14" />
      </button>
    </div>
  </header>
</template>
