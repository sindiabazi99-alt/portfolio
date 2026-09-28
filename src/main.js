import "./style.css";
import { PROJECTS, SETTINGS } from "./content.gen.js";

// ---------------------------------------------------------------- config
// testi e contatti arrivano dal CMS (content/settings.json)
const esc = (v = "") =>
  String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const IG = (SETTINGS.instagram || "").replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/$/, "");
const CONTACT = [
  SETTINGS.email && { href: `mailto:${SETTINGS.email}`, text: SETTINGS.email },
  IG && { href: `https://www.instagram.com/${IG}/`, text: `@${IG}` },
].filter(Boolean);

const CATS = [
  { id: "all", label: "All Work", center: SETTINGS.name },
  { id: "covers", label: "Covers" },
  { id: "storyboards", label: "Storyboards" },
  { id: "comics", label: "Comics" },
  { id: "concept", label: "Concept Art" },
  { id: "illustration", label: "Illustration" },
];
const CAT_LABEL = Object.fromEntries(CATS.map((c) => [c.id, c.label]));

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => (t < 0.5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2);
const wrapPI = (a) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));
const pad2 = (n) => String(n).padStart(2, "0");
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------------------------------------------------------------- state
const S = {
  mode: "grid", // grid | sphere | index
  cat: "all",
  W: innerWidth,
  H: innerHeight,
  R: 300,
  yaw: 0,
  pitch: -0.18,
  vYaw: 0,
  vPitch: 0,
  scroll: 0,
  scrollTarget: 0,
  gridH: 0,
  hover: null,
  mx: 0.5,
  my: 0.5,
  started: false,
};

const stage = $("#stage");
const world = $("#world");
const label = $("#label");

// ---------------------------------------------------------------- items
const BASE = 240; // lato lungo del tile in px prima della scala
const items = [];
PROJECTS.forEach((p, pi) => {
  p.index = pi;
  p.images.forEach((im, ii) => {
    const a = im.w / im.h;
    const w = a >= 1 ? BASE : BASE * a;
    const h = a >= 1 ? BASE / a : BASE;
    const el = document.createElement("button");
    el.className = "tile";
    el.style.cssText = `width:${w}px;height:${h}px;margin:${-h / 2}px 0 0 ${-w / 2}px;display:none`;
    el.setAttribute("aria-label", `${p.title} — ${ii + 1}`);
    const img = new Image();
    img.decoding = "async";
    img.alt = "";
    el.append(img);
    const it = { el, img, p, ii, w, h, inGrid: false, inSphere: false, hv: 0, dim: 0, vis: false };
    it.cur = { x: 0, y: S.H, z: -600, a: 0, b: 0, s: 0.2, o: 0 };
    it.hid = { ...it.cur };
    el.addEventListener("pointerenter", () => setHover(it));
    el.addEventListener("pointerleave", () => S.hover === it && setHover(null));
    el.addEventListener("focus", () => setHover(it));
    el.addEventListener("blur", () => S.hover === it && setHover(null));
    el.addEventListener("keydown", (e) => e.key === "Enter" && openProject(p, ii));
    items.push(it);
  });
});

// ordine mescolato ma deterministico, così la sfera/griglia sono "mixate" come nel ref
let seed = 8;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const order = [...items];
for (let i = order.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [order[i], order[j]] = [order[j], order[i]];
}
order.forEach((it) => world.append(it.el));

// ---------------------------------------------------------------- layout
function computeLayout() {
  S.W = innerWidth;
  S.H = innerHeight;
  const mobile = S.W < 760;
  const vis = order.filter((it) => S.cat === "all" || it.p.cat === S.cat);
  items.forEach((it) => (it.inGrid = false));

  // sfera (fibonacci) — in "All" max 8 immagini per progetto, così i tile restano leggibili
  const sph = S.cat === "all" ? vis.filter((it) => it.ii < (mobile ? 5 : 8)) : vis;
  const N = sph.length;
  const R = (S.R = mobile ? Math.min(S.W * 0.5, S.H * 0.32) : Math.min(S.W * 0.5, S.H) * 0.42);
  const tile = Math.min(R * 0.5, Math.sqrt((4 * Math.PI * R * R) / N) * 0.74);
  const ga = Math.PI * (3 - Math.sqrt(5));
  vis.forEach((it) => (it.inGrid = true));
  items.forEach((it) => (it.inSphere = false));
  sph.forEach((it, i) => {
    it.inSphere = true;
    const y = 1 - ((i + 0.5) / N) * 2;
    it.lat = Math.asin(y);
    it.lon = i * ga;
    it.ss = tile / BASE;
  });

  // griglia giustificata
  const pad = mobile ? 14 : 24;
  const gap = mobile ? 5 : 8;
  const top = mobile ? 108 : 96;
  const avail = S.W - pad * 2;
  const rowT = mobile ? 92 : clamp(S.W / 9.5, 110, 180);
  let row = [];
  let sum = 0;
  let y = top;
  const flush = (last) => {
    const rh = last ? Math.min(rowT, (avail - gap * (row.length - 1)) / sum) : (avail - gap * (row.length - 1)) / sum;
    let x = pad;
    row.forEach((it) => {
      const w = (it.w / it.h) * rh;
      it.gx = x + w / 2 - S.W / 2;
      it.gy = y + rh / 2 - S.H / 2;
      it.gs = rh / it.h;
      x += w + gap;
    });
    y += rh + gap;
    row = [];
    sum = 0;
  };
  vis.forEach((it) => {
    row.push(it);
    sum += it.w / it.h;
    if (sum * rowT + gap * (row.length - 1) >= avail) flush(false);
  });
  if (row.length) flush(true);
  S.gridH = y + 70;
  S.scrollTarget = clamp(S.scrollTarget, 0, Math.max(0, S.gridH - S.H));
}

const isOn = (it) => (S.mode === "sphere" ? it.inSphere : S.mode === "grid" ? it.inGrid : false);

function target(it, o) {
  if (!isOn(it)) return Object.assign(o, it.hid);
  if (S.mode === "sphere") {
    const R = S.R;
    const cl = Math.cos(it.lat);
    const lon = it.lon + S.yaw;
    const x = R * cl * Math.sin(lon);
    const y0 = -R * Math.sin(it.lat);
    const z0 = R * cl * Math.cos(lon);
    const cp = Math.cos(S.pitch);
    const sp = Math.sin(S.pitch);
    const y = y0 * cp - z0 * sp;
    const z = y0 * sp + z0 * cp;
    const nz = z / R;
    o.x = x;
    o.y = y;
    o.z = z;
    o.a = Math.atan2(x, z);
    o.b = Math.asin(clamp(-y / R, -1, 1));
    o.s = it.ss;
    o.o = 0.1 + 0.9 * ((nz + 1) / 2) ** 1.6;
    o.front = nz > -0.1;
    return o;
  }
  o.x = it.gx;
  o.y = it.gy - S.scroll;
  o.z = 0;
  o.a = 0;
  o.b = 0;
  o.s = it.gs;
  o.o = 1;
  o.front = true;
  return o;
}

// transizione: ogni tile interpola dallo stato corrente al layout nuovo (che resta "vivo", es. la sfera ruota)
function transition({ dur = 1500, stagger = 420 } = {}) {
  const now = performance.now();
  items.forEach((it) => {
    it.from = { ...it.cur };
    if (!isOn(it)) {
      const c = it.cur;
      it.hid = { x: c.x * 0.35, y: c.y * 0.35 + 40, z: c.z - 700, a: c.a, b: c.b, s: c.s * 0.5, o: 0 };
    }
    it.t0 = now + (reduced ? 0 : rand() * stagger);
    it.dur = reduced ? 1 : dur;
  });
}

// ---------------------------------------------------------------- loop
const tmp = {};
let last = performance.now();
function frame(now) {
  const dt = Math.min(50, now - last);
  last = now;

  // rotazione sfera: auto + inerzia drag
  if (!drag.active) {
    S.vYaw = lerp(S.vYaw, reduced ? 0 : 0.00022, 0.02);
    S.vPitch *= 0.92;
  }
  S.yaw += S.vYaw * dt;
  const pitchRest = -0.16 + (S.my - 0.5) * 0.35;
  S.pitch = clamp(drag.active ? S.pitch : lerp(S.pitch + S.vPitch * dt, pitchRest, 0.02), -0.9, 0.9);

  // scroll griglia
  S.scroll = lerp(S.scroll, S.scrollTarget, 0.1);

  const hp = S.hover?.p;
  for (const it of items) {
    const t = target(it, tmp);
    const c = it.cur;
    let k = 1;
    if (it.from) {
      k = easeInOut(clamp((now - it.t0) / it.dur, 0, 1));
      const f = it.from;
      c.x = lerp(f.x, t.x, k);
      c.y = lerp(f.y, t.y, k);
      c.z = lerp(f.z, t.z, k);
      c.a = lerp(f.a, f.a + wrapPI(t.a - f.a), k);
      c.b = lerp(f.b, t.b, k);
      c.s = lerp(f.s, t.s, k);
      c.o = lerp(f.o, t.o, k);
      if (k >= 1) it.from = null;
    } else {
      Object.assign(c, t);
    }

    // hover: stesso progetto in evidenza, il resto sfuma
    it.hv = lerp(it.hv, S.hover === it ? 1 : 0, 0.15);
    it.dim = lerp(it.dim, hp && it.p !== hp ? 1 : 0, 0.12);

    const s = c.s * (1 + it.hv * (S.mode === "sphere" ? 0.22 : 0.05));
    const op = c.o * (1 - it.dim * 0.72);
    const onScreen = Math.abs(c.y) < S.H / 2 + 260 && Math.abs(c.x) < S.W / 2 + 260;
    const vis = op > 0.01 && onScreen;
    if (vis !== it.vis) {
      it.vis = vis;
      it.el.style.display = vis ? "" : "none";
    }
    if (!vis) continue;
    const zb = it.hv * (S.mode === "sphere" ? 40 : 1);
    it.el.style.transform = `translate3d(${c.x.toFixed(2)}px,${c.y.toFixed(2)}px,${(c.z + zb).toFixed(2)}px) rotateY(${c.a.toFixed(4)}rad) rotateX(${c.b.toFixed(4)}rad) scale(${s.toFixed(4)})`;
    it.el.style.opacity = op.toFixed(3);
    it.el.style.pointerEvents = k >= 1 && t.front && S.mode !== "index" ? "auto" : "none";
  }

  cursorFrame();
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- modes & filters
const statusEl = $("#status");
function setStatus(txt) {
  statusEl.textContent = txt;
}
function defaultStatus() {
  if (S.mode === "sphere") return "Drag to rotate — click to open";
  if (S.mode === "grid") return "Scroll to explore — click to open";
  return `${PROJECTS.length} projects`;
}

function setMode(mode, { silent } = {}) {
  if (mode === S.mode && S.started) return;
  const prev = S.mode;
  S.mode = mode;
  document.body.dataset.mode = mode;
  if (mode === "grid" && prev !== "grid") {
    S.scroll = S.scrollTarget = 0;
  }
  $$("#views button").forEach((b) => b.setAttribute("aria-selected", b.dataset.mode === mode));
  label.classList.toggle("hide", mode !== "sphere");
  $("#index").classList.toggle("on", mode === "index");
  stage.style.cursor = mode === "sphere" ? "grab" : "";
  if (!silent) transition(mode === "index" ? { dur: 900, stagger: 250 } : undefined);
  setStatus(defaultStatus());
  if (!silent && S.started) {
    try {
      localStorage.setItem("sa-mode", mode === "index" ? "sphere" : mode);
    } catch {}
  }
}

function setCat(cat) {
  S.cat = cat;
  $$("#cats button").forEach((b) => b.setAttribute("aria-selected", b.dataset.cat === cat));
  const c = CATS.find((x) => x.id === cat);
  const n = cat === "all" ? items.length : items.filter((it) => it.p.cat === cat).length;
  $("#label-text").textContent = c.center || c.label;
  $("#label-count").textContent = n;
  S.scrollTarget = 0;
  computeLayout();
  if (S.mode === "index") setMode("sphere");
  else transition({ dur: 1300, stagger: 360 });
  renderIndex();
}

// ---------------------------------------------------------------- UI build
const catsEl = $("#cats");
CATS.forEach((c) => {
  const n = c.id === "all" ? items.length : items.filter((it) => it.p.cat === c.id).length;
  if (!n) return;
  const b = document.createElement("button");
  b.dataset.cat = c.id;
  b.setAttribute("role", "tab");
  b.innerHTML = `${c.label}<sup>${n}</sup>`;
  b.addEventListener("click", () => setCat(c.id));
  catsEl.append(b);
});
$$("#views button").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
$("#year").textContent = new Date().getFullYear();

const contactEl = $("#contact");
contactEl.innerHTML =
  (SETTINGS.availability ? `<li>${esc(SETTINGS.availability)}</li>` : "") +
  CONTACT.map((c) => `<li><a href="${esc(c.href)}" target="_blank" rel="noopener">${esc(c.text)}</a></li>`).join("");
const list = (el, arr) => ($(el).innerHTML = (arr || []).map((x) => `<li>${esc(x)}</li>`).join(""));
list("#clients", SETTINGS.clients);
list("#disciplines", SETTINGS.disciplines);

// index
const indexList = $("#index-list");
const peek = $("#peek");
const peekImg = $("img", peek);
let peekP = null;
let peekTimer = 0;
function renderIndex() {
  const list = PROJECTS.filter((p) => S.cat === "all" || p.cat === S.cat);
  indexList.innerHTML = list
    .map(
      (p, i) => `<li><button data-slug="${p.slug}" style="--d:${i * 45}ms">
        <span class="n">${pad2(p.index + 1)}</span>
        <span class="c">${CAT_LABEL[p.cat]}</span>
        <span class="t">${esc(p.title)}</span>
        <span class="k">${esc(p.kind)}${p.client ? ` — ${esc(p.client)}` : ""}</span>
        <span class="q">${pad2(p.images.length)}</span>
      </button></li>`
    )
    .join("");
  $$("button", indexList).forEach((b) => {
    const p = PROJECTS.find((x) => x.slug === b.dataset.slug);
    b.addEventListener("click", () => openProject(p, 0));
    b.addEventListener("pointerenter", () => {
      peekP = p;
      let i = 0;
      peekImg.src = p.images[0].thumb;
      peek.classList.add("on");
      clearInterval(peekTimer);
      peekTimer = setInterval(() => {
        i = (i + 1) % p.images.length;
        peekImg.src = p.images[i].thumb;
      }, 420);
    });
    b.addEventListener("pointerleave", () => {
      peekP = null;
      peek.classList.remove("on");
      clearInterval(peekTimer);
    });
  });
}

// ---------------------------------------------------------------- cursor
const cursor = $("#cursor");
const pill = $("#cursor-pill");
const cur = { x: -100, y: -100, tx: -100, ty: -100, px: -100, py: -100 };
function setHover(it) {
  S.hover = it;
  if (it) {
    pill.innerHTML = `${esc(it.p.title)}<em>${esc(it.p.kind)}</em>`;
    cursor.classList.add("on");
    setStatus(`${pad2(it.p.index + 1)} — ${it.p.title} · ${pad2(it.ii + 1)}/${pad2(it.p.images.length)}`);
  } else {
    cursor.classList.remove("on");
    setStatus(defaultStatus());
  }
}
function cursorFrame() {
  cur.x = lerp(cur.x, cur.tx, 0.35);
  cur.y = lerp(cur.y, cur.ty, 0.35);
  cursor.style.transform = `translate3d(${cur.x}px,${cur.y}px,0)`;
  if (peekP) {
    cur.px = lerp(cur.px, cur.tx + 24, 0.14);
    cur.py = lerp(cur.py, cur.ty - 120, 0.14);
    peek.style.transform = `translate3d(${Math.min(cur.px, S.W - 240)}px,${cur.py}px,0)`;
  }
}
addEventListener("pointermove", (e) => {
  cur.tx = e.clientX;
  cur.ty = e.clientY;
  S.mx = e.clientX / S.W;
  S.my = e.clientY / S.H;
});

// ---------------------------------------------------------------- input (drag / wheel / touch)
const drag = { active: false, x: 0, y: 0, sx: 0, sy: 0, moved: 0, t: 0, target: null, id: null };
stage.addEventListener("pointerdown", (e) => {
  if (e.button !== 0 && e.pointerType === "mouse") return;
  drag.active = true;
  drag.x = drag.sx = e.clientX;
  drag.y = drag.sy = e.clientY;
  drag.moved = 0;
  drag.t = performance.now();
  drag.target = items.find((it) => it.el === e.target.closest(".tile")) || null;
  drag.id = e.pointerId;
  stage.setPointerCapture(e.pointerId);
  if (S.mode === "sphere") stage.classList.add("dragging");
});
stage.addEventListener("pointermove", (e) => {
  if (!drag.active || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x;
  const dy = e.clientY - drag.y;
  const dtt = Math.max(1, performance.now() - drag.t);
  drag.x = e.clientX;
  drag.y = e.clientY;
  drag.t = performance.now();
  drag.moved += Math.abs(dx) + Math.abs(dy);
  if (S.mode === "sphere") {
    S.yaw += dx * 0.0055;
    S.pitch = clamp(S.pitch - dy * 0.004, -0.9, 0.9);
    S.vYaw = (dx * 0.0055) / dtt;
    S.vPitch = (-dy * 0.004) / dtt;
  } else if (S.mode === "grid") {
    S.scrollTarget = clamp(S.scrollTarget - dy * (e.pointerType === "touch" ? 1.6 : 1), 0, Math.max(0, S.gridH - S.H));
    drag.vy = -dy / dtt;
  }
});
const endDrag = (e) => {
  if (!drag.active || e.pointerId !== drag.id) return;
  drag.active = false;
  stage.classList.remove("dragging");
  if (S.mode === "grid" && drag.vy) {
    S.scrollTarget = clamp(S.scrollTarget + drag.vy * 260, 0, Math.max(0, S.gridH - S.H));
    drag.vy = 0;
  }
  if (drag.moved < 6 && drag.target && e.type === "pointerup") openProject(drag.target.p, drag.target.ii);
};
stage.addEventListener("pointerup", endDrag);
stage.addEventListener("pointercancel", endDrag);

addEventListener(
  "wheel",
  (e) => {
    if (viewerOpen || infoOpen || S.mode === "index") return;
    e.preventDefault();
    const d = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
    if (S.mode === "grid") S.scrollTarget = clamp(S.scrollTarget + d, 0, Math.max(0, S.gridH - S.H));
    else S.vYaw += d * 0.00002 + (e.deltaX || 0) * 0.00002;
  },
  { passive: false }
);

// ---------------------------------------------------------------- viewer
const viewer = $("#viewer");
let viewerOpen = false;
function openProject(p, at = 0) {
  if (location.hash !== `#/${p.slug}`) {
    history.pushState(null, "", `#/${p.slug}`);
  }
  renderViewer(p, at);
}
function renderViewer(p, at = 0) {
  const next = PROJECTS[(p.index + 1) % PROJECTS.length];
  const portrait = p.images.filter((im) => im.h > im.w).length > p.images.length / 2 && p.images.length > 2;
  viewer.innerHTML = `
    <div class="v-head">
      <a class="brand" href="#/">SINDI ABAZI</a>
      <span class="count hide-m">${pad2(p.index + 1)} / ${pad2(PROJECTS.length)}</span>
      <span class="count hide-m">${CAT_LABEL[p.cat]}</span>
      <button class="link" data-close>Close</button>
    </div>
    <div class="v-body">
      <div class="v-meta v-reveal">
        <h1 class="v-title">${p.title.split(" ").map((w) => `<span class="w">${esc(w)}</span>`).join(" ")}</h1>
        <dl>
          ${p.kind ? `<dt>Type</dt><dd>${esc(p.kind)}</dd>` : ""}
          ${p.client ? `<dt>Client</dt><dd>${esc(p.client)}</dd>` : ""}
          ${p.year ? `<dt>Year</dt><dd>${esc(p.year)}</dd>` : ""}
          <dt>Images</dt><dd>${pad2(p.images.length)}</dd>
        </dl>
        ${p.note ? `<p>${esc(p.note)}</p>` : ""}
      </div>
      <div class="v-imgs v-reveal ${portrait ? "portrait" : ""}">
        ${p.images
          .map(
            (im, i) => `<figure style="aspect-ratio:${im.w}/${im.h}" data-i="${i}">
              <img src="${im.src}" alt="${esc(p.title)} — ${i + 1}" loading="${i < 4 || i === at ? "eager" : "lazy"}" decoding="async" width="${im.w}" height="${im.h}">
              <figcaption>${pad2(i + 1)}</figcaption></figure>`
          )
          .join("")}
      </div>
    </div>
    <button class="v-next" data-next="${next.slug}"><span>Next project — ${pad2(next.index + 1)}</span><strong>${esc(next.title)}</strong></button>`;
  $$("img", viewer).forEach((img) => {
    if (img.complete) img.classList.add("loaded");
    else img.addEventListener("load", () => img.classList.add("loaded"), { once: true });
  });
  $("[data-next]", viewer).addEventListener("click", () => {
    viewer.scrollTo({ top: 0 });
    openProject(next, 0);
  });
  $("[data-close]", viewer).addEventListener("click", closeViewer);
  viewer.setAttribute("aria-hidden", "false");
  viewer.dataset.slug = p.slug;
  if (!viewerOpen) {
    viewer.scrollTop = 0;
    requestAnimationFrame(() => viewer.classList.add("on"));
  }
  viewerOpen = true;
  fitTitle();
  setHover(null);
  if (at > 0) {
    const fig = $(`figure[data-i="${at}"]`, viewer);
    setTimeout(() => viewer.scrollTo({ top: fig.offsetTop - 80, behavior: "smooth" }), 700);
  }
}
// garantisce che la parola più lunga del titolo stia nella colonna
function fitTitle() {
  const t = $(".v-title", viewer);
  if (!t) return;
  t.style.fontSize = "";
  let size = parseFloat(getComputedStyle(t).fontSize);
  const words = $$(".w", t);
  const tooWide = () => words.some((w) => w.offsetWidth > t.clientWidth + 1);
  while (tooWide() && size > 24) {
    size -= 2;
    t.style.fontSize = size + "px";
  }
}
addEventListener("resize", () => viewerOpen && fitTitle());
document.fonts?.ready.then(() => viewerOpen && fitTitle());

function closeViewer() {
  if (location.hash.length > 2) history.pushState(null, "", location.pathname);
  hideViewer();
}
function hideViewer() {
  viewerOpen = false;
  viewer.classList.remove("on");
  viewer.setAttribute("aria-hidden", "true");
}
function route() {
  const slug = location.hash.replace(/^#\/?/, "");
  const p = PROJECTS.find((x) => x.slug === slug);
  if (p && viewerOpen && viewer.dataset.slug === slug) return;
  if (p) renderViewer(p, 0);
  else if (viewerOpen) hideViewer();
}
addEventListener("popstate", route);
addEventListener("hashchange", route);

// ---------------------------------------------------------------- info
const info = $("#info");
let infoOpen = false;
function toggleInfo(on) {
  infoOpen = on;
  info.classList.toggle("on", on);
  info.setAttribute("aria-hidden", String(!on));
}
$("#info-btn").addEventListener("click", () => toggleInfo(true));
$("[data-close]", info).addEventListener("click", () => toggleInfo(false));

addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (infoOpen) toggleInfo(false);
    else if (viewerOpen) closeViewer();
  }
  if (viewerOpen || infoOpen || e.target.closest?.("input,textarea")) return;
  if (e.key === "s") setMode("sphere");
  if (e.key === "g") setMode("grid");
  if (e.key === "i") setMode("index");
});

$(".brand").addEventListener("click", (e) => {
  e.preventDefault();
  if (viewerOpen) closeViewer();
  if (S.cat !== "all") setCat("all");
  setMode("sphere");
});

let rz = 0;
addEventListener("resize", () => {
  cancelAnimationFrame(rz);
  rz = requestAnimationFrame(computeLayout);
});

// ---------------------------------------------------------------- boot
async function boot() {
  const num = $("#loader-num");
  let done = 0;
  const total = items.length;
  const load = (it) =>
    new Promise((res) => {
      it.img.onload = it.img.onerror = () => {
        done++;
        num.textContent = String(Math.round((done / total) * 100)).padStart(3, "0");
        res();
      };
      it.img.src = it.p.images[it.ii].thumb;
    });
  // non blocchiamo più di ~4s sul caricamento
  await Promise.race([Promise.all(order.map(load)), new Promise((r) => setTimeout(r, 4000))]);
  num.textContent = "100";

  computeLayout();
  setCat("all");
  renderIndex();
  // intro come nel ref: prima la griglia, poi il morph in sfera
  items.forEach((it) => {
    const c = it.cur;
    c.x = it.gx;
    c.y = it.gy + S.H * 0.6;
    c.z = -300;
    c.s = it.gs * 0.9;
    c.o = 0;
  });
  setMode("grid", { silent: true });
  transition({ dur: 1400, stagger: 700 });
  S.started = true;
  requestAnimationFrame((t) => {
    last = t;
    frame(t);
  });
  $("#loader").classList.add("done");
  setTimeout(() => document.body.classList.add("ready"), 500);

  let saved = "sphere";
  try {
    saved = localStorage.getItem("sa-mode") || "sphere";
  } catch {}
  if (location.hash.length > 2) route();
  if (saved === "sphere") setTimeout(() => S.mode === "grid" && S.scroll < 5 && setMode("sphere"), 2600);
}
boot();
