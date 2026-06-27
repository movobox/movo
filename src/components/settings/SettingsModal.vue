<script setup lang="ts">
import { computed, ref } from "vue";
import { Bot, Code2, KeyRound, Network, ShieldCheck, SlidersHorizontal, Trash2 } from "@lucide/vue";
import { useI18n } from "vue-i18n";
import { defaultSettings, withDefaultPinooxMcp } from "../../constants/settings";
import { useLanguageStore } from "../../stores/language";
import { useStudioStore } from "../../stores/studio";

const studio = useStudioStore();
const language = useLanguageStore();
const { t } = useI18n();
const agentOptions = [
  { value: "build", label: "Agent", description: "General coding and project work." },
  { value: "ask", label: "Ask", description: "Answer questions and inspect context without editing." },
  { value: "debugger", label: "Debug", description: "Trace errors, logs, failing tests, and runtime issues." },
  { value: "plan", label: "Plan", description: "Create an implementation plan before changing files." },
  { value: "compose", label: "Compose", description: "Draft text, docs, prompts, and structured content." },
  { value: "pinoox", label: "Pinoox", description: "Auto-select the right Pinoox workflow and role." }
];
const selectedAgentDescription = computed(() => agentOptions.find((option) => option.value === studio.appSettings.agent)?.description || "");

const activeSection = ref("general");
const sections = computed(() => [
  { id: "general", label: t("settingsGeneral"), icon: SlidersHorizontal },
  { id: "model", label: t("settingsModel"), icon: Bot },
  { id: "permissions", label: t("settingsPermissions"), icon: ShieldCheck },
  { id: "context", label: t("settingsContext"), icon: Code2 },
  { id: "network", label: t("settingsNetwork"), icon: Network },
  { id: "advanced", label: t("settingsAdvanced"), icon: KeyRound }
]);

function restorePinooxMcpDefaults() {
  studio.appSettings.mcpServersJson = withDefaultPinooxMcp(defaultSettings.mcpServersJson);
}

function setLanguageFromSelect(event: Event) {
  const value = (event.target as HTMLSelectElement).value;
  if (value === "en" || value === "fa") language.setLanguage(value);
}
</script>

<template>
  <Teleport to="body">
    <div v-if="studio.showSettings" class="modal-backdrop" @click="studio.showSettings = false">
      <div class="settings-card settings-card-wide" @click.stop>
        <div class="settings-head">
          <h2>{{ t("settings") }}</h2>
          <button type="button" @click="studio.showSettings = false">{{ t("close") }}</button>
        </div>

        <div class="settings-layout">
          <nav class="settings-menu">
            <button
              v-for="section in sections"
              :key="section.id"
              type="button"
              :class="{ active: activeSection === section.id }"
              @click="activeSection = section.id"
            >
              <component :is="section.icon" :size="15" />
              <span>{{ section.label }}</span>
            </button>
          </nav>

          <div class="settings-body settings-panel">
            <section v-if="activeSection === 'general'" class="settings-section">
              <label class="field">
                <span>{{ t("language") }}</span>
                <select :value="language.locale" @change="setLanguageFromSelect">
                  <option value="en">{{ t("english") }}</option>
                  <option value="fa">{{ t("persian") }}</option>
                </select>
              </label>

              <label class="field">
                <span>{{ t("theme") }}</span>
                <select v-model="studio.appSettings.theme">
                  <option value="dark">Dark</option>
                  <option value="movo">Movo</option>
                </select>
              </label>

              <div class="toggles">
                <label class="toggle-row">
                  <input v-model="studio.appSettings.trustWorkspace" type="checkbox" />
                  <span>{{ t("trust") }}</span>
                </label>
                <label class="toggle-row">
                  <input v-model="studio.appSettings.watcher.enabled" type="checkbox" />
                  <span>{{ t("watcher") }}<small>{{ t("watcherHint") }}</small></span>
                </label>
              </div>
            </section>

            <section v-else-if="activeSection === 'model'" class="settings-section">
              <label class="field">
                <span>{{ t("model") }}</span>
                <input v-model="studio.appSettings.model" type="text" :placeholder="t('modelHint')" />
              </label>
              <label class="field">
                <span>{{ t("provider") }}</span>
                <input v-model="studio.appSettings.provider" type="text" :placeholder="t('providerHint')" />
              </label>
              <label class="field">
                <span>{{ t("agent") }}</span>
                <select v-model="studio.appSettings.agent">
                  <option v-for="option in agentOptions" :key="option.value" :value="option.value" :title="option.description">
                    {{ option.label }}
                  </option>
                </select>
                <small>{{ selectedAgentDescription }}</small>
              </label>
              <label class="field">
                <span>{{ t("providerOptions") }}</span>
                <textarea v-model="studio.appSettings.providerJson" rows="7" spellcheck="false" />
              </label>
            </section>

            <section v-else-if="activeSection === 'permissions'" class="settings-section">
              <div class="toggles">
                <label class="toggle-row">
                  <input v-model="studio.appSettings.skipPermissions" type="checkbox" />
                  <span>{{ t("skipPermissions") }}<small>{{ t("skipWarning") }}</small></span>
                </label>
              </div>
              <div class="settings-grid">
                <label class="field">
                  <span>Edit</span>
                  <select v-model="studio.appSettings.permissions.edit">
                    <option value="ask">Ask</option>
                    <option value="allow">Allow</option>
                    <option value="deny">Deny</option>
                  </select>
                </label>
                <label class="field">
                  <span>Bash</span>
                  <select v-model="studio.appSettings.permissions.bash">
                    <option value="ask">Ask</option>
                    <option value="allow">Allow</option>
                    <option value="deny">Deny</option>
                  </select>
                </label>
                <label class="field">
                  <span>Web fetch</span>
                  <select v-model="studio.appSettings.permissions.webfetch">
                    <option value="ask">Ask</option>
                    <option value="allow">Allow</option>
                    <option value="deny">Deny</option>
                  </select>
                </label>
                <label class="field">
                  <span>Web search</span>
                  <select v-model="studio.appSettings.permissions.websearch">
                    <option value="ask">Ask</option>
                    <option value="allow">Allow</option>
                    <option value="deny">Deny</option>
                  </select>
                </label>
              </div>
            </section>

            <section v-else-if="activeSection === 'context'" class="settings-section">
              <div class="toggles">
                <label class="toggle-row">
                  <input v-model="studio.appSettings.checkpoint.enabled" type="checkbox" />
                  <span>Checkpoint</span>
                </label>
                <label class="toggle-row">
                  <input v-model="studio.appSettings.memory.enabled" type="checkbox" />
                  <span>Memory</span>
                </label>
                <label class="toggle-row">
                  <input v-model="studio.appSettings.compaction.auto" type="checkbox" />
                  <span>{{ t("autoCompact") }}<small>{{ t("autoCompactHint") }}</small></span>
                </label>
                <label class="toggle-row">
                  <input v-model="studio.appSettings.compaction.prune" type="checkbox" />
                  <span>{{ t("pruneContext") }}</span>
                </label>
              </div>
              <label class="field">
                <span>{{ t("reservedTokens") }}</span>
                <input v-model.number="studio.appSettings.compaction.reserved" type="number" min="0" step="1000" />
              </label>
              <label class="field">
                <span>{{ t("instructions") }}</span>
                <textarea v-model="studio.appSettings.instructionsJson" rows="6" spellcheck="false" />
              </label>
            </section>

            <section v-else-if="activeSection === 'network'" class="settings-section">
              <label class="field">
                <span>Share</span>
                <select v-model="studio.appSettings.share">
                  <option value="manual">Manual</option>
                  <option value="auto">Auto</option>
                  <option value="disabled">Disabled</option>
                </select>
              </label>
              <label class="field">
                <span>Autoupdate</span>
                <select v-model="studio.appSettings.autoupdate">
                  <option :value="true">Auto</option>
                  <option value="notify">Notify only</option>
                  <option :value="false">Disabled</option>
                </select>
              </label>
              <label class="field">
                <span>Server</span>
                <textarea v-model="studio.appSettings.serverJson" rows="6" spellcheck="false" />
              </label>
            </section>

            <section v-else class="settings-section">
              <label class="field">
                <span>Project config directory</span>
                <input v-model="studio.appSettings.projectConfigDir" type="text" placeholder=".movo" spellcheck="false" />
                <small>Default is <code>.movo</code>. Movo writes <code>movo.json</code> there and uses that file for project configuration.</small>
              </label>
              <label class="field">
                <span>MCP overrides</span>
                <textarea v-model="studio.appSettings.mcpServersJson" rows="6" spellcheck="false" />
                <small>Internal defaults are hidden and merged automatically. Add only custom MCP servers here.</small>
              </label>
              <label class="field">
                <span>Agent overrides</span>
                <textarea v-model="studio.appSettings.agentsJson" rows="6" spellcheck="false" />
              </label>
              <label class="field">
                <span>Command overrides</span>
                <textarea v-model="studio.appSettings.commandsJson" rows="8" spellcheck="false" />
              </label>
              <label class="field">
                <span>Skill overrides</span>
                <textarea v-model="studio.appSettings.skillsJson" rows="5" spellcheck="false" />
              </label>
              <label class="field">
                <span>Tool config overrides</span>
                <textarea v-model="studio.appSettings.toolJson" rows="4" spellcheck="false" />
              </label>
              <label class="field">
                <span>LSP</span>
                <textarea v-model="studio.appSettings.lspJson" rows="4" spellcheck="false" />
              </label>
              <label class="field">
                <span>Formatter</span>
                <textarea v-model="studio.appSettings.formatterJson" rows="4" spellcheck="false" />
              </label>
              <div class="support-card">
                <strong>Pinoox MCP</strong>
                <span>Enabled by default via <code>npx -y pinoox-mcp</code>. Movo also adds general Context7/Grep MCP defaults for docs and code examples.</span>
                <button type="button" class="secondary-btn" @click="restorePinooxMcpDefaults">Restore Pinoox MCP</button>
              </div>
              <label class="field">
                <span>Keybinds</span>
                <textarea v-model="studio.appSettings.keybindingsJson" rows="6" spellcheck="false" />
              </label>
              <div class="settings-footer">
                <button class="danger-btn" type="button" :disabled="!studio.activeChat" @click="studio.activeChat && studio.deleteChat(studio.activeChat.id)">
                  <Trash2 :size="14" /> {{ t("deleteChat") }}
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
