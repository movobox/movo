import { defineStore } from "pinia";
import { computed, nextTick, ref, watch } from "vue";
import pkg from "../../package.json";
import { normalizeAppSettings } from "../constants/settings";
import { translate } from "../i18n";
import type { AppSettings, Chat, ChatAttachment, ChatMessage, InterruptedEvent, PermissionEvent, ProjectFile, QueuedMessage, TerminalExitEvent, TerminalSession } from "../types";
import { clone, lineDir, makeChat, makeMessage, normalizeChat, now, relativeTime, uid } from "../utils/chat";
import { useLanguageStore } from "./language";

type CliStatus = { installed: boolean; version: string; checked: boolean };
const APP_NAME = "Movo";
const APP_VERSION = pkg.version || "0.1.0";

export const useStudioStore = defineStore("studio", () => {
  const language = useLanguageStore();
  const appSettings = ref<AppSettings>(normalizeAppSettings());
  const chats = ref<Chat[]>([]);
  const draftChat = ref<Chat | null>(null);
  const activeChatId = ref("");
  type TerminalScope = { sessions: TerminalSession[]; activeId: string };
  const terminalScopes = ref<Record<string, TerminalScope>>({});
  const cliStatus = ref<CliStatus>({ installed: false, version: "", checked: false });
  const showSettings = ref(false);
  const showTerminal = ref(false);
  const terminalFloating = ref(false);
  const showAgentMenu = ref(false);
  const showModelMenu = ref(false);
  const deleteConfirmId = ref("");
  type RunActivity = { text: string; detail: string; code?: string; codeLang?: string; oldCode?: string; newCode?: string; editFilePath?: string };
  type TimelineItem =
    | { kind: "text"; text: string }
    | { kind: "activity"; text: string; detail: string; code?: string; codeLang?: string; oldCode?: string; newCode?: string; editFilePath?: string };
  type RunState = {
    isRunning: boolean;
    isStopping: boolean;
    stopRequested: boolean;
    streamingText: string;
    activities: RunActivity[];
    timeline: TimelineItem[];
    pendingPermissions: PermissionEvent[];
    interruptedRun: InterruptedEvent | null;
    startedAt: number;
  };
  const runStates = ref<Record<string, RunState>>({});
  const projectFiles = ref<ProjectFile[]>([]);
  const filePickerOpen = ref(false);
  const filePickerQuery = ref("");
  const editingMsgId = ref("");
  const editingText = ref("");
  const editingChatId = ref("");
  const editingChatTitle = ref("");
  const isDisconnected = ref(false);
  const messagesEl = ref<HTMLElement | null>(null);
  const isPinnedToBottom = ref(true);
  const showScrollToBottom = ref(false);
  const droppedFileScopes = ref<Record<string, string[]>>({});
  const attachmentScopes = ref<Record<string, ChatAttachment[]>>({});

  let disconnectTimer: ReturnType<typeof setInterval> | null = null;
  let saveChatsTimer: ReturnType<typeof setTimeout> | null = null;
  let saveUiTimer: ReturnType<typeof setTimeout> | null = null;
  let hydrated = false;
  let outputUnsubscribe: (() => void) | undefined;
  let permissionUnsubscribe: (() => void) | undefined;
  let terminalExitUnsubscribe: (() => void) | undefined;
  let interruptedUnsubscribe: (() => void) | undefined;
  const bottomThreshold = 96;

  const activeChat = computed(() => draftChat.value || chats.value.find((c) => c.id === activeChatId.value) || null);
  const activeTitle = computed(() => activeChat.value?.title || translate("untitled"));
  const currentModel = computed(() => appSettings.value.model || "MiMo Auto");
  const terminalScopeKey = computed(() => activeChat.value ? `chat:${activeChat.value.id}` : "default");
  const attachmentScopeKey = computed(() => activeChat.value ? `chat:${activeChat.value.id}` : "default");
  function currentTerminalScope() {
    const key = terminalScopeKey.value;
    if (!terminalScopes.value[key]) terminalScopes.value[key] = { sessions: [], activeId: "" };
    return terminalScopes.value[key];
  }
  function findTerminalScope(terminalId: string) {
    return Object.values(terminalScopes.value).find((scope) => scope.sessions.some((terminal) => terminal.id === terminalId)) || null;
  }
  const terminalSessions = computed(() => currentTerminalScope().sessions);
  function currentDraftAttachments() {
    const key = attachmentScopeKey.value;
    if (!attachmentScopes.value[key]) attachmentScopes.value[key] = [];
    return attachmentScopes.value[key];
  }
  function currentDroppedFiles() {
    const key = attachmentScopeKey.value;
    if (!droppedFileScopes.value[key]) droppedFileScopes.value[key] = [];
    return droppedFileScopes.value[key];
  }
  const droppedFiles = computed({
    get: () => currentDroppedFiles(),
    set: (files: string[]) => { droppedFileScopes.value[attachmentScopeKey.value] = files; }
  });
  const draftAttachments = computed({
    get: () => currentDraftAttachments(),
    set: (attachments: ChatAttachment[]) => { attachmentScopes.value[attachmentScopeKey.value] = attachments; }
  });
  const activeTerminalId = computed({
    get: () => currentTerminalScope().activeId,
    set: (terminalId: string) => { currentTerminalScope().activeId = terminalId; }
  });
  const activeTerminal = computed(() => terminalSessions.value.find((terminal) => terminal.id === activeTerminalId.value) || null);
  const runningTerminals = computed(() => terminalSessions.value.filter((terminal) => terminal.running));
  const hasRunningTerminal = computed(() => runningTerminals.value.length > 0);
  const activeRunState = computed(() => activeChat.value ? runStates.value[activeChat.value.id] || null : null);
  const isRunning = computed(() => Boolean(activeRunState.value?.isRunning));
  const isStopping = computed(() => Boolean(activeRunState.value?.isStopping));
  const streamingText = computed(() => activeRunState.value?.streamingText || "");
  const runActivities = computed(() => activeRunState.value?.activities || []);
  const runTimeline = computed(() => activeRunState.value?.timeline || []);
  const pendingPermissions = computed(() => activeRunState.value?.pendingPermissions || []);
  const interruptedRun = computed(() => activeRunState.value?.interruptedRun || null);
  const hasAnyRunningChat = computed(() => Object.values(runStates.value).some((state) => state.isRunning));
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
  const canRun = computed(() => Boolean(activeChat.value?.folder && (activeDraft.value.trim() || draftAttachments.value.length)));
  const selectedContextFiles = computed(() => extractMentionedFiles(activeDraft.value, projectFiles.value));
  const fileSuggestions = computed(() => {
    const query = filePickerQuery.value.trim().toLowerCase();
    if (!filePickerOpen.value || !query) return [];
    return fuzzyFiles(projectFiles.value, query).slice(0, 8);
  });

  function chatRunStatus(chatId: string) {
    const state = runStates.value[chatId];
    if (!state?.isRunning) return "";
    return state.isStopping ? "stopping" : "running";
  }

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

  function makeRunState(startedAt = Date.now()): RunState {
    return {
      isRunning: false,
      isStopping: false,
      stopRequested: false,
      streamingText: "",
      activities: [],
      timeline: [],
      pendingPermissions: [],
      interruptedRun: null,
      startedAt
    };
  }

  function ensureRunState(chatId: string) {
    if (!runStates.value[chatId]) runStates.value[chatId] = makeRunState();
    return runStates.value[chatId];
  }

  function clearRunState(chatId: string) {
    delete runStates.value[chatId];
  }

  function settingsFromProjectConfig(config: unknown) {
    if (!config || typeof config !== "object" || Array.isArray(config)) return appSettings.value;
    const src = config as Record<string, any>;
    const perm = src.permission && typeof src.permission === "object" ? src.permission : {};
    return normalizeAppSettings({
      ...appSettings.value,
      provider: typeof src.provider === "string" ? src.provider : appSettings.value.provider,
      model: typeof src.model === "string" ? src.model : appSettings.value.model,
      agent: typeof src.default_agent === "string" ? src.default_agent : typeof src.agent === "string" ? src.agent : appSettings.value.agent,
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
      agentsJson: src.agent && typeof src.agent === "object" ? JSON.stringify(src.agent, null, 2) : appSettings.value.agentsJson,
      commandsJson: src.command && typeof src.command === "object" ? JSON.stringify(src.command, null, 2) : appSettings.value.commandsJson,
      skillsJson: src.skills && typeof src.skills === "object" ? JSON.stringify(src.skills, null, 2) : appSettings.value.skillsJson,
      toolJson: src.tool && typeof src.tool === "object" ? JSON.stringify(src.tool, null, 2) : appSettings.value.toolJson,
      lspJson: src.lsp && typeof src.lsp === "object" ? JSON.stringify(src.lsp, null, 2) : appSettings.value.lspJson,
      formatterJson: src.formatter && typeof src.formatter === "object" ? JSON.stringify(src.formatter, null, 2) : appSettings.value.formatterJson,
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

  function startEditChat(chatId: string) {
    const chat = chats.value.find((c) => c.id === chatId) || (draftChat.value?.id === chatId ? draftChat.value : null);
    if (!chat) return;
    editingChatId.value = chatId;
    editingChatTitle.value = chat.title;
    nextTick(() => {
      const el = document.querySelector(".chat-title-input") as HTMLInputElement | null;
      el?.focus();
      el?.select();
    });
  }

  function cancelEditChat() {
    editingChatId.value = "";
    editingChatTitle.value = "";
  }

  function saveEditChat() {
    const title = editingChatTitle.value.trim();
    if (!editingChatId.value || !title) { cancelEditChat(); return; }
    const chat = chats.value.find((c) => c.id === editingChatId.value) || (draftChat.value?.id === editingChatId.value ? draftChat.value : null);
    if (chat) {
      chat.title = title;
      chat.updatedAt = now();
      schedulePersistence();
    }
    cancelEditChat();
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
    if (appSettings.value.trustWorkspace) {
      await window.studio.saveProjectConfig({ folder, appSettings: clone(appSettings.value) });
    }
    await loadProjectFiles();
    schedulePersistence();
  }

  async function loadProjectFiles() {
    const folder = activeChat.value?.folder;
    if (!folder) {
      projectFiles.value = [];
      return;
    }
    const result = await window.studio.listProjectFiles(folder);
    projectFiles.value = result.ok ? result.files : [];
  }

  async function checkCli() {
    const result = await window.studio.checkMimo();
    cliStatus.value = { ...result, checked: true };
  }

  async function saveAppSettings() {
    await window.studio.saveSettings(clone(appSettings.value));
    if (appSettings.value.trustWorkspace && activeChat.value?.folder) {
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
    if (!chat || !canRun.value) return;
    const requestText = text || "Use the attached file(s) as context.";

    if (text && await handleLocalCommand(text)) return;

    const contextFiles = extractMentionedFiles(requestText, projectFiles.value);
    const mentions = Array.from(requestText.matchAll(/@([^\s`"'<>]+)/g)).map((m) => m[1]);
    const unresolvedMentions = mentions.filter((m) => !contextFiles.some((f) => f === m || f.endsWith("/" + m) || f.endsWith("\\" + m)));
    const resolvedFromFs: string[] = [];
    const projectFolder = chat.folder || "";
    for (const mention of unresolvedMentions) {
      try {
        const result = await window.studio.searchFiles({ fileName: mention, projectFolder });
        if (result.found && result.path) resolvedFromFs.push(result.path);
      } catch {}
    }
    await Promise.all(draftAttachments.value.map((attachment) => enrichAttachment(attachment)));
    const outgoingAttachments = clone(draftAttachments.value);
    const attachedFiles = outgoingAttachments.map((attachment) => attachment.path);
    const allExtraFiles = [...new Set([...contextFiles, ...droppedFiles.value, ...resolvedFromFs, ...attachedFiles])].filter((f) => f && typeof f === "string" && f.trim().length > 0);
    const promptText = withAttachmentContext(requestText, outgoingAttachments);
    droppedFiles.value = [];
    draftAttachments.value = [];
    chat.messages.push(makeMessage("user", requestText, outgoingAttachments));
    if (chat.messages.length === 1) chat.title = requestText.slice(0, 56);
    chat.updatedAt = now();
    chat.draft = "";
    const runStartedAt = Date.now();
    const runState = makeRunState(runStartedAt);
    runState.isRunning = true;
    runState.activities = [{
      text: "Understanding request",
      detail: [
        `Request:\n${promptText}`,
        allExtraFiles.length ? `Context and attached files:\n${allExtraFiles.map((file) => `- ${file}`).join("\n")}` : ""
      ].filter(Boolean).join("\n")
    }, {
      text: "Preparing workspace",
      detail: "Loading project settings, hidden Movo defaults, and relevant context before the engine starts."
    }];
    runStates.value[chat.id] = runState;
    await nextTick();
    scrollToBottom("smooth");

    try {
      await persistChats();
      await persistUiState();
      const payload = {
        chat: clone(chat),
        message: buildPromptWithCommandContext(promptText),
        appSettings: clone(appSettings.value),
        extraFiles: allExtraFiles
      };
      const result = await window.studio.runMimo(payload);
      const finalText = result.output.trim();
      const activityLog = formatRunActivities(runState.activities, Date.now() - runStartedAt);
      if (activityLog) chat.messages.push(makeMessage("system", activityLog));
      if (runState.stopRequested) {
        if (runState.streamingText.trim()) {
          chat.messages.push(makeMessage("assistant", runState.streamingText.trim()));
        } else if (finalText) {
          chat.messages.push(makeMessage("assistant", finalText));
        }
        runState.streamingText = "";
        chat.messages.push(makeMessage("system", translate("stoppedByUser")));
      } else if (!result.ok && finalText && runState.interruptedRun) {
        runState.streamingText = "";
        chat.messages.push(makeMessage("assistant", finalText));
        chat.messages.push(makeMessage("system", translate("interruptedTitle")));
      } else if (finalText) {
        runState.streamingText = "";
        chat.messages.push(makeMessage(result.ok ? "assistant" : "system", finalText));
      } else if (runState.streamingText.trim()) {
        chat.messages.push(makeMessage(result.ok ? "assistant" : "system", runState.streamingText.trim()));
        runState.streamingText = "";
      } else {
        chat.messages.push(makeMessage("system", `Exit code ${result.code}`));
      }
      chat.updatedAt = now();
      await appendProjectChanges(chat);
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
      runState.isRunning = false;
      runState.isStopping = false;
      runState.stopRequested = false;
      runState.streamingText = "";
      runState.activities = [];
      runState.timeline = [];
      runState.pendingPermissions = [];
      if (!runState.interruptedRun) clearRunState(chat.id);
      await nextTick();
      scrollMessages({ behavior: "smooth" });
      void processQueue();
    }
  }

  async function handleLocalCommand(text: string) {
    if (text.startsWith("!")) {
      await runBangCommand(text.slice(1).trim());
      return true;
    }
    if (!text.startsWith("/")) return false;
    const [command, ...args] = text.slice(1).trim().split(/\s+/);
    const rest = args.join(" ");
    if (command === "new") {
      startNewChat(activeChat.value?.folder || "");
      return true;
    }
    if (command === "sessions") {
      const chat = activeChat.value;
      if (!chat) return true;
      const result = await window.studio.listSessions();
      chat.messages.push(makeMessage("user", text));
      chat.messages.push(makeMessage("system", `${APP_NAME} sessions:\n\n\`\`\`text\n${result.output.trim() || "No sessions found."}\n\`\`\``));
      chat.draft = "";
      schedulePersistence();
      return true;
    }
    if (command === "compact") {
      const chat = activeChat.value;
      if (!chat) return true;
      chat.messages.push(makeMessage("user", text));
      chat.messages.push(makeMessage("system", `Context compaction requested. The next ${APP_NAME} run will use the current saved session/context.`));
      chat.draft = "";
      schedulePersistence();
      return true;
    }
    if (command === "export") {
      await exportCurrentChat();
      activeDraft.value = rest;
      return true;
    }
    return false;
  }

  async function runBangCommand(command: string) {
    const chat = activeChat.value;
    if (!chat || !command) return;
    chat.messages.push(makeMessage("user", `!${command}`));
    chat.draft = "";
    const runStartedAt = Date.now();
    const runState = makeRunState(runStartedAt);
    runState.isRunning = true;
    runState.activities = [{ text: "Running command", detail: `Command:\n${command}\nWorking directory: ${chat.folder || "."}` }];
    runStates.value[chat.id] = runState;
    await nextTick();
    scrollToBottom("smooth");
    const result = await window.studio.runShellCommand({ command, cwd: chat.folder });
    const output = result.output.trim() || "(no output)";
    const activityLog = formatRunActivities(runState.activities, Date.now() - runStartedAt);
    if (activityLog) chat.messages.push(makeMessage("system", activityLog));
    chat.messages.push(makeMessage("system", `Command output entered context:\n\n\`\`\`text\n${output.slice(0, 12000)}\n\`\`\``));
    chat.updatedAt = now();
    clearRunState(chat.id);
    schedulePersistence();
    await nextTick();
    scrollToBottom("smooth");
  }

  function buildPromptWithCommandContext(text: string) {
    const identity = buildMovoIdentityInstruction();
    const commandBlocks = activeChat.value?.messages
      .filter((message) => message.role === "system" && message.text.startsWith("Command output entered context:"))
      .slice(-3)
      .map((message) => message.text)
      .join("\n\n") || "";
    const withIdentity = `${identity}\n\n${text}`;
    if (!commandBlocks) return withIdentity;
    return `${withIdentity}\n\nRecent command context:\n${commandBlocks}`;
  }

  function withAttachmentContext(text: string, attachments: ChatAttachment[]) {
    if (!attachments.length) return text;
    const lines = attachments.map((attachment) => {
      const label = attachment.kind === "image" ? "image" : "file";
      return `- ${label}: ${attachment.name} (${attachment.path})`;
    });
    return [
      text,
      "",
      "Attached files available to inspect:",
      ...lines
    ].join("\n");
  }

  function buildMovoIdentityInstruction() {
    return [
      "<movo_identity>",
      `You are ${APP_NAME}, version ${APP_VERSION}, a desktop AI studio.`,
      `If the user asks your name, identity, product name, app name, version, or asks who/what you are, answer as ${APP_NAME} and include version ${APP_VERSION}.`,
      "Do not identify your product identity as the underlying engine or any legacy product name.",
      "If the user explicitly asks about the underlying engine, be transparent, but keep Movo as the app/product identity.",
      "</movo_identity>"
    ].join("\n");
  }

  async function appendProjectChanges(chat: Chat) {
    if (!chat.folder) return;
    const result = await window.studio.getProjectChanges(chat.folder);
    const changes = result.changes;
    if (!changes.isGitRepo) return;
    if (!changes.files.length && !changes.diff.trim()) return;
    const last = chat.messages[chat.messages.length - 1];
    if (!last || last.role !== "assistant") return;
    const statusIcon: Record<string, string> = {
      modified: "M",
      added: "A",
      deleted: "D",
      renamed: "R",
      untracked: "?",
      copied: "C"
    };
    const statusColor: Record<string, string> = {
      modified: "#eab308",
      added: "#22c55e",
      deleted: "#ef4444",
      renamed: "#a78bfa",
      untracked: "#94a3b8",
      copied: "#60a5fa"
    };
    const fileLines = changes.files.map((f) => {
      const icon = statusIcon[f.status] || "?";
      const color = statusColor[f.status] || "#94a3b8";
      return `| \`${icon}\` | \`${f.path}\` |`;
    });
    const header = `|   | File |`;
    const separator = `|---|------|`;
    const fileTable = [header, separator, ...fileLines].join("\n");
    const diff = changes.diff.trim()
      ? `\n\n<details>\n<summary>View Diff (${changes.diff.trim().split("\n").filter((l: string) => l.startsWith("+") || l.startsWith("-")).length} lines changed)</summary>\n\n\`\`\`diff\n${changes.diff.trim()}\n\`\`\`\n</details>`
      : "";
    last.text = `${last.text}\n\n---\n\n### Changed files\n\n${fileTable}${diff}`;
  }

  async function processQueue() {
    const chat = activeChat.value;
    if (!chat || chat.queuedMessages.length === 0 || runStates.value[chat.id]?.isRunning) return;
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
    const chat = activeChat.value;
    if (!chat) return;
    const runState = runStates.value[chat.id];
    if (!runState?.isRunning || runState.isStopping) return;
    runState.stopRequested = true;
    runState.isStopping = true;
    await window.studio.stopMimo({ chatId: chat.id });
  }

  function dismissInterrupted() {
    const chat = activeChat.value;
    if (!chat) return;
    const runState = runStates.value[chat.id];
    if (!runState) return;
    runState.interruptedRun = null;
    if (!runState.isRunning) clearRunState(chat.id);
  }

  async function resumeInterruptedRun() {
    const interrupted = interruptedRun.value;
    if (!interrupted) return;
    const runState = runStates.value[interrupted.chatId];
    if (runState) runState.interruptedRun = null;
    const chat = activeChat.value;
    if (!chat) return;
    const prompt = interrupted.message || [...chat.messages].reverse().find((m) => m.role === "user")?.text || "";
    if (!prompt) return;
    chat.draft = `Continue from where the previous response was interrupted. Do not repeat completed parts unless necessary.\n\nOriginal request:\n${prompt}`;
    schedulePersistence();
    await nextTick();
    void runPrompt();
  }

  function pushRunActivity(chatId: string, text: string, detail = "", code?: string, codeLang?: string, oldCode?: string, newCode?: string, editFilePath?: string) {
    const clean = text.trim();
    if (!clean) return;
    const runState = ensureRunState(chatId);
    const last = runState.activities[runState.activities.length - 1];
    if (last && last.text === clean && last.detail === detail.trim() && last.code === code) return;
    runState.activities.push({ text: clean, detail: detail.trim(), code, codeLang, oldCode, newCode, editFilePath });
    if (runState.activities.length > 50) {
      runState.activities.splice(0, runState.activities.length - 50);
    }
    runState.timeline.push({ kind: "activity", text: clean, detail: detail.trim(), code, codeLang, oldCode, newCode, editFilePath });
    if (runState.timeline.length > 200) {
      runState.timeline.splice(0, runState.timeline.length - 200);
    }
  }

  async function createTerminal() {
    const scope = currentTerminalScope();
    const id = uid();
    const index = scope.sessions.length + 1;
    const cwd = projectRoot.value;
    scope.sessions.push({
      id,
      title: `Terminal ${index}`,
      cwd,
      running: true,
      exitCode: null
    });
    scope.activeId = id;
    showTerminal.value = true;
    const result = await window.studio.createTerminalProcess({ terminalId: id, cwd });
    if (!result.ok) {
      const terminal = scope.sessions.find((item) => item.id === id);
      if (terminal) {
        terminal.running = false;
        terminal.exitCode = -1;
      }
    }
  }

  function ensureTerminal() {
    const scope = currentTerminalScope();
    if (!scope.sessions.length) void createTerminal();
    if (!scope.activeId) scope.activeId = scope.sessions[0]?.id || "";
  }

  function openTerminalPanel() {
    ensureTerminal();
    showTerminal.value = true;
  }

  function toggleTerminalFloating() {
    terminalFloating.value = !terminalFloating.value;
    showTerminal.value = true;
  }

  function selectTerminal(terminalId: string) {
    const scope = currentTerminalScope();
    if (scope.sessions.some((terminal) => terminal.id === terminalId)) scope.activeId = terminalId;
  }

  async function closeTerminal(terminalId: string) {
    const scope = findTerminalScope(terminalId);
    if (!scope) return;
    const terminal = scope.sessions.find((item) => item.id === terminalId);
    if (terminal?.running) await stopTerminalCommand(terminalId);
    const index = scope.sessions.findIndex((item) => item.id === terminalId);
    if (index >= 0) scope.sessions.splice(index, 1);
    if (scope.activeId === terminalId) {
      scope.activeId = scope.sessions[0]?.id || "";
    }
    if (scope === currentTerminalScope() && !scope.sessions.length) {
      scope.activeId = "";
      showTerminal.value = false;
    }
  }

  async function stopTerminalCommand(terminalId = activeTerminalId.value) {
    const scope = findTerminalScope(terminalId);
    const terminal = scope?.sessions.find((item) => item.id === terminalId);
    if (!terminal) return;
    await window.studio.stopTerminalCommand(terminalId);
    terminal.running = false;
  }

  async function openExternalTerminal() {
    const cwd = activeTerminal.value?.cwd || projectRoot.value || "";
    await window.studio.openExternalTerminal({ cwd });
  }

  function handleTerminalExit(event: TerminalExitEvent) {
    const scope = findTerminalScope(event.terminalId);
    const terminal = scope?.sessions.find((item) => item.id === event.terminalId);
    if (!terminal) return;
    terminal.running = false;
    terminal.exitCode = event.code;
    if (event.cwd) terminal.cwd = event.cwd;
  }

  async function approvePermission(permType: string) {
    const chat = activeChat.value;
    if (!chat) return;
    const runState = runStates.value[chat.id];
    if (runState) runState.pendingPermissions = runState.pendingPermissions.filter((p) => p.type !== permType);
    await window.studio.approvePermission({ type: permType, chatId: chat.id });
  }

  function denyPermission(permType: string) {
    const chat = activeChat.value;
    if (!chat) return;
    const runState = runStates.value[chat.id];
    if (runState) runState.pendingPermissions = runState.pendingPermissions.filter((p) => p.type !== permType);
  }

  function updateFilePickerFromDraft() {
    const beforeCursor = activeDraft.value;
    const match = beforeCursor.match(/(?:^|\s)@([^\s@]*)$/);
    filePickerOpen.value = Boolean(match && projectFiles.value.length);
    filePickerQuery.value = match?.[1] || "";
  }

  function insertContextFile(path: string) {
    const draft = activeDraft.value;
    const displayName = fileNameFromPath(path);
    const replacement = `@${displayName} `;
    if (!droppedFiles.value.includes(path)) droppedFiles.value.push(path);
    activeDraft.value = draft.replace(/(?:^|\s)@([^\s@]*)$/, (match) => {
      const prefix = match.startsWith(" ") ? " " : "";
      return `${prefix}${replacement}`;
    });
    filePickerOpen.value = false;
    filePickerQuery.value = "";
  }

  function removeContextFile(path: string) {
    const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    activeDraft.value = activeDraft.value
      .replace(new RegExp(`(^|\\s)@${escaped}(?=\\s|$)`, "g"), " ")
      .replace(/[ \t]{2,}/g, " ")
      .trimStart();
    droppedFiles.value = droppedFiles.value.filter((file) => file !== path);
  }

  function attachMentionFile(path: string) {
    const clean = path.trim();
    if (!clean) return;
    if (!droppedFiles.value.includes(clean)) droppedFiles.value.push(clean);
    const mention = `@${fileNameFromPath(clean)}`;
    if (!activeDraft.value.includes(mention)) {
      activeDraft.value = `${activeDraft.value.trimEnd()} ${mention} `.trimStart();
    }
    filePickerOpen.value = false;
    filePickerQuery.value = "";
  }

  async function attachFile(path: string) {
    const clean = path.trim();
    if (!clean) return;
    try {
      const info = await window.studio.inspectFile?.(resolveAttachmentPath(clean));
      if (!info) {
        attachFallbackFile(clean);
        return;
      }
      if (!info.ok) {
        attachFallbackFile(clean);
        return;
      }
      if (info.mentionable) {
        attachMentionFile(info.path);
        return;
      }
      addDraftAttachment({
        path: info.path,
        name: info.name,
        kind: info.isImage ? "image" : "binary",
        mime: info.mime,
        size: info.size,
        previewUrl: info.previewUrl
      });
    } catch {
      attachFallbackFile(clean);
    }
  }

  function attachFallbackFile(path: string) {
    const clean = resolveAttachmentPath(path.trim());
    if (!clean) return;
    if (isCodeLikePath(clean)) {
      attachMentionFile(clean);
      return;
    }
    addDraftAttachment({
      path: clean,
      name: fileNameFromPath(clean),
      kind: isImageLikePath(clean) ? "image" : "binary",
      mime: isImageLikePath(clean) ? "image/*" : "application/octet-stream",
      size: 0,
      previewUrl: isImageLikePath(clean) && isAbsolutePath(clean) ? `movo-file://preview?path=${encodeURIComponent(clean)}` : undefined,
      filePreviewUrl: isImageLikePath(clean) && isAbsolutePath(clean) ? `movo-file://preview?path=${encodeURIComponent(clean)}` : undefined
    });
  }

  function resolveAttachmentPath(path: string) {
    if (isAbsolutePath(path)) return path;
    const root = projectRoot.value;
    if (!root) return path;
    return `${root.replace(/[\\/]+$/, "")}/${path.replace(/^[\\/]+/, "")}`;
  }

  function removeAttachment(id: string) {
    draftAttachments.value = draftAttachments.value.filter((attachment) => attachment.id !== id);
  }

  function addDraftAttachment(attachment: Omit<ChatAttachment, "id"> & { id?: string }) {
    const cleanPath = attachment.path.trim();
    if (!cleanPath) return;
    const existing = draftAttachments.value.find((item) => item.path === cleanPath);
    if (existing) {
      mergeAttachment(existing, attachment);
      void enrichAttachment(existing);
      return;
    }
    const item = {
      id: attachment.id || uid(),
      path: cleanPath,
      name: attachment.name || fileNameFromPath(cleanPath),
      kind: attachment.kind,
      mime: attachment.mime || (attachment.kind === "image" ? "image/*" : "application/octet-stream"),
      size: Number.isFinite(attachment.size) ? attachment.size : 0,
      previewUrl: attachment.previewUrl,
      filePreviewUrl: attachment.filePreviewUrl
    };
    draftAttachments.value.push(item);
    void enrichAttachment(item);
  }

  function mergeAttachment(target: ChatAttachment, source: Omit<ChatAttachment, "id"> & { id?: string }) {
    target.name = source.name || target.name;
    target.kind = source.kind || target.kind;
    target.mime = source.mime || target.mime;
    if (Number.isFinite(source.size) && source.size > 0) target.size = source.size;
    if (source.previewUrl) target.previewUrl = source.previewUrl;
    if (source.filePreviewUrl) target.filePreviewUrl = source.filePreviewUrl;
  }

  async function enrichAttachment(attachment: ChatAttachment) {
    if (!window.studio.inspectFile) return;
    if (attachment.size > 0 && (attachment.kind !== "image" || attachment.previewUrl)) return;
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
    if (!chat || runStates.value[chat.id]?.isRunning) return;
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

  async function openProjectFolder() {
    const folder = projectRoot.value;
    if (!folder) return;
    await window.studio.openPath(folder);
  }

  async function exportCurrentChat() {
    const chat = activeChat.value;
    if (!chat) return;
    const result = await window.studio.exportChat(clone(chat));
    if (result.ok && result.path) {
      chat.messages.push(makeMessage("system", `Session exported:\n\n\`${result.path}\``));
      schedulePersistence();
    }
  }

  async function importSession() {
    const result = await window.studio.importChat();
    if (!result.ok || !result.chat) return;
    const chat = normalizeChat(result.chat, translate("untitled"));
    chat.id = uid();
    chat.updatedAt = now();
    chats.value.unshift(chat);
    draftChat.value = null;
    activeChatId.value = chat.id;
    await persistChats();
    await persistUiState();
    await loadProjectFiles();
  }

  function forkCurrentChat() {
    const chat = activeChat.value;
    if (!chat) return;
    const fork = normalizeChat(clone(chat), translate("untitled"));
    fork.id = uid();
    fork.title = `${fork.title} (fork)`;
    fork.createdAt = now();
    fork.updatedAt = now();
    chats.value.unshift(fork);
    draftChat.value = null;
    activeChatId.value = fork.id;
    schedulePersistence();
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
    updateFilePickerFromDraft();
    if (e.key === "Escape" && filePickerOpen.value) {
      e.preventDefault();
      filePickerOpen.value = false;
      return;
    }
    if ((e.key === "Tab" || e.key === "Enter") && filePickerOpen.value && fileSuggestions.value[0]) {
      e.preventDefault();
      insertContextFile(fileSuggestions.value[0].path);
      return;
    }
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    if (isRunning.value && activeDraft.value.trim()) queueDraft();
    else void runPrompt();
  }

  async function hydrate() {
    const settings = await window.studio.getSettings();
    appSettings.value = normalizeAppSettings(settings.app || {});
    appSettings.value.model = "";
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
    await loadProjectFiles();
    outputUnsubscribe = window.studio.onMimoOutput((event) => {
      const chatId = event.chatId || activeChat.value?.id || "";
      const runState = chatId ? runStates.value[chatId] : null;
      if (!chatId || !runState?.isRunning) return;
      const isActiveRun = activeChat.value?.id === chatId;
      if (event.type === "activity") {
        pushRunActivity(chatId, event.text, event.detail || "", event.code, event.codeLang, event.oldCode, event.newCode, event.editFilePath);
        if (isActiveRun) void nextTick(() => scrollMessages({ behavior: "smooth" }));
      } else if (event.type === "stdout") {
        if (!runState.streamingText.trim()) pushRunActivity(chatId, translate("writingFinal"));
        runState.streamingText += event.text;
        const last = runState.timeline[runState.timeline.length - 1];
        if (last && last.kind === "text") {
          last.text += event.text;
        } else {
          runState.timeline.push({ kind: "text", text: event.text });
        }
        if (isActiveRun) void nextTick(() => scrollMessages({ behavior: "auto" }));
      } else if (event.type === "stderr") {
        pushRunActivity(chatId, event.text);
        if (isActiveRun) void nextTick(() => scrollMessages({ behavior: "smooth" }));
      }
    });
    permissionUnsubscribe = window.studio.onMimoPermission((event) => {
      const chatId = event.chatId || activeChat.value?.id || "";
      const runState = chatId ? runStates.value[chatId] : null;
      if (chatId && runState?.isRunning) {
        const exists = runState.pendingPermissions.some((p) => p.type === event.type && p.target === event.target);
        if (!exists) runState.pendingPermissions.push(event);
        pushRunActivity(chatId, `${translate("permRequested")}: ${event.type}`);
        void nextTick(() => scrollMessages({ behavior: "smooth" }));
      }
    });
    terminalExitUnsubscribe = window.studio.onTerminalExit(handleTerminalExit);
    if (typeof window.studio.onMimoInterrupted === "function") {
      interruptedUnsubscribe = window.studio.onMimoInterrupted((event) => {
        const runState = ensureRunState(event.chatId);
        runState.interruptedRun = event;
        if (activeChat.value?.id === event.chatId) void nextTick(() => scrollMessages({ behavior: "smooth" }));
      });
    }
    checkConnection();
    disconnectTimer = setInterval(checkConnection, 15000);
  }

  function destroy() {
    outputUnsubscribe?.();
    permissionUnsubscribe?.();
    terminalExitUnsubscribe?.();
    interruptedUnsubscribe?.();
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
  watch(terminalScopeKey, () => {
    if (showTerminal.value) ensureTerminal();
  });
  watch(() => activeChat.value?.folder, () => void loadProjectFiles());
  watch(activeDraft, updateFilePickerFromDraft);
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
    terminalFloating,
    showAgentMenu,
    showModelMenu,
    deleteConfirmId,
    streamingText,
    runActivities,
    runTimeline,
    pendingPermissions,
    projectFiles,
    filePickerOpen,
    filePickerQuery,
    selectedContextFiles,
    fileSuggestions,
    droppedFiles,
    draftAttachments,
    editingMsgId,
    editingText,
    editingChatId,
    editingChatTitle,
    isDisconnected,
    interruptedRun,
    messagesEl,
    showScrollToBottom,
    activeChat,
    activeTitle,
    currentModel,
    activeTerminal,
    runningTerminals,
    hasRunningTerminal,
    isAgentCommandActive,
    projectRoot,
    activeDraft,
    draftDir,
    messageQueue,
    canRun,
    chatSizeInfo,
    projectGroups,
    chatRunStatus,
    lineDir,
    relativeTime,
    updateScrollState,
    scrollToBottom,
    createTerminal,
    openTerminalPanel,
    toggleTerminalFloating,
    selectTerminal,
    closeTerminal,
    stopTerminalCommand,
    openExternalTerminal,
    startNewChat,
    selectChat,
    deleteChat,
    pickFolder,
    runPrompt,
    editQueued,
    deleteQueued,
    stopRun,
    dismissInterrupted,
    resumeInterruptedRun,
    queueDraft,
    approvePermission,
    denyPermission,
    updateFilePickerFromDraft,
    insertContextFile,
    removeContextFile,
    attachMentionFile,
    attachFile,
    addDraftAttachment,
    removeAttachment,
    startEdit,
    cancelEdit,
    saveEdit,
    startEditChat,
    cancelEditChat,
    saveEditChat,
    revertTo,
    copyMessage,
    openProjectFolder,
    exportCurrentChat,
    importSession,
    forkCurrentChat,
    selectAgent,
    selectModel,
    handleComposerKeydown,
    hydrate,
    destroy
  };
});

function extractMentionedFiles(text: string, files: ProjectFile[]) {
  const byPath = new Set(files.map((file) => file.path));
  const byName = new Map(files.map((file) => [file.name, file.path]));
  const matches = text.match(/@([^\s`"'<>]+)/g) || [];
  return Array.from(new Set(matches.map((match) => {
    const value = match.slice(1);
    if (byPath.has(value)) return value;
    return byName.get(value) || "";
  }).filter(Boolean)));
}

function fileNameFromPath(path: string) {
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

function pathExt(path: string) {
  const name = fileNameFromPath(path);
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index + 1).toLowerCase() : "";
}

function isCodeLikePath(path: string) {
  const name = fileNameFromPath(path);
  return codeLikeExts.has(pathExt(path)) || codeLikeNames.has(name);
}

function isImageLikePath(path: string) {
  return imageLikeExts.has(pathExt(path));
}

function isAbsolutePath(path: string) {
  return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("/") || path.startsWith("\\");
}

function fuzzyFiles(files: ProjectFile[], query: string) {
  return [...files]
    .map((file) => ({ file, score: fuzzyScore(file.path.toLowerCase(), query) }))
    .filter((item) => item.score > -1)
    .sort((a, b) => b.score - a.score || a.file.path.length - b.file.path.length)
    .map((item) => item.file);
}

function fuzzyScore(value: string, query: string) {
  if (value.includes(query)) return 1000 - value.indexOf(query) - value.length * 0.01;
  let score = 0;
  let cursor = 0;
  for (const char of query) {
    const found = value.indexOf(char, cursor);
    if (found < 0) return -1;
    score += found === cursor ? 8 : 2;
    cursor = found + 1;
  }
  return score - value.length * 0.01;
}

function formatRunActivities(activities: { text: string; detail: string; code?: string; codeLang?: string; oldCode?: string; newCode?: string; editFilePath?: string }[], elapsedMs: number) {
  const useful = activities
    .map((activity) => ({
      ...activity,
      text: activity.text.trim(),
      detail: activity.detail.trim()
    }))
    .filter((activity) => activity.text || activity.detail || activity.code || activity.oldCode || activity.newCode);
  if (!useful.length) return "";

  const lines = [
    `<details class="activity-log-summary">`,
    `<summary><span>${escapeHtml(formatWorkedDuration(elapsedMs))}</span><span class="activity-log-count">${useful.length} step${useful.length === 1 ? "" : "s"}</span></summary>`,
    `<div class="activity-log-list">`
  ];
  for (const [index, activity] of useful.entries()) {
    lines.push(`<section class="activity-log-item">`);
    lines.push(`<div class="activity-log-item-head"><span class="activity-log-index">${index + 1}</span><span class="activity-log-title">${escapeHtml(activity.text)}</span></div>`);
    if (activity.detail) lines.push(formatActivityDetail(activity.detail));
    if (activity.editFilePath) lines.push(`<div class="activity-log-file">File: <code>${escapeHtml(activity.editFilePath)}</code></div>`);
    if (activity.code) {
      lines.push(`<pre class="activity-log-code" dir="ltr"><code class="language-${escapeHtml(activity.codeLang || "text")}">${escapeHtml(truncateActivityCode(activity.code))}</code></pre>`);
    }
    if (activity.oldCode || activity.newCode) {
      const diffLines: string[] = [];
      if (activity.oldCode) {
        diffLines.push(...truncateActivityCode(activity.oldCode).split("\n").map((line) => `-${line}`));
      }
      if (activity.newCode) {
        diffLines.push(...truncateActivityCode(activity.newCode).split("\n").map((line) => `+${line}`));
      }
      lines.push(`<pre class="activity-log-code diff" dir="ltr"><code>${escapeHtml(diffLines.join("\n"))}</code></pre>`);
    }
    lines.push(`</section>`);
  }
  lines.push(`</div>`);
  lines.push("</details>");
  return lines.join("\n").trim();
}

function formatWorkedDuration(elapsedMs: number) {
  const seconds = Math.max(1, Math.round(elapsedMs / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes <= 0) return `Worked for ${rest}s`;
  return `Worked for ${minutes}m ${rest}s`;
}

function truncateActivityCode(code: string, maxLines = 40) {
  const lines = code.split("\n");
  if (lines.length <= maxLines) return code;
  return `${lines.slice(0, maxLines).join("\n")}\n... (${lines.length - maxLines} more lines)`;
}

function formatActivityDetail(detail: string) {
  const lines = detail.split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean);
  const fileLines = lines.filter((line) => /^[-*]\s+/.test(line) || /^[A-Za-z]:[\\/]/.test(line) || line.includes("/") || line.includes("\\"));
  if (fileLines.length >= 2 && lines.some((line) => /^Files?:/i.test(line))) {
    const files = fileLines.map((line) => line.replace(/^[-*]\s+/, ""));
    return `<div class="activity-log-files">${files.map((file) => `<code>${escapeHtml(file)}</code>`).join("")}</div>`;
  }
  return `<pre class="activity-log-detail">${escapeHtml(detail)}</pre>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
