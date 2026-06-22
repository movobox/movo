import DOMPurify from "dompurify";
import MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";
import { lineDir } from "./chat";

const md = new MarkdownIt({
  breaks: true,
  linkify: true,
  typographer: true,
  html: false
});

const defaultFence = md.renderer.rules.fence?.bind(md.renderer.rules);
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const language = token.info.trim().split(/\s+/)[0];
  const rendered = defaultFence ? defaultFence(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
  return `<div class="md-codeblock">${language ? `<div class="md-code-lang">${md.utils.escapeHtml(language)}</div>` : ""}${rendered}</div>`;
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

for (const rule of ["paragraph_open", "heading_open", "blockquote_open"] as const) {
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

export function renderMarkdown(source: string) {
  const html = md.render(source || "");
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ["target", "rel", "dir"],
    USE_PROFILES: { html: true }
  });
}
