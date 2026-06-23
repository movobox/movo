const JS_KW = new Set(["const","let","var","function","return","if","else","for","while","do","switch","case","break","continue","new","delete","typeof","instanceof","in","of","class","extends","super","import","from","export","default","async","await","try","catch","finally","throw","yield","this","static","get","set","true","false","null","undefined","void","NaN","Infinity"]);
const PY_KW = new Set(["def","class","return","if","elif","else","for","while","break","continue","import","from","as","try","except","finally","raise","with","yield","lambda","pass","True","False","None","and","or","not","in","is","global","nonlocal","del","print","self"]);
const TS_KW = new Set(["const","let","var","function","return","if","else","for","while","do","switch","case","break","continue","new","delete","typeof","instanceof","in","of","class","extends","super","import","from","export","default","async","await","try","catch","finally","throw","yield","this","static","get","set","true","false","null","undefined","void","type","interface","enum","implements","abstract","readonly","private","protected","public","override","satisfies","keyof","infer"]);
const PHP_KW = new Set(["<?php","function","return","if","else","elseif","for","foreach","while","do","switch","case","break","continue","new","echo","class","extends","implements","public","private","protected","static","final","abstract","interface","trait","namespace","use","as","try","catch","finally","throw","array","true","false","null","isset","unset","empty","require","include","define","const","var","global"]);
const HTML_TAGS = new Set(["html","head","body","div","span","p","a","h1","h2","h3","h4","h5","h6","ul","ol","li","table","tr","td","th","thead","tbody","form","input","button","select","option","textarea","img","video","audio","source","canvas","script","style","link","meta","title","section","article","nav","header","footer","main","aside","figure","figcaption","pre","code","br","hr"]);
const CSS_KW = new Set(["color","background","margin","padding","border","display","position","width","height","font","text","align","justify","flex","grid","overflow","cursor","opacity","transition","animation","transform","box-shadow","z-index","top","left","right","bottom","float","clear"]);
const BASH_KW = new Set(["echo","cd","ls","mkdir","rm","cp","mv","cat","grep","sed","awk","find","chmod","chown","sudo","apt","npm","yarn","pip","git","docker","ssh","curl","wget","tar","zip","unzip","export","source","alias","if","then","else","fi","for","do","done","while","case","esac","function"]);
const JSON_SPECIAL = new Set(["true","false","null"]);

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function wrap(cls: string, text: string): string {
  return `<span class="hl-${cls}">${esc(text)}</span>`;
}

function highlightString(content: string, startIdx: number): { result: string; endIdx: number } {
  const q = content[startIdx];
  let i = startIdx + 1;
  while (i < content.length && content[i] !== q) {
    if (content[i] === "\\") i++;
    i++;
  }
  return { result: wrap("str", content.slice(startIdx, i + 1)), endIdx: i + 1 };
}

function highlightLineComment(content: string, startIdx: number): { result: string; endIdx: number } {
  const end = content.indexOf("\n", startIdx);
  const actualEnd = end === -1 ? content.length : end;
  return { result: wrap("cmt", content.slice(startIdx, actualEnd)), endIdx: actualEnd };
}

function highlightBlockComment(content: string, startIdx: number): { result: string; endIdx: number } {
  const end = content.indexOf("*/", startIdx + 2);
  const actualEnd = end === -1 ? content.length : end + 2;
  return { result: wrap("cmt", content.slice(startIdx, actualEnd)), endIdx: actualEnd };
}

function extractWord(content: string, idx: number): string {
  let end = idx;
  while (end < content.length && /[\w$]/.test(content[end])) end++;
  return content.slice(idx, end);
}

function highlightGeneric(content: string, keywords: Set<string>): string {
  let result = "";
  let i = 0;
  while (i < content.length) {
    const ch = content[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      const { result: s, endIdx } = highlightString(content, i);
      result += s;
      i = endIdx;
    } else if (ch === "/" && content[i + 1] === "/") {
      const { result: c, endIdx } = highlightLineComment(content, i);
      result += c;
      i = endIdx;
    } else if (ch === "/" && content[i + 1] === "*") {
      const { result: c, endIdx } = highlightBlockComment(content, i);
      result += c;
      i = endIdx;
    } else if (ch === "#" && i === 0 || (ch === "#" && content[i - 1] === "\n")) {
      const { result: c, endIdx } = highlightLineComment(content, i);
      result += c;
      i = endIdx;
    } else if (/\d/.test(ch)) {
      let end = i;
      while (end < content.length && /[\d.xXeEabcdefABCDEF_]/.test(content[end])) end++;
      result += wrap("num", content.slice(i, end));
      i = end;
    } else if (/[a-zA-Z_$]/.test(ch)) {
      const word = extractWord(content, i);
      if (keywords.has(word)) {
        result += wrap("kw", word);
      } else if (content[i + word.length] === "(") {
        result += wrap("fn", word);
      } else {
        result += esc(word);
      }
      i += word.length;
    } else {
      result += esc(ch);
      i++;
    }
  }
  return result;
}

function highlightHtml(content: string): string {
  let result = "";
  let i = 0;
  while (i < content.length) {
    if (content[i] === "<" && content[i + 1] === "!" && content[i + 2] === "-" && content[i + 3] === "-") {
      const end = content.indexOf("-->", i + 4);
      const actualEnd = end === -1 ? content.length : end + 3;
      result += wrap("cmt", content.slice(i, actualEnd));
      i = actualEnd;
    } else if (content[i] === "<" && (/[a-zA-Z\/!]/.test(content[i + 1] || ""))) {
      let j = i + 1;
      if (content[j] === "/") j++;
      const tagStart = j;
      while (j < content.length && /[\w-]/.test(content[j])) j++;
      const tag = content.slice(tagStart, j);
      result += "&lt;";
      if (tagStart > i + 1) result += "/";
      if (HTML_TAGS.has(tag)) {
        result += wrap("tag", tag);
      } else {
        result += esc(tag);
      }
      i = j;
      while (i < content.length && content[i] !== ">") {
        if (content[i] === '"' || content[i] === "'") {
          const { result: s, endIdx } = highlightString(content, i);
          result += s;
          i = endIdx;
        } else if (content[i] === "=") {
          result += esc("=");
          i++;
        } else if (content[i] === "-" && content[i + 1] === "-") {
          const { result: c, endIdx } = highlightLineComment(content, i);
          result += c;
          i = endIdx;
        } else {
          result += esc(content[i]);
          i++;
        }
      }
      if (i < content.length && content[i] === ">") {
        result += "&gt;";
        i++;
      }
    } else if (content[i] === "<" && content[i + 1] === "?") {
      const phpStart = content.indexOf("?>", i + 2);
      const actualEnd = phpStart === -1 ? content.length : phpStart + 2;
      result += highlightGeneric(content.slice(i, actualEnd), PHP_KW);
      i = actualEnd;
    } else {
      result += esc(content[i]);
      i++;
    }
  }
  return result;
}

function highlightCss(content: string): string {
  let result = "";
  let i = 0;
  while (i < content.length) {
    if (content[i] === "/" && content[i + 1] === "*") {
      const { result: c, endIdx } = highlightBlockComment(content, i);
      result += c;
      i = endIdx;
    } else if (content[i] === '"' || content[i] === "'") {
      const { result: s, endIdx } = highlightString(content, i);
      result += s;
      i = endIdx;
    } else if (content[i] === "#" && /[0-9a-fA-F]/.test(content[i + 1] || "")) {
      let end = i + 1;
      while (end < content.length && /[0-9a-fA-F]/.test(content[end])) end++;
      result += wrap("num", content.slice(i, end));
      i = end;
    } else if (/\d/.test(content[i])) {
      let end = i;
      while (end < content.length && /[\d.%pxremvwems]/.test(content[end])) end++;
      result += wrap("num", content.slice(i, end));
      i = end;
    } else if (content[i] === "." && /[a-zA-Z_-]/.test(content[i + 1] || "")) {
      let end = i + 1;
      while (end < content.length && /[\w-]/.test(content[end])) end++;
      result += wrap("fn", content.slice(i, end));
      i = end;
    } else if (content[i] === "@") {
      let end = i + 1;
      while (end < content.length && /[\w-]/.test(content[end])) end++;
      result += wrap("kw", content.slice(i, end));
      i = end;
    } else if (/[a-zA-Z_-]/.test(content[i])) {
      let end = i;
      while (end < content.length && /[\w-]/.test(content[end])) end++;
      const word = content.slice(i, end);
      if (CSS_KW.has(word)) {
        result += wrap("prop", word);
      } else {
        result += esc(word);
      }
      i = end;
    } else {
      result += esc(content[i]);
      i++;
    }
  }
  return result;
}

const LANG_MAP: Record<string, Set<string>> = {
  javascript: JS_KW, js: JS_KW, jsx: JS_KW,
  typescript: TS_KW, ts: TS_KW, tsx: TS_KW,
  python: PY_KW, py: PY_KW,
  php: PHP_KW,
  bash: BASH_KW, sh: BASH_KW, shell: BASH_KW, zsh: BASH_KW,
  json: JSON_SPECIAL
};

export function highlightCode(code: string, lang: string): string {
  const l = lang.toLowerCase().trim();
  if (l === "html" || l === "htm" || l === "vue" || l === "svelte") return highlightHtml(code);
  if (l === "css" || l === "scss" || l === "sass" || l === "less") return highlightCss(code);
  const keywords = LANG_MAP[l];
  if (keywords) return highlightGeneric(code, keywords);
  return esc(code);
}
