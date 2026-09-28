import fs from "node:fs";
import { defineConfig } from "vite";

// inserisce in index.html i testi di content/settings.json (modificabili dal CMS)
const esc = (v = "") =>
  String(v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function settingsHtml() {
  return {
    name: "settings-html",
    transformIndexHtml(html) {
      const s = JSON.parse(fs.readFileSync("content/settings.json", "utf8"));
      const site = "https://sindi-abazi.vercel.app";
      const share = s.share_image ? (s.share_image.startsWith("http") ? s.share_image : site + s.share_image) : "";
      const map = {
        NAME: s.name,
        TAGLINE: s.tagline,
        BIO: s.bio,
        SEO_TITLE: s.seo_title || s.name,
        SEO_DESCRIPTION: s.seo_description || s.tagline,
        SHARE_IMAGE: share,
      };
      return html.replace(/%([A-Z_]+)%/g, (m, k) => (k in map ? esc(map[k]) : m));
    },
  };
}

export default defineConfig({ plugins: [settingsHtml()] });
