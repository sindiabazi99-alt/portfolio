// Legge i contenuti del CMS (content/*.json) e prepara il sito:
// - miniature 640px e versioni web delle foto in public/_gen (non versionate)
// - src/content.gen.js con progetti + impostazioni, usato da main.js
// Gira da solo prima di `npm run dev` e `npm run build` (anche su Vercel).
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const GEN = path.join(PUBLIC, "_gen");
const readJSON = (f) => JSON.parse(fs.readFileSync(f, "utf8"));

fs.mkdirSync(GEN, { recursive: true });
const settings = readJSON(path.join(ROOT, "content", "settings.json"));

const dir = path.join(ROOT, "content", "projects");
const entries = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => ({ slug: f.replace(/\.json$/, ""), ...readJSON(path.join(dir, f)) }))
  .filter((p) => !p.hidden)
  .sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.title.localeCompare(b.title));

const fresh = (out, src) => fs.existsSync(out) && fs.statSync(out).mtimeMs >= fs.statSync(src).mtimeMs;

async function processImage(publicPath) {
  const src = path.join(PUBLIC, decodeURIComponent(publicPath));
  if (!fs.existsSync(src)) {
    console.warn(`  ! immagine mancante, saltata: ${publicPath}`);
    return null;
  }
  const base = path.basename(src).replace(/\.[^.]+$/, "");
  const thumb = path.join(GEN, `${base}-640.webp`);
  if (!fresh(thumb, src)) {
    await sharp(src).rotate().resize(640, 640, { fit: "inside", withoutEnlargement: true }).webp({ quality: 72 }).toFile(thumb);
  }
  const meta = await sharp(thumb).metadata();

  // la foto grande si usa così com'è se è già un webp leggero, altrimenti se ne crea una versione web
  const srcMeta = await sharp(src).metadata();
  const light = /\.webp$/i.test(src) && Math.max(srcMeta.width, srcMeta.height) <= 2400 && fs.statSync(src).size <= 1.5e6;
  let full = publicPath;
  if (!light) {
    const out = path.join(GEN, `${base}-2000.webp`);
    if (!fresh(out, src)) {
      await sharp(src).rotate().resize(2000, 2000, { fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toFile(out);
    }
    full = `/_gen/${base}-2000.webp`;
  }
  return { src: full, thumb: `/_gen/${base}-640.webp`, w: meta.width, h: meta.height };
}

// piccolo pool per non aprire 200 immagini insieme
async function mapPool(list, n, fn) {
  const out = new Array(list.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < list.length) {
        const k = i++;
        out[k] = await fn(list[k]);
      }
    })
  );
  return out;
}

const t0 = Date.now();
const projects = [];
for (const p of entries) {
  const images = (await mapPool(p.images || [], 8, processImage)).filter(Boolean);
  if (!images.length) {
    console.warn(`  ! "${p.title}" non ha immagini, non viene mostrato`);
    continue;
  }
  projects.push({
    slug: p.slug,
    title: p.title,
    cat: p.category,
    kind: p.type || "",
    client: p.client || "",
    year: p.year ? String(p.year) : "",
    note: p.description || "",
    images,
  });
}

fs.writeFileSync(
  path.join(ROOT, "src", "content.gen.js"),
  `// generato da scripts/build-content.mjs — non modificare, cambia i file in content/\n` +
    `export const SETTINGS = ${JSON.stringify(settings, null, 1)};\n` +
    `export const PROJECTS = ${JSON.stringify(projects, null, 1)};\n`
);
const n = projects.reduce((s, p) => s + p.images.length, 0);
console.log(`content: ${projects.length} progetti, ${n} immagini (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
