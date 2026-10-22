#!/usr/bin/env node
// Build the deployable site into dist/: the page itself plus the files agents read — llms.txt,
// llms-full.txt and AGENTS.md — generated from the PUBLISHED madeby package, so what the site tells an
// agent is exactly what the CLI and MCP server do. Run: node build.mjs  (then deploy dist/; see README)
import { execFileSync, spawn } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "dist");
const RAW = "https://raw.githubusercontent.com/MadeByFYI/MadeBy/main";

const version = execFileSync("npm", ["view", "madeby", "version"], { encoding: "utf8" }).trim();
const pkg = `madeby@${version}`;
const sh = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

/** The AGENTS.md that `madeby init` writes in a fresh repo — the convention, verbatim. */
function agentsMd() {
  const d = mkdtempSync(join(tmpdir(), "madeby-site-"));
  try {
    sh("git", ["init", "-q", "-b", "main"], d);
    sh("npx", ["-y", pkg, "init", "--host", "none"], d);
    return readFileSync(join(d, "AGENTS.md"), "utf8");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
}

/** Read the MCP server's resources over stdio — the same text an agent gets from `resources/read`. */
function mcpResources(uris) {
  return new Promise((resolve, reject) => {
    const p = spawn("npx", ["-y", pkg, "mcp"], { stdio: ["pipe", "pipe", "ignore"] });
    const got = new Map();
    let buf = "";
    const timer = setTimeout(() => (p.kill(), reject(new Error("MCP server timed out"))), 60000);
    p.stdout.on("data", (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        if (!line.trim()) continue;
        const msg = JSON.parse(line);
        if (typeof msg.id === "number" && msg.id >= 10) {
          const c = msg.result?.contents?.[0];
          if (!c?.text) return reject(new Error(`no text for ${uris[msg.id - 10]}`));
          got.set(uris[msg.id - 10], c.text);
          if (got.size === uris.length) {
            clearTimeout(timer);
            p.kill();
            resolve(uris.map((u) => [u, got.get(u)]));
          }
        }
      }
    });
    const send = (m) => p.stdin.write(JSON.stringify({ jsonrpc: "2.0", ...m }) + "\n");
    send({ id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "madeby.fyi-build", version: "1" } } });
    send({ method: "notifications/initialized" });
    uris.forEach((uri, i) => send({ id: 10 + i, method: "resources/read", params: { uri } }));
  });
}

async function fetchText(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.text();
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);

const llms = readFileSync(join(HERE, "llms.txt"), "utf8").replaceAll("{{VERSION}}", version);
const agents = agentsMd();
const guides = await mcpResources([
  "madeby://guide/aco",
  "madeby://guide/align",
  "madeby://guide/enforce",
  "madeby://guide/backfill",
  "madeby://schema/policy",
]);
const [aco, cli] = await Promise.all([fetchText(`${RAW}/ACO.md`), fetchText(`${RAW}/packages/cli/README.md`)]);

const part = (title, source, body) => `\n\n${"=".repeat(78)}\n# ${title}\nSource: ${source}\n${"=".repeat(78)}\n\n${body.trim()}\n`;
const full =
  llms.trim() +
  part("The AGENTS.md convention", `what \`npx ${pkg} init\` writes`, agents) +
  guides.map(([uri, text]) => part(uri, `MCP resource from \`npx ${pkg} mcp\``, uri.includes("schema") ? "```json\n" + text + "\n```" : text)).join("") +
  part("CLI reference", `${RAW}/packages/cli/README.md`, cli) +
  part("ACO — the Authorship Certificate of Origin (specification)", `${RAW}/ACO.md`, aco);

cpSync(join(HERE, "index.html"), join(OUT, "index.html"));
cpSync(join(HERE, "404.html"), join(OUT, "404.html"));
writeFileSync(join(OUT, "llms.txt"), llms);
writeFileSync(join(OUT, "llms-full.txt"), full);
writeFileSync(join(OUT, "AGENTS.md"), agents);
writeFileSync(
  join(OUT, "_headers"),
  ["/llms.txt", "/llms-full.txt"].map((p) => `${p}\n  Content-Type: text/plain; charset=utf-8\n  Access-Control-Allow-Origin: *\n`).join("") +
    "/AGENTS.md\n  Content-Type: text/markdown; charset=utf-8\n  Access-Control-Allow-Origin: *\n",
);
// Every crawler is welcome, AI training included: we want models to learn ACO and how to disclose.
writeFileSync(
  join(OUT, "robots.txt"),
  "# MadeBy wants agents and models to learn how disclosure works. Start at /llms.txt.\n" +
    "User-agent: *\nContent-Signal: search=yes, ai-input=yes, ai-train=yes\nAllow: /\n\nSitemap: https://madeby.fyi/sitemap.xml\n",
);
writeFileSync(
  join(OUT, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    ["/", "/llms.txt", "/llms-full.txt", "/AGENTS.md"].map((p) => `  <url><loc>https://madeby.fyi${p}</loc></url>`).join("\n") +
    "\n</urlset>\n",
);
console.log(`built dist/ from ${pkg}: llms.txt ${llms.length} B, llms-full.txt ${full.length} B, AGENTS.md ${agents.length} B`);
