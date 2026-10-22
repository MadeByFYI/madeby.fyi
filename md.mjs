// index.html → Markdown, for agents and anyone who'd rather read text. Written for this page's own
// markup (its classes say what each block is), so the result reads as a document, not a scrape:
// commands become code blocks, the terminal samples stay verbatim, the steps stay numbered.
// No dependencies — the page is hand-written HTML, so a small tokenizer is enough.

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rarr: "→", darr: "↓", middot: "·", mdash: "—", ndash: "–", hellip: "…", copy: "©" };

const decode = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) =>
    e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITIES[e.toLowerCase()] ?? m),
  );

/** Parse HTML into a tree of { tag, attrs, children } and text strings. */
function parse(html) {
  const root = { tag: "#root", attrs: {}, children: [] };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)((?:\s+[^\s=>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(html))) {
    const top = stack[stack.length - 1];
    if (m[5] !== undefined) {
      top.children.push(decode(m[5]));
      continue;
    }
    if (!m[2]) continue; // comment
    const tag = m[2].toLowerCase();
    if (m[1]) {
      const i = stack.map((n) => n.tag).lastIndexOf(tag);
      if (i > 0) stack.length = i;
      continue;
    }
    const attrs = {};
    for (const a of m[3].matchAll(/([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) attrs[a[1].toLowerCase()] = decode(a[2] ?? a[3] ?? a[4] ?? "");
    const node = { tag, attrs, children: [] };
    top.children.push(node);
    if (!VOID.has(tag) && !m[4]) stack.push(node);
  }
  return root;
}

const cls = (n, c) => typeof n === "object" && (n.attrs.class ?? "").split(/\s+/).includes(c);
const find = (n, pred) => {
  if (typeof n !== "object") return null;
  if (pred(n)) return n;
  for (const c of n.children) {
    const f = find(c, pred);
    if (f) return f;
  }
  return null;
};
/** The raw text of a node, whitespace as written (for terminal samples). */
const rawText = (n) => (typeof n === "string" ? n : n.tag === "br" ? "\n" : n.children.map(rawText).join(""));
const squash = (s) => s.replace(/\s+/g, " ").trim();
const absolute = (href) => (href.startsWith("#") || href.startsWith("/") ? `https://madeby.fyi/${href.replace(/^\//, "")}` : href);

/** Inline Markdown for a node's children. */
function inline(n) {
  if (typeof n === "string") return n.replace(/\s+/g, " ");
  if (n.attrs["aria-hidden"] === "true") return "";
  const inner = () => n.children.map(inline).join("");
  switch (n.tag) {
    case "b":
    case "strong":
      return `**${inner().trim()}**`;
    case "i":
    case "em":
      return `*${inner().trim()}*`;
    case "code":
      return "`" + squash(rawText(n)) + "`";
    case "br":
      return "\n";
    case "a":
      return `[${squash(inner())}](${absolute(n.attrs.href ?? "")})`;
    case "span":
      return cls(n, "mono") ? "`" + squash(rawText(n)) + "`" : inner();
    default:
      return inner();
  }
}

/** Block Markdown: an array of blocks, joined by blank lines. */
function blocks(n, ctx = {}) {
  if (typeof n === "string") return n.trim() ? [squash(n)] : [];
  if (n.attrs["aria-hidden"] === "true" && !cls(n, "term")) return [];
  if (["style", "script", "nav", "head"].includes(n.tag)) return [];
  const kids = (c = ctx) => n.children.flatMap((k) => blocks(k, c));

  if (/^h[1-4]$/.test(n.tag)) return [`${"#".repeat(Number(n.tag[1]))} ${ctx.step ? `${ctx.step}. ` : ""}${squash(inline(n))}`];
  if (n.tag === "p") {
    const text = inline(n).replace(/[ \t]+\n/g, "\n").trim();
    if (!text) return [];
    return [cls(n, "eyebrow") ? `*${text}*` : text];
  }
  if (cls(n, "term")) {
    const body = find(n, (x) => cls(x, "body"));
    return body ? ["```text\n" + rawText(body).replace(/^\n+|\s+$/g, "") + "\n```"] : [];
  }
  if (n.tag === "span" && cls(n, "cmd")) return ["```sh\n" + squash(rawText(n)).replace(/^\$\s*/, "") + "\n```"];
  if (cls(n, "cta") || cls(n, "cols")) return n.children.flatMap((k) => (typeof k === "object" && k.tag === "a" ? [`- ${inline(k)}`] : blocks(k, ctx)));
  if (cls(n, "cats")) {
    const lines = n.children
      .filter((k) => typeof k === "object")
      .map((k) => {
        const part = (c) => find(k, (x) => cls(x, c));
        const code = find(k, (x) => x.tag === "code");
        const trailers = code ? rawText(code).split("\n").map((t) => "`" + t.trim() + "`").join(" + ") : "";
        return `- **${squash(rawText(part("k")))}**: ${squash(rawText(part("when")))} Run \`${squash(rawText(part("cmd"))).replace(/^\$\s*/, "")}\`, which adds ${trailers}.`;
      });
    return [lines.join("\n")];
  }
  if (cls(n, "stat")) {
    const cells = n.children.filter((k) => typeof k === "object" && !cls(k, "vs"));
    const out = [];
    for (let i = 0; i + 1 < cells.length; i += 2) out.push(`- **${squash(rawText(cells[i]))}** ${squash(rawText(cells[i + 1]))}`);
    return [out.join("\n")];
  }
  if (cls(n, "agents")) return [`Agents: ${n.children.filter((k) => typeof k === "object").map((k) => squash(rawText(k))).join(", ")}`];
  if (n.tag === "a") return cls(n, "brand") ? [] : [`- ${inline(n)}`];
  if (n.tag === "ol") {
    let i = 0;
    return n.children.flatMap((k) => (typeof k === "object" && k.tag === "li" ? blocks(k, { ...ctx, step: ++i }) : []));
  }
  if (n.tag === "li") return kids(ctx);
  // a step's heading takes the number; nothing below it does
  return n.children.flatMap((k) => {
    const out = blocks(k, ctx);
    if (ctx.step && out.some((b) => b.startsWith("#"))) ctx = { ...ctx, step: undefined };
    return out;
  });
}

/** Markdown for the page: the <main> content, then the footer's links. */
export function pageToMarkdown(html, { url }) {
  const doc = parse(html);
  const main = find(doc, (n) => n.tag === "main");
  const footer = find(doc, (n) => n.tag === "footer");
  const desc = find(doc, (n) => n.tag === "meta" && n.attrs.name === "description")?.attrs.content ?? "";
  const parts = [
    `> The Markdown version of ${url}. Agents: start at ${url}llms.txt, or read everything in one file at ${url}llms-full.txt.`,
    ...(desc ? [desc] : []),
    ...blocks(main),
    "---",
    ...blocks(footer).map((b) => b.replace(/^#### /, "### ")),
  ];
  // consecutive one-line list items are one list, not several
  const merged = [];
  for (const b of parts) {
    const prev = merged[merged.length - 1];
    if (prev !== undefined && /^- /.test(b) && /^- [^\n]*$/.test(prev.split("\n").pop()) && /^- /.test(prev)) merged[merged.length - 1] = `${prev}\n${b}`;
    else merged.push(b);
  }
  return merged.join("\n\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
