<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import ChatComposer from "./components/chat/ChatComposer.vue";
import ChatHeader from "./components/chat/ChatHeader.vue";
import ChatSidebar from "./components/layout/ChatSidebar.vue";
import ConversationView from "./components/chat/ConversationView.vue";
import SettingsModal from "./components/settings/SettingsModal.vue";
import TerminalPanel from "./components/terminal/TerminalPanel.vue";
import { useLanguageStore } from "./stores/language";
import { useStudioStore } from "./stores/studio";

const studio = useStudioStore();
const language = useLanguageStore();

onMounted(studio.hydrate);
onUnmounted(studio.destroy);
</script>

<template>
  <main class="app" :dir="language.direction" :class="{ rtl: language.locale === 'fa' }">
    <ChatSidebar />

    <section class="workspace">
      <ChatHeader />
      <div class="main-area">
        <ConversationView />
        <TerminalPanel v-if="studio.showTerminal" />
      </div>
      <ChatComposer />
    </section>

    <SettingsModal />
  </main>
</template>
