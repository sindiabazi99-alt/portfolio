// CMS su misura per il portfolio.
// Legge e scrive i file del repo GitHub (content/*.json + public/uploads) e ogni "Pubblica" è un unico commit:
// Vercel lo vede e ripubblica il sito da solo. In locale (npm run dev) scrive direttamente sui file.
import Sortable from "https://cdn.jsdelivr.net/npm/sortablejs@1.15.6/modular/sortable.esm.js";

const REPO = { owner: "sindiabazi99-alt", repo: "portfolio", branch: "main" };
const SITE = "https://sindi-abazi.vercel.app";
const LOCAL = ["localhost", "127.0.0.1"].includes(location.hostname);
const TOKEN_KEY = "sa-cms-token";
const CATS = [
  ["covers", "Covers"],
  ["storyboards", "Storyboards"],
  ["comics", "Comics"],
  ["concept", "Concept Art"],
  ["illustration", "Illustration"],
];
const CAT = Object.fromEntries(CATS);
const SPHERE = 8; // immagini per progetto nella sfera della home

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v = "") => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const app = $("#app");

// ================================================================ backend

function githubBackend(token) {
  const R = `/repos/${REPO.owner}/${REPO.repo}`;
  const api = async (path, opt = {}) => {
    const r = await fetch(`https://api.github.com${path}`, {
      ...opt,
      cache: "no-store",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(opt.body ? { "Content-Type": "application/json" } : {}),
        ...opt.headers,
      },
    });
    if (!r.ok) {
      const e = new Error(`GitHub ${r.status}`);
      e.status = r.status;
      try {
        e.detail = (await r.json()).message;
      } catch {}
      throw e;
    }
    if (r.status === 204) return null;
    return opt.raw ? r.text() : r.json();
  };
  return {
    kind: "github",
    async whoami() {
      const user = await api("/user");
      const repo = await api(R);
      if (!repo.permissions?.push) {
        const e = new Error("no-push");
        e.status = 403;
        throw e;
      }
      return user.login;
    },
    async list() {
      const ref = await api(`${R}/git/ref/heads/${REPO.branch}`);
      const tree = await api(`${R}/git/trees/${ref.object.sha}?recursive=1`);
      return tree.tree.filter((x) => x.type === "blob").map((x) => x.path);
    },
    read(path) {
      const p = path.split("/").map(encodeURIComponent).join("/");
      return api(`${R}/contents/${p}?ref=${REPO.branch}`, { raw: true, headers: { Accept: "application/vnd.github.raw+json" } });
    },
    async commit(message, files) {
      const ref = await api(`${R}/git/ref/heads/${REPO.branch}`);
      const head = await api(`${R}/git/commits/${ref.object.sha}`);
      const tree = await pool(files, 4, async (f) => {
        if (f.delete) return { path: f.path, mode: "100644", type: "blob", sha: null };
        const body = f.base64 != null ? { content: f.base64, encoding: "base64" } : { content: f.text, encoding: "utf-8" };
        const blob = await api(`${R}/git/blobs`, { method: "POST", body: JSON.stringify(body) });
        return { path: f.path, mode: "100644", type: "blob", sha: blob.sha };
      });
      const nt = await api(`${R}/git/trees`, { method: "POST", body: JSON.stringify({ base_tree: head.tree.sha, tree }) });
      const c = await api(`${R}/git/commits`, {
        method: "POST",
        body: JSON.stringify({ message, tree: nt.sha, parents: [ref.object.sha] }),
      });
      await api(`${R}/git/refs/heads/${REPO.branch}`, { method: "PATCH", body: JSON.stringify({ sha: c.sha }) });
      return c.sha;
    },
    // stato del deploy Vercel (Vercel crea un "deployment" su GitHub per ogni commit)
    async deployState(sha) {
      const d = await api(`${R}/deployments?sha=${sha}&per_page=5`);
      const prod = d.find((x) => /production/i.test(x.environment)) || d[0];
      if (!prod) return "pending";
      const s = await api(`${R}/deployments/${prod.id}/statuses?per_page=1`);
      return s[0]?.state || "pending";
    },
  };
}

function localBackend() {
  const j = async (r) => {
    if (!r.ok) throw Object.assign(new Error(`local ${r.status}`), { status: r.status });
    return r;
  };
  return {
    kind: "local",
    whoami: async () => "locale",
    list: () => fetch("/__cms/list").then(j).then((r) => r.json()),
    read: (p) => fetch(`/__cms/file?path=${encodeURIComponent(p)}`).then(j).then((r) => r.text()),
    commit: (message, files) =>
      fetch("/__cms/commit", { method: "POST", body: JSON.stringify({ message, files }) })
        .then(j)
        .then((r) => r.json())
        .then((x) => x.sha),
    deployState: null,
  };
}

async function pool(list, n, fn) {
  const out = new Array(list.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, list.length) }, async () => {
      while (i < list.length) {
        const k = i++;
        out[k] = await fn(list[k], k);
      }
    })
  );
  return out;
}

// ================================================================ stato

const S = {
  backend: null,
  user: "",
  projects: [], // { path, slug, data, saved (json serializzato), isNew }
  settings: null,
  settingsSaved: "",
  deleted: [], // path json di progetti eliminati (già esistenti)
  files: new Set(), // file presenti nel repo
  pending: new Map(), // "/uploads/x.webp" -> { base64, url } foto nuove non ancora pubblicate
  localURL: new Map(), // anteprime delle foto appena pubblicate (prima che Vercel le serva)
  view: "projects",
  current: null,
  filter: "all",
  deploy: { state: "idle", text: "" },
  deletedSaved: {},
};

const PROJECT_KEYS = ["title", "order", "category", "type", "client", "year", "description", "hidden", "images"];
function serializeProject(d) {
  const o = {};
  for (const k of PROJECT_KEYS) {
    const v = d[k];
    if ((k === "client" || k === "year" || k === "type") && !v) continue;
    if (k === "hidden") o[k] = !!v;
    else if (k === "order") o[k] = Number(v) || 0;
    else if (k === "images") o[k] = [...(v || [])];
    else o[k] = v ?? "";
  }
  return JSON.stringify(o, null, 2) + "\n";
}
const serializeSettings = (s) => JSON.stringify(s, null, 2) + "\n";

const isDirty = (p) => p.isNew || serializeProject(p.data) !== p.saved;
function changeCount() {
  return (
    S.projects.filter(isDirty).length +
    S.deleted.length +
    (S.settings && serializeSettings(S.settings) !== S.settingsSaved ? 1 : 0)
  );
}

const slugify = (s) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "progetto";

// ================================================================ immagini

const baseName = (p) => p.split("/").pop().replace(/\.[^.]+$/, "");
function imgSrc(p, big = false) {
  if (S.pending.has(p)) return S.pending.get(p).url;
  if (S.localURL.has(p)) return S.localURL.get(p);
  return big ? p : `/_gen/${baseName(p)}-640.webp`;
}
// se la miniatura non esiste ancora (foto appena pubblicata) prova l'originale, poi GitHub
window.__imgFallback = (img) => {
  const p = img.dataset.path;
  const steps = [p, `https://raw.githubusercontent.com/${REPO.owner}/${REPO.repo}/${REPO.branch}/public${p}`];
  const i = Number(img.dataset.step || 0);
  if (i < steps.length) {
    img.dataset.step = i + 1;
    img.src = steps[i];
  }
};
const imgTag = (p, alt = "") =>
  `<img src="${esc(imgSrc(p))}" data-path="${esc(p)}" alt="${esc(alt)}" loading="lazy" onerror="__imgFallback(this)">`;

// converte in WebP (o JPEG se il browser non sa fare WebP), max 2400px
async function prepareImage(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  let blob = await new Promise((r) => c.toBlob(r, "image/webp", 0.86));
  let ext = "webp";
  if (!blob || blob.type !== "image/webp") {
    blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.88));
    ext = "jpg";
  }
  const base64 = await new Promise((res) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result).split(",")[1]);
    fr.readAsDataURL(blob);
  });
  const name = slugify(file.name.replace(/\.[^.]+$/, "")).slice(0, 40);
  const path = `/uploads/${name}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  return { path, base64, url: URL.createObjectURL(blob) };
}

async function addImages(fileList, onEach) {
  const files = [...fileList].filter((f) => f.type.startsWith("image/"));
  if (!files.length) return;
  const out = [];
  for (const f of files) {
    try {
      const im = await prepareImage(f);
      S.pending.set(im.path, { base64: im.base64, url: im.url });
      out.push(im.path);
      onEach?.(out.length, files.length);
    } catch (e) {
      toast(`Non riesco a leggere ${f.name}`, true);
    }
  }
  return out;
}

// ================================================================ caricamento

async function load() {
  const paths = await S.backend.list();
  S.files = new Set(paths);
  const projPaths = paths.filter((p) => /^content\/projects\/[^/]+\.json$/.test(p));
  const texts = await pool(projPaths, 6, (p) => S.backend.read(p));
  S.projects = projPaths.map((path, i) => {
    const data = JSON.parse(texts[i]);
    data.images = data.images || [];
    return { path, slug: path.split("/").pop().replace(/\.json$/, ""), data, saved: serializeProject(data), isNew: false };
  });
  sortProjects();
  S.settings = JSON.parse(await S.backend.read("content/settings.json"));
  S.settings.clients ||= [];
  S.settings.disciplines ||= [];
  S.settingsSaved = serializeSettings(S.settings);
  S.deleted = [];
}
const sortProjects = () =>
  S.projects.sort((a, b) => (a.data.order ?? 999) - (b.data.order ?? 999) || a.data.title.localeCompare(b.data.title));

// ================================================================ pubblica

async function publish() {
  // controlli
  for (const p of S.projects) {
    if (!p.data.title.trim()) return fail(p, "Manca il titolo");
    if (!p.data.category) return fail(p, "Manca la categoria");
    if (!p.data.hidden && !p.data.images.length) return fail(p, "Serve almeno un'immagine (o nascondi il progetto)");
  }
  const n = changeCount();
  if (!n) return;

  const files = [];
  const used = new Set(S.projects.flatMap((p) => p.data.images));
  if (S.settings.share_image) used.add(S.settings.share_image);

  // nuovi progetti: il file prende il nome dal titolo
  for (const p of S.projects.filter((x) => x.isNew)) {
    let slug = slugify(p.data.title);
    let k = 2;
    while (S.projects.some((x) => x !== p && x.slug === slug) || S.files.has(`content/projects/${slug}.json`)) slug = `${slugify(p.data.title)}-${k++}`;
    p.slug = slug;
    p.path = `content/projects/${slug}.json`;
  }
  for (const p of S.projects.filter(isDirty)) files.push({ path: p.path, text: serializeProject(p.data) });
  for (const path of S.deleted) files.push({ path, delete: true });
  if (serializeSettings(S.settings) !== S.settingsSaved) files.push({ path: "content/settings.json", text: serializeSettings(S.settings) });

  // foto nuove usate + foto non più usate da nessuno
  for (const [p, v] of S.pending) if (used.has(p)) files.push({ path: `public${p}`, base64: v.base64 });
  const previouslyUsed = new Set();
  for (const p of S.projects) if (!p.isNew) JSON.parse(p.saved).images.forEach((x) => previouslyUsed.add(x));
  const oldSettings = JSON.parse(S.settingsSaved);
  if (oldSettings.share_image) previouslyUsed.add(oldSettings.share_image);
  for (const path of S.deleted) {
    try {
      JSON.parse(S.deletedSaved?.[path] || "{}").images?.forEach((x) => previouslyUsed.add(x));
    } catch {}
  }
  for (const p of previouslyUsed) if (!used.has(p) && S.files.has(`public${p}`)) files.push({ path: `public${p}`, delete: true });

  const msg = `CMS: ${n} modific${n === 1 ? "a" : "he"}`;
  setDeploy("busy", "Salvataggio…");
  $("#publish") && ($("#publish").disabled = true);
  try {
    const sha = await S.backend.commit(msg, files);
    // da qui tutto è salvato
    for (const [p, v] of S.pending) if (used.has(p)) S.localURL.set(p, v.url);
    S.pending.clear();
    for (const f of files) f.delete ? S.files.delete(f.path) : S.files.add(f.path);
    for (const p of S.projects) {
      p.saved = serializeProject(p.data);
      p.isNew = false;
    }
    S.deleted = [];
    S.deletedSaved = {};
    S.settingsSaved = serializeSettings(S.settings);
    toast("Salvato ✓");
    render();
    watchDeploy(sha);
  } catch (e) {
    console.error(e);
    setDeploy("err", "Errore nel salvataggio");
    toast(e.status === 409 || e.status === 422 ? "Il sito è stato modificato altrove: ricarica la pagina e riprova" : `Salvataggio non riuscito (${e.detail || e.message})`, true);
    render();
  }
}

function fail(p, text) {
  S.view = "edit";
  S.current = p;
  render();
  toast(`“${p.data.title || "Senza titolo"}”: ${text}`, true);
}

let deployTimer = 0;
async function watchDeploy(sha) {
  clearTimeout(deployTimer);
  if (S.backend.kind === "local") return setDeploy("ok", "Salvato sui file locali");
  setDeploy("busy", "In pubblicazione…");
  const t0 = Date.now();
  const tick = async () => {
    let st = "pending";
    try {
      st = await S.backend.deployState(sha);
    } catch (e) {
      // token senza permesso "Deployments": non possiamo seguire il deploy
      return setDeploy("ok", "Salvato · online tra circa 1 minuto");
    }
    if (st === "success") return setDeploy("ok", "Online ✓");
    if (st === "failure" || st === "error") return setDeploy("err", "Pubblicazione fallita");
    if (Date.now() - t0 > 6 * 60e3) return setDeploy("ok", "Salvato · controlla il sito tra poco");
    deployTimer = setTimeout(tick, 5000);
  };
  deployTimer = setTimeout(tick, 4000);
}
function setDeploy(state, text) {
  S.deploy = { state, text };
  const el = $("#status");
  if (el) {
    el.className = `status ${state}`;
    $(".txt", el).textContent = text;
  }
}

// ================================================================ UI

function toast(text, err = false) {
  const t = document.createElement("div");
  t.className = `toast${err ? " err" : ""}`;
  t.textContent = text;
  $("#toasts").append(t);
  setTimeout(() => t.remove(), err ? 6000 : 2600);
}

function renderLogin(error = "") {
  app.innerHTML = `
  <div class="login"><form class="login-card" id="login">
    <h1>Sindi Abazi</h1>
    <p class="sub">Gestione contenuti del portfolio</p>
    <div class="field">
      <label for="tok">Token GitHub</label>
      <input type="text" id="tok" autocomplete="off" spellcheck="false" placeholder="ghp_… oppure github_pat_…" required />
    </div>
    <div class="row"><button class="btn primary" type="submit">Entra</button></div>
    ${error ? `<p class="err">${esc(error)}</p>` : ""}
    <details>
      <summary>Come si crea il token?</summary>
      <ol>
        <li>GitHub → foto profilo → <b>Settings</b> → <b>Developer settings</b></li>
        <li><b>Personal access tokens</b> → <b>Tokens (classic)</b> → <b>Generate new token (classic)</b></li>
        <li>Spunta <b>repo</b>, scegli la scadenza, <b>Generate token</b></li>
        <li>Copia il codice e incollalo qui. Serve una volta sola: il browser lo ricorda.</li>
      </ol>
    </details>
  </form></div>`;
  $("#login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const tok = $("#tok").value.trim();
    await start(githubBackend(tok), tok);
  });
}

function renderShell(inner) {
  const n = changeCount();
  app.innerHTML = `
  <header class="top">
    <div class="logo">${esc(S.settings?.name || "CMS")}<span>CMS</span></div>
    <nav class="tabs" role="tablist">
      <button role="tab" data-view="projects" aria-selected="${S.view !== "settings"}">Progetti</button>
      <button role="tab" data-view="settings" aria-selected="${S.view === "settings"}">Impostazioni</button>
    </nav>
    <div class="grow"></div>
    <span id="status" class="status ${S.deploy.state}"><span class="dot"></span><span class="txt">${esc(S.deploy.text || (S.backend.kind === "local" ? "Modalità locale" : "Tutto pubblicato"))}</span></span>
    <a class="btn ghost view-site" href="${S.backend.kind === "local" ? "/" : SITE}" target="_blank" rel="noopener">Vedi sito ↗</a>
    <button class="btn primary" id="publish" ${n ? "" : "disabled"}>Pubblica${n ? ` <span class="n">${n}</span>` : ""}</button>
    <div class="menu" id="menu">
      <button class="btn ghost" id="menu-btn" aria-label="Account">•••</button>
      <div class="menu-pop">
        <div class="who">${S.backend.kind === "local" ? "Modalità locale" : `Accesso come ${esc(S.user)}`}</div>
        <a href="https://github.com/${REPO.owner}/${REPO.repo}/commits/${REPO.branch}" target="_blank" rel="noopener">Cronologia modifiche ↗</a>
        ${S.backend.kind === "local" ? "" : `<button id="logout">Esci</button>`}
      </div>
    </div>
  </header>
  <main>${inner}</main>`;

  $$(".tabs button").forEach((b) =>
    b.addEventListener("click", () => {
      S.view = b.dataset.view;
      S.current = null;
      render();
    })
  );
  $("#publish").addEventListener("click", publish);
  $("#menu-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    $("#menu").classList.toggle("open");
  });
  $("#logout")?.addEventListener("click", () => {
    if (changeCount() && !confirm("Ci sono modifiche non pubblicate. Uscire lo stesso?")) return;
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {}
    location.reload();
  });
}
document.addEventListener("click", () => $("#menu")?.classList.remove("open"));

function render() {
  if (S.view === "settings") return renderSettings();
  if (S.view === "edit" && S.current) return renderEditor(S.current);
  renderProjects();
}

const eyeIcon = (hidden) =>
  hidden
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c5 0 9 4.5 10 7-.4 1-1.3 2.5-2.7 3.9M6.6 6.6C4.4 8 2.8 10.2 2 12c1 2.5 5 7 10 7 1.8 0 3.4-.5 4.8-1.3"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`;

function renderProjects() {
  const list = S.projects.filter((p) => S.filter === "all" || p.data.category === S.filter);
  const canDrag = S.filter === "all";
  renderShell(`
    <div class="head">
      <h2>Progetti<small>${S.projects.length}</small></h2>
      <button class="btn" id="new">+ Nuovo progetto</button>
    </div>
    <div class="chips">
      <button class="chip" data-f="all" aria-pressed="${S.filter === "all"}">Tutti</button>
      ${CATS.map(([id, l]) => `<button class="chip" data-f="${id}" aria-pressed="${S.filter === id}">${l}</button>`).join("")}
    </div>
    <div class="list" id="list">
      ${
        list.length
          ? list
              .map(
                (p) => `
        <div class="row ${p.data.hidden ? "hidden" : ""} ${canDrag ? "" : "nodrag"}" data-i="${S.projects.indexOf(p)}">
          <span class="handle" title="Trascina per riordinare">⠿</span>
          <div class="thumb">${p.data.images[0] ? imgTag(p.data.images[0]) : ""}</div>
          <div><div class="t">${esc(p.data.title || "Senza titolo")}${isDirty(p) ? `<span class="dirty" title="Modifiche non pubblicate"></span>` : ""}</div>
            <div class="s">${esc([p.data.type, p.data.client, p.data.year].filter(Boolean).join(" · ") || "—")}</div></div>
          <span class="cat"><span class="pill">${esc(CAT[p.data.category] || "—")}</span></span>
          <span class="count">${p.data.images.length} foto</span>
          <button class="eye" data-eye title="${p.data.hidden ? "Nascosto — clicca per mostrarlo" : "Visibile — clicca per nasconderlo"}">${eyeIcon(p.data.hidden)}</button>
        </div>`
              )
              .join("")
          : `<div class="empty">Nessun progetto in questa categoria</div>`
      }
    </div>
    <p class="hint">${canDrag ? "Trascina le righe per cambiare l'ordine sul sito." : "Per riordinare torna su “Tutti”."} Le modifiche vanno online quando premi <b>Pubblica</b>.</p>
  `);

  $$(".chip").forEach((c) =>
    c.addEventListener("click", () => {
      S.filter = c.dataset.f;
      render();
    })
  );
  $("#new").addEventListener("click", () => {
    const p = {
      path: "",
      slug: "",
      isNew: true,
      saved: "",
      data: { title: "", order: (S.projects.length + 1) * 10, category: S.filter !== "all" ? S.filter : "", type: "", client: "", year: "", description: "", hidden: false, images: [] },
    };
    S.projects.push(p);
    S.view = "edit";
    S.current = p;
    render();
    $("#f-title")?.focus();
  });
  $$(".row").forEach((r) => {
    const p = S.projects[+r.dataset.i];
    r.addEventListener("click", (e) => {
      if (e.target.closest("[data-eye]")) {
        p.data.hidden = !p.data.hidden;
        return render();
      }
      if (e.target.closest(".handle")) return;
      S.view = "edit";
      S.current = p;
      render();
      scrollTo(0, 0);
    });
  });
  if (canDrag && list.length > 1) {
    Sortable.create($("#list"), {
      handle: ".handle",
      animation: 160,
      onEnd: () => {
        const order = $$(".row", $("#list")).map((r) => S.projects[+r.dataset.i]);
        order.forEach((p, i) => (p.data.order = (i + 1) * 10));
        S.projects = order;
        render();
      },
    });
  }
}

function field(id, label, value, { type = "text", help = "", cls = "", textarea = false, placeholder = "" } = {}) {
  const input = textarea
    ? `<textarea id="${id}" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`
    : `<input type="${type}" id="${id}" class="${cls}" value="${esc(value)}" placeholder="${esc(placeholder)}" />`;
  return `<div class="field"><label for="${id}">${label}</label>${input}${help ? `<div class="help">${help}</div>` : ""}</div>`;
}

function renderEditor(p) {
  const d = p.data;
  renderShell(`
    <button class="back" id="back">← Tutti i progetti</button>
    <div class="editor">
      <div class="card form">
        ${field("f-title", "Titolo", d.title, { cls: "title-input", placeholder: "Nome del progetto" })}
        <div class="field"><label for="f-cat">Categoria</label>
          <select id="f-cat"><option value="" ${d.category ? "" : "selected"} disabled>Scegli…</option>
          ${CATS.map(([id, l]) => `<option value="${id}" ${d.category === id ? "selected" : ""}>${l}</option>`).join("")}</select></div>
        ${field("f-type", "Tipo (tag)", d.type, { placeholder: "Es. Storyboard, Album Cover…" })}
        <div class="two">
          ${field("f-client", "Cliente", d.client, { placeholder: "Facoltativo" })}
          ${field("f-year", "Anno", d.year, { placeholder: "Facoltativo" })}
        </div>
        ${field("f-desc", "Descrizione", d.description, { textarea: true, placeholder: "Due righe sul progetto" })}
        <div class="switch ${d.hidden ? "" : "on"}" id="f-vis" role="switch" aria-checked="${!d.hidden}" tabindex="0">
          <span>${d.hidden ? "Nascosto dal sito" : "Visibile sul sito"}</span><span class="k"></span></div>
        <div class="danger-zone"><button class="btn danger ghost" id="del">Elimina progetto</button></div>
      </div>
      <div class="card">
        <div class="gallery-head"><h3>Immagini <span>· ${d.images.length}</span></h3><span>Le prime ${SPHERE} vanno nella sfera della home</span></div>
        <label class="drop" id="drop"><input type="file" id="file" accept="image/*" multiple hidden />
          <strong>Trascina qui le immagini</strong> o clicca per sceglierle<br /><span class="help">JPG, PNG o WebP — vengono ottimizzate da sole</span></label>
        <div class="grid" id="grid">
          ${d.images
            .map(
              (im, i) => `<div class="tile ${S.pending.has(im) ? "new" : ""}" data-i="${i}">${imgTag(im)}
              <span class="num ${i < SPHERE ? "sph" : ""}" title="${i < SPHERE ? "Nella sfera" : ""}">${i + 1}</span>
              <button class="x" data-rm="${i}" aria-label="Rimuovi immagine">×</button></div>`
            )
            .join("")}
        </div>
        ${d.images.length ? `<p class="hint">Trascina le immagini per cambiarne l'ordine.</p>` : ""}
      </div>
    </div>
  `);

  const bind = (id, key) =>
    $(id).addEventListener("input", (e) => {
      d[key] = e.target.value;
      refreshPublish();
    });
  bind("#f-title", "title");
  bind("#f-type", "type");
  bind("#f-client", "client");
  bind("#f-year", "year");
  bind("#f-desc", "description");
  $("#f-cat").addEventListener("change", (e) => {
    d.category = e.target.value;
    refreshPublish();
  });
  const vis = $("#f-vis");
  const toggle = () => {
    d.hidden = !d.hidden;
    renderEditor(p);
  };
  vis.addEventListener("click", toggle);
  vis.addEventListener("keydown", (e) => (e.key === " " || e.key === "Enter") && (e.preventDefault(), toggle()));
  $("#back").addEventListener("click", () => {
    S.view = "projects";
    S.current = null;
    render();
  });
  $("#del").addEventListener("click", () => {
    if (!confirm(`Eliminare “${d.title || "questo progetto"}”? Sparirà dal sito quando premi Pubblica.`)) return;
    S.projects = S.projects.filter((x) => x !== p);
    if (!p.isNew) {
      S.deleted.push(p.path);
      S.deletedSaved = { ...(S.deletedSaved || {}), [p.path]: p.saved };
    }
    S.view = "projects";
    S.current = null;
    render();
  });

  // upload
  const drop = $("#drop");
  const handle = async (files) => {
    drop.classList.add("busy");
    const strong = $("strong", drop);
    const added = await addImages(files, (i, n) => (strong.textContent = `Preparo ${i}/${n}…`));
    drop.classList.remove("busy");
    if (added?.length) {
      d.images.push(...added);
      toast(`${added.length} immagin${added.length === 1 ? "e aggiunta" : "i aggiunte"}`);
    }
    renderEditor(p);
  };
  $("#file").addEventListener("change", (e) => handle(e.target.files));
  ["dragenter", "dragover"].forEach((ev) =>
    drop.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.add("over");
    })
  );
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove("over")));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    handle(e.dataTransfer.files);
  });

  $$("[data-rm]").forEach((b) =>
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      const i = +b.dataset.rm;
      const [rm] = d.images.splice(i, 1);
      if (S.pending.has(rm) && !S.projects.some((x) => x.data.images.includes(rm))) S.pending.delete(rm);
      renderEditor(p);
    })
  );
  if (d.images.length > 1) {
    Sortable.create($("#grid"), {
      animation: 160,
      filter: ".x",
      preventOnFilter: false,
      onEnd: () => {
        d.images = $$(".tile", $("#grid")).map((t) => d.images[+t.dataset.i]);
        renderEditor(p);
      },
    });
  }
}

function renderSettings() {
  const s = S.settings;
  renderShell(`
    <div class="head"><h2>Impostazioni</h2></div>
    <div class="settings">
      <div class="card">
        <h3>Testi</h3>
        ${field("s-name", "Nome", s.name)}
        ${field("s-tagline", "Sottotitolo (sotto il nome)", s.tagline)}
        ${field("s-bio", "Bio (pagina Info)", s.bio, { textarea: true })}
        ${field("s-clients", "Worked on", s.clients.join("\n"), { textarea: true, help: "Una voce per riga" })}
        ${field("s-disciplines", "Discipline", s.disciplines.join("\n"), { textarea: true, help: "Una voce per riga" })}
      </div>
      <div class="card">
        <h3>Contatti</h3>
        ${field("s-availability", "Disponibilità", s.availability, { placeholder: "Es. Open for commissions" })}
        ${field("s-email", "Email", s.email, { type: "email" })}
        ${field("s-instagram", "Instagram", s.instagram, { help: "Solo il nome utente, senza @" })}
        <h3 style="margin-top:8px">Google e social</h3>
        ${field("s-seo_title", "Titolo (tab del browser e Google)", s.seo_title)}
        ${field("s-seo_description", "Descrizione per Google", s.seo_description, { textarea: true })}
        <div class="field"><label>Immagine di anteprima (WhatsApp, Instagram, ecc.) — ideale 1200×630</label>
          <div class="share">${s.share_image ? `<img src="${esc(S.pending.get(s.share_image)?.url || S.localURL.get(s.share_image) || s.share_image)}" alt="">` : ""}
          <label class="btn"><input type="file" id="s-share" accept="image/*" hidden />Cambia immagine</label></div></div>
      </div>
    </div>
  `);
  const bind = (key, list = false) =>
    $(`#s-${key}`).addEventListener("input", (e) => {
      s[key] = list ? e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) : e.target.value;
      refreshPublish();
    });
  ["name", "tagline", "bio", "availability", "email", "instagram", "seo_title", "seo_description"].forEach((k) => bind(k));
  bind("clients", true);
  bind("disciplines", true);
  $("#s-share").addEventListener("change", async (e) => {
    const [path] = (await addImages(e.target.files)) || [];
    if (path) {
      s.share_image = path;
      renderSettings();
    }
  });
}

// aggiorna solo il pulsante Pubblica mentre si scrive (senza ridisegnare i campi)
function refreshPublish() {
  const n = changeCount();
  const b = $("#publish");
  if (!b) return;
  b.disabled = !n;
  b.innerHTML = `Pubblica${n ? ` <span class="n">${n}</span>` : ""}`;
}

addEventListener("beforeunload", (e) => {
  if (changeCount()) e.preventDefault();
});
addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "s") {
    e.preventDefault();
    publish();
  }
});

// ================================================================ avvio

async function start(backend, token) {
  app.innerHTML = `<div class="boot">Caricamento…</div>`;
  try {
    S.backend = backend;
    S.user = await backend.whoami();
    await load();
    if (token) {
      try {
        localStorage.setItem(TOKEN_KEY, token);
      } catch {}
    }
    render();
  } catch (e) {
    console.error(e);
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {}
    const msg =
      e.status === 401
        ? "Token non valido o scaduto."
        : e.status === 403 || e.status === 404
          ? `Questo token non può modificare il repository “${REPO.repo}”. Crea un token classic con la spunta “repo”.`
          : `Non riesco a collegarmi (${e.detail || e.message}).`;
    renderLogin(msg);
  }
}

let saved = null;
try {
  saved = localStorage.getItem(TOKEN_KEY);
} catch {}
if (LOCAL && !new URLSearchParams(location.search).has("github")) start(localBackend());
else if (saved) start(githubBackend(saved), saved);
else renderLogin();
