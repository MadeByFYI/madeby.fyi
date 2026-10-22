#!/usr/bin/env node
// Tell IndexNow engines (Bing, Yandex, Seznam, Naver …) that the site changed. Run after a deploy:
//   node indexnow.mjs            # every URL in the sitemap
// The key file (<key>.txt in this directory) is deployed with the site; that's how they verify us.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const keyFile = readdirSync(HERE).find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
if (!keyFile) throw new Error("no IndexNow key file");
const key = readFileSync(join(HERE, keyFile), "utf8").trim();
const sitemap = readFileSync(join(HERE, "dist", "sitemap.xml"), "utf8");
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: "madeby.fyi", key, keyLocation: `https://madeby.fyi/${keyFile}`, urlList }),
});
console.log(`IndexNow: ${res.status} ${res.statusText} for ${urlList.length} URLs`);
if (res.status >= 300) process.exit(1);
