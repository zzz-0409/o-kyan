const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const readText = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (ref) => fs.existsSync(path.join(root, ref.replace(/^\.\//, "")));

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function assert(condition, message) {
  if (!condition) fail(message);
}

const html = readText("index.html");
const manifestText = readText("manifest.webmanifest");
const sw = readText("sw.js");

JSON.parse(manifestText);
new Function(sw);

const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1])
  .join("\n");
new Function(inlineScripts);

const suspiciousCodepoints = [
  0x7e67, 0x7e3a, 0x7e5d, 0x8b41, 0x7aca, 0x9aeb, 0x8c4c,
  0x9a55, 0x880e, 0x8b6b, 0x8b20, 0x96aa, 0x8f64
];
const mojibakeLines = [];
for (const codepoint of suspiciousCodepoints) {
  const char = String.fromCodePoint(codepoint);
  let index = html.indexOf(char);
  while (index !== -1) {
    mojibakeLines.push(html.slice(0, index).split(/\r?\n/).length);
    index = html.indexOf(char, index + char.length);
  }
}
assert(!mojibakeLines.length, `Mojibake-like characters found near lines: ${mojibakeLines.join(", ")}`);

const refs = new Map();
function addRef(source, ref) {
  if (!ref || /^(https?:|data:|#|javascript:)/.test(ref)) return;
  const clean = ref.split("?")[0].split("#")[0];
  if (!clean || clean === "./" || clean.endsWith("/")) return;
  if (!clean.includes("assets/") && !clean.includes("manifest.webmanifest") && !clean.includes("sw.js")) return;
  if (!refs.has(clean)) refs.set(clean, new Set());
  refs.get(clean).add(source);
}

for (const match of html.matchAll(/(?:src|href|content)=["']([^"']+)["']/g)) {
  addRef("index.html", match[1]);
}
for (const match of html.matchAll(/assetUrl\(["']([^"']+)["']\)/g)) {
  addRef("index.html", match[1]);
}
for (const match of html.matchAll(/["'](\.\/?assets\/[^"']+?)["']/g)) {
  addRef("index.html", match[1]);
}
for (const match of sw.matchAll(/["'](\.\/(?:assets|manifest|index)[^"']*)["']/g)) {
  addRef("sw.js", match[1]);
}

const manifest = JSON.parse(manifestText);
for (const icon of manifest.icons || []) {
  addRef("manifest.webmanifest", icon.src);
}

for (const frame of ["0", "1", "2", "3"]) {
  addRef("index.html", `assets/character/imagegen-runner-${frame}.png`);
}

for (const [ref, sources] of refs) {
  assert(exists(ref), `Missing asset reference: ${ref} <- ${[...sources].join(", ")}`);
}

const preloads = [...html.matchAll(/<link rel="preload" as="image" href="([^"]+)"/g)]
  .map((match) => match[1].split("?")[0]);
const requiredPreloads = [
  "assets/backgrounds/imagegen-full-road-city-loop.png",
  "assets/character/imagegen-runner-0.png",
  "assets/character/imagegen-runner-1.png",
  "assets/character/imagegen-runner-2.png",
  "assets/character/imagegen-runner-3.png",
  "assets/character/imagegen-runner-jump.png",
  "assets/obstacles/imagegen-car.png",
  "assets/obstacles/imagegen-hole.png",
  "assets/gimmicks/imagegen-boost-pad.png",
  "assets/gimmicks/imagegen-slow-pad.png"
];
for (const ref of requiredPreloads) {
  assert(preloads.includes(ref), `Missing required image preload: ${ref}`);
}

const iconSizes = new Set((manifest.icons || []).map((icon) => icon.sizes));
assert(iconSizes.has("192x192"), "manifest is missing a 192x192 icon");
assert(iconSizes.has("512x512"), "manifest is missing a 512x512 icon");

if (process.exitCode) process.exit(process.exitCode);

console.log(`runner validation ok (${refs.size} refs, ${requiredPreloads.length} required preloads)`);
