<script setup lang="ts">
import { Folder, FolderOpen, Pencil, Plus, Settings, Trash2 } from "@lucide/vue";
import { useI18n } from "vue-i18n";
import { useStudioStore } from "../../stores/studio";

const studio = useStudioStore();
const { t } = useI18n();
</script>

<template>
  <aside class="sidebar">
    <button class="new-chat-btn" type="button" @click="studio.startNewChat()">
      <Plus :size="18" />
      {{ t("newChat") }}
    </button>

    <section class="session-list">
      <div v-for="group in studio.projectGroups" :key="group.folder" class="session-group">
        <div class="group-label">
          <Folder :size="14" />
          <span>{{ group.name }}</span>
        </div>

        <div v-for="chat in group.items" :key="chat.id" class="session-row">
          <button
            class="session-item"
            :class="{ active: chat.id === studio.activeChatId }"
            type="button"
            @click="studio.selectChat(chat.id)"
          >
            <Pencil :size="13" class="edit-icon" @click.stop="studio.startEditChat(chat.id)" />
            <template v-if="studio.editingChatId === chat.id">
              <input
                class="chat-title-input"
                v-model="studio.editingChatTitle"
                @keydown.enter="studio.saveEditChat"
                @keydown.escape="studio.cancelEditChat"
                @blur="studio.saveEditChat"
                @click.stop
              />
            </template>
            <template v-else>
              <span class="session-title">{{ chat.title }}</span>
            </template>
            <span class="session-time">{{ studio.relativeTime(chat.updatedAt) }}</span>
          </button>
          <button class="delete-btn" type="button" @click="studio.deleteConfirmId = chat.id">
            <Trash2 :size="12" />
          </button>
        </div>

        <div v-if="studio.deleteConfirmId && group.items.some((chat) => chat.id === studio.deleteConfirmId)" class="delete-confirm">
          <span>{{ t("confirmDelete") }}</span>
          <div class="delete-confirm-actions">
            <button type="button" class="cancel-btn" @click="studio.deleteConfirmId = ''">{{ t("cancel") }}</button>
            <button type="button" @click="studio.deleteChat(studio.deleteConfirmId)">{{ t("deleteChat") }}</button>
          </div>
        </div>
      </div>

      <div v-if="!studio.chats.length" class="no-sessions">{{ t("noProject") }}</div>
    </section>

    <div class="sidebar-footer">
      <button class="folder-btn" type="button" @click="studio.pickFolder">
        <FolderOpen :size="16" />
        <span>{{ studio.activeChat?.folder ? studio.activeChat.folder.split(/[\\/]/).filter(Boolean).pop() : t("chooseFolder") }}</span>
      </button>
      <button class="settings-btn" type="button" @click="studio.showSettings = true">
        <Settings :size="18" />
      </button>
    </div>
  </aside>
</template>
