import {
  LIMITS, STATUSES, WEEKDAYS, WEEKDAYS_SHORT, addDays, buildContext, buildCsv, buildExport, buildPeriod,
  capitalize, clampToPeriod, computeStats, dayNumber, dropLoad, exerciseModes, firstPeriodDayOfMonth,
  formatClock, formatDateFr, formatKg, formatLongFr, formatPercent, groupRuns, inPeriod, modeText, monthGrid,
  monthLabelFr, monthsOfPeriod, parseDecimalInput, planFor, restSeconds, shortDate, todayInTZ, usesRM,
  validateEntry, validateImport, weekLabel, weekNumber, weekdayIndex, workingLoad, periodEnd, checkProgram,
} from "./core.js";
import { askPersistence, createLocalStore, loadProfile, saveProfile } from "./store.js";
import { CONFIG, PROGRAM } from "./data.js";
import { HYSTERESIS, Spring, VelocityTracker, clamp, haptic, project, reducedMotion, rubberband } from "./motion.js";

const $ = (sel, root = document) => root.querySelector(sel);
const app = $("#app");
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const isDesktop = () => matchMedia("(min-width: 980px)").matches;

const svg = (inner) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;
const ICON = {
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  cross: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  pause: svg('<path d="M9 6v12M15 6v12"/>'),
  play: svg('<path d="M8 5.5l10.5 6.5L8 18.5z"/>'),
  timer: svg('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9.5 2.5h5"/>'),
  dumbbell: svg('<path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11"/>'),
  calendar: svg('<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
  left: svg('<path d="M15 5l-7 7 7 7"/>'),
  right: svg('<path d="M9 5l7 7-7 7"/>'),
};
const ST = {
  "Fait": { cls: "done", icon: ICON.check, short: "Fait" },
  "Non fait": { cls: "missed", icon: ICON.cross, short: "Non fait" },
  "Repos / annulé": { cls: "rest", icon: ICON.pause, short: "Pause" },
};
const fmtShort = (iso) =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

function weekRange(monday) {
  const sunday = addDays(monday, 6);
  if (monday.slice(0, 7) === sunday.slice(0, 7)) return `${dayNumber(monday)} – ${fmtShort(sunday)}`;
  return `${fmtShort(monday)} – ${fmtShort(sunday)}`;
}

/* ------------------------------------------------------------------ état */
const S = {
  store: null, config: null, program: null, ctx: null, start: null, end: null, tz: "Europe/Paris",
  period: [], months: [], today: "", selected: "", calMonth: "", tab: "seances", calMode: "frise",
  scope: "all", modal: null, timer: null, timerClosing: false, tick: null, friseLeft: null, opener: null,
  userEmail: "", gesture: false, renderPending: false, suppressClickUntil: 0,
  weekNav: { prev: false, next: false }, weekCommit: 0,
};

const dayStatus = (iso) => (S.store ? S.store.get(`day:${iso}`) : null);
const dayStatuses = () => {
  const out = {};
  if (!S.store) return out;
  for (const [k, e] of S.store.all()) if (k.startsWith("day:") && e.v) out[k.slice(4)] = e.v;
  return out;
};

/* ------------------------------------------------------------------ confirmation (HUD) */
let toastTimer = null;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
}

/* ------------------------------------------------------------------ démarrage */
const isStandalone = () => navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
const BACKUP_NAME = "salle-sauvegarde.json";

function boot() {
  const errors = checkProgram(PROGRAM);
  if (errors.length) {
    app.innerHTML = `<div class="auth"><div class="auth-card"><div class="auth-logo">${ICON.dumbbell}</div><h1 class="t-large">Salle</h1>
      <p class="t-sub">Le programme (js/data.js) contient une erreur :<br>${errors.map(esc).join("<br>")}</p></div></div>`;
    return;
  }
  const profile = loadProfile();
  startApp({
    config: { ...CONFIG, end: periodEnd(CONFIG.start), firstName: profile.firstName, goal: profile.goal },
    program: PROGRAM,
  });
  askPersistence();
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

function startApp(data) {
  Object.assign(S, {
    config: data.config, program: data.program, start: data.config.start, end: data.config.end,
    tz: data.config.timezone || "Europe/Paris", userEmail: "", tab: "seances", calMode: "frise",
    scope: "all", friseLeft: null, modal: null, timer: null, weekCommit: 0,
  });
  S.ctx = buildContext(S.program, S.start);
  S.period = buildPeriod(S.start);
  S.months = monthsOfPeriod(S.start);
  S.today = todayInTZ(S.tz);
  S.selected = clampToPeriod(S.today, S.start);
  S.calMonth = S.selected.slice(0, 7);
  document.title = S.config.appName || "Salle";
  S.store = createLocalStore({
    onChange: () => { if (S.store) renderAll(); },
    onError: (msg) => toast(msg),
  });
  renderShell();
  renderAll();
}

/* ------------------------------------------------------------------ contrôle segmenté */
const segSprings = new Map();

function segHTML(id, label, action, attr, items, current) {
  const idx = Math.max(0, items.findIndex((it) => it.value === current));
  return `<div class="seg" id="${id}" role="group" aria-label="${esc(label)}" style="--n:${items.length}" data-index="${idx}">
    <span class="seg-thumb" aria-hidden="true"></span>
    ${items.map((it) => `<button class="press" data-action="${action}" data-${attr}="${esc(it.value)}" aria-pressed="${it.value === current}">${it.label}</button>`).join("")}
  </div>`;
}

function syncSegments() {
  for (const seg of document.querySelectorAll(".seg[id]")) {
    const id = seg.id;
    const idx = Number(seg.dataset.index) || 0;
    let sp = segSprings.get(id);
    if (!sp) {
      sp = new Spring(idx, {
        onUpdate: (v) => {
          const t = document.querySelector(`#${id} .seg-thumb`);
          if (t) t.style.transform = `translateX(${v * 100}%)`;
        },
      });
      segSprings.set(id, sp);
    }
    if (sp.target !== idx) {
      if (reducedMotion()) sp.set(idx);
      else sp.to(idx, { damping: 1, response: 0.3, precision: 0.002 });
    }
    const t = seg.querySelector(".seg-thumb");
    if (t) t.style.transform = `translateX(${sp.value * 100}%)`;
  }
}

/* ------------------------------------------------------------------ coque */
function renderShell() {
  const initial = (S.config.firstName || "S").charAt(0).toUpperCase();
  app.innerHTML = `<div class="shell">
    <header class="topbar" id="topbar">
      <div class="brand"><span class="brand-mark">${ICON.dumbbell}</span><span>${esc(S.config.appName || "Salle")}</span></div>
      <nav class="tabs" aria-label="Navigation principale" id="tabs-host"></nav>
      <div class="top-right">
        <button class="avatar press" data-action="open-settings" aria-label="Réglages et sauvegarde">${esc(initial)}</button>
      </div>
    </header>
    <div class="layout">
      <main id="view" tabindex="-1"></main>
      <aside class="side" id="side" aria-label="Résumé"></aside>
    </div>
    <footer class="foot t-foot">Suivi du ${esc(formatDateFr(S.start))} au ${esc(formatDateFr(S.end))} ·
      <button class="link" data-action="open-settings">Sauvegarde et réglages</button></footer>
  </div>
  <nav class="bottombar" aria-label="Navigation principale">
    <button data-action="tab" data-tab="seances">${ICON.dumbbell}<span>Séances</span></button>
    <button data-action="tab" data-tab="calendrier">${ICON.calendar}<span>Calendrier</span></button>
  </nav>`;
  onScroll();
}

function renderAll() {
  if (!S.store || !$("#view")) return;
  if (S.gesture) { S.renderPending = true; return; }
  S.renderPending = false;
  $("#tabs-host").innerHTML = segHTML("seg-tabs", "Onglets", "tab", "tab", [
    { value: "seances", label: `${ICON.dumbbell} Séances` },
    { value: "calendrier", label: `${ICON.calendar} Calendrier` },
  ], S.tab);
  renderView();
  renderSide();
  for (const b of document.querySelectorAll(".bottombar [data-action=tab]")) {
    if (b.dataset.tab === S.tab) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  }
  syncSegments();
}

function renderView() {
  const view = $("#view");
  const prevFrise = $("#frise");
  if (prevFrise) S.friseLeft = prevFrise.scrollLeft;
  view.innerHTML = S.tab === "seances" ? seancesHTML() : calendrierHTML();
  if (S.tab === "seances") {
    paintWeek(weekSpring.value);
    attachWeekGesture();
  }
  if (S.tab === "calendrier" && S.calMode === "frise") afterFriseRender();
}

/* ------------------------------------------------------------------ onglet Séances */
function greetingHTML() {
  const g = S.config.goal;
  const name = S.config.firstName ? ` ${esc(S.config.firstName)}` : "";
  const num = (n) => String(n).replace(".", ",");
  return `<section class="page-head"><h1 class="t-large">Bonjour${name}</h1>${
    g ? `<p class="t-sub">Objectif : ${num(g.from)} → ${num(g.to)} kg</p>` : ""
  }</section>`;
}

function backupDue() {
  const m = S.store.meta();
  if (!m.lastChange || (m.lastBackup && m.lastBackup >= m.lastChange)) return null;
  if (!m.lastBackup) return S.store.size() >= 3 ? "Aucune sauvegarde pour l'instant" : null;
  const days = Math.floor((Date.now() - m.lastBackup) / 86400000);
  return days >= 7 ? `Dernière sauvegarde il y a ${days} jours` : null;
}

function bannersHTML() {
  let out = "";
  if (!isStandalone()) {
    out += `<section class="banner group"><p class="t-headline">Ajoute Salle à ton écran d'accueil</p>
      <p class="t-sub">Dans Safari : Partager, puis « Sur l'écran d'accueil ». Ensuite, ouvre toujours Salle depuis l'icône : c'est là que tes données sont gardées.</p></section>`;
  }
  const due = backupDue();
  if (due) {
    out += `<section class="banner group warn"><p class="t-headline">${esc(due)}</p>
      <p class="t-sub">Garde une copie dans l'app Fichiers pour ne rien perdre.</p>
      <button class="btn small filled press" data-action="backup">Sauvegarder dans Fichiers</button></section>`;
  }
  return out;
}

function markButton(iso) {
  const st = dayStatus(iso);
  if (!st) return `<button class="btn filled press mark-btn" data-action="open-day" data-date="${iso}">Pointer ma séance</button>`;
  return `<button class="btn press mark-btn" data-st="${esc(st)}" data-action="open-day" data-date="${iso}">${ST[st].icon} ${esc(st)}</button>`;
}

function weekPageHTML(monday, live) {
  const cells = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(monday, i);
    const st = dayStatus(d);
    const ok = inPeriod(d, S.start);
    const ind = st ? `<span class="ind ${ST[st].cls}">${ST[st].icon}</span>` : `<span class="ind"><span class="dot"></span></span>`;
    const inner = `<span class="ab">${WEEKDAYS_SHORT[i]}</span><span class="nb">${dayNumber(d)}</span>${ind}`;
    if (!live) {
      cells.push(`<div class="wd-ghost ${ok ? "" : "off"}">${inner}</div>`);
      continue;
    }
    cells.push(`<button class="wd press ${d === S.today ? "today" : ""}" data-action="select-day" data-date="${d}" aria-pressed="${d === S.selected}" ${ok ? "" : "disabled"}
      aria-label="${esc(capitalize(formatLongFr(d)))}${st ? `, ${esc(st)}` : ""}${d === S.today ? ", aujourd'hui" : ""}">${inner}</button>`);
  }
  return `<div class="week-page" ${live ? "" : 'aria-hidden="true"'}>${cells.join("")}</div>`;
}

function seancesHTML() {
  const iso = S.selected;
  const plan = planFor(S.program, iso);
  const isToday = iso === S.today;
  const n = plan.exercises.length;
  const wi = weekdayIndex(iso);
  const monday = addDays(iso, -wi);
  S.weekNav = { prev: addDays(monday, -1) >= S.start, next: addDays(monday, 7) <= S.end };

  const heroMeta = plan.isRest ? "Jour de repos" : `${n} exercice${n > 1 ? "s" : ""}`;
  const finish = dayStatus(iso) === "Fait"
    ? `<button class="btn wide press" data-action="open-day" data-date="${iso}">${ICON.check} Séance faite · corriger</button>`
    : `<button class="btn filled wide press" data-action="finish">${ICON.check} Séance terminée</button>`;
  const anchor = weekLabel(monday < S.start ? S.start : monday, S.start);

  return `${bannersHTML()}${greetingHTML()}
    <section class="hero group">
      <p class="t-eyebrow">${isToday ? "Aujourd'hui" : esc(formatLongFr(iso))}</p>
      <h2 class="t-title1">${WEEKDAYS[wi]}</h2>
      <p class="title">${esc(plan.title)}</p>
      <p class="meta t-sub">${heroMeta}</p>
      ${markButton(iso)}
    </section>
    <section class="week" aria-label="Semaine">
      <div class="week-head">
        <span class="wk"><span class="t-eyebrow">${esc(anchor)}</span><span class="t-sub">${esc(weekRange(monday))}</span></span>
        <button class="btn small plain press" data-action="go-today" ${iso === clampToPeriod(S.today, S.start) ? "disabled" : ""}>Aujourd'hui</button>
        <button class="chev press" data-action="week-prev" aria-label="Semaine précédente" ${S.weekNav.prev ? "" : "disabled"}>${ICON.left}</button>
        <button class="chev press" data-action="week-next" aria-label="Semaine suivante" ${S.weekNav.next ? "" : "disabled"}>${ICON.right}</button>
      </div>
      <div class="week-viewport" id="week-viewport">
        <div class="week-track" id="week-track">
          ${weekPageHTML(addDays(monday, -7), false)}${weekPageHTML(monday, true)}${weekPageHTML(addDays(monday, 7), false)}
        </div>
      </div>
    </section>
    ${plan.isRest
      ? `<section class="rest-day group"><h3 class="t-headline">Jour de repos</h3><p class="t-sub">Rien de prévu ce jour-là. Tu peux quand même le pointer.</p></section>`
      : `<p class="t-eyebrow section-title">Exercices</p>
         <section class="exlist group" aria-label="Exercices">${plan.exercises.map(exerciseHTML).join("")}</section>${finish}`}`;
}

function exerciseHTML(ex, i) {
  const rs = restSeconds(ex.rest);
  const modes = exerciseModes(ex);
  let loadBtn = "";
  let dropLine = "";
  if (modes.length) {
    const body = S.store.get(`body:${ex.id}`);
    loadBtn = `<button class="pill press" data-action="edit-body" data-id="${esc(ex.id)}"><small>Mon réglage</small><b>${esc(modeText(body))}</b></button>`;
  } else if (usesRM(ex)) {
    const load = workingLoad(S.store.get(`rm:${ex.id}`), ex.percent);
    loadBtn = `<button class="pill press" data-action="edit-rm" data-id="${esc(ex.id)}"><small>${formatPercent(ex.percent)} du 1RM</small><b>${
      load == null ? "Renseigner" : esc(formatKg(load))
    }</b></button>`;
  }
  if (ex.drop) {
    const load = usesRM(ex) ? workingLoad(S.store.get(`rm:${ex.id}`), ex.percent) : null;
    const dl = load != null ? dropLoad(load, ex.dropPercent) : null;
    const cut = typeof ex.dropPercent === "number" ? `baisse de ${formatPercent(ex.dropPercent)}` : "";
    dropLine = `<p class="ex-drop">Dropset à l'échec${dl != null ? ` : <b>${esc(formatKg(dl))}</b>` : ""}${cut ? ` · ${cut}` : ""}</p>`;
  }
  const restBtn = rs
    ? `<button class="pill rest-btn press" data-action="timer" data-id="${esc(ex.id)}" aria-label="Lancer le minuteur de repos : ${esc(ex.rest)}">${ICON.timer}<b>${esc(ex.rest)}</b></button>`
    : "";
  const actions = [restBtn, loadBtn].filter(Boolean);
  const showMethod = ex.method && !(usesRM(ex) && /%/.test(ex.method));
  return `<article class="ex">
    <span class="ex-num" aria-hidden="true">${i + 1}</span>
    <div><h3>${esc(ex.name)}</h3>
      <p class="ex-reps"><strong>${esc(ex.reps)}</strong>${showMethod ? `<span aria-hidden="true">·</span><span>${esc(ex.method)}</span>` : ""}${ex.drop ? '<span class="badge">DROPSET</span>' : ""}</p>
      ${dropLine}
      ${actions.length ? `<div class="ex-actions">${actions.join("")}</div>` : ""}
    </div>
  </article>`;
}

/* ----- bande de semaine : suit le doigt, élan projeté, résistance aux bords ----- */
const weekSpring = new Spring(0, { onUpdate: (x) => paintWeek(x) });

function paintWeek(x) {
  const track = $("#week-track");
  const vp = $("#week-viewport");
  if (!track || !vp) return;
  const W = vp.clientWidth;
  let shown = x;
  if (x > 0 && !S.weekNav.prev) shown = rubberband(x, W);
  else if (x < 0 && !S.weekNav.next) shown = -rubberband(-x, W);
  shown = clamp(shown, -W, W);
  track.style.transform = `translate3d(${-W + shown}px,0,0)`;
}

function shiftWeek(dir) {
  S.selected = clampToPeriod(addDays(S.selected, 7 * dir), S.start);
  weekSpring.stop();
  weekSpring.value = 0;
  weekSpring.target = 0;
  weekSpring.velocity = 0;
  S.weekCommit = 0;
  renderAll();
}

function commitWeek(dir, velocity = 0) {
  const vp = $("#week-viewport");
  if (!vp || reducedMotion()) {
    shiftWeek(dir);
    const t = $("#week-track");
    if (t && t.animate) t.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 180, easing: "ease-out" });
    return;
  }
  if (S.weekCommit && weekSpring.running) {
    if (S.weekCommit === -dir) {
      // Changement d'avis en plein vol : on repart vers la semaine actuelle sans casser la vitesse.
      S.weekCommit = 0;
      weekSpring.to(0, { damping: 1, response: 0.32, precision: 0.5 });
      return;
    }
    shiftWeek(S.weekCommit); // la première page se termine, la suivante enchaîne
    if ((dir > 0 && !S.weekNav.next) || (dir < 0 && !S.weekNav.prev)) return;
  }
  const W = $("#week-viewport").clientWidth;
  S.weekCommit = dir;
  weekSpring.to(-dir * W, { damping: 1, response: 0.32, velocity, precision: 0.5, onRest: () => shiftWeek(dir) });
}

/**
 * Glissement générique sur un axe : seuil de 10 px avant de s'engager, abandon si le geste
 * part dans l'autre axe, suivi 1:1 depuis la valeur affichée, vitesse transmise au relâchement.
 * Les mouvements sont écoutés sur la fenêtre pour ne jamais perdre le doigt.
 */
function attachDrag(el, { axis = "y", filterStart, shouldLock, onStart, onMove, onEnd }) {
  el.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const info = filterStart ? filterStart(e) : {};
    if (info === false) return;
    const id = e.pointerId, sx = e.clientX, sy = e.clientY;
    const vt = new VelocityTracker();
    let locked = false, base = 0;
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    const move = (ev) => {
      if (ev.pointerId !== id) return;
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      const main = axis === "y" ? dy : dx, cross = axis === "y" ? dx : dy;
      if (!locked) {
        if (Math.hypot(dx, dy) < HYSTERESIS) return;
        if (Math.abs(cross) > Math.abs(main) || (shouldLock && !shouldLock(main, info))) return cleanup();
        locked = true;
        try { el.setPointerCapture(id); } catch { /* pointeur déjà relâché */ }
        base = onStart(info) - main; // part de la position affichée : aucun saut
        vt.reset();
      }
      const v = base + main;
      onMove(v);
      vt.add(v, ev.timeStamp);
    };
    const end = (ev) => {
      if (ev.pointerId !== id) return;
      cleanup();
      if (!locked) return;
      S.suppressClickUntil = performance.now() + 120; // fin de glissement, pas un appui
      onEnd(ev.type === "pointercancel" ? 0 : vt.velocity(ev.timeStamp));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  });
}

function attachWeekGesture() {
  const vp = $("#week-viewport");
  if (!vp) return;
  attachDrag(vp, {
    axis: "x",
    onStart: () => {
      weekSpring.stop(); // on rattrape la bande là où elle est, même en plein vol
      S.weekCommit = 0;
      S.gesture = true;
      return weekSpring.value;
    },
    onMove: (x) => weekSpring.set(x),
    onEnd: (v) => {
      S.gesture = false;
      const x = weekSpring.value;
      const W = ($("#week-viewport") || vp).clientWidth;
      const projected = x + project(v);
      let dir = 0;
      if (projected < -W / 2 && S.weekNav.next) dir = 1;
      else if (projected > W / 2 && S.weekNav.prev) dir = -1;
      if (S.renderPending) renderAll();
      if (dir) commitWeek(dir, v);
      else weekSpring.to(0, { damping: 1, response: 0.35, velocity: v, precision: 0.5 });
    },
  });
}

/* ------------------------------------------------------------------ onglet Calendrier */
function calendrierHTML() {
  const idx = S.months.indexOf(S.calMonth);
  const todayIn = inPeriod(S.today, S.start);
  const opts = S.months
    .map((m) => `<option value="${m}" ${m === S.calMonth ? "selected" : ""}>${esc(monthLabelFr(m))}</option>`)
    .join("");
  return `<section class="page-head"><h1 class="t-large">Calendrier</h1>
      <p class="t-sub">Du ${esc(formatDateFr(S.start))} au ${esc(formatDateFr(S.end))}</p></section>
    <section class="toolbar" aria-label="Navigation du calendrier">
      <div class="month-picker">
        <button class="chev press" data-action="cal-prev" id="cal-prev" aria-label="Mois précédent" ${idx <= 0 ? "disabled" : ""}>${ICON.left}</button>
        <select id="cal-month" aria-label="Choisir un mois">${opts}</select>
        <button class="chev press" data-action="cal-next" id="cal-next" aria-label="Mois suivant" ${idx >= S.months.length - 1 ? "disabled" : ""}>${ICON.right}</button>
      </div>
      <button class="btn small press" data-action="cal-today" ${todayIn ? "" : "disabled"}>Aujourd'hui</button>
      ${segHTML("seg-calmode", "Affichage", "cal-mode", "mode", [
        { value: "frise", label: "Frise" }, { value: "mois", label: "Mois" },
      ], S.calMode)}
    </section>
    ${S.calMode === "frise" ? friseHTML() : monthHTML()}
    <div class="legend t-foot" aria-label="Légende">
      <span><i class="sw done"></i>Fait</span><span><i class="sw missed"></i>Non fait</span>
      <span><i class="sw rest"></i>Repos / annulé</span><span><i class="sw empty"></i>Non renseigné</span>
    </div>
    ${statsCardHTML()}`;
}

function cellLabel(iso, st) {
  return `${capitalize(formatLongFr(iso))}${st ? ` : ${st}` : " : à pointer"}`;
}

function friseHTML() {
  const months = groupRuns(S.period, (d) => d.slice(0, 7));
  const weeks = groupRuns(S.period, (d) => `${d.slice(0, 7)}|${weekNumber(d, S.start)}`);
  const rowMonth = months
    .map((r) => `<td colspan="${r.length}"><span class="sticky-txt">${esc(monthLabelFr(r.key))}</span></td>`).join("");
  const rowWeek = weeks
    .map((r) => `<td colspan="${r.length}"><span class="sticky-txt">${esc(weekLabel(r.first, S.start))}</span></td>`).join("");
  let rowDate = "", rowPlan = "", rowMark = "";
  for (const d of S.period) {
    const st = dayStatus(d);
    const cls = `${st ? `st-${ST[st].cls}` : ""} ${d === S.today ? "today" : ""}`;
    const plan = planFor(S.program, d);
    const label = esc(cellLabel(d, st));
    rowDate += `<td class="${cls}" data-action="open-day" data-date="${d}"><b>${WEEKDAYS_SHORT[weekdayIndex(d)]}</b>${shortDate(d)}${d === S.today ? '<span class="today-tag">AUJ.</span>' : ""}</td>`;
    rowPlan += `<td class="${cls}" data-action="open-day" data-date="${d}">${esc(plan.title)}</td>`;
    rowMark += `<td class="${cls}"><button data-action="open-day" data-date="${d}" aria-label="${label}">${st ? `${ST[st].icon}<span>${esc(st === "Repos / annulé" ? "Repos" : st)}</span>` : ""}</button></td>`;
  }
  return `<p class="hint t-foot">Glisse pour parcourir l'année</p>
    <div class="frise-scroll" id="frise" role="region" aria-label="Frise annuelle" tabindex="0">
      <table class="frise">
        <colgroup><col class="c0">${S.period.map(() => '<col class="cd">').join("")}</colgroup>
        <tr class="r-month"><th class="lab" scope="row">Mois</th>${rowMonth}</tr>
        <tr class="r-week"><th class="lab" scope="row">Semaine</th>${rowWeek}</tr>
        <tr class="r-date"><th class="lab" scope="row">Date</th>${rowDate}</tr>
        <tr class="r-plan"><th class="lab" scope="row">Séance prévue</th>${rowPlan}</tr>
        <tr class="r-mark"><th class="lab" scope="row">Pointage</th>${rowMark}</tr>
      </table>
    </div>`;
}

function friseColWidth(fs) {
  const td = fs.querySelector(".r-date td");
  return td ? td.getBoundingClientRect().width : 96;
}

function scrollFriseToDate(iso, smooth) {
  const fs = $("#frise");
  if (!fs) return;
  const idx = Math.max(0, S.period.indexOf(clampToPeriod(iso, S.start)));
  const left = idx * friseColWidth(fs);
  if (smooth && !reducedMotion()) fs.scrollTo({ left, behavior: "smooth" });
  else fs.scrollLeft = left;
  S.friseLeft = left;
}

function afterFriseRender() {
  const fs = $("#frise");
  if (!fs) return;
  if (S.friseLeft == null) scrollFriseToDate(S.today, false);
  else fs.scrollLeft = S.friseLeft;
  let raf = 0;
  fs.addEventListener("scroll", () => {
    S.friseLeft = fs.scrollLeft;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const idx = Math.min(S.period.length - 1, Math.max(0, Math.round(fs.scrollLeft / friseColWidth(fs))));
      const m = S.period[idx].slice(0, 7);
      if (m !== S.calMonth) {
        S.calMonth = m;
        syncMonthControls();
      }
    });
  }, { passive: true });
}

function syncMonthControls() {
  const sel = $("#cal-month");
  if (sel) sel.value = S.calMonth;
  const idx = S.months.indexOf(S.calMonth);
  const prev = $("#cal-prev"), next = $("#cal-next");
  if (prev) prev.disabled = idx <= 0;
  if (next) next.disabled = idx >= S.months.length - 1;
}

function goToMonth(ym) {
  if (!S.months.includes(ym)) return;
  S.calMonth = ym;
  if (S.calMode === "frise") {
    syncMonthControls();
    scrollFriseToDate(firstPeriodDayOfMonth(ym, S.start), true);
  } else {
    renderAll();
  }
}

function monthHTML() {
  const weeks = monthGrid(S.calMonth, S.start);
  const head = WEEKDAYS_SHORT.map((d) => `<span>${d}</span>`).join("");
  const cells = weeks.flat().map((c) => {
    if (!c) return '<div class="mcell blank" aria-hidden="true"></div>';
    const st = dayStatus(c.iso);
    const plan = planFor(S.program, c.iso);
    const cls = `${st ? `st-${ST[st].cls}` : ""} ${c.iso === S.today ? "today" : ""}`;
    return `<button class="mcell press ${cls}" data-action="open-day" data-date="${c.iso}" ${c.inPeriod ? "" : "disabled"} aria-label="${esc(cellLabel(c.iso, st))}">
      <span class="n">${dayNumber(c.iso)}</span><span class="k">${plan.isRest ? "Repos" : "Salle"}</span>
      <span class="s">${st ? `${ST[st].icon}${esc(ST[st].short)}` : ""}</span></button>`;
  }).join("");
  return `<section class="month group" aria-label="${esc(monthLabelFr(S.calMonth))}"><div class="dow">${head}</div><div class="grid">${cells}</div></section>`;
}

function statsCardHTML() {
  const r = computeStats(dayStatuses(), S.start, S.today, S.scope);
  const monthName = monthLabelFr(S.today.slice(0, 7)).toLowerCase();
  const scopeNote = S.scope === "month"
    ? `Ce mois = le mois en cours (${esc(monthName)}), pas le mois affiché dans la grille.`
    : "Depuis le premier jour du suivi jusqu'à aujourd'hui.";
  return `<section class="stats" aria-label="Statistiques">
    <div class="stats-head"><h2 class="t-title2">Assiduité</h2>
      ${segHTML("seg-scope", "Période des statistiques", "scope", "scope", [
        { value: "all", label: "Depuis le début" }, { value: "month", label: "Ce mois" },
      ], S.scope)}</div>
    <div class="tiles">
      <div class="tile"><b>${r.done}</b><span>Réalisées</span></div>
      <div class="tile"><b>${r.missed}</b><span>Manquées</span></div>
      <div class="tile accent"><b>${r.attendance == null ? "—" : `${r.attendance} %`}</b><span>Assiduité</span></div>
      <div class="tile"><b>${r.toFill}</b><span>À renseigner</span></div>
      <div class="tile"><b>${r.rest}</b><span>Repos / annulés</span></div>
    </div>
    <p class="formula t-foot">${scopeNote}<br>Assiduité = faits ÷ (faits + non faits). Les repos, les cases vides et les dates à venir ne comptent pas.</p>
  </section>`;
}

function renderSide() {
  const side = $("#side");
  if (!side) return;
  const r = computeStats(dayStatuses(), S.start, S.today, "all");
  side.innerHTML = `<div class="group"><h2 class="t-headline">Mon suivi</h2>
    <p class="big">${r.attendance == null ? "—" : `${r.attendance} %`}</p><p class="t-sub">d'assiduité depuis le début</p>
    <div class="row"><span>Séances réalisées</span><b>${r.done}</b></div>
    <div class="row"><span>Manquées</span><b>${r.missed}</b></div>
    <div class="row"><span>À renseigner</span><b>${r.toFill}</b></div>
    <button class="btn press" data-action="tab" data-tab="calendrier">${ICON.calendar} Voir le calendrier</button></div>`;
}

/* ------------------------------------------------------------------ feuilles */
// Mobile : la feuille monte depuis le bas et redescend par le même chemin ; elle suit
// le doigt, garde l'élan au relâchement, résiste au-delà du haut, et reste saisissable
// pendant qu'elle s'ouvre ou se ferme. Ordinateur : fenêtre centrée qui « se matérialise ».
let sheetCtl = null;

function sheet(title, sub, body) {
  return `<div class="sheet-head"><div><h2 id="m-title" class="t-title2">${title}</h2>${sub ? `<p class="t-sub">${sub}</p>` : ""}</div>
    <button class="close-x press" data-action="close-modal" aria-label="Fermer">${ICON.cross}</button></div>${body}`;
}

function paintSheet(ctl, v) {
  const { el, scrim } = ctl;
  if (ctl.desktop) {
    const p = clamp(v, 0, 1.2);
    el.style.opacity = String(clamp(v));
    el.style.transform = `scale(${0.96 + 0.04 * p})`;
    scrim.style.opacity = String(clamp(v));
    return;
  }
  const shown = v < 0 ? -rubberband(-v, ctl.h) : v;
  el.style.transform = `translate3d(0,${shown}px,0)`;
  scrim.style.opacity = String(clamp(1 - v / Math.max(1, ctl.h)));
  if (ctl.state === "closing" && v >= ctl.h - 1) removeSheet(ctl);
}

function updateSheetTouch(ctl) {
  if (!ctl || ctl.desktop) return;
  const scrollable = ctl.el.scrollHeight > ctl.el.clientHeight + 1;
  ctl.el.style.touchAction = scrollable ? "pan-y" : "none";
}

function openModal(html, focusSel) {
  if (sheetCtl) removeSheet(sheetCtl);
  S.opener = document.activeElement;
  const root = $("#modal-root");
  root.innerHTML = `<div class="overlay"><div class="scrim" data-action="close-bg"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="m-title" tabindex="-1">
      <div class="grabber" aria-hidden="true"></div><div class="sheet-body">${html}</div></div></div>`;
  document.body.classList.add("modal-open");
  syncViewport();
  const overlay = $(".overlay", root);
  const ctl = { overlay, el: $(".sheet", overlay), scrim: $(".scrim", overlay), desktop: isDesktop(), state: "open" };
  ctl.h = ctl.el.offsetHeight || 400;
  ctl.spring = new Spring(ctl.desktop ? 0 : ctl.h, { onUpdate: (v) => paintSheet(ctl, v) });
  sheetCtl = ctl;
  paintSheet(ctl, ctl.spring.value);
  updateSheetTouch(ctl);
  syncSegments();
  if (reducedMotion()) {
    ctl.spring.set(ctl.desktop ? 1 : 0);
    ctl.el.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "ease" });
    ctl.scrim.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "ease" });
  } else {
    // Apparition sans rebond : rien n'a été lancé, rien ne doit déborder.
    ctl.spring.to(ctl.desktop ? 1 : 0, { damping: 1, response: 0.35, precision: ctl.desktop ? 0.002 : 0.5 });
  }
  if (!ctl.desktop) attachSheetDrag(ctl);
  const target = (focusSel && $(focusSel)) || ctl.el;
  target.focus({ preventScroll: true });
}

function setSheetContent(html, focusSel) {
  const ctl = sheetCtl;
  if (!ctl) return;
  $(".sheet-body", ctl.el).innerHTML = html;
  ctl.h = ctl.el.offsetHeight;
  updateSheetTouch(ctl);
  syncSegments();
  const target = (focusSel && $(focusSel)) || ctl.el;
  target.focus({ preventScroll: true });
}

function removeSheet(ctl) {
  if (sheetCtl !== ctl) return;
  ctl.spring.stop();
  sheetCtl = null;
  S.modal = null;
  $("#modal-root").innerHTML = "";
  document.body.classList.remove("modal-open");
}

function reopenSheet(ctl) {
  ctl.state = "open";
  ctl.overlay.classList.remove("closing");
  document.body.classList.add("modal-open");
}

function closeModal(silent, velocity = 0) {
  const ctl = sheetCtl;
  if (!ctl) { S.modal = null; return; }
  if (ctl.state === "closing") return;
  ctl.state = "closing";
  ctl.overlay.classList.add("closing");
  document.body.classList.remove("modal-open");
  if (!silent && S.opener && S.opener.isConnected) S.opener.focus({ preventScroll: true });
  S.opener = null;
  if (reducedMotion()) {
    const anim = ctl.el.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: "ease", fill: "forwards" });
    ctl.scrim.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: "ease", fill: "forwards" });
    if (anim) anim.onfinish = () => removeSheet(ctl);
    else removeSheet(ctl);
    return;
  }
  if (ctl.desktop) {
    ctl.spring.to(0, { damping: 1, response: 0.25, precision: 0.01, onRest: () => removeSheet(ctl) });
  } else {
    ctl.h = ctl.el.offsetHeight;
    // Sortie par le chemin d'entrée, à la vitesse du doigt s'il y en a une.
    ctl.spring.to(ctl.h + 40, { damping: 1, response: 0.3, velocity, precision: 0.5, onRest: () => removeSheet(ctl) });
  }
}

function attachSheetDrag(ctl) {
  const el = ctl.el;
  attachDrag(el, {
    axis: "y",
    filterStart: (e) => {
      if (e.target.closest("input, select, textarea")) return false;
      const head = !!e.target.closest(".grabber, .sheet-head");
      const scrollable = el.scrollHeight > el.clientHeight + 1;
      if (!head && scrollable && el.scrollTop > 0) return false; // le contenu défile d'abord
      return { head, scrollable };
    },
    shouldLock: (dy, info) => !(dy < 0 && info.scrollable && !info.head),
    onStart: () => {
      if (ctl.state === "closing") reopenSheet(ctl); // rattrapée pendant sa fermeture
      ctl.h = el.offsetHeight;
      ctl.spring.stop();
      el.classList.add("dragging");
      return ctl.spring.value;
    },
    onMove: (y) => ctl.spring.set(y),
    onEnd: (v) => {
      el.classList.remove("dragging");
      const y = ctl.spring.value;
      if (y + project(v) > ctl.h * 0.5 && v > -100) closeModal(false, v);
      else ctl.spring.to(0, { damping: 0.8, response: 0.3, velocity: v, precision: 0.5 }); // l'élan justifie un léger rebond
    },
  });
}

function syncViewport() {
  const vv = window.visualViewport;
  const root = document.documentElement;
  if (vv) {
    root.style.setProperty("--vv-h", `${vv.height}px`);
    root.style.setProperty("--vv-top", `${vv.offsetTop}px`);
  }
  if (sheetCtl) {
    sheetCtl.h = sheetCtl.el.offsetHeight;
    updateSheetTouch(sheetCtl);
  }
}

/* ----- pointage d'un jour ----- */
function dayHTML(iso) {
  const plan = planFor(S.program, iso);
  const st = dayStatus(iso);
  const rows = STATUSES.map((s) => `<button class="list-row has-icon status-choice row-press" data-action="set-status" data-date="${iso}" data-st="${esc(s)}" aria-pressed="${st === s}">
      <span class="icon-sq ${ST[s].cls}">${ST[s].icon}</span><span class="grow">${esc(s)}</span><span class="check">${ICON.check}</span></button>`).join("");
  return sheet(esc(capitalize(formatLongFr(iso))), `Séance prévue : ${esc(plan.title)}`, `
    ${iso > S.today ? '<p class="note warn">Date à venir : elle ne sera comptée qu\'à partir de ce jour.</p>' : ""}
    <div class="group-list">${rows}</div>
    <div class="group-list"><button class="list-row danger row-press" data-action="clear-day" data-date="${iso}" ${st ? "" : "disabled"}>Effacer le pointage</button></div>`);
}

function openDay(iso) {
  if (!inPeriod(iso, S.start)) return;
  S.modal = { kind: "day", iso };
  openModal(dayHTML(iso));
}

function setDay(iso, status) {
  if (!inPeriod(iso, S.start)) return;
  S.store.set(`day:${iso}`, status);
}

/* ----- 1RM ----- */
function rmPreviewHTML(ex, parsed) {
  if (!parsed.ok) return "";
  if (parsed.empty) return '<p class="note pad" style="margin-top:0">Champ vide : le 1RM sera effacé.</p>';
  const load = workingLoad(parsed.value, ex.percent);
  let rows = `<div class="list-row result"><small>${formatPercent(ex.percent)} du 1RM</small><b>${esc(formatKg(load))}</b></div>`;
  if (ex.drop && typeof ex.dropPercent === "number") {
    rows += `<div class="list-row result"><small>Dropset à l'échec (−${formatPercent(ex.dropPercent)})</small><b>${esc(formatKg(dropLoad(load, ex.dropPercent)))}</b></div>`;
  }
  return `<div class="group-list">${rows}</div>`;
}

const rmParse = (raw) => parseDecimalInput(raw, { min: 0, max: LIMITS.rmMax });

function openRm(id) {
  const ex = S.ctx.exercises.get(id);
  if (!ex || !usesRM(ex)) return;
  S.modal = { kind: "rm", id };
  const cur = S.store.get(`rm:${id}`);
  const value = cur == null ? "" : String(cur).replace(".", ",");
  openModal(sheet("Mon 1RM", esc(ex.name), `
    <label class="field-big"><span>Charge maximale connue pour 1 répétition</span>
      <span class="with-unit"><input id="rm-input" inputmode="decimal" autocomplete="off" autocapitalize="none" enterkeyhint="done" value="${esc(value)}" placeholder="0"><span class="unit">kg</span></span></label>
    <p class="error" id="rm-error" role="alert"></p>
    <div id="rm-preview">${rmPreviewHTML(ex, rmParse(value))}</div>
    <p class="note pad" style="margin-top:0">Le calcul est exact ; adapte la charge au matériel disponible.</p>
    <div class="actions-2">
      <button class="btn press" data-action="close-modal">Annuler</button>
      <button class="btn filled press" data-action="save-rm" data-id="${esc(id)}">Enregistrer</button>
    </div>
    ${cur != null ? `<button class="btn plain danger wide press" style="margin-top:0.4rem" data-action="clear-rm" data-id="${esc(id)}">Effacer mon 1RM</button>` : ""}`), "#rm-input");
}

function saveRm(id) {
  const parsed = rmParse($("#rm-input").value);
  if (!parsed.ok) { $("#rm-error").textContent = parsed.error; return; }
  const v = validateEntry(`rm:${id}`, parsed.value, S.ctx);
  if (!v.ok) { $("#rm-error").textContent = v.error; return; }
  S.store.set(`rm:${id}`, v.value);
  closeModal();
  toast(v.value == null ? "1RM effacé" : `1RM enregistré : ${formatKg(v.value)}`);
}

/* ----- réglage PDC / lesté / assisté ----- */
const bodyParse = (raw) => parseDecimalInput(raw, { min: 0, minInclusive: true, max: LIMITS.bodyMax });

function openBody(id) {
  const ex = S.ctx.exercises.get(id);
  if (!ex || !exerciseModes(ex).length) return;
  const cur = S.store.get(`body:${id}`) || { mode: "PDC", weight: 0 };
  S.modal = { kind: "body", id, mode: cur.mode, weightText: cur.mode === "PDC" ? "" : String(cur.weight).replace(".", ",") };
  openModal(bodyHTML(), "#body-input");
  updateBodyPreview();
}

function bodyHTML() {
  const m = S.modal;
  const ex = S.ctx.exercises.get(m.id);
  const modes = exerciseModes(ex);
  const label = m.mode === "Lesté" ? "Lest ajouté" : "Assistance";
  return sheet("Mon réglage", esc(ex.name), `
    <div class="modes">${segHTML("seg-modes", "Mode", "set-mode", "mode", modes.map((md) => ({ value: md, label: esc(md) })), m.mode)}</div>
    ${m.mode === "PDC"
      ? '<p class="note pad" style="margin-top:0">Poids du corps : aucun poids externe à saisir.</p>'
      : `<label class="field-big"><span>${label}</span>
           <span class="with-unit"><input id="body-input" inputmode="decimal" autocomplete="off" enterkeyhint="done" value="${esc(m.weightText)}" placeholder="0"><span class="unit">kg</span></span></label>
         <p class="error" id="body-error" role="alert"></p>
         <div id="body-preview"></div>`}
    <div class="actions-2">
      <button class="btn press" data-action="close-modal">Annuler</button>
      <button class="btn filled press" data-action="save-body" data-id="${esc(m.id)}">Enregistrer</button>
    </div>`);
}

function updateBodyPreview() {
  const el = $("#body-preview");
  if (!el) return;
  const p = bodyParse($("#body-input").value);
  el.innerHTML = p.ok && !p.empty
    ? `<div class="group-list"><div class="list-row result"><small>Affichage</small><b>${esc(modeText({ mode: S.modal.mode, weight: p.value }))}</b></div></div>`
    : "";
}

function saveBody(id) {
  const m = S.modal;
  let value;
  if (m.mode === "PDC") value = { mode: "PDC", weight: 0 };
  else {
    const p = bodyParse($("#body-input").value);
    if (!p.ok) { $("#body-error").textContent = p.error; return; }
    if (p.empty) { $("#body-error").textContent = "Indique un poids (ou choisis PDC)."; return; }
    value = { mode: m.mode, weight: p.value };
  }
  const v = validateEntry(`body:${id}`, value, S.ctx);
  if (!v.ok) { const e = $("#body-error"); if (e) e.textContent = v.error; return; }
  S.store.set(`body:${id}`, v.value);
  closeModal();
  toast(`Réglage enregistré : ${modeText(v.value)}`);
}

/* ----- réglages & sauvegarde ----- */
function lastBackupText() {
  const m = S.store.meta();
  if (!m.lastBackup) return "Aucune sauvegarde pour l'instant";
  const d = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: S.tz })
    .format(new Date(m.lastBackup));
  const fresh = !m.lastChange || m.lastBackup >= m.lastChange;
  return `Dernière sauvegarde : ${d}${fresh ? " ✓" : " (modifs depuis)"}`;
}

const numText = (n) => (n == null ? "" : String(n).replace(".", ","));

function settingsHTML(errorMsg) {
  const g = S.config.goal;
  return sheet("Réglages", "Tout est enregistré sur ce téléphone", `
    <p class="t-eyebrow list-title">Sauvegarde</p>
    <div class="group-list">
      <div class="list-row"><div><p class="t-headline">${esc(lastBackupText())}</p>
        <p class="note">Le fichier va dans l'app Fichiers. Choisis toujours le même dossier et « Remplacer » : tu gardes un seul fichier à jour.</p></div></div>
      <button class="list-row tint row-press" data-action="backup">Sauvegarder dans Fichiers</button>
      <label class="list-row file-row tint row-press">Restaurer depuis un fichier
        <input type="file" id="import-file" accept=".json,application/json" aria-label="Restaurer une sauvegarde"></label>
      <button class="list-row tint row-press" data-action="export-csv">Exporter le calendrier (CSV)</button>
    </div>
    <p class="error" id="settings-error" role="alert" style="margin-top:-0.6rem">${esc(errorMsg || "")}</p>
    <p class="t-eyebrow list-title">Mon profil</p>
    <div class="group-list">
      <label class="list-row"><span class="grow">Prénom</span>
        <input class="inline-input" id="pf-name" value="${esc(S.config.firstName || "")}" placeholder="Facultatif" autocomplete="given-name" maxlength="40"></label>
      <label class="list-row"><span class="grow">Poids de départ (kg)</span>
        <input class="inline-input num" id="pf-from" inputmode="decimal" value="${esc(numText(g && g.from))}" placeholder="—"></label>
      <label class="list-row"><span class="grow">Objectif (kg)</span>
        <input class="inline-input num" id="pf-to" inputmode="decimal" value="${esc(numText(g && g.to))}" placeholder="—"></label>
    </div>
    <p class="error" id="profile-error" role="alert" style="margin-top:-0.6rem"></p>
    <button class="btn filled wide press" data-action="save-profile">Enregistrer le profil</button>
    <p class="t-eyebrow list-title" style="margin-top:1.4rem">Écran d'accueil</p>
    <div class="group-list"><ol class="steps"><li>Ouvre ce site dans Safari.</li><li>Touche Partager, puis « Sur l'écran d'accueil ».</li>
      <li>Ouvre ensuite toujours Salle depuis l'icône.</li></ol></div>`);
}

function openSettings(errorMsg) {
  S.modal = { kind: "settings" };
  if (sheetCtl && sheetCtl.state === "open") setSheetContent(settingsHTML(errorMsg));
  else openModal(settingsHTML(errorMsg));
}

function saveProfileFromForm() {
  const err = $("#profile-error");
  const name = $("#pf-name").value.trim().slice(0, 40);
  const opts = { min: 20, minInclusive: true, max: 400 };
  const from = parseDecimalInput($("#pf-from").value, opts);
  const to = parseDecimalInput($("#pf-to").value, opts);
  if (!from.ok || !to.ok) { err.textContent = "Poids entre 20 et 400 kg."; return; }
  if (from.empty !== to.empty) { err.textContent = "Remplis les deux poids, ou aucun."; return; }
  const goal = from.empty ? null : { from: from.value, to: to.value };
  if (!saveProfile({ firstName: name, goal })) { err.textContent = "Impossible d'enregistrer sur cet appareil."; return; }
  S.config.firstName = name;
  S.config.goal = goal;
  closeModal();
  renderShell();
  renderAll();
  toast("Profil enregistré");
}

function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function backupJSON() {
  const out = {};
  for (const [k, e] of S.store.all()) {
    const v = validateEntry(k, e.v, S.ctx);
    if (v.ok && v.value !== null) out[k] = v.value;
  }
  const profile = { firstName: S.config.firstName || "", goal: S.config.goal || null };
  return JSON.stringify({ ...buildExport(out, S.start), profile }, null, 2);
}

/** iPhone : feuille de partage → « Enregistrer dans Fichiers ». Ailleurs : téléchargement. */
async function saveToFiles() {
  const json = backupJSON();
  const file = new File([json], BACKUP_NAME, { type: "application/json" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      S.store.markBackup();
      toast("Sauvegarde envoyée");
    } catch (e) {
      if (e && e.name === "AbortError") return; // annulé par toi
      download(BACKUP_NAME, json, "application/json");
      S.store.markBackup();
      toast("Sauvegarde téléchargée");
    }
  } else {
    download(BACKUP_NAME, json, "application/json");
    S.store.markBackup();
    toast("Sauvegarde téléchargée");
  }
  renderAll();
  if (S.modal && S.modal.kind === "settings" && sheetCtl) setSheetContent(settingsHTML());
}

function exportCsv() {
  download("salle-calendrier.csv", buildCsv(S.start, S.program, dayStatuses()), "text/csv;charset=utf-8");
  toast("Calendrier exporté");
}

async function handleImportFile(input) {
  const file = input.files && input.files[0];
  input.value = "";
  if (!file) return;
  const err = (m) => { const el = $("#settings-error"); if (el) el.textContent = m; };
  if (file.size > LIMITS.importBytes) return err("Fichier trop volumineux (200 000 octets maximum).");
  let text;
  try { text = await file.text(); } catch { return err("Impossible de lire ce fichier."); }
  const r = validateImport(text, S.ctx);
  if (!r.ok) return err(r.error);
  let profile = null;
  try {
    const p = JSON.parse(text).profile;
    if (p && typeof p.firstName === "string") profile = { firstName: p.firstName.slice(0, 40), goal: p.goal && Number.isFinite(p.goal.from) && Number.isFinite(p.goal.to) ? p.goal : null };
  } catch { /* déjà validé */ }
  S.modal = { kind: "import", entries: r.entries, count: r.count, profile };
  setSheetContent(sheet("Restaurer cette sauvegarde ?", esc(file.name), `
    <div class="group-list"><div class="list-row result"><small>Valeurs à restaurer</small><b>${r.count}</b></div></div>
    <p class="note pad">Les éléments du fichier remplacent leurs valeurs actuelles ; tout le reste est conservé. Rien ne change tant que tu n'as pas confirmé.</p>
    <div class="actions-2"><button class="btn press" data-action="import-cancel">Annuler</button>
    <button class="btn filled press" data-action="import-confirm">Restaurer</button></div>`));
}

/* ------------------------------------------------------------------ minuteur */
// Pastille flottante : arrive par le bas, se ferme d'un glissement vers le bas.
const timerSpring = new Spring(0, { onUpdate: (y) => paintTimer(y) });

function paintTimer(y) {
  const el = $("#timer-root .timer");
  if (!el) return;
  const shown = y < 0 ? -rubberband(-y, 60) : y;
  el.style.transform = `translate3d(0,${shown}px,0)`;
  el.style.opacity = String(clamp(1 - Math.max(0, y) / 90));
  if (S.timerClosing && y >= 95) finishTimerClose();
}

function remainingMs() {
  const t = S.timer;
  return t.paused ? t.remaining : Math.max(0, t.endAt - Date.now());
}
function stopTick() { if (S.tick) { clearInterval(S.tick); S.tick = null; } }
function startTick() { stopTick(); S.tick = setInterval(tick, 250); }
function tick() {
  const t = S.timer;
  if (!t) return stopTick();
  const ms = remainingMs();
  if (ms <= 0 && !t.done) { t.done = true; stopTick(); haptic(30); renderTimer(); return; }
  const el = $("#t-time");
  if (el && !t.done) el.textContent = formatClock(ms / 1000);
}

function startTimer(ex) {
  const secs = restSeconds(ex.rest);
  if (!secs) return;
  const visible = !!S.timer;
  S.timer = { name: ex.name, endAt: Date.now() + secs * 1000, paused: false, remaining: secs * 1000, done: false };
  renderTimer();
  startTick();
  if (S.timerClosing) {
    // Rattrapé pendant sa sortie : il repart d'où il est.
    S.timerClosing = false;
    if (reducedMotion()) timerSpring.set(0);
    else timerSpring.to(0, { damping: 1, response: 0.35, precision: 0.5 });
    return;
  }
  if (visible) { paintTimer(timerSpring.value); return; }
  if (reducedMotion()) {
    timerSpring.set(0);
    $("#timer-root .timer")?.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "ease" });
    return;
  }
  timerSpring.set(70);
  timerSpring.to(0, { damping: 1, response: 0.35, precision: 0.5 });
}

function toggleTimer() {
  const t = S.timer;
  if (!t || t.done) return;
  if (!t.paused) { t.remaining = remainingMs(); t.paused = true; stopTick(); }
  else { t.endAt = Date.now() + t.remaining; t.paused = false; startTick(); }
  renderTimer();
}

function closeTimer(velocity = 0) {
  if (!S.timer) return;
  stopTick();
  if (reducedMotion()) return finishTimerClose();
  S.timerClosing = true;
  timerSpring.to(110, { damping: 1, response: 0.3, velocity, precision: 0.5, onRest: finishTimerClose });
}

function finishTimerClose() {
  S.timerClosing = false;
  timerSpring.stop();
  timerSpring.value = 0;
  timerSpring.target = 0;
  S.timer = null;
  renderTimer();
}

function renderTimer() {
  const root = $("#timer-root");
  const t = S.timer;
  if (!t) { root.innerHTML = ""; return; }
  root.innerHTML = `<div class="timer ${t.done ? "done" : ""}" role="timer" aria-label="Minuteur de repos">
    <div class="tn"><small>Repos · ${esc(t.name)}</small>
      ${t.done ? '<div class="tt" role="status">Repos terminé</div>' : `<div class="tt" id="t-time">${formatClock(remainingMs() / 1000)}</div>`}</div>
    ${t.done ? "" : `<button class="round orange press" data-action="timer-toggle" aria-label="${t.paused ? "Reprendre" : "Mettre en pause"}">${t.paused ? ICON.play : ICON.pause}</button>`}
    <button class="round press" data-action="timer-close" aria-label="Fermer le minuteur">${ICON.cross}</button></div>`;
  paintTimer(timerSpring.value);
  attachTimerGesture();
}

function attachTimerGesture() {
  const el = $("#timer-root .timer");
  if (!el) return;
  attachDrag(el, {
    axis: "y",
    onStart: () => {
      if (S.timerClosing) { S.timerClosing = false; if (S.timer && !S.timer.done && !S.timer.paused) startTick(); }
      timerSpring.stop();
      return timerSpring.value;
    },
    onMove: (y) => timerSpring.set(y),
    onEnd: (v) => {
      const y = timerSpring.value;
      if (y + project(v) > 50) closeTimer(v);
      else timerSpring.to(0, { damping: 0.8, response: 0.3, velocity: v, precision: 0.5 });
    },
  });
}

/* ------------------------------------------------------------------ actions */
function goToday() {
  S.today = todayInTZ(S.tz);
  S.selected = clampToPeriod(S.today, S.start);
  weekSpring.stop();
  weekSpring.value = 0;
  weekSpring.target = 0;
  S.weekCommit = 0;
  renderAll();
}

function switchTab(tab) {
  if (S.tab === tab) { window.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" }); return; }
  S.tab = tab;
  renderAll();
  window.scrollTo({ top: 0 });
}

function onAction(el) {
  const a = el.dataset.action;
  const id = el.dataset.id;
  const date = el.dataset.date;
  switch (a) {
    case "tab": return switchTab(el.dataset.tab);
    case "select-day": S.selected = date; return renderAll();
    case "week-prev": return commitWeek(-1);
    case "week-next": return commitWeek(1);
    case "go-today": return goToday();
    case "open-day": return openDay(date);
    case "set-status":
      setDay(date, el.dataset.st); haptic(); closeModal(); toast(`Pointé : ${el.dataset.st}`); return;
    case "clear-day": setDay(date, null); closeModal(); toast("Pointage effacé"); return;
    case "finish": setDay(S.selected, "Fait"); haptic(); toast("Séance pointée : Fait"); return;
    case "edit-rm": return openRm(id);
    case "save-rm": return saveRm(id);
    case "clear-rm": S.store.set(`rm:${id}`, null); closeModal(); toast("1RM effacé"); return;
    case "edit-body": return openBody(id);
    case "set-mode": {
      const inp = $("#body-input");
      if (inp) S.modal.weightText = inp.value;
      S.modal.mode = el.dataset.mode;
      setSheetContent(bodyHTML(), "#body-input");
      updateBodyPreview();
      return;
    }
    case "save-body": return saveBody(id);
    case "timer": { const ex = S.ctx.exercises.get(id); if (ex) startTimer(ex); return; }
    case "timer-toggle": return toggleTimer();
    case "timer-close": return closeTimer();
    case "cal-prev": return goToMonth(S.months[S.months.indexOf(S.calMonth) - 1]);
    case "cal-next": return goToMonth(S.months[S.months.indexOf(S.calMonth) + 1]);
    case "cal-today": {
      S.today = todayInTZ(S.tz);
      const t = clampToPeriod(S.today, S.start);
      S.calMonth = t.slice(0, 7);
      if (S.calMode === "frise") { syncMonthControls(); scrollFriseToDate(t, true); } else renderAll();
      return;
    }
    case "cal-mode":
      if (S.calMode === el.dataset.mode) return;
      S.calMode = el.dataset.mode;
      if (S.calMode === "frise") S.friseLeft = null;
      return renderAll();
    case "scope": S.scope = el.dataset.scope; return renderAll();
    case "open-settings": return openSettings();
    case "close-modal":
    case "close-bg": return closeModal();
    case "backup": return saveToFiles();
    case "save-profile": return saveProfileFromForm();
    case "export-csv": return exportCsv();
    case "import-cancel": return openSettings();
    case "import-confirm": {
      const m = S.modal;
      S.store.setMany(m.entries);
      if (m.profile) {
        saveProfile(m.profile);
        S.config.firstName = m.profile.firstName;
        S.config.goal = m.profile.goal;
        renderShell();
        renderAll();
      }
      S.store.markBackup(); // ce qu'on vient de restaurer est déjà dans un fichier
      closeModal();
      toast(`Sauvegarde restaurée : ${m.count} valeur${m.count > 1 ? "s" : ""}`);
      return;
    }
    default:
  }
}

document.addEventListener("click", (e) => {
  if (performance.now() < S.suppressClickUntil) { e.preventDefault(); return; } // fin d'un glissement, pas un appui
  const el = e.target.closest("[data-action]");
  if (!el || el.disabled) return;
  if (sheetCtl && sheetCtl.state === "closing" && el.closest(".overlay")) return;
  onAction(el);
});

document.addEventListener("input", (e) => {
  if (e.target.id === "rm-input" && S.modal && S.modal.kind === "rm") {
    const ex = S.ctx.exercises.get(S.modal.id);
    const p = rmParse(e.target.value);
    $("#rm-error").textContent = p.ok ? "" : p.error;
    $("#rm-preview").innerHTML = rmPreviewHTML(ex, p);
  } else if (e.target.id === "body-input" && S.modal && S.modal.kind === "body") {
    const p = bodyParse(e.target.value);
    $("#body-error").textContent = p.ok ? "" : p.error;
    updateBodyPreview();
  }
});

document.addEventListener("change", (e) => {
  if (e.target.id === "cal-month") goToMonth(e.target.value);
  else if (e.target.id === "import-file") handleImportFile(e.target);
});

document.addEventListener("keydown", (e) => {
  const open = sheetCtl && sheetCtl.state === "open";
  if (e.key === "Escape" && open) { e.preventDefault(); closeModal(); return; }
  if (e.key === "Enter" && open && e.target.id && e.target.id.startsWith("pf-")) {
    e.preventDefault();
    saveProfileFromForm();
    return;
  }
  if (e.key === "Enter" && open && (e.target.id === "rm-input" || e.target.id === "body-input")) {
    e.preventDefault();
    onAction($(S.modal.kind === "rm" ? "[data-action=save-rm]" : "[data-action=save-body]"));
    return;
  }
  if (e.key === "Tab" && open) {
    const el = sheetCtl.el;
    const items = [...el.querySelectorAll("button:not(:disabled), input, [href], [tabindex]:not([tabindex='-1'])")];
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});

// iOS n'applique :active (retour à l'appui) que si la page écoute touchstart.
document.addEventListener("touchstart", () => {}, { passive: true });

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", syncViewport);
  window.visualViewport.addEventListener("scroll", syncViewport);
}
window.addEventListener("resize", () => { paintWeek(weekSpring.value); });

// Effet de bord : la barre du haut ne devient matière que lorsque le contenu passe dessous.
function onScroll() {
  const bar = $("#topbar");
  if (bar) bar.classList.toggle("scrolled", window.scrollY > 4);
}
window.addEventListener("scroll", onScroll, { passive: true });

/* « Aujourd'hui » suit le fuseau Europe/Paris, y compris si la page reste ouverte après minuit. */
function checkDayChange() {
  if (!S.store) return;
  const t = todayInTZ(S.tz);
  if (t === S.today) { if (S.timer && !S.timer.paused) tick(); return; }
  const followed = S.selected === clampToPeriod(S.today, S.start);
  S.today = t;
  if (followed) S.selected = clampToPeriod(t, S.start);
  renderAll();
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkDayChange(); });
window.addEventListener("focus", checkDayChange);
setInterval(checkDayChange, 30000);

boot();
