<script setup lang="ts">
import { ArrowDown, Bot, Copy, FolderOpen, Pencil, RotateCcw, Shield, ShieldCheck } from "@lucide/vue";
import { useI18n } from "vue-i18n";
import { useStudioStore } from "../../stores/studio";
import MessageContent from "./MessageContent.vue";

const studio = useStudioStore();
const { t } = useI18n();
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
              <MessageContent :text="message.text" />
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
          <div class="activity-feed">
            <div
              v-for="(activity, index) in studio.runActivities"
              :key="index"
              class="activity-row"
            >
              <span class="activity-dot"></span>
              <span>{{ activity }}</span>
            </div>
            <div v-if="!studio.runActivities.length" class="activity-row">
              <span class="activity-dot"></span>
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
  </div>
</template>
