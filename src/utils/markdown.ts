import DOMPurify from "dompurify";
import MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";
import { lineDir } from "./chat";
import { highlightCode } from "./highlight";

const md = new MarkdownIt({
  breaks: true,
  linkify: true,
  typographer: true,
  html: true
});

type CalloutKind = "note" | "tip" | "warning" | "danger" | "info";

function colorizeDiff(content: string): string {
  return content.split("\n").map((line) => {
    if (line.startsWith("+") && !line.startsWith("+++")) return `<span class="diff-add">${md.utils.escapeHtml(line)}</span>`;
    if (line.startsWith("-") && !line.startsWith("---")) return `<span class="diff-del">${md.utils.escapeHtml(line)}</span>`;
    if (line.startsWith("@@")) return `<span class="diff-hunk">${md.utils.escapeHtml(line)}</span>`;
    return md.utils.escapeHtml(line);
  }).join("\n");
}

function copyBtn(): string {
  return `<button class="md-copy-btn" data-md-copy-code="true" type="button">Copy</button>`;
}

function linkFileMentions(source: string) {
  const parts = source.split(/(```[\s\S]*?```)/g);
  return parts.map((part) => {
    if (part.startsWith("```")) return part;
    return part.replace(/(^|[\s([{:])(@?(?:[A-Za-z]:[\\/]|\.{1,2}[\\/]|[A-Za-z0-9_.-]+[\\/])[\w\s./\\@()[\]-]+\.\w{1,12})/g, (match, prefix, filePath) => {
    const cleanPath = String(filePath).replace(/[),.;:!?]+$/, "");
    const suffix = String(filePath).slice(cleanPath.length);
    return `${prefix}<button class="md-file-link" type="button" data-file-path="${md.utils.escapeHtml(cleanPath)}">${md.utils.escapeHtml(cleanPath)}</button>${suffix}`;
    });
  }).join("");
}

function normalizeAdvancedMarkdown(source: string) {
  const parts = source.split(/(```[\s\S]*?```)/g);
  return parts.map((part) => {
    if (part.startsWith("```")) return part;
    return part
      .replace(/(^|\n)([ \t]*)(?:\*\s*){3,}(?=\s*(?:\n|$))/g, "$1$2***")
      .replace(/(^|\n)([ \t]*)([-+*])\s+\[( |x|X)\]\s+/g, "$1$2$3 [$4] ")
      .replace(/\*\*[ \t]+([^*\n][^*\n]*?)[ \t]*\*\*/g, "**$1**")
      .replace(/\*\*[ \t]*([^*\n][^*\n]*?)[ \t]+\*\*/g, "**$1**")
      .replace(/__[ \t]+([^_\n][^_\n]*?)[ \t]*__/g, "__$1__")
      .replace(/__[ \t]*([^_\n][^_\n]*?)[ \t]+__/g, "__$1__")
      .replace(/(^|[^*])\*[ \t]+([^*\n][^*\n]*?)[ \t]*\*(?!\*)/g, "$1*$2*")
      .replace(/(^|[^*])\*[ \t]*([^*\n][^*\n]*?)[ \t]+\*(?!\*)/g, "$1*$2*")
      .replace(/(^|[^_])_[ \t]+([^_\n][^_\n]*?)[ \t]*_(?!_)/g, "$1_$2_")
      .replace(/(^|[^_])_[ \t]*([^_\n][^_\n]*?)[ \t]+_(?!_)/g, "$1_$2_")
      .replace(/~~[ \t]+([^~\n][^~\n]*?)[ \t]*~~/g, "~~$1~~")
      .replace(/~~[ \t]*([^~\n][^~\n]*?)[ \t]+~~/g, "~~$1~~");
  }).join("");
}

const defaultFence = md.renderer.rules.fence?.bind(md.renderer.rules);
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const language = token.info.trim().split(/\s+/)[0];
  const isDiff = language === "diff";
  if (isDiff) {
    const colored = colorizeDiff(token.content);
    return `<div class="md-codeblock" dir="ltr"><div class="md-code-lang" dir="ltr">diff</div><div class="md-diff-wrap" dir="ltr"><pre><code class="language-diff">${colored}</code></pre></div></div>`;
  }
  if (language) {
    const highlighted = highlightCode(token.content, language);
    return `<div class="md-codeblock" dir="ltr"><div class="md-code-lang" dir="ltr">${md.utils.escapeHtml(language)}${copyBtn()}</div><pre><code class="language-${md.utils.escapeHtml(language)}">${highlighted}</code></pre></div>`;
  }
  const rendered = defaultFence ? defaultFence(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
  return `<div class="md-codeblock" dir="ltr">${rendered}</div>`;
};

const defaultTableOpen = md.renderer.rules.table_open || ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.table_open = (tokens, idx, options, env, self) => {
  tokens[idx].attrJoin("class", "md-table");
  return `<div class="md-table-wrap">${defaultTableOpen(tokens, idx, options, env, self)}`;
};

const defaultTableClose = md.renderer.rules.table_close || ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.table_close = (tokens, idx, options, env, self) => {
  return `${defaultTableClose(tokens, idx, options, env, self)}</div>`;
};

const defaultHr = md.renderer.rules.hr || ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.hr = (tokens, idx, options, env, self) => {
  tokens[idx].attrJoin("class", "md-divider");
  return defaultHr(tokens, idx, options, env, self);
};

const defaultLinkOpen = md.renderer.rules.link_open || ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  token.attrSet("target", "_blank");
  token.attrSet("rel", "noreferrer noopener");
  return defaultLinkOpen(tokens, idx, options, env, self);
};

function plainInlineText(token?: Token) {
  if (!token?.children) return "";
  return token.children
    .filter((child) => child.type === "text" || child.type === "code_inline")
    .map((child) => child.content)
    .join(" ");
}

function setDirFromNextInline(tokens: Token[], idx: number) {
  const inline = tokens[idx + 1]?.type === "inline" ? tokens[idx + 1] : undefined;
  tokens[idx].attrSet("dir", lineDir(plainInlineText(inline)));
}

for (const rule of ["paragraph_open", "heading_open", "blockquote_open", "th_open", "td_open"] as const) {
  const fallback = md.renderer.rules[rule] || ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules[rule] = (tokens, idx, options, env, self) => {
    setDirFromNextInline(tokens, idx);
    return fallback(tokens, idx, options, env, self);
  };
}

const defaultListItemOpen = md.renderer.rules.list_item_open || ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.list_item_open = (tokens, idx, options, env, self) => {
  const inline = tokens.slice(idx + 1).find((token) => token.type === "inline");
  tokens[idx].attrSet("dir", lineDir(plainInlineText(inline)));
  return defaultListItemOpen(tokens, idx, options, env, self);
};

md.core.ruler.after("inline", "movo_advanced_blocks", (state) => {
  for (let i = 0; i < state.tokens.length; i++) {
    const token = state.tokens[i];

    if (token.type === "ordered_list_open") token.attrJoin("class", "md-workflow-list");
    if (token.type === "bullet_list_open") token.attrJoin("class", "md-bullet-list");

    if (token.type === "inline" && token.children?.length) {
      const first = token.children[0];
      const task = first?.type === "text" ? first.content.match(/^\[( |x|X)\]\s+/) : null;
      if (task) {
        first.content = first.content.slice(task[0].length);
        const li = state.tokens.slice(0, i).reverse().find((candidate) => candidate.type === "list_item_open");
        li?.attrJoin("class", `md-task-item ${task[1].toLowerCase() === "x" ? "done" : "todo"}`);
        const checkbox = new state.Token("html_inline", "", 0);
        checkbox.content = `<input class="md-task-check" type="checkbox" disabled${task[1].toLowerCase() === "x" ? " checked" : ""}>`;
        token.children.unshift(checkbox);
      }
    }

    if (token.type !== "blockquote_open") continue;
    const inline = state.tokens.slice(i + 1).find((candidate) => candidate.type === "inline");
    const marker = inline?.children?.[0];
    if (marker?.type !== "text") continue;
    const match = marker.content.match(/^\[!(NOTE|TIP|WARNING|DANGER|INFO)\]\s*/i);
    if (!match) continue;
    const kind = match[1].toLowerCase() as CalloutKind;
    marker.content = marker.content.slice(match[0].length);
    token.attrJoin("class", `md-callout ${kind}`);
  }
});

function ensureSentenceBreaks(text: string): string {
  return text.replace(/([.!؟!])\s*(?=[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF])/g, "$1\n\n");
}

export function renderMarkdown(source: string) {
  const cleaned = normalizeAdvancedMarkdown(ensureSentenceBreaks(source || ""));
  const html = md.render(linkFileMentions(cleaned));
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ["target", "rel", "dir", "class", "type", "data-file-path", "data-md-copy-code", "disabled", "checked"],
    ADD_TAGS: ["details", "summary", "span", "button", "div", "section", "pre", "code", "input"],
    USE_PROFILES: { html: true }
  });
}
