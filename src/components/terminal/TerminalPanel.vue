<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Maximize2, PanelRightClose, PanelTopOpen, Plus, Square, Trash2, X } from "@lucide/vue";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useI18n } from "vue-i18n";
import { useStudioStore } from "../../stores/studio";

type TerminalRuntime = {
  terminal: Terminal;
  fit: FitAddon;
  host: HTMLElement;
};

const studio = useStudioStore();
const { t } = useI18n();
const hosts = ref<Record<string, HTMLElement | null>>({});
const runtimes = new Map<string, TerminalRuntime>();
let dataUnsubscribe: (() => void) | undefined;
let resizeObserver: ResizeObserver | undefined;

function terminalTheme() {
  return {
    background: "#0c0c0c",
    foreground: "#cccccc",
    cursor: "#ffffff",
    cursorAccent: "#0c0c0c",
    selectionBackground: "#264f78",
    selectionForeground: "#ffffff",
    black: "#0c0c0c",
    red: "#c50f1f",
    green: "#13a10e",
    yellow: "#c19c00",
    blue: "#0037da",
    magenta: "#881798",
    cyan: "#3a96dd",
    white: "#cccccc",
    brightBlack: "#767676",
    brightRed: "#e74856",
    brightGreen: "#16c60c",
    brightYellow: "#f9f1a5",
    brightBlue: "#3b78ff",
    brightMagenta: "#b4009e",
    brightCyan: "#61d6d6",
    brightWhite: "#f2f2f2"
  };
}

function fitRuntime(runtime: TerminalRuntime, terminalId: string) {
  try {
    if (!runtime.host.offsetWidth || !runtime.host.offsetHeight) return;
    runtime.fit.fit();
    void window.studio.resizeTerminal({
      terminalId,
      cols: runtime.terminal.cols,
      rows: runtime.terminal.rows
    });
  } catch {}
}

function scheduleFit(terminalId = studio.activeTerminalId) {
  const runtime = terminalId ? runtimes.get(terminalId) : null;
  if (!runtime) return;
  requestAnimationFrame(() => {
    fitRuntime(runtime, terminalId);
    requestAnimationFrame(() => fitRuntime(runtime, terminalId));
  });
}

function activateTerminal(terminalId: string) {
  studio.selectTerminal(terminalId);
  void nextTick(() => {
    const runtime = runtimes.get(terminalId);
    if (!runtime) return;
    scheduleFit(terminalId);
    runtime.terminal.focus();
  });
}

function mountRuntime(terminalId: string) {
  if (runtimes.has(terminalId)) return;
  const host = hosts.value[terminalId];
  if (!host) return;

  const terminal = new Terminal({
    allowProposedApi: true,
    convertEol: true,
    cursorBlink: true,
    cursorStyle: "block",
    fontFamily: '"Cascadia Mono", "Cascadia Code", Consolas, "SFMono-Regular", Menlo, monospace',
    fontSize: 13,
    lineHeight: 1.22,
    scrollback: 8000,
    tabStopWidth: 4,
    theme: terminalTheme(),
    drawBoldTextInBrightColors: true,
    allowTransparency: false
  });
  const fit = new FitAddon();
  terminal.loadAddon(fit);
  terminal.open(host);
  try {
    const webgl = new WebglAddon();
    webgl.onContextLoss(() => { webgl.dispose(); });
    terminal.loadAddon(webgl);
  } catch {}
  terminal.onData((data) => {
    void window.studio.writeTerminalInput({ terminalId, data });
  });
  terminal.attachCustomKeyEventHandler((event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "l" && event.type === "keydown") {
      terminal.clear();
      return false;
    }
    return true;
  });
  const runtime = { terminal, fit, host };
  runtimes.set(terminalId, runtime);
  resizeObserver?.observe(host);
  scheduleFit(terminalId);
  if (studio.activeTerminalId === terminalId) terminal.focus();
}

function syncRuntimes() {
  for (const session of studio.terminalSessions) mountRuntime(session.id);
  for (const [terminalId, runtime] of runtimes.entries()) {
    if (!studio.terminalSessions.some((session) => session.id === terminalId)) {
      runtime.terminal.dispose();
      runtimes.delete(terminalId);
    }
  }
}

function clearActiveTerminal() {
  const runtime = studio.activeTerminalId ? runtimes.get(studio.activeTerminalId) : null;
  runtime?.terminal.clear();
  runtime?.terminal.focus();
}

function fitActiveTerminal() {
  const terminalId = studio.activeTerminalId;
  const runtime = terminalId ? runtimes.get(terminalId) : null;
  if (!runtime) return;
  scheduleFit(terminalId);
  runtime.terminal.focus();
}

function toggleFloating() {
  studio.toggleTerminalFloating();
  void nextTick(() => fitActiveTerminal());
}

watch(
  () => studio.terminalSessions.map((terminal) => terminal.id).join(","),
  () => void nextTick(syncRuntimes)
);

watch(
  () => studio.activeTerminalId,
  (terminalId) => {
    if (!terminalId) return;
    void nextTick(() => activateTerminal(terminalId));
  }
);

watch(
  () => studio.terminalFloating,
  () => void nextTick(fitActiveTerminal)
);

onMounted(() => {
  dataUnsubscribe = window.studio.onTerminalData((event) => {
    runtimes.get(event.terminalId)?.terminal.write(event.data);
  });
  resizeObserver = new ResizeObserver(() => fitActiveTerminal());
  void nextTick(() => {
    syncRuntimes();
    for (const runtime of runtimes.values()) resizeObserver?.observe(runtime.host);
  });
});

onBeforeUnmount(() => {
  dataUnsubscribe?.();
  resizeObserver?.disconnect();
  for (const runtime of runtimes.values()) runtime.terminal.dispose();
  runtimes.clear();
});
</script>

<template>
  <aside class="terminal-panel" :class="{ floating: studio.terminalFloating }">
    <div class="term-header">
      <div class="term-tabs">
        <div
          v-for="terminal in studio.terminalSessions"
          :key="terminal.id"
          class="term-tab"
          :class="{ active: terminal.id === studio.activeTerminalId, running: terminal.running }"
        >
          <button class="term-tab-main" type="button" @click="activateTerminal(terminal.id)">
            <span class="term-tab-dot"></span>
            <span>{{ terminal.title }}</span>
          </button>
          <button class="term-tab-close" type="button" :title="t('closeTerminal')" @click="studio.closeTerminal(terminal.id)">
            <X :size="11" />
          </button>
        </div>
      </div>
      <button class="term-icon-btn" type="button" :title="t('newTerminal')" @click="studio.createTerminal">
        <Plus :size="14" />
      </button>
      <button class="term-icon-btn" type="button" :title="studio.terminalFloating ? 'Dock terminal' : 'Float terminal'" @click="toggleFloating">
        <PanelRightClose v-if="studio.terminalFloating" :size="13" />
        <PanelTopOpen v-else :size="13" />
      </button>
      <button class="term-icon-btn" type="button" title="Fit" @click="fitActiveTerminal">
        <Maximize2 :size="13" />
      </button>
      <button class="term-icon-btn" type="button" :title="t('clearTerminal')" @click="clearActiveTerminal">
        <Trash2 :size="13" />
      </button>
      <button class="term-icon-btn" type="button" :title="t('stopCommand')" @click="studio.stopTerminalCommand()">
        <Square :size="13" />
      </button>
      <button class="term-icon-btn" type="button" @click="studio.showTerminal = false">
        <X :size="14" />
      </button>
    </div>

    <div class="term-workspace">
      <div
        v-for="terminal in studio.terminalSessions"
        :key="terminal.id"
        :ref="(el) => { hosts[terminal.id] = el as HTMLElement | null; }"
        class="xterm-host"
        :class="{ active: terminal.id === studio.activeTerminalId }"
        @click="activateTerminal(terminal.id)"
      ></div>
      <div v-if="!studio.terminalSessions.length" class="term-empty">{{ t("terminalEmpty") }}</div>
    </div>
  </aside>
</template>
