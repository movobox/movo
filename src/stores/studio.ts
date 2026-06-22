import { defineStore } from "pinia";
import { computed, nextTick, ref, watch } from "vue";
import { normalizeAppSettings } from "../constants/settings";
import { translate } from "../i18n";
import type { AppSettings, Chat, ChatMessage, PermissionEvent, QueuedMessage, TerminalExitEvent, TerminalSession } from "../types";
import { clone, lineDir, makeChat, makeMessage, normalizeChat, now, relativeTime, uid } from "../utils/chat";
import { useLanguageStore } from "./language";

type CliStatus = { installed: boolean; version: string; checked: boolean };

export const useStudioStore = defineStore("studio", () => {
  const language = useLanguageStore();
  const appSettings = ref<AppSettings>(normalizeAppSettings());
  const chats = ref<Chat[]>([]);
  const draftChat = ref<Chat | null>(null);
  const activeChatId = ref("");
  const terminalSessions = ref<TerminalSession[]>([]);
  const activeTerminalId = ref("");
  const cliStatus = ref<CliStatus>({ installed: false, version: "", checked: false });
  const isRunning = ref(false);
  const isStopping = ref(false);
  const showSettings = ref(false);
  const showTerminal = ref(false);
  const showAgentMenu = ref(false);
  const showModelMenu = ref(false);
  const deleteConfirmId = ref("");
  const streamingText = ref("");
  const runActivities = ref<string[]>([]);
  const pendingPermissions = ref<PermissionEvent[]>([]);
  const editingMsgId = ref("");
  const editingText = ref("");
  const isDisconnected = ref(false);
  const messagesEl = ref<HTMLElement | null>(null);
  const isPinnedToBottom = ref(true);
  const showScrollToBottom = ref(false);

  let disconnectTimer: ReturnType<typeof setInterval> | null = null;
  let saveChatsTimer: ReturnType<typeof setTimeout> | null = null;
  let saveUiTimer: ReturnType<typeof setTimeout> | null = null;
  let hydrated = false;
  let outputUnsubscribe: (() => void) | undefined;
  let permissionUnsubscribe: (() => void) | undefined;
  let terminalExitUnsubscribe: (() => void) | undefined;
  let stopRequested = false;
  const bottomThreshold = 96;

  const activeChat = computed(() => draftChat.value || chats.value.find((c) => c.id === activeChatId.value) || null);
  const activeTitle = computed(() => activeChat.value?.title || translate("untitled"));
  const currentModel = computed(() => appSettings.value.model || "MiMo Auto");
  const activeTerminal = computed(() => terminalSessions.value.find((terminal) => terminal.id === activeTerminalId.value) || null);
  const runningTerminals = computed(() => terminalSessions.value.filter((terminal) => terminal.running));
  const hasRunningTerminal = computed(() => runningTerminals.value.length > 0);
  const isAgentCommandActive = computed(() => pendingPermissions.value.some((permission) => ["bash", "shell", "command"].includes(permission.type.toLowerCase())));
  const projectRoot = computed(() => activeChat.value?.folder || chats.value.find((chat) => chat.folder)?.folder || "");
  const activeDraft = computed({
    get: () => activeChat.value?.draft || "",
    set: (value: string) => {
      const chat = activeChat.value;
      if (!chat) return;
      chat.draft = value;
      chat.updatedAt = now();
      schedulePersistence();
    }
  });
  const draftDir = computed(() => lineDir(activeDraft.value) || "ltr");
  const messageQueue = computed<QueuedMessage[]>(() => activeChat.value?.queuedMessages || []);
  const canRun = computed(() => Boolean(activeChat.value?.folder && activeDraft.value.trim()));

  const chatSizeInfo = computed(() => {
    const chat = activeChat.value;
    if (!chat) return null;
    const bytes = new Blob([JSON.stringify(chat)]).size;
    const kb = (bytes / 1024).toFixed(1);
    const maxKb = 1000;
    const pct = Math.min(100, Math.round((bytes / (maxKb * 1024)) * 100));
    return `${kb}kb (${pct}%)`;
  });

  const projectGroups = computed(() => {
    const groups = new Map<string, Chat[]>();
    for (const chat of chats.value) {
      const noProject = translate("noProject");
      const key = chat.folder || noProject;
      groups.set(key, [...(groups.get(key) || []), chat]);
    }
    const noProject = translate("noProject");
    return Array.from(groups.entries()).map(([folder, items]) => ({
      folder,
      name: folder === noProject ? folder : folder.split(/[\\/]/).filter(Boolean).pop() || folder,
      items
    }));
  });

  function schedulePersistence() {
    scheduleChatsSave();
    scheduleUiSave();
  }

  function scheduleChatsSave() {
    if (!hydrated) return;
    if (saveChatsTimer) clearTimeout(saveChatsTimer);
    saveChatsTimer = setTimeout(() => void persistChats(), 250);
  }

  function scheduleUiSave() {
    if (!hydrated) return;
    if (saveUiTimer) clearTimeout(saveUiTimer);
    saveUiTimer = setTimeout(() => void persistUiState(), 250);
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
      compaction: {
        auto: typeof src.compaction?.auto === "boolean" ? src.compaction.auto : appSettings.value.compaction.auto,
        prune: typeof src.compaction?.prune === "boolean" ? src.compaction.prune : appSettings.value.compaction.prune,
        reserved: typeof src.compaction?.reserved === "number" ? src.compaction.reserved : appSettings.value.compaction.reserved
      },
      watcher: { enabled: typeof src.watcher?.enabled === "boolean" ? src.watcher.enabled : appSettings.value.watcher.enabled },
      share: typeof src.share === "string" ? src.share : appSettings.value.share,
      autoupdate: typeof src.autoupdate === "boolean" || src.autoupdate === "notify" ? src.autoupdate : appSettings.value.autoupdate,
      experimental: { maxMode: typeof src.experimental?.maxMode === "boolean" ? src.experimental.maxMode : appSettings.value.experimental.maxMode },
      mcpServersJson: src.mcp ? JSON.stringify(src.mcp, null, 2) : src.mcpServers ? JSON.stringify(src.mcpServers, null, 2) : appSettings.value.mcpServersJson,
      keybindingsJson: src.keybindings ? JSON.stringify(src.keybindings, null, 2) : appSettings.value.keybindingsJson,
      serverJson: src.server ? JSON.stringify(src.server, null, 2) : appSettings.value.serverJson,
      instructionsJson: src.instructions ? JSON.stringify(src.instructions, null, 2) : appSettings.value.instructionsJson,
      providerJson: src.provider && typeof src.provider === "object" ? JSON.stringify(src.provider, null, 2) : appSettings.value.providerJson
    });
  }

  function startNewChat(folder = activeChat.value?.folder || "") {
    draftChat.value = makeChat(translate("untitled"), folder);
    activeChatId.value = "";
    isPinnedToBottom.value = true;
    showScrollToBottom.value = false;
    scheduleUiSave();
  }

  function selectChat(chatId: string) {
    draftChat.value = null;
    activeChatId.value = chatId;
    scheduleUiSave();
    void nextTick(() => scrollToBottom("auto"));
  }

  async function deleteChat(chatId: string) {
    chats.value = chats.value.filter((c) => c.id !== chatId);
    if (!chats.value.length) {
      draftChat.value = makeChat(translate("untitled"));
      activeChatId.value = "";
    } else {
      draftChat.value = null;
      activeChatId.value = chats.value[0].id;
    }
    deleteConfirmId.value = "";
    await persistChats();
    await persistUiState();
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
    await window.studio.saveProjectConfig({ folder, appSettings: clone(appSettings.value) });
    schedulePersistence();
  }

  async function checkCli() {
    const result = await window.studio.checkMimo();
    cliStatus.value = { ...result, checked: true };
  }

  async function saveAppSettings() {
    await window.studio.saveSettings(clone(appSettings.value));
    if (activeChat.value?.folder) {
      await window.studio.saveProjectConfig({ folder: activeChat.value.folder, appSettings: clone(appSettings.value) });
    }
  }

  async function persistChats() {
    await window.studio.saveChats(clone(chats.value));
  }

  async function persistUiState() {
    await window.studio.saveUiState({
      activeChatId: activeChatId.value,
      draftChat: draftChat.value ? clone(draftChat.value) : null
    });
  }

  async function runPrompt() {
    const chat = activeChat.value;
    const text = activeDraft.value.trim();
    if (!chat || !canRun.value || !text) return;

    chat.messages.push(makeMessage("user", text));
    if (chat.messages.length === 1) chat.title = text.slice(0, 56);
    chat.updatedAt = now();
    chat.draft = "";
    streamingText.value = "";
    runActivities.value = [translate("workingOnIt")];
    pendingPermissions.value = [];
    isRunning.value = true;
    isStopping.value = false;
    stopRequested = false;
    await nextTick();
    scrollToBottom("smooth");

    try {
      await persistChats();
      await persistUiState();
      const payload = {
        chat: clone(chat),
        message: text,
        appSettings: clone(appSettings.value),
        extraFiles: []
      };
      const result = await window.studio.runMimo(payload);
      const finalText = result.output.trim();
      if (stopRequested) {
        if (streamingText.value.trim()) {
          chat.messages.push(makeMessage("assistant", streamingText.value.trim()));
        } else if (finalText) {
          chat.messages.push(makeMessage("assistant", finalText));
        }
        streamingText.value = "";
        chat.messages.push(makeMessage("system", translate("stoppedByUser")));
      } else if (finalText) {
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
      await persistUiState();
    } catch (e) {
      chat.messages.push(makeMessage("system", `Error: ${String(e)}`));
      schedulePersistence();
    } finally {
      isRunning.value = false;
      isStopping.value = false;
      stopRequested = false;
      streamingText.value = "";
      runActivities.value = [];
      pendingPermissions.value = [];
      await nextTick();
      scrollMessages({ behavior: "smooth" });
      void processQueue();
    }
  }

  async function processQueue() {
    const chat = activeChat.value;
    if (!chat || chat.queuedMessages.length === 0 || isRunning.value) return;
    const next = chat.queuedMessages.shift();
    if (!next) return;
    chat.draft = next.text;
    schedulePersistence();
    await nextTick();
    void runPrompt();
  }

  function queueDraft() {
    const chat = activeChat.value;
    const text = activeDraft.value.trim();
    if (!chat || !text) return;
    chat.queuedMessages.push({ id: uid(), text });
    chat.draft = "";
    chat.updatedAt = now();
    schedulePersistence();
  }

  function editQueued(id: string) {
    const chat = activeChat.value;
    if (!chat) return;
    const idx = chat.queuedMessages.findIndex((q) => q.id === id);
    if (idx < 0) return;
    chat.draft = chat.queuedMessages[idx].text;
    chat.queuedMessages.splice(idx, 1);
    schedulePersistence();
  }

  function deleteQueued(id: string) {
    const chat = activeChat.value;
    if (!chat) return;
    chat.queuedMessages = chat.queuedMessages.filter((q) => q.id !== id);
    schedulePersistence();
  }

  async function stopRun() {
    if (!isRunning.value || isStopping.value) return;
    stopRequested = true;
    isStopping.value = true;
    await window.studio.stopMimo();
  }

  function pushRunActivity(text: string) {
    const clean = text.trim();
    if (!clean) return;
    const last = runActivities.value[runActivities.value.length - 1];
    if (last === clean) return;
    runActivities.value.push(clean);
    if (runActivities.value.length > 8) {
      runActivities.value.splice(0, runActivities.value.length - 8);
    }
  }

  async function createTerminal() {
    const id = uid();
    const index = terminalSessions.value.length + 1;
    const cwd = projectRoot.value;
    terminalSessions.value.push({
      id,
      title: `Terminal ${index}`,
      cwd,
      running: true,
      exitCode: null
    });
    activeTerminalId.value = id;
    showTerminal.value = true;
    const result = await window.studio.createTerminalProcess({ terminalId: id, cwd });
    if (!result.ok) {
      const terminal = terminalSessions.value.find((item) => item.id === id);
      if (terminal) {
        terminal.running = false;
        terminal.exitCode = -1;
      }
    }
  }

  function ensureTerminal() {
    if (!terminalSessions.value.length) void createTerminal();
    if (!activeTerminalId.value) activeTerminalId.value = terminalSessions.value[0]?.id || "";
  }

  function openTerminalPanel() {
    ensureTerminal();
    showTerminal.value = true;
  }

  function selectTerminal(terminalId: string) {
    activeTerminalId.value = terminalId;
  }

  async function closeTerminal(terminalId: string) {
    const terminal = terminalSessions.value.find((item) => item.id === terminalId);
    if (terminal?.running) await stopTerminalCommand(terminalId);
    terminalSessions.value = terminalSessions.value.filter((item) => item.id !== terminalId);
    if (activeTerminalId.value === terminalId) {
      activeTerminalId.value = terminalSessions.value[0]?.id || "";
    }
    if (!terminalSessions.value.length) {
      activeTerminalId.value = "";
      showTerminal.value = false;
    }
  }

  async function stopTerminalCommand(terminalId = activeTerminalId.value) {
    const terminal = terminalSessions.value.find((item) => item.id === terminalId);
    if (!terminal) return;
    await window.studio.stopTerminalCommand(terminalId);
    terminal.running = false;
  }

  function handleTerminalExit(event: TerminalExitEvent) {
    const terminal = terminalSessions.value.find((item) => item.id === event.terminalId);
    if (!terminal) return;
    terminal.running = false;
    terminal.exitCode = event.code;
    if (event.cwd) terminal.cwd = event.cwd;
  }

  async function approvePermission(permType: string) {
    pendingPermissions.value = pendingPermissions.value.filter((p) => p.type !== permType);
    await window.studio.approvePermission(permType);
  }

  function denyPermission(permType: string) {
    pendingPermissions.value = pendingPermissions.value.filter((p) => p.type !== permType);
  }

  function updateScrollState() {
    const el = messagesEl.value;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isPinnedToBottom.value = distanceFromBottom <= bottomThreshold;
    showScrollToBottom.value = !isPinnedToBottom.value;
  }

  function scrollMessages(options: { force?: boolean; behavior?: ScrollBehavior } = {}) {
    const el = messagesEl.value;
    if (!el) return;
    if (!options.force && !isPinnedToBottom.value) {
      showScrollToBottom.value = true;
      return;
    }
    el.scrollTo({ top: el.scrollHeight, behavior: options.behavior || "auto" });
    isPinnedToBottom.value = true;
    showScrollToBottom.value = false;
  }

  function scrollToBottom(behavior: ScrollBehavior = "smooth") {
    scrollMessages({ force: true, behavior });
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
    const idx = chat.messages.findIndex((m) => m.id === msg.id);
    if (idx < 0) return;
    chat.messages[idx].text = editingText.value;
    chat.messages = chat.messages.slice(0, idx + 1);
    chat.updatedAt = now();
    editingMsgId.value = "";
    editingText.value = "";
    await persistChats();
  }

  async function revertTo(msgId: string) {
    const chat = activeChat.value;
    if (!chat || isRunning.value) return;
    const idx = chat.messages.findIndex((m) => m.id === msgId);
    if (idx < 0) return;
    const message = chat.messages[idx];
    const sourceIdx = message.role === "user"
      ? idx
      : [...chat.messages.slice(0, idx + 1)].reverse().findIndex((item) => item.role === "user");
    const userIdx = message.role === "user"
      ? idx
      : sourceIdx >= 0 ? idx - sourceIdx : -1;
    if (userIdx < 0) return;
    const prompt = chat.messages[userIdx].text;
    chat.messages = chat.messages.slice(0, userIdx);
    chat.draft = prompt;
    chat.queuedMessages = [];
    chat.updatedAt = now();
    editingMsgId.value = "";
    editingText.value = "";
    schedulePersistence();
    await nextTick();
    await runPrompt();
  }

  function copyMessage(text: string) {
    void navigator.clipboard.writeText(text);
  }

  function checkConnection() {
    window.studio.checkMimo().then((result) => {
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

  function handleComposerKeydown(e: KeyboardEvent) {
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    if (isRunning.value && activeDraft.value.trim()) queueDraft();
    else void runPrompt();
  }

  async function hydrate() {
    const settings = await window.studio.getSettings();
    appSettings.value = normalizeAppSettings(settings.app || {});
    language.setLanguage(appSettings.value.language || "en");
    chats.value = (settings.chats || []).map((chat) => normalizeChat(chat, translate("untitled")));
    draftChat.value = settings.ui?.draftChat ? normalizeChat(settings.ui.draftChat, translate("untitled")) : null;
    activeChatId.value = settings.ui?.activeChatId && chats.value.some((chat) => chat.id === settings.ui?.activeChatId)
      ? settings.ui.activeChatId
      : chats.value[0]?.id || "";
    if (!activeChatId.value && !draftChat.value) draftChat.value = makeChat(translate("untitled"));

    hydrated = true;
    await nextTick();
    scrollToBottom("auto");
    await checkCli();
    outputUnsubscribe = window.studio.onMimoOutput((event) => {
      if (event.type === "activity" && isRunning.value) {
        pushRunActivity(event.text);
        void nextTick(() => scrollMessages({ behavior: "smooth" }));
      } else if (event.type === "stdout" && isRunning.value) {
        if (!streamingText.value.trim()) pushRunActivity(translate("writingFinal"));
        streamingText.value += event.text;
        void nextTick(() => scrollMessages({ behavior: "auto" }));
      } else if (event.type === "stderr" && isRunning.value) {
        pushRunActivity(event.text);
        void nextTick(() => scrollMessages({ behavior: "smooth" }));
      }
    });
    permissionUnsubscribe = window.studio.onMimoPermission((event) => {
      if (isRunning.value) {
        const exists = pendingPermissions.value.some((p) => p.type === event.type && p.target === event.target);
        if (!exists) pendingPermissions.value.push(event);
        pushRunActivity(`${translate("permRequested")}: ${event.type}`);
        void nextTick(() => scrollMessages({ behavior: "smooth" }));
      }
    });
    terminalExitUnsubscribe = window.studio.onTerminalExit(handleTerminalExit);
    checkConnection();
    disconnectTimer = setInterval(checkConnection, 15000);
  }

  function destroy() {
    outputUnsubscribe?.();
    permissionUnsubscribe?.();
    terminalExitUnsubscribe?.();
    if (disconnectTimer) clearInterval(disconnectTimer);
    if (saveChatsTimer) clearTimeout(saveChatsTimer);
    if (saveUiTimer) clearTimeout(saveUiTimer);
  }

  watch(() => language.locale, (locale) => {
    appSettings.value.language = locale;
    void saveAppSettings();
  });
  watch(appSettings, saveAppSettings, { deep: true });
  watch(activeChatId, scheduleUiSave);
  watch(draftChat, scheduleUiSave, { deep: true });
  watch(chats, scheduleChatsSave, { deep: true });

  return {
    appSettings,
    chats,
    draftChat,
    activeChatId,
    terminalSessions,
    activeTerminalId,
    cliStatus,
    isRunning,
    isStopping,
    showSettings,
    showTerminal,
    showAgentMenu,
    showModelMenu,
    deleteConfirmId,
    streamingText,
    runActivities,
    pendingPermissions,
    editingMsgId,
    editingText,
    isDisconnected,
    messagesEl,
    showScrollToBottom,
    activeChat,
    activeTitle,
    currentModel,
    activeTerminal,
    runningTerminals,
    hasRunningTerminal,
    isAgentCommandActive,
    activeDraft,
    draftDir,
    messageQueue,
    canRun,
    chatSizeInfo,
    projectGroups,
    lineDir,
    relativeTime,
    updateScrollState,
    scrollToBottom,
    createTerminal,
    openTerminalPanel,
    selectTerminal,
    closeTerminal,
    stopTerminalCommand,
    startNewChat,
    selectChat,
    deleteChat,
    pickFolder,
    runPrompt,
    editQueued,
    deleteQueued,
    stopRun,
    approvePermission,
    denyPermission,
    startEdit,
    cancelEdit,
    saveEdit,
    revertTo,
    copyMessage,
    selectAgent,
    selectModel,
    handleComposerKeydown,
    hydrate,
    destroy
  };
});
