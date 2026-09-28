import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
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

// solo in sviluppo: il CMS su /admin/ legge e scrive i file locali invece di GitHub
function localCms() {
  const root = process.cwd();
  const allowed = (p) => /^(content\/|public\/uploads\/)/.test(p) && !p.includes("..");
  const walk = (dir) =>
    fs.existsSync(dir)
      ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
          const full = path.join(dir, e.name);
          return e.isDirectory() ? walk(full) : [path.relative(root, full)];
        })
      : [];
  return {
    name: "local-cms",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === "/admin" || req.url === "/admin/") req.url = "/admin/index.html";
        next();
      });
      server.middlewares.use("/__cms", (req, res) => {
        const url = new URL(req.url, "http://x");
        const send = (code, body, type = "application/json") => {
          res.statusCode = code;
          res.setHeader("Content-Type", type);
          res.end(typeof body === "string" ? body : JSON.stringify(body));
        };
        if (url.pathname === "/list") return send(200, [...walk("content"), ...walk("public/uploads")]);
        if (url.pathname === "/file") {
          const p = url.searchParams.get("path") || "";
          if (!allowed(p) || !fs.existsSync(p)) return send(404, { error: "not found" });
          return send(200, fs.readFileSync(p, "utf8"), "text/plain; charset=utf-8");
        }
        if (url.pathname === "/commit" && req.method === "POST") {
          let body = "";
          req.on("data", (c) => (body += c));
          req.on("end", () => {
            try {
              const { files } = JSON.parse(body);
              for (const f of files) {
                if (!allowed(f.path)) throw new Error(`percorso non permesso: ${f.path}`);
                if (f.delete) fs.rmSync(f.path, { force: true });
                else {
                  fs.mkdirSync(path.dirname(f.path), { recursive: true });
                  fs.writeFileSync(f.path, f.base64 != null ? Buffer.from(f.base64, "base64") : f.text);
                }
              }
              execFileSync("node", ["scripts/build-content.mjs"], { stdio: "inherit" });
              send(200, { sha: "local" });
            } catch (e) {
              send(400, { error: String(e.message || e) });
            }
          });
          return;
        }
        send(404, { error: "not found" });
      });
    },
  };
}

export default defineConfig({ plugins: [settingsHtml(), localCms()] });
