<script setup lang="ts">
import {
  Bot,
  ChevronDown,
  Clock3,
  Copy,
  Folder,
  FolderOpen,
  Globe2,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Settings,
  Shield,
  ShieldCheck,
  Square,
  TerminalSquare,
  Trash2,
  Wifi,
  WifiOff
} from "@lucide/vue";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import type { AppSettings, Chat, ChatMessage, Language, OutputEvent, PermissionEvent } from "./types";

type CliStatus = { installed: boolean; version: string; checked: boolean };

const defaultSettings: AppSettings = {
  language: "en",
  model: "",
  provider: "",
  agent: "build",
  trustWorkspace: true,
  skipPermissions: false,
  theme: "dark",
  permissions: { edit: "ask", bash: "ask", webfetch: "ask", websearch: "ask" },
  checkpoint: { enabled: true },
  memory: { enabled: true },
  experimental: { maxMode: false },
  mcpServersJson: "{}",
  keybindingsJson: "{}"
};

const dictionary = {
  en: {
    newChat: "New chat",
    sessions: "Sessions",
    settings: "Settings",
    noProject: "No folder selected",
    chooseFolder: "Open folder",
    untitled: "New session",
    placeholder: "Ask MiMo to do something...",
    running: "Working...",
    bundled: "Ready",
    missing: "Engine not found",
    terminal: "Output",
    outputEmpty: "Command output appears here.",
    language: "Language",
    english: "English",
    persian: "Persian",
    model: "Model",
    modelHint: "MiMo Auto",
    agent: "Agent",
    build: "Build",
    plan: "Plan",
    compose: "Compose",
    trust: "Trust this workspace",
    skipPermissions: "Skip permission prompts",
    skipWarning: "Only for fully trusted folders.",
    close: "Close",
    deleteChat: "Delete session",
    provider: "Provider",
    providerHint: "Custom API provider",
    emptyTitle: "What can MiMo build for you?",
    emptyText: "Open a folder to start. Your chats stay here.",
    confirmDelete: "Delete?",
    permRequested: "Permission requested",
    permApprove: "Approve",
    permDeny: "Deny",
    permAutoRejected: "Auto-rejected",
    editMsg: "Edit",
    revertTo: "Revert to here",
    copyMsg: "Copy",
    connected: "Connected",
    disconnected: "Disconnected",
    retryConnect: "Retry",
    queued: "queued"
  },
  fa: {
    newChat: "\u0686\u062a \u062c\u062f\u06cc\u062f",
    sessions: "\u062c\u0644\u0633\u0647\u200c\u0647\u0627",
    settings: "\u062a\u0639\u06cc\u06cc\u0646\u0627\u062a",
    noProject: "\u0641\u0648\u0644\u062f\u0631\u06cc \u0627\u0646\u062a\u062e\u0627\u0628 \u0646\u0634\u062f\u0647",
    chooseFolder: "\u0628\u0627\u0632 \u06a9\u0631\u062f\u0646 \u0641\u0648\u0644\u062f\u0631",
    untitled: "\u062c\u0644\u0633\u0647 \u062c\u062f\u06cc\u062f",
    placeholder: "\u0628\u0647 MiMo \u0628\u06af\u0648\u06cc\u06cc\u062f \u0627\u0646\u062c\u0627\u0645 \u0628\u062f\u0647\u06cc\u062f...",
    running: "\u062f\u0631 \u062d\u0627\u0644 \u06a9\u0627\u0631...",
    bundled: "\u0622\u0645\u0627\u062f\u0647",
    missing: "Engine \u0635\u0641\u062d \u0646\u0634\u062f\u0647",
    terminal: "\u062e\u0631\u0648\u062c\u06cc",
    outputEmpty: "\u062e\u0631\u0648\u062c\u06cc \u062f\u0633\u062a\u0648\u0631 \u0627\u06cc\u0646\u062c\u0627 \u0646\u0645\u0627\u06cc\u0634 \u0645\u06cc\u200c\u0634\u0648\u062f.",
    language: "\u0632\u0628\u0627\u0646",
    english: "\u0627\u0646\u06af\u0644\u06cc\u0633\u06cc",
    persian: "\u0641\u0627\u0631\u0633\u06cc",
    model: "\u0645\u062f\u0644",
    modelHint: "MiMo Auto",
    agent: "Agent",
    build: "Build",
    plan: "Plan",
    compose: "Compose",
    trust: "\u0627\u0639\u062a\u0645\u0627\u062f \u0628\u0647 \u0641\u0648\u0644\u062f\u0631",
    skipPermissions: "\u0628\u06cc\u0631\u0648\u0646 \u0627\u0632 \u067e\u0631\u0633\u0634\u200c\u0647\u0627",
    skipWarning: "\u0641\u0642\u0637 \u0628\u0631\u0627\u06cc \u0641\u0648\u0644\u062f\u0631 \u0645\u0627\u0645\u0648\u0646.",
    close: "\u0628\u0633\u062a\u0646",
    deleteChat: "\u062d\u0630\u0641 \u062c\u0644\u0633\u0647",
    provider: "Provider",
    providerHint: "API \u0633\u0641\u0627\u0631\u0634\u06cc",
    emptyTitle: "MiMo \u0686\u0647 \u0628\u0631\u0627\u06cc\u062a\u0627\u0646 \u0628\u0633\u0627\u0632\u0647?",
    emptyText: "\u0641\u0648\u0644\u062f\u0631 \u0631\u0627 \u0628\u0627\u0632 \u06a9\u0646\u06cc\u062f. \u0686\u062a\u200c\u0647\u0627 \u0627\u06cc\u0646\u062c\u0627 \u0645\u06cc\u200c\u0645\u0627\u0646\u062f.",
    confirmDelete: "\u062d\u0630\u0641",
    permRequested: "\u062f\u0631\u062e\u0648\u0627\u0633\u062a \u062f\u0633\u062a\u0631\u0633\u06cc",
    permApprove: "\u062a\u0648\u0636\u06cc\u0642",
    permDeny: "\u0631\u062f",
    permAutoRejected: "\u0631\u062f \u062e\u0648\u062f\u06a9\u0627\u0631",
    editMsg: "\u0648\u06cc\u0631\u0627\u06cc\u0634",
    revertTo: "\u0628\u0631\u06af\u0634\u062a \u0628\u0647 \u0627\u06cc\u0646\u062c\u0627",
    copyMsg: "\u06a9\u067e\u06cc",
    connected: "\u0635\u0627\u062d\u0628",
    disconnected: "\u0642\u0637\u0639",
    retryConnect: "\u062a\u0644\u0627\u0634",
    queued: "\u062f\u0631 \u0627\u0646\u062a\u0638\u0627\u0631"
  }
};

const appSettings = ref<AppSettings>({ ...defaultSettings });
const chats = ref<Chat[]>([]);
const draftChat = ref<Chat | null>(null);
const activeChatId = ref("");
const draft = ref("");
const output = ref<OutputEvent[]>([]);
const cliStatus = ref<CliStatus>({ installed: false, version: "", checked: false });
const isRunning = ref(false);
const showSettings = ref(false);
const showTerminal = ref(false);
const messagesRef = ref<HTMLElement | null>(null);
const showAgentMenu = ref(false);
const showModelMenu = ref(false);
const deleteConfirmId = ref("");
const streamingText = ref("");
const pendingPermissions = ref<PermissionEvent[]>([]);
const editingMsgId = ref("");
const editingText = ref("");
const isDisconnected = ref(false);
const messageQueue = ref<{ id: string; text: string }[]>([]);
let disconnectTimer: ReturnType<typeof setInterval> | null = null;

const lang = computed<Language>(() => appSettings.value.language || "en");
const t = computed(() => dictionary[lang.value]);
const direction = computed(() => (lang.value === "fa" ? "rtl" : "ltr"));
const activeChat = computed(() => draftChat.value || chats.value.find((c) => c.id === activeChatId.value));
const activeTitle = computed(() => activeChat.value?.title || t.value.untitled);
const currentModel = computed(() => appSettings.value.model || "MiMo Auto");
const draftDir = computed(() => lineDir(draft.value) || "ltr");

const chatSizeInfo = computed(() => {
  const chat = activeChat.value;
  if (!chat) return null;
  const json = JSON.stringify(chat);
  const bytes = new Blob([json]).size;
  const kb = (bytes / 1024).toFixed(1);
  const maxKb = 1000;
  const pct = Math.min(100, Math.round((bytes / (maxKb * 1024)) * 100));
  return `${kb}kb (${pct}%)`;
});

const canRun = computed(() => Boolean(activeChat.value?.folder && draft.value.trim()));

const projectGroups = computed(() => {
  const groups = new Map<string, Chat[]>();
  for (const chat of chats.value) {
    const key = chat.folder || t.value.noProject;
    groups.set(key, [...(groups.get(key) || []), chat]);
  }
  return Array.from(groups.entries()).map(([folder, items]) => ({
    folder,
    name: folder === t.value.noProject ? folder : folder.split(/[\\/]/).filter(Boolean).pop() || folder,
    items
  }));
});

function normalizeAppSettings(value: Partial<AppSettings> = {}): AppSettings {
  return {
    ...defaultSettings,
    ...value,
    permissions: { ...defaultSettings.permissions, ...(value.permissions || {}) },
    checkpoint: { ...defaultSettings.checkpoint, ...(value.checkpoint || {}) },
    memory: { ...defaultSettings.memory, ...(value.memory || {}) },
    experimental: { ...defaultSettings.experimental, ...(value.experimental || {}) },
    mcpServersJson: value.mcpServersJson || defaultSettings.mcpServersJson,
    keybindingsJson: value.keybindingsJson || defaultSettings.keybindingsJson
  };
}

function settingsFromProjectConfig(config: unknown) {
  if (!config || typeof config !== "object" || Array.isArray(config)) return appSettings.value;
  const src = config as Record<string, any>;
  const perm = src.permission && typeof src.permission === "object" ? src.permission : {};
  return normalizeAppSettings({
    ...appSettings.value,
    provider: typeof src.provider === "string" ? src.provider : appSettings.value.provider,
    model: typeof src.model === "string" ? src.model : appSettings.value.model,
    agent: typeof src.agent === "string" ? src.agent : appSettings.value.agent,
    theme: typeof src.theme === "string" ? src.theme : appSettings.value.theme,
    permissions: {
      ...appSettings.value.permissions,
      edit: typeof perm.edit === "string" ? perm.edit : appSettings.value.permissions.edit,
      bash: typeof perm.bash === "string" ? perm.bash : appSettings.value.permissions.bash,
      webfetch: typeof perm.webfetch === "string" ? perm.webfetch : appSettings.value.permissions.webfetch,
      websearch: typeof perm.websearch === "string" ? perm.websearch : appSettings.value.permissions.websearch
    },
    checkpoint: { enabled: typeof src.checkpoint?.enabled === "boolean" ? src.checkpoint.enabled : appSettings.value.checkpoint.enabled },
    memory: { enabled: typeof src.memory?.enabled === "boolean" ? src.memory.enabled : appSettings.value.memory.enabled },
    experimental: { maxMode: typeof src.experimental?.maxMode === "boolean" ? src.experimental.maxMode : appSettings.value.experimental.maxMode },
    mcpServersJson: src.mcpServers ? JSON.stringify(src.mcpServers, null, 2) : appSettings.value.mcpServersJson,
    keybindingsJson: src.keybindings ? JSON.stringify(src.keybindings, null, 2) : appSettings.value.keybindingsJson
  });
}

function serialize<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }

function uid() { return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function now() { return new Date().toISOString(); }

function makeChat(folder = ""): Chat {
  const ts = now();
  return { id: uid(), title: t.value.untitled, folder, messages: [], createdAt: ts, updatedAt: ts };
}

function makeMessage(role: ChatMessage["role"], text: string): ChatMessage {
  return { id: uid(), role, text, createdAt: now() };
}

const RTL_RE = /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u0780-\u07BF\u07C0-\u07FF\u08A0-\u08FF\u200F\u202B\u202E\uFB1D-\uFDFF\uFE70-\uFEFF]/;

function lineDir(line: string): "ltr" | "rtl" {
  const trimmed = line.trimStart();
  if (!trimmed) return "ltr";
  return RTL_RE.test(trimmed) ? "rtl" : "ltr";
}

function relativeTime(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const hours = Math.max(1, Math.round(diff / 3_600_000));
  return hours < 24 ? `${hours}h` : `${Math.round(hours / 24)}d`;
}

function startNewChat(folder = activeChat.value?.folder || "") {
  draftChat.value = makeChat(folder);
  activeChatId.value = "";
  draft.value = "";
  output.value = [];
}

function deleteChat(chatId: string) {
  chats.value = chats.value.filter((c) => c.id !== chatId);
  if (!chats.value.length) {
    draftChat.value = makeChat();
    activeChatId.value = "";
  } else {
    draftChat.value = null;
    activeChatId.value = chats.value[0].id;
  }
  deleteConfirmId.value = "";
  persistChats();
}

async function pickFolder() {
  const folder = await window.studio.pickFolder();
  if (!folder) return;
  if (!activeChat.value) startNewChat(folder);
  else activeChat.value.folder = folder;
  const existingConfig = await window.studio.readProjectConfig(folder);
  if (existingConfig.ok && existingConfig.raw) {
    appSettings.value = settingsFromProjectConfig(existingConfig.config);
  }
  await window.studio.saveProjectConfig({ folder, appSettings: serialize(appSettings.value) });
  if (!draftChat.value) persistChats();
}

async function checkCli() {
  const result = await window.studio.checkMimo();
  cliStatus.value = { ...result, checked: true };
}

async function saveAppSettings() {
  await window.studio.saveSettings(serialize(appSettings.value));
  if (activeChat.value?.folder) {
    await window.studio.saveProjectConfig({ folder: activeChat.value.folder, appSettings: serialize(appSettings.value) });
  }
}

async function persistChats() {
  await window.studio.saveChats(serialize(chats.value));
}

async function runPrompt() {
  console.log("[vue] runPrompt called", { canRun: canRun.value, folder: activeChat.value?.folder });
  const chat = activeChat.value;
  const text = draft.value.trim();
  if (!chat || !canRun.value || !text) return;

  chat.messages.push(makeMessage("user", text));
  if (chat.messages.length === 1) chat.title = text.slice(0, 56);
  chat.updatedAt = now();
  draft.value = "";
  output.value = [];
  streamingText.value = "";
  pendingPermissions.value = [];
  isRunning.value = true;
  await nextTick();
  scrollMessages();

  try {
    console.log("[vue] calling persistChats...");
    await persistChats();
    console.log("[vue] persistChats done, serializing...");
    const payload = {
      chat: JSON.parse(JSON.stringify(chat)),
      message: text,
      appSettings: JSON.parse(JSON.stringify(appSettings.value)),
      extraFiles: []
    };
    console.log("[vue] calling runMimo...", Object.keys(payload));
    const result = await window.studio.runMimo(payload);
    console.log("[vue] runMimo result:", { ok: result.ok, code: result.code, outputLen: result.output.length });
    const finalText = result.output.trim();
    if (finalText) {
      streamingText.value = "";
      chat.messages.push(makeMessage(result.ok ? "assistant" : "system", finalText));
    } else if (streamingText.value.trim()) {
      chat.messages.push(makeMessage(result.ok ? "assistant" : "system", streamingText.value.trim()));
      streamingText.value = "";
    } else {
      chat.messages.push(makeMessage("system", `Exit code ${result.code}`));
    }
    chat.updatedAt = now();
    if (draftChat.value?.id === chat.id) {
      chats.value.unshift(chat);
      activeChatId.value = chat.id;
      draftChat.value = null;
    }
    await persistChats();
  } catch (e) {
    console.error("[mimo] runPrompt error:", e);
    chat.messages.push(makeMessage("system", `Error: ${String(e)}`));
  } finally {
    isRunning.value = false;
    streamingText.value = "";
    pendingPermissions.value = [];
    await nextTick();
    scrollMessages();
    processQueue();
  }
}

async function processQueue() {
  if (messageQueue.value.length === 0 || isRunning.value) return;
  const next = messageQueue.value.shift()!;
  draft.value = next.text;
  await nextTick();
  runPrompt();
}

function editQueued(id: string) {
  const idx = messageQueue.value.findIndex(q => q.id === id);
  if (idx < 0) return;
  draft.value = messageQueue.value[idx].text;
  messageQueue.value.splice(idx, 1);
}

function deleteQueued(id: string) {
  messageQueue.value = messageQueue.value.filter(q => q.id !== id);
}

async function stopRun() {
  await window.studio.stopMimo();
  isRunning.value = false;
}

async function approvePermission(permType: string) {
  pendingPermissions.value = pendingPermissions.value.filter(p => p.type !== permType);
  await window.studio.approvePermission(permType);
}

function denyPermission(permType: string) {
  pendingPermissions.value = pendingPermissions.value.filter(p => p.type !== permType);
}

function scrollMessages() {
  messagesRef.value?.scrollTo({ top: messagesRef.value.scrollHeight, behavior: "smooth" });
}

function startEdit(msg: ChatMessage) {
  editingMsgId.value = msg.id;
  editingText.value = msg.text;
  nextTick(() => {
    const el = document.querySelector(".msg-edit-input") as HTMLTextAreaElement | null;
    el?.focus();
  });
}

function cancelEdit() {
  editingMsgId.value = "";
  editingText.value = "";
}

async function saveEdit(msg: ChatMessage) {
  const chat = activeChat.value;
  if (!chat) return;
  const idx = chat.messages.findIndex(m => m.id === msg.id);
  if (idx < 0) return;
  chat.messages[idx].text = editingText.value;
  chat.messages = chat.messages.slice(0, idx + 1);
  chat.updatedAt = now();
  editingMsgId.value = "";
  editingText.value = "";
  await persistChats();
}

function revertTo(msgId: string) {
  const chat = activeChat.value;
  if (!chat) return;
  const idx = chat.messages.findIndex(m => m.id === msgId);
  if (idx < 0) return;
  chat.messages = chat.messages.slice(0, idx + 1);
  chat.updatedAt = now();
  persistChats();
}

function copyMessage(text: string) {
  navigator.clipboard.writeText(text);
}

function checkConnection() {
  window.studio.checkMimo().then(result => {
    isDisconnected.value = !result.installed;
  }).catch(() => {
    isDisconnected.value = true;
  });
}

function selectAgent(agent: string) {
  appSettings.value.agent = agent;
  showAgentMenu.value = false;
}

function selectModel(model: string) {
  appSettings.value.model = model;
  showModelMenu.value = false;
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (isRunning.value && draft.value.trim()) {
      messageQueue.value.push({ id: uid(), text: draft.value.trim() });
      draft.value = "";
    } else {
      runPrompt();
    }
  }
}

watch(() => appSettings.value.language, saveAppSettings);
watch(appSettings, saveAppSettings, { deep: true });

onMounted(async () => {
  const settings = await window.studio.getSettings();
  appSettings.value = normalizeAppSettings(settings.app || {});
  chats.value = settings.chats || [];
  if (chats.value.length) activeChatId.value = chats.value[0].id;
  else draftChat.value = makeChat();
  await checkCli();
  window.studio.onMimoOutput((event) => {
    output.value.push(event);
    if (event.type === "stdout" && isRunning.value) {
      streamingText.value += event.text;
      nextTick(scrollMessages);
    }
  });
  window.studio.onMimoPermission((event) => {
    if (isRunning.value) {
      const exists = pendingPermissions.value.some(p => p.type === event.type && p.target === event.target);
      if (!exists) pendingPermissions.value.push(event);
      nextTick(scrollMessages);
    }
  });
  checkConnection();
  disconnectTimer = setInterval(checkConnection, 15000);
});

onUnmounted(() => {
  if (disconnectTimer) clearInterval(disconnectTimer);
});
</script>

<template>
  <main class="app" :dir="direction" :class="{ rtl: lang === 'fa' }">
    <aside class="sidebar">
      <button class="new-chat-btn" type="button" @click="startNewChat()">
        <Plus :size="18" />
        {{ t.newChat }}
      </button>

      <section class="session-list">
        <div v-for="group in projectGroups" :key="group.folder" class="session-group">
          <div class="group-label">
            <Folder :size="14" />
            <span>{{ group.name }}</span>
          </div>
          <div v-for="chat in group.items" :key="chat.id" class="session-row">
            <button
              class="session-item"
              :class="{ active: chat.id === activeChatId }"
              type="button"
              @click="draftChat = null; activeChatId = chat.id"
            >
              <Pencil :size="13" />
              <span class="session-title">{{ chat.title }}</span>
              <span class="session-time">{{ relativeTime(chat.updatedAt) }}</span>
            </button>
            <button class="delete-btn" type="button" @click="deleteConfirmId = chat.id">
              <Trash2 :size="12" />
            </button>
          </div>
          <div v-if="deleteConfirmId && group.items.some(c => c.id === deleteConfirmId)" class="delete-confirm">
            <span>{{ t.confirmDelete }}</span>
            <button type="button" @click="deleteChat(deleteConfirmId)">{{ t.deleteChat }}</button>
          </div>
        </div>
        <div v-if="!chats.length" class="no-sessions">{{ t.noProject }}</div>
      </section>

      <div class="sidebar-footer">
        <button class="folder-btn" type="button" @click="pickFolder">
          <FolderOpen :size="16" />
          <span>{{ activeChat?.folder ? activeChat.folder.split(/[\\/]/).filter(Boolean).pop() : t.chooseFolder }}</span>
        </button>
        <button class="settings-btn" type="button" @click="showSettings = true">
          <Settings :size="18" />
        </button>
      </div>
    </aside>

    <section class="workspace">
      <header class="chat-header">
        <h1>{{ activeTitle }}</h1>
        <div class="header-right">
          <span v-if="chatSizeInfo" class="chat-size">{{ chatSizeInfo }}</span>
          <span v-if="messageQueue.length > 0" class="queue-badge">{{ messageQueue.length }}</span>
          <div class="conn-status" :class="{ ok: !isDisconnected }" :title="isDisconnected ? t.disconnected : t.connected">
            <WifiOff v-if="isDisconnected" :size="14" />
            <Wifi v-else :size="14" />
            <span class="conn-label">{{ isDisconnected ? t.disconnected : t.connected }}</span>
          </div>
          <span class="status-dot" :class="{ on: cliStatus.installed, running: isRunning }"></span>
          <button class="term-toggle" type="button" @click="showTerminal = !showTerminal" :class="{ active: showTerminal }">
            <TerminalSquare :size="18" />
          </button>
        </div>
      </header>

      <div class="main-area">
        <div ref="messagesRef" class="conversation">
          <div v-if="!activeChat?.messages.length" class="empty-state">
            <div class="empty-icon"><Bot :size="48" /></div>
            <h2>{{ t.emptyTitle }}</h2>
            <p>{{ t.emptyText }}</p>
            <button class="open-folder-btn" type="button" @click="pickFolder">
              <FolderOpen :size="18" />
              {{ t.chooseFolder }}
            </button>
          </div>

          <template v-for="(message, msgIdx) in activeChat?.messages" :key="message.id">
            <article class="chat-msg" :class="message.role">
              <div v-if="message.role === 'user'" class="avatar user-av">U</div>
              <div v-else class="avatar ai-av"><Bot :size="15" /></div>
              <div class="msg-body">
                <template v-if="editingMsgId === message.id">
                  <textarea
                    v-model="editingText"
                    class="msg-edit-input"
                    rows="3"
                    @keydown.escape="cancelEdit"
                    @keydown.enter.meta="saveEdit(message)"
                    @keydown.enter.ctrl="saveEdit(message)"
                  />
                  <div class="msg-edit-bar">
                    <button class="edit-btn save" type="button" @click="saveEdit(message)">{{ t.permApprove }}</button>
                    <button class="edit-btn cancel" type="button" @click="cancelEdit">{{ t.close }}</button>
                  </div>
                </template>
                <template v-else>
                  <div class="msg-text msg-multiline">
                    <div
                      v-for="(line, li) in message.text.split('\n')"
                      :key="li"
                      :dir="lineDir(line) || 'ltr'"
                      class="msg-line"
                    >{{ line }}</div>
                  </div>
                  <div class="msg-actions" :dir="lineDir(message.text) || 'ltr'">
                    <button v-if="message.role === 'user'" class="msg-action-btn" type="button" :title="t.editMsg" @click="startEdit(message)">
                      <Pencil :size="12" />
                    </button>
                    <button class="msg-action-btn" type="button" :title="t.copyMsg" @click="copyMessage(message.text)">
                      <Copy :size="12" />
                    </button>
                    <button
                      v-if="msgIdx < (activeChat?.messages.length || 0) - 1"
                      class="msg-action-btn revert"
                      type="button"
                      :title="t.revertTo"
                      @click="revertTo(message.id)"
                    >
                      <RotateCcw :size="12" />
                    </button>
                  </div>
                </template>
              </div>
            </article>
          </template>

          <div v-if="isRunning" class="chat-msg assistant streaming">
            <div class="avatar ai-av"><Bot :size="15" /></div>
            <div class="msg-content">
              <div v-if="streamingText" class="msg-text msg-multiline">
                <div
                  v-for="(line, li) in streamingText.split('\n')"
                  :key="li"
                  :dir="lineDir(line) || 'ltr'"
                  class="msg-line"
                >{{ line }}</div>
              </div>
              <div v-else class="msg-text"><span class="dot-pulse"></span></div>
              <div v-for="perm in pendingPermissions" :key="perm.type + perm.target" class="permission-card">
                <div class="perm-header">
                  <Shield :size="15" />
                  <span>{{ t.permRequested }}: <strong>{{ perm.type }}</strong></span>
                </div>
                <div class="perm-target">{{ perm.target }}</div>
                <div class="perm-actions">
                  <button class="perm-btn approve" type="button" @click="approvePermission(perm.type)">
                    <ShieldCheck :size="13" /> {{ t.permApprove }}
                  </button>
                  <button class="perm-btn deny" type="button" @click="denyPermission(perm.type)">
                    {{ t.permDeny }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <aside v-if="showTerminal" class="terminal-panel">
          <div class="term-header">
            <span>{{ t.terminal }}</span>
            <button type="button" @click="showTerminal = false"><Square :size="13" /></button>
          </div>
          <div class="term-body">
            <div v-if="!output.length" class="term-empty">{{ t.outputEmpty }}</div>
            <pre v-for="(line, index) in output" :key="index" :class="line.type">{{ line.text }}</pre>
          </div>
        </aside>
      </div>

      <form class="composer" @submit.prevent="runPrompt">
        <div v-if="messageQueue.length > 0" class="queue-list">
          <div v-for="q in messageQueue" :key="q.id" class="queue-item">
            <span class="queue-item-text">{{ q.text }}</span>
            <div class="queue-item-actions">
              <button class="queue-action-btn" type="button" :title="t.editMsg" @click="editQueued(q.id)">
                <Pencil :size="11" />
              </button>
              <button class="queue-action-btn delete" type="button" :title="t.deleteChat" @click="deleteQueued(q.id)">
                <Trash2 :size="11" />
              </button>
            </div>
          </div>
        </div>
        <textarea
          v-model="draft"
          :dir="draftDir"
          :placeholder="isRunning ? (lang === 'fa' ? 'پیام بعدی را بنویسید...' : 'Type next message...') : t.placeholder"
          rows="2"
          @keydown="handleKeydown"
        />
        <div class="composer-bar">
          <div class="bar-left">
            <div class="dropdown-wrap">
              <button class="sel-btn" type="button" @click.stop="showAgentMenu = !showAgentMenu">
                {{ appSettings.agent }} <ChevronDown :size="12" />
              </button>
              <div v-if="showAgentMenu" class="dropdown" @click.stop>
                <button type="button" @click="selectAgent('build')">{{ t.build }}</button>
                <button type="button" @click="selectAgent('plan')">{{ t.plan }}</button>
                <button type="button" @click="selectAgent('compose')">{{ t.compose }}</button>
              </div>
            </div>
            <div class="dropdown-wrap">
              <button class="sel-btn" type="button" @click.stop="showModelMenu = !showModelMenu">
                {{ currentModel }} <ChevronDown :size="12" />
              </button>
              <div v-if="showModelMenu" class="dropdown" @click.stop>
                <button type="button" @click="selectModel('')">MiMo Auto</button>
                <button type="button" @click="selectModel('claude-sonnet-4-20250514')">Claude Sonnet</button>
                <button type="button" @click="selectModel('gpt-4o')">GPT-4o</button>
              </div>
            </div>
          </div>
          <button v-if="isRunning" class="send-btn stop" type="button" @click="stopRun">
            <Square :size="14" />
          </button>
          <button v-else class="send-btn" type="submit" :disabled="!canRun">
            <Play :size="14" />
          </button>
        </div>
      </form>
    </section>

    <Teleport to="body">
      <div v-if="showSettings" class="modal-backdrop" @click="showSettings = false">
        <div class="settings-card" @click.stop>
          <div class="settings-head">
            <h2>{{ t.settings }}</h2>
            <button type="button" @click="showSettings = false">{{ t.close }}</button>
          </div>
          <div class="settings-body">
            <label class="field">
              <span>{{ t.language }}</span>
              <div class="lang-toggle">
                <button type="button" :class="{ active: lang === 'en' }" @click="appSettings.language = 'en'">
                  <Globe2 :size="14" /> EN
                </button>
                <button type="button" :class="{ active: lang === 'fa' }" @click="appSettings.language = 'fa'">
                  <Globe2 :size="14" /> FA
                </button>
              </div>
            </label>
            <label class="field">
              <span>{{ t.model }}</span>
              <input v-model="appSettings.model" type="text" :placeholder="t.modelHint" />
            </label>
            <label class="field">
              <span>{{ t.provider }}</span>
              <input v-model="appSettings.provider" type="text" :placeholder="t.providerHint" />
            </label>
            <label class="field">
              <span>{{ t.agent }}</span>
              <select v-model="appSettings.agent">
                <option value="build">{{ t.build }}</option>
                <option value="plan">{{ t.plan }}</option>
                <option value="compose">{{ t.compose }}</option>
              </select>
            </label>
            <div class="toggles">
              <label class="toggle-row">
                <input v-model="appSettings.trustWorkspace" type="checkbox" />
                <span>{{ t.trust }}</span>
              </label>
              <label class="toggle-row">
                <input v-model="appSettings.skipPermissions" type="checkbox" />
                <span>{{ t.skipPermissions }}<small>{{ t.skipWarning }}</small></span>
              </label>
              <label class="toggle-row">
                <input v-model="appSettings.checkpoint.enabled" type="checkbox" />
                <span>Checkpoint</span>
              </label>
              <label class="toggle-row">
                <input v-model="appSettings.memory.enabled" type="checkbox" />
                <span>Memory</span>
              </label>
            </div>
            <div class="settings-footer">
              <button class="danger-btn" type="button" :disabled="!activeChat" @click="activeChat && deleteChat(activeChat.id)">
                <Trash2 :size="14" /> {{ t.deleteChat }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </main>
</template>
