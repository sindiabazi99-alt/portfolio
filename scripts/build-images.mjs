// Converte i lavori nella cartella sorgente in immagini web (webp) + genera src/data.js
// uso: node scripts/build-images.mjs
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.resolve(ROOT, "..");
const OUT = path.join(ROOT, "public", "img");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "8thflr-"));

const PROJECTS = [
  { slug: "juice-wrld", dir: "ART COVERS/juice wrld", title: "Juice WRLD", cat: "covers", kind: "Cover Art", note: "Cover artwork & visual concepts." },
  { slug: "no-regular-music", dir: "ART COVERS/NRM COVER", title: "No Regular Music", cat: "covers", kind: "Album Cover", note: "Concept, sketches and lineups for the NRM album cover." },
  { slug: "gucci-loafer", crop: true, dir: "STORYBOARDS/Gucci_Loafer Storyboards- FOR GOOFY STUDIO", title: "Gucci — Loafer", cat: "storyboards", kind: "Storyboard", client: "for Goofy Studio", note: "Scene-by-scene storyboard for the Gucci Loafer film." },
  { slug: "gucci-rossetto", crop: true, dir: "STORYBOARDS/Gucci_rossetto storyboards- FOR GOOFY STUDIO/JPEGS", title: "Gucci — Rossetto", cat: "storyboards", kind: "Storyboard", client: "for Goofy Studio", note: "Storyboard for the Gucci lipstick spot." },
  { slug: "valentino-yadim", crop: true, dir: "STORYBOARDS/valentino-yadim-storyboard_goofy_", title: "Valentino × Yadim", cat: "storyboards", kind: "Storyboard", client: "for Goofy Studio", note: "Storyboard for Valentino with Yadim." },
  { slug: "luche", crop: true, dir: "STORYBOARDS/storyboard luchè", title: "Luchè", cat: "storyboards", kind: "Music Video Storyboard", note: "Full shot-by-shot storyboard for a Luchè music video." },
  { slug: "la-creatura-perfetta", dir: "fumetti/La creatura perfetta", title: "La Creatura Perfetta", cat: "comics", kind: "Comic", note: "Short comic story." },
  { slug: "malinche", dir: "fumetti/malinche (non published yet)", title: "Malinche", cat: "comics", kind: "Comic — Unreleased", note: "Graphic novel in progress. Not published yet." },
  { slug: "guardiani-notturni", dir: "fumetti/guardiani notturni 2020", title: "Guardiani Notturni", cat: "comics", kind: "Comic", year: "2020", note: "Night guardians — comic pages." },
  { slug: "aprendemos-juntos-comics", dir: "fumetti/comics serie Aprendemos Juntos Kids", title: "Aprendemos Juntos Kids", cat: "comics", kind: "Comic Series", note: "Comic pages for the Aprendemos Juntos Kids series." },
  { slug: "aprendemos-juntos-concept", dir: "CONCEPT ART per serie APRENDEMOS JUNTOS KIDS", title: "Aprendemos Juntos Kids", cat: "concept", kind: "Series Concept Art", note: "Characters, props and environments for the animated series." },
  { slug: "aztec-tec-world", dir: "game CONCEPTS personal project-aztec:tec world", title: "Aztec:Tec World", cat: "concept", kind: "Game Concept — Personal", note: "Characters and world-building for an original game." },
  { slug: "illustrations", dir: "Illustrations", title: "Illustrations", cat: "illustration", kind: "Illustration", note: "Selected character illustrations." },
  { slug: "evoluzione-incompleta", dir: "personal project -libretto 25 scimmie", title: "Evoluzione Incompleta", cat: "illustration", kind: "Booklet — Personal", note: "25 monkey sketches for 25 years. A small book made for my brother." },
];

const sh = (cmd, args) => execFileSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"] }).toString();
const dims = (f) => {
  const o = sh("sips", ["-g", "pixelWidth", "-g", "pixelHeight", f]);
  return [+o.match(/pixelWidth: (\d+)/)[1], +o.match(/pixelHeight: (\d+)/)[1]];
};
const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true });

fs.mkdirSync(OUT, { recursive: true });
const data = [];

for (const p of PROJECTS) {
  const dir = path.join(SRC, p.dir);
  const files = fs.readdirSync(dir).filter((f) => /\.(jpe?g|psd)$/i.test(f)).sort(natural);
  const outDir = path.join(OUT, p.slug);
  fs.mkdirSync(outDir, { recursive: true });
  const images = [];
  files.forEach((f, i) => {
    let src = path.join(dir, f);
    const n = String(i + 1).padStart(2, "0");
    const full = path.join(outDir, `${n}.webp`);
    const thumb = path.join(outDir, `${n}-t.webp`);
    if (!fs.existsSync(full) || !fs.existsSync(thumb)) {
      // PSD / JPG -> JPG temporaneo ridimensionato (sips legge il composito PSD)
      const tmp = path.join(TMP, `${p.slug}-${n}.jpg`);
      sh("sips", ["-Z", "2200", "-s", "format", "jpeg", "-s", "formatOptions", "92", src, "--out", tmp]);
      src = tmp;
      if (p.crop) {
        // rimuove il bordo scuro della tela di Photoshop attorno ai frame
        const log = spawnSync("ffmpeg", ["-i", tmp, "-vf", "cropdetect=limit=0.22:round=2:skip=0:reset=1", "-f", "null", "-"]).stderr.toString();
        const m = [...log.matchAll(/crop=(\d+:\d+:\d+:\d+)/g)].pop();
        if (m) {
          const cropped = tmp.replace(/\.jpg$/, "-c.jpg");
          sh("ffmpeg", ["-loglevel", "error", "-y", "-i", tmp, "-vf", `crop=${m[1]}`, "-q:v", "2", cropped]);
          src = cropped;
        }
      }
      const [w, h] = dims(src);
      const big = w >= h ? ["-resize", String(Math.min(w, 2000)), "0"] : ["-resize", "0", String(Math.min(h, 2000))];
      const small = w >= h ? ["-resize", "640", "0"] : ["-resize", "0", "640"];
      sh("cwebp", ["-quiet", "-q", "80", ...big, src, "-o", full]);
      sh("cwebp", ["-quiet", "-q", "72", ...small, src, "-o", thumb]);
    }
    const [w, h] = dims(thumb);
    images.push({ src: `/img/${p.slug}/${n}.webp`, thumb: `/img/${p.slug}/${n}-t.webp`, w, h });
    process.stdout.write(".");
  });
  const { dir: _d, crop: _c, ...meta } = p;
  data.push({ ...meta, images });
  console.log(` ${p.slug} (${images.length})`);
}

fs.writeFileSync(
  path.join(ROOT, "src", "data.js"),
  `// generato da scripts/build-images.mjs\nexport const PROJECTS = ${JSON.stringify(data, null, 1)};\n`
);
fs.rmSync(TMP, { recursive: true, force: true });
console.log("done");
