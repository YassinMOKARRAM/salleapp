import {
  LIMITS, STATUSES, WEEKDAYS, WEEKDAYS_SHORT, addDays, buildContext, buildCsv, buildExport, buildPeriod,
  capitalize, clampToPeriod, computeStats, dayNumber, dropLoad, exerciseModes, firstPeriodDayOfMonth,
  formatClock, formatDateFr, formatKg, formatLongFr, formatPercent, groupRuns, inPeriod, modeText, monthGrid,
  monthLabelFr, monthsOfPeriod, parseDecimalInput, planFor, restSeconds, shortDate, todayInTZ, usesRM,
  validateEntry, validateImport, weekLabel, weekNumber, weekdayIndex, workingLoad, periodEnd, checkProgram,
  repRange, roundHalf, NOTE_MAX, seriesCount,
} from "./core.js";
import { askPersistence, clearProgram, createLocalStore, loadPrefs, loadProfile, loadProgram, runOnce, saveProfile, savePrefs, saveProgramData } from "./store.js";
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
  up: svg('<path d="M6 15l6-6 6 6"/>'),
  down: svg('<path d="M6 9l6 6 6-6"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  scale: svg('<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M8.5 9.5a5 5 0 0 1 7 0L13 12"/>'),
  chart: svg('<path d="M4 18l5-6 4 3 7-8"/>'),
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
  // 25/10/2026 : séances du mardi et du mercredi inversées, aussi dans un programme déjà modifié dans l'app.
  runOnce("swap-mardi-mercredi", () => {
    const stored = loadProgram(null, checkProgram);
    if (!stored) return;
    const tue = stored.days.find((d) => d.day === 2), wed = stored.days.find((d) => d.day === 3);
    if (!tue || !wed) return;
    [tue.title, wed.title] = [wed.title, tue.title];
    [tue.exercises, wed.exercises] = [wed.exercises, tue.exercises];
    saveProgramData(stored);
  });
  const profile = loadProfile();
  startApp({
    config: { ...CONFIG, end: periodEnd(CONFIG.start), firstName: profile.firstName, goal: profile.goal },
    program: loadProgram(PROGRAM, checkProgram),
  });
  askPersistence();
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

function startApp(data) {
  Object.assign(S, {
    config: data.config, program: data.program, start: data.config.start, end: data.config.end,
    tz: data.config.timezone || "Europe/Paris", userEmail: "", tab: "seances", calMode: "frise", prefs: loadPrefs(), fillFrom: {},
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
    <button data-action="tab" data-tab="evolution">${ICON.chart}<span>Évolution</span></button>
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
    { value: "evolution", label: `${ICON.chart} Évolution` },
  ], S.tab);
  renderView();
  renderSide();
  for (const b of document.querySelectorAll(".bottombar [data-action=tab]")) {
    if (b.dataset.tab === S.tab) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  }
  syncSegments();
  syncProgress();
  animateFills();
  revealNext();
}

function renderView() {
  const view = $("#view");
  const prevFrise = $("#frise");
  if (prevFrise) S.friseLeft = prevFrise.scrollLeft;
  view.innerHTML = S.tab === "seances" ? seancesHTML() : S.tab === "evolution" ? evolutionHTML() : calendrierHTML();
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
  const lastBw = latestWeighIn();
  if (lastBw && diffDaysSimple(lastBw.date, S.today) >= 7) {
    out += `<section class="banner group"><p class="t-headline">Pense à te peser</p>
      <p class="t-sub">Dernière pesée il y a ${diffDaysSimple(lastBw.date, S.today)} jours.</p>
      <button class="btn small filled press" data-action="bw-add">Ajouter une pesée</button></section>`;
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

  const done = doneSet(iso);
  const nDone = plan.exercises.filter((e) => done.has(e.id)).length;
  const allDone = n > 0 && nDone === n;
  const heroMeta = plan.isRest ? "Jour de repos"
    : nDone ? `${nDone} sur ${n} exercice${n > 1 ? "s" : ""} faits` : `${n} exercice${n > 1 ? "s" : ""}`;
  const finish = dayStatus(iso) === "Fait"
    ? `<button class="btn wide press" data-action="open-day" data-date="${iso}">${ICON.check} Séance faite · corriger</button>`
    : `<button class="btn filled wide press ${allDone ? "ready" : ""}" data-action="finish">${ICON.check} ${allDone ? "Tout est fait · pointer la séance" : "Séance terminée"}</button>`;
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
    ${S.editing ? editListHTML(iso, plan)
      : plan.isRest
      ? `<section class="rest-day group"><h3 class="t-headline">Jour de repos</h3><p class="t-sub">Rien de prévu ce jour-là. Tu peux quand même le pointer.</p>
          <button class="btn small press" style="margin-top:0.9rem" data-action="edit-start">${ICON.plus} Prévoir une séance ce jour-là</button></section>${noteHTML(iso)}`
      : `<div class="progress-head"><p class="t-eyebrow">Exercices</p>
           <span class="ph-right"><span class="t-sub num" id="progress-count">${nDone}/${n}</span>
           <button class="btn small plain press" data-action="edit-start">Modifier</button></span></div>
         <div class="progress" id="progress" role="progressbar" aria-label="Progression de la séance" aria-valuemin="0" aria-valuemax="${n}" aria-valuenow="${nDone}"><span></span></div>
         <p class="t-foot sets-hint">Touche un exercice à chaque série faite · appui long pour en retirer une</p>
         <section class="exlist group" aria-label="Exercices">${plan.exercises.map((ex, i) => exerciseHTML(ex, i, done, nextId(plan, done))).join("")}</section>${finish}${noteHTML(iso)}`}`;
}

/* ----- éditeur du programme (s'applique au jour de la semaine) ----- */
const DAY_PREFIX = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"];
const REST_CHOICES = ["—", "30 s", "45 s", "60 s", "60–90 s", "90 s", "90–120 s", "2 min", "2–3 min", "3 min", "3–4 min", "4 min", "5 min"];

function dayOf(program, wi) {
  let d = program.days.find((x) => x.day === wi + 1);
  if (!d) {
    d = { day: wi + 1, weekday: WEEKDAYS[wi], title: "Repos", exercises: [] };
    program.days.push(d);
    program.days.sort((a, b) => a.day - b.day);
  }
  return d;
}

/** Modifie une copie du programme, la vérifie, l'enregistre sur le téléphone puis réaffiche. */
function mutateProgram(fn, { render = true } = {}) {
  const p = structuredClone(S.program);
  fn(p);
  for (const d of p.days) {
    if (!d.exercises.length) d.title = "Repos";
    else if (!d.title || d.title === "Repos") d.title = "Séance";
  }
  const errors = checkProgram(p);
  if (errors.length) { toast(errors[0]); return false; }
  if (!saveProgramData(p)) { toast("Impossible d'enregistrer sur cet appareil."); return false; }
  S.program = p;
  S.ctx = buildContext(p, S.start);
  if (render) renderAll();
  return true;
}

function editListHTML(iso, plan) {
  const wi = weekdayIndex(iso);
  const day = WEEKDAYS[wi].toLowerCase();
  const rows = plan.exercises.map((ex, i) => `<div class="ex-edit">
      <button class="ex-edit-main row-press" data-action="ex-edit" data-id="${esc(ex.id)}">
        <span class="grow"><b>${esc(ex.name)}</b><small>${esc(ex.reps)}${ex.rest && ex.rest !== "—" ? ` · repos ${esc(ex.rest)}` : ""}</small></span>
        <span class="chev-sm">${ICON.right}</span></button>
      <button class="chev press" data-action="ex-move" data-id="${esc(ex.id)}" data-dir="-1" aria-label="Monter ${esc(ex.name)}" ${i === 0 ? "disabled" : ""}>${ICON.up}</button>
      <button class="chev press" data-action="ex-move" data-id="${esc(ex.id)}" data-dir="1" aria-label="Descendre ${esc(ex.name)}" ${i === plan.exercises.length - 1 ? "disabled" : ""}>${ICON.down}</button>
    </div>`).join("");
  return `<div class="progress-head"><p class="t-eyebrow">Séance du ${day}</p>
      <button class="btn small plain press strong" data-action="edit-done">Terminé</button></div>
    <p class="note pad" style="margin:0 0 0.65rem">Les changements s'appliquent à tous les ${day}s.</p>
    <div class="group-list edit-title">
      <label class="list-row"><span class="grow">Nom de la séance</span>
        <input class="inline-input wide" id="day-title" value="${esc(plan.isRest ? "" : plan.title)}" placeholder="Ex. Dos + biceps" maxlength="40" enterkeyhint="done"></label>
    </div>
    <section class="exlist group edit" aria-label="Exercices">${rows}
      <button class="list-row tint row-press add-row" data-action="ex-add">${ICON.plus} Ajouter un exercice</button>
    </section>`;
}

function saveDayTitle(silent = false) {
  const input = $("#day-title");
  if (!input) return;
  const wi = weekdayIndex(S.selected);
  const title = input.value.trim().slice(0, 40);
  const cur = dayOf(structuredClone(S.program), wi);
  if (!cur.exercises.length || title === cur.title || !title) return;
  // En quittant le champ, on enregistre sans tout réafficher : le bouton touché reste en place.
  if (mutateProgram((p) => { dayOf(p, wi).title = title; }, { render: !silent }) && silent) {
    const t = $(".hero .title");
    if (t) t.textContent = title;
  }
}

function splitReps(reps) {
  const m = /^\s*(\d{1,2})\s*[×x]\s*(.+)$/i.exec(reps || "");
  return m ? { series: m[1], reps: m[2].trim() } : { series: "", reps: (reps || "").trim() };
}

function exEditorHTML(ex, isNew) {
  const wi = weekdayIndex(S.selected);
  const r = splitReps(ex.reps);
  const rest = ex.rest || "—";
  const restOpts = (REST_CHOICES.includes(rest) ? REST_CHOICES : [rest, ...REST_CHOICES])
    .map((v) => `<option value="${esc(v)}" ${v === rest ? "selected" : ""}>${v === "—" ? "Aucun" : esc(v)}</option>`).join("");
  const pct = typeof ex.percent === "number" ? String(Math.round(ex.percent * 1000) / 10).replace(".", ",") : "";
  const dropPct = typeof ex.dropPercent === "number" ? String(Math.round(ex.dropPercent * 1000) / 10).replace(".", ",") : "25";
  const bw = exerciseModes(ex).length > 0;
  return sheet(isNew ? "Nouvel exercice" : "Modifier l'exercice", `Séance du ${WEEKDAYS[wi].toLowerCase()}`, `
    <div class="group-list">
      <label class="list-row"><span class="grow">Nom</span>
        <input class="inline-input wide" id="ef-name" value="${esc(ex.name || "")}" placeholder="Ex. Tirage vertical" maxlength="60" autocapitalize="sentences"></label>
    </div>
    <div class="group-list">
      <label class="list-row"><span class="grow">Séries</span>
        <input class="inline-input num" id="ef-series" inputmode="numeric" value="${esc(r.series)}" placeholder="—" maxlength="2"></label>
      <label class="list-row"><span class="grow">Répétitions ou durée</span>
        <input class="inline-input num" id="ef-reps" value="${esc(r.reps)}" placeholder="8–12" maxlength="40"></label>
      <label class="list-row"><span class="grow">Repos</span>
        <select class="inline-select" id="ef-rest">${restOpts}</select></label>
      <label class="list-row"><span class="grow">Consigne</span>
        <input class="inline-input wide" id="ef-method" value="${esc(ex.method || "")}" placeholder="Au feeling" maxlength="40"></label>
    </div>
    <p class="t-eyebrow list-title">Charge</p>
    <div class="group-list">
      <label class="list-row"><span class="grow">Poids du corps</span>
        <input type="checkbox" class="switch" id="ef-bw" ${bw ? "checked" : ""}></label>
      <label class="list-row" id="ef-pct-row" ${bw ? "hidden" : ""}><span class="grow">% du 1RM</span>
        <input class="inline-input num" id="ef-pct" inputmode="decimal" value="${esc(pct)}" placeholder="Au feeling" maxlength="5"></label>
      <label class="list-row"><span class="grow">Dropset à l'échec</span>
        <input type="checkbox" class="switch" id="ef-drop" ${ex.drop ? "checked" : ""}></label>
      <label class="list-row" id="ef-drop-row" ${ex.drop ? "" : "hidden"}><span class="grow">Baisse de la charge (%)</span>
        <input class="inline-input num" id="ef-droppct" inputmode="decimal" value="${esc(dropPct)}" maxlength="4"></label>
    </div>
    <p class="error" id="ef-error" role="alert" style="margin-top:-0.6rem"></p>
    <div class="actions-2">
      <button class="btn press" data-action="close-modal">Annuler</button>
      <button class="btn filled press" data-action="ex-save">Enregistrer</button>
    </div>
    ${isNew ? "" : `<button class="btn plain danger wide press" style="margin-top:0.4rem" data-action="ex-delete">Supprimer l'exercice</button>`}`);
}

function openExEditor(id) {
  const plan = planFor(S.program, S.selected);
  const ex = id ? plan.exercises.find((e) => e.id === id) : null;
  if (id && !ex) return;
  S.modal = { kind: "ex-edit", id: id || null, armed: false };
  openModal(exEditorHTML(ex || { name: "", reps: "", rest: "90–120 s", method: "", percent: null, drop: false, dropPercent: null }, !ex),
    ex ? null : "#ef-name");
}

function saveExEditor() {
  const err = (m) => { $("#ef-error").textContent = m; };
  const name = $("#ef-name").value.trim().replace(/\s+/g, " ");
  const series = $("#ef-series").value.trim();
  const reps = $("#ef-reps").value.trim().replace(/(\d)\s*-\s*(\d)/g, "$1–$2");
  const rest = $("#ef-rest").value;
  const method = $("#ef-method").value.trim().slice(0, 40);
  const bw = $("#ef-bw").checked;
  const drop = $("#ef-drop").checked;
  if (!name) return err("Donne un nom à l'exercice.");
  if (series && !/^\d{1,2}$/.test(series)) return err("Séries : un nombre entre 1 et 99.");
  if (series && Number(series) < 1) return err("Séries : au moins 1.");
  if (!reps) return err("Indique les répétitions ou la durée (ex. 8–12, 30 s, 15 min).");
  let percent = null;
  if (!bw) {
    const pc = parseDecimalInput($("#ef-pct").value, { min: 0, max: 150, unit: "%" });
    if (!pc.ok) return err(`% du 1RM : ${pc.error}`);
    if (!pc.empty) percent = Math.round(pc.value * 10) / 1000;
  }
  let dropPercent = null;
  if (drop) {
    const dp = parseDecimalInput($("#ef-droppct").value, { min: 0, max: 90, unit: "%" });
    if (!dp.ok || dp.empty) return err("Baisse du dropset : un pourcentage entre 1 et 90.");
    dropPercent = Math.round(dp.value * 10) / 1000;
  }
  const wi = weekdayIndex(S.selected);
  const id = S.modal.id || `${DAY_PREFIX[wi]}-${Date.now().toString(36)}`;
  const pctText = percent ? `${String(Math.round(percent * 1000) / 10).replace(".", ",")} % du 1RM` : "";
  // « Au feeling » n'a plus de sens si un % du 1RM est fixé.
  const finalMethod = percent && (!method || /feeling/i.test(method)) ? pctText
    : method || (bw ? "Poids du corps" : "Au feeling");
  const ex = {
    id, name: name.slice(0, 60), reps: (series ? `${Number(series)} × ${reps}` : reps).slice(0, 40), rest,
    method: finalMethod,
    percent, rmKey: null, drop, dropPercent, bodyweight: bw,
  };
  if (bw) ex.modes = ["PDC", "Lesté", "Assisté"];
  const isNew = !S.modal.id;
  const ok = mutateProgram((p) => {
    const d = dayOf(p, wi);
    const i = d.exercises.findIndex((e) => e.id === id);
    if (i >= 0) d.exercises[i] = ex;
    else d.exercises.push(ex);
  });
  if (!ok) return;
  closeModal();
  toast(isNew ? "Exercice ajouté" : "Exercice modifié");
}

function deleteExercise() {
  const btn = $("[data-action=ex-delete]");
  if (!S.modal.armed) {
    // Deux appuis : la suppression efface aussi les réglages de cet exercice.
    S.modal.armed = true;
    btn.textContent = "Confirmer la suppression";
    btn.classList.add("armed");
    return;
  }
  const id = S.modal.id;
  const wi = weekdayIndex(S.selected);
  if (mutateProgram((p) => { const d = dayOf(p, wi); d.exercises = d.exercises.filter((e) => e.id !== id); })) {
    closeModal();
    toast("Exercice supprimé");
  }
}

function moveExercise(id, dir) {
  const wi = weekdayIndex(S.selected);
  mutateProgram((p) => {
    const list = dayOf(p, wi).exercises;
    const i = list.findIndex((e) => e.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
  });
}

function resetProgram() {
  const btn = $("[data-action=program-reset]");
  if (!btn.classList.contains("armed")) {
    btn.classList.add("armed");
    btn.textContent = "Confirmer : revenir au programme d'origine";
    return;
  }
  clearProgram();
  S.program = PROGRAM;
  S.ctx = buildContext(PROGRAM, S.start);
  closeModal();
  renderAll();
  toast("Programme d'origine rétabli");
}

/* ----- charges notées ----- */
const numFr = (n) => String(n).replace(".", ",");
const shortDay = (iso) =>
  new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
const diffDaysSimple = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

function fmtSet(set) {
  if (!set) return "";
  const w = set.w == null ? "" : set.w === 0 ? "PDC" : formatKg(set.w);
  const r = set.r ? `${set.r} rép.` : "";
  return w && r ? `${w} × ${set.r}` : w || r;
}

function logHistory(exId) {
  const out = [];
  for (const [k, e] of S.store.all()) {
    if (!k.startsWith("log:") || !e.v || !e.v[exId]) continue;
    out.push({ date: k.slice(4), ...e.v[exId] });
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}

function lastLog(exId, beforeIso) {
  return logHistory(exId).find((x) => x.date < beforeIso) || null;
}

/** Conseil simple de progression : plus de répétitions, puis plus de poids. */
function progressTip(last, range) {
  if (!last || !range) return "";
  if (last.r && last.r >= range.hi && last.w) {
    return `Tu as atteint ${range.hi} rép. : essaie ${formatKg(roundHalf(last.w + 2.5))} pour ${range.lo} rép.`;
  }
  if (last.r && last.w != null) return `Pour progresser : vise ${Math.min(last.r + 1, range.hi)} rép. à ${last.w === 0 ? "PDC" : formatKg(last.w)}.`;
  return "";
}

function openLog(id) {
  const ex = S.ctx.exercises.get(id);
  if (!ex) return;
  const range = repRange(ex.reps);
  const today = (S.store.get(`log:${S.selected}`) || {})[id] || null;
  const last = lastLog(id, S.selected);
  const hist = logHistory(id).filter((x) => x.date !== S.selected).slice(0, 5);
  const bw = exerciseModes(ex).length > 0;
  S.modal = { kind: "log", id };
  const tip = progressTip(last, range);
  openModal(sheet("Ma série", `${esc(ex.name)} · ${esc(ex.reps)}`, `
    ${last ? `<div class="group-list">
      <div class="list-row result"><small>Dernière fois · ${esc(shortDay(last.date))}</small><b>${esc(fmtSet(last))}</b></div>
      ${tip ? `<div class="list-row tip">${ICON.chart}<span>${esc(tip)}</span></div>` : ""}</div>` : ""}
    <label class="field-big"><span>${bw ? "Lest (0 = poids du corps)" : "Charge utilisée"}</span>
      <span class="with-unit"><input id="lg-w" inputmode="decimal" autocomplete="off" enterkeyhint="next"
        value="${today && today.w != null ? esc(numFr(today.w)) : ""}" placeholder="${last && last.w != null ? esc(numFr(last.w)) : "0"}"><span class="unit">kg</span></span></label>
    <div class="group-list">
      <label class="list-row"><span class="grow">Répétitions</span>
        <input class="inline-input num" id="lg-r" inputmode="numeric" maxlength="3" enterkeyhint="done"
          value="${today && today.r ? today.r : ""}" placeholder="${range ? range.hi : "—"}"></label>
    </div>
    <p class="error" id="lg-error" role="alert" style="margin-top:-0.6rem"></p>
    ${hist.length ? `<p class="t-eyebrow list-title">Historique</p><div class="group-list">${hist.map((h) =>
      `<div class="list-row result"><small>${esc(shortDay(h.date))}</small><b>${esc(fmtSet(h))}</b></div>`).join("")}</div>` : ""}
    <div class="actions-2">
      <button class="btn press" data-action="close-modal">Annuler</button>
      <button class="btn filled press" data-action="log-save">Enregistrer</button>
    </div>
    ${today ? `<button class="btn plain danger wide press" style="margin-top:0.4rem" data-action="log-clear">Effacer</button>` : ""}`), "#lg-w");
}

function saveLog() {
  const id = S.modal.id;
  const err = (m) => { $("#lg-error").textContent = m; };
  const w = parseDecimalInput($("#lg-w").value, { min: 0, minInclusive: true, max: LIMITS.rmMax });
  if (!w.ok) return err(w.error);
  const rRaw = $("#lg-r").value.trim();
  if (rRaw && !/^\d{1,3}$/.test(rRaw)) return err("Répétitions : un nombre entier.");
  const r = rRaw ? Number(rRaw) : null;
  if (r !== null && (r < 1 || r > 100)) return err("Répétitions : entre 1 et 100.");
  if (w.empty && r === null) return err("Indique la charge ou les répétitions.");
  const iso = S.selected;
  const log = { ...(S.store.get(`log:${iso}`) || {}) };
  log[id] = { w: w.empty ? null : w.value, r };
  // Noter sa série coche aussi l'exercice : on passe directement au suivant.
  const plan = planFor(S.program, iso);
  const done = doneSet(iso);
  const newlyDone = !done.has(id);
  done.add(id);
  const ids = plan.exercises.map((e) => e.id).filter((x) => done.has(x));
  S.justChecked = newlyDone ? id : null;
  closeModal();
  const ex = plan.exercises.find((e) => e.id === id);
  const sets = { ...(S.store.get(`sets:${iso}`) || {}) };
  if (ex) { S.fillFrom[id] = setsDone(ex, iso) / seriesCount(ex); sets[id] = seriesCount(ex); }
  S.store.setMany({ [`log:${iso}`]: log, [`ex:${iso}`]: ids, [`sets:${iso}`]: sets });
  if (newlyDone) haptic();
  toast(`Série notée : ${fmtSet(log[id])}`);
}

function clearLog() {
  const iso = S.selected;
  const log = { ...(S.store.get(`log:${iso}`) || {}) };
  delete log[S.modal.id];
  closeModal();
  S.store.set(`log:${iso}`, Object.keys(log).length ? log : null);
  toast("Charge effacée");
}

/* ----- note de séance ----- */
function noteHTML(iso) {
  const note = S.store.get(`note:${iso}`) || "";
  return `<p class="t-eyebrow section-title" style="margin-top:1.4rem">Note de séance</p>
    <div class="group-list note-box"><textarea id="session-note" data-date="${iso}" rows="3" maxlength="${NOTE_MAX}"
      placeholder="Ressenti, douleur, à changer la prochaine fois…" aria-label="Note de séance">${esc(note)}</textarea></div>`;
}

function saveNote(iso, value) {
  const v = validateEntry(`note:${iso}`, value, S.ctx);
  if (!v.ok) return;
  if ((S.store.get(`note:${iso}`) || null) === v.value) return;
  S.store.set(`note:${iso}`, v.value, { silent: true }); // pas de réaffichage pendant la frappe
}

function dayExtrasHTML(iso) {
  const note = S.store.get(`note:${iso}`);
  const bw = S.store.get(`bw:${iso}`);
  const log = S.store.get(`log:${iso}`);
  const rows = [];
  if (log) {
    for (const [id, set] of Object.entries(log)) {
      const ex = S.ctx.exercises.get(id);
      if (ex) rows.push(`<div class="list-row result"><small>${esc(ex.name)}</small><b>${esc(fmtSet(set))}</b></div>`);
    }
  }
  if (bw != null) rows.push(`<div class="list-row result"><small>Pesée</small><b>${esc(formatKg(bw))}</b></div>`);
  return `${rows.length ? `<p class="t-eyebrow list-title">Ce jour-là</p><div class="group-list">${rows.join("")}</div>` : ""}
    ${note ? `<p class="t-eyebrow list-title">Note</p><div class="group-list"><p class="note-read">${esc(note)}</p></div>` : ""}`;
}

/* ----- onglet Évolution ----- */
function evolutionHTML() {
  return `<section class="page-head"><h1 class="t-large">Évolution</h1>
      <p class="t-sub">Ton poids et tes charges au fil des semaines</p></section>
    ${bodyWeightHTML()}
    ${chargesHTML()}`;
}

function setDelta(first, last) {
  if (first.w != null && last.w != null && first.w !== last.w) {
    const d = Math.round((last.w - first.w) * 100) / 100;
    return { text: `${d > 0 ? "+" : "−"}${formatKg(Math.abs(d))}`, up: d > 0 };
  }
  if (first.r && last.r && first.r !== last.r) {
    const d = last.r - first.r;
    return { text: `${d > 0 ? "+" : "−"}${Math.abs(d)} rép.`, up: d > 0 };
  }
  return { text: "stable", up: null };
}

function chargesHTML() {
  const rows = [];
  for (const day of [...S.program.days].sort((a, b) => a.day - b.day)) {
    for (const ex of day.exercises) {
      const h = logHistory(ex.id);
      if (!h.length) continue;
      const last = h[0], first = h[h.length - 1];
      const d = h.length > 1 ? setDelta(first, last) : null;
      rows.push(`<button class="list-row row-press evo-row" data-action="ex-history" data-id="${esc(ex.id)}">
        <span class="grow"><b>${esc(ex.name)}</b><small>${esc(day.weekday || WEEKDAYS[day.day - 1])} · ${h.length} séance${h.length > 1 ? "s" : ""}</small></span>
        <span class="evo-val"><b class="num">${esc(fmtSet(last))}</b>${d ? `<small class="${d.up === true ? "up" : d.up === false ? "down" : ""}">${esc(d.text)}</small>` : ""}</span>
        <span class="chev-sm">${ICON.right}</span></button>`);
    }
  }
  return `<section class="evo-charges" aria-label="Charges">
    <div class="stats-head"><h2 class="t-title2">Charges</h2></div>
    ${rows.length ? `<div class="group-list">${rows.join("")}</div>
      <p class="note pad">Écart entre ta première et ta dernière série notée.</p>`
      : `<div class="group bw-card"><p class="t-sub">Pendant tes séances, touche « Noter » sur un exercice : ta progression apparaîtra ici.</p></div>`}
  </section>`;
}

function openHistory(id) {
  const ex = S.ctx.exercises.get(id);
  if (!ex) return;
  const h = logHistory(id);
  S.modal = { kind: "history", id };
  const weights = h.filter((x) => typeof x.w === "number" && x.w > 0).map((x) => ({ date: x.date, w: x.w })).reverse();
  openModal(sheet(esc(ex.name), `${esc(ex.reps)} · ${h.length} séance${h.length > 1 ? "s" : ""}`, `
    ${weights.length >= 2 ? `<div class="group bw-card sheet-card">${weightChartSVG(weights, null, `Courbe des charges, ${ex.name}`)}</div>` : ""}
    <p class="t-eyebrow list-title">Historique</p>
    <div class="group-list">${h.map((x) => `<div class="list-row result"><small>${esc(shortDay(x.date))}</small><b>${esc(fmtSet(x))}</b></div>`).join("")}</div>`));
}

/* ----- poids de corps ----- */
function weighIns() {
  const out = [];
  for (const [k, e] of S.store.all()) if (k.startsWith("bw:") && typeof e.v === "number") out.push({ date: k.slice(3), w: e.v });
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}
function latestWeighIn() {
  const all = weighIns();
  return all.length ? all[all.length - 1] : null;
}

const fmtSigned = (n) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${formatKg(Math.abs(Math.round(n * 10) / 10))}`;

function bodyWeightHTML() {
  const list = weighIns();
  const g = S.config.goal;
  const last = list[list.length - 1];
  const first = list[0];
  let summary = `<p class="t-sub">Aucune pesée pour l'instant. Une par semaine suffit, le matin à jeun.</p>`;
  if (last) {
    const start = g ? g.from : first.w;
    const gained = last.w - start;
    const toGo = g ? g.to - last.w : null;
    const pct = g && g.to !== g.from ? clamp((last.w - g.from) / (g.to - g.from)) : null;
    summary = `<div class="bw-top">
        <div><p class="bw-value num">${esc(formatKg(last.w))}</p><p class="t-sub">Pesée du ${esc(shortDay(last.date))}</p></div>
        <div class="bw-delta"><b class="num">${esc(fmtSigned(gained))}</b><span class="t-sub">${g ? "depuis le départ" : "depuis la 1re pesée"}</span></div>
      </div>
      ${g ? `<div class="bw-goal"><div class="progress goal"><span style="transform:scaleX(${pct})"></span></div>
        <p class="t-sub">${toGo > 0 ? `Encore ${esc(formatKg(Math.round(toGo * 10) / 10))} pour atteindre ${esc(formatKg(g.to))}` : `Objectif de ${esc(formatKg(g.to))} atteint 🎉`}</p></div>` : ""}
      ${list.length >= 2 ? weightChartSVG(list, g) : ""}`;
  }
  const rows = list.slice(-5).reverse().map((x) => `<button class="list-row row-press result" data-action="bw-edit" data-date="${x.date}">
      <small>${esc(shortDay(x.date))}</small><b class="num">${esc(formatKg(x.w))}</b></button>`).join("");
  return `<section class="bw-section" aria-label="Poids de corps">
    <div class="stats-head"><h2 class="t-title2">Poids de corps</h2>
      <button class="btn small press" data-action="bw-add">${ICON.plus} Pesée</button></div>
    <div class="group bw-card">${summary}</div>
    ${rows ? `<p class="t-eyebrow list-title" style="margin-top:1rem">Dernières pesées</p><div class="group-list">${rows}</div>` : ""}
  </section>`;
}

/** Courbe simple (une seule série : pas de légende, le titre la nomme). */
function weightChartSVG(list, goal, label = "Courbe du poids de corps") {
  const W = 320, H = 140, padL = 34, padR = 12, padT = 12, padB = 22;
  const t0 = Date.parse(`${list[0].date}T00:00:00Z`), t1 = Date.parse(`${list[list.length - 1].date}T00:00:00Z`);
  const vals = list.map((x) => x.w).concat(goal ? [goal.to] : []);
  let lo = Math.floor(Math.min(...vals) - 1), hi = Math.ceil(Math.max(...vals) + 1);
  if (hi - lo < 4) { const mid = (hi + lo) / 2; lo = Math.floor(mid - 2); hi = Math.ceil(mid + 2); }
  const x = (d) => padL + (t1 === t0 ? (W - padL - padR) : ((Date.parse(`${d}T00:00:00Z`) - t0) / (t1 - t0)) * (W - padL - padR));
  const y = (v) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  const pts = list.map((p) => [x(p.date), y(p.w)]);
  const path = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");
  const area = `${path}L${pts[pts.length - 1][0].toFixed(1)},${H - padB}L${pts[0][0].toFixed(1)},${H - padB}Z`;
  const ticks = [lo, Math.round((lo + hi) / 2), hi];
  const lastP = pts[pts.length - 1];
  const data = esc(JSON.stringify(list.map((p, i) => ({ x: pts[i][0], y: pts[i][1], t: `${shortDay(p.date)} · ${formatKg(p.w)}` }))));
  return `<figure class="bw-chart" data-points="${data}">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}, de ${esc(formatKg(list[0].w))} à ${esc(formatKg(list[list.length - 1].w))}">
      ${ticks.map((t) => `<line class="grid" x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}"/><text class="tick" x="${padL - 6}" y="${y(t) + 3.5}" text-anchor="end">${t}</text>`).join("")}
      ${goal ? `<line class="goal-line" x1="${padL}" x2="${W - padR}" y1="${y(goal.to)}" y2="${y(goal.to)}"/><text class="tick goal-txt" x="${W - padR}" y="${y(goal.to) - 5}" text-anchor="end">Objectif ${numFr(goal.to)}</text>` : ""}
      <path class="area" d="${area}"/>
      <path class="line" d="${path}"/>
      <circle class="end" cx="${lastP[0]}" cy="${lastP[1]}" r="4.5"/>
      <g class="cross" visibility="hidden"><line class="cross-l" y1="${padT}" y2="${H - padB}"/><circle class="cross-d" r="4.5"/></g>
    </svg>
    <figcaption class="chart-tip t-foot" aria-live="polite"></figcaption>
  </figure>`;
}

// Toucher/survoler la courbe : point le plus proche + valeur.
function chartPointer(e) {
  const fig = e.target.closest && e.target.closest(".bw-chart");
  if (!fig) return;
  const svgEl = fig.querySelector("svg");
  const pts = JSON.parse(fig.dataset.points);
  const r = svgEl.getBoundingClientRect();
  const vx = ((e.clientX - r.left) / r.width) * 320;
  let best = pts[0];
  for (const p of pts) if (Math.abs(p.x - vx) < Math.abs(best.x - vx)) best = p;
  const g = svgEl.querySelector(".cross");
  g.setAttribute("visibility", "visible");
  g.querySelector(".cross-l").setAttribute("x1", best.x);
  g.querySelector(".cross-l").setAttribute("x2", best.x);
  g.querySelector(".cross-d").setAttribute("cx", best.x);
  g.querySelector(".cross-d").setAttribute("cy", best.y);
  fig.querySelector(".chart-tip").textContent = best.t;
}
document.addEventListener("pointermove", chartPointer);
document.addEventListener("pointerdown", chartPointer);

function openWeighIn(iso) {
  if (!inPeriod(iso, S.start)) iso = clampToPeriod(iso, S.start);
  const cur = S.store.get(`bw:${iso}`);
  const last = latestWeighIn();
  S.modal = { kind: "bw", iso, armed: false };
  openModal(sheet("Pesée", esc(capitalize(formatLongFr(iso))), `
    <label class="field-big"><span>Poids de corps</span>
      <span class="with-unit"><input id="bw-input" inputmode="decimal" autocomplete="off" enterkeyhint="done"
        value="${cur != null ? esc(numFr(cur)) : ""}" placeholder="${last ? esc(numFr(last.w)) : "0"}"><span class="unit">kg</span></span></label>
    <p class="error" id="bw-error" role="alert"></p>
    <p class="note pad" style="margin-top:0">Idéalement le matin, à jeun, une fois par semaine.</p>
    <div class="actions-2">
      <button class="btn press" data-action="close-modal">Annuler</button>
      <button class="btn filled press" data-action="bw-save">Enregistrer</button>
    </div>
    ${cur != null ? `<button class="btn plain danger wide press" style="margin-top:0.4rem" data-action="bw-delete">Supprimer la pesée</button>` : ""}`), "#bw-input");
}

function saveWeighIn() {
  const p = parseDecimalInput($("#bw-input").value, { min: 20, minInclusive: true, max: 400 });
  if (!p.ok || p.empty) { $("#bw-error").textContent = "Indique un poids entre 20 et 400 kg."; return; }
  const iso = S.modal.iso;
  closeModal();
  S.store.set(`bw:${iso}`, p.value);
  toast(`Pesée enregistrée : ${formatKg(p.value)}`);
}

function deleteWeighIn() {
  const btn = $("[data-action=bw-delete]");
  if (!S.modal.armed) { S.modal.armed = true; btn.textContent = "Confirmer la suppression"; btn.classList.add("armed"); return; }
  const iso = S.modal.iso;
  closeModal();
  S.store.set(`bw:${iso}`, null);
  toast("Pesée supprimée");
}

/* ----- exercices cochés pendant la séance ----- */
const doneSet = (iso) => new Set(S.store.get(`ex:${iso}`) || []);
const nextId = (plan, done) => (plan.exercises.find((e) => !done.has(e.id)) || {}).id;

function toggleExercise(id) {
  const iso = S.selected;
  const plan = planFor(S.program, iso);
  if (!plan.exercises.some((e) => e.id === id)) return;
  const done = doneSet(iso);
  const adding = !done.has(id);
  if (adding) done.add(id);
  else done.delete(id);
  const ids = plan.exercises.map((e) => e.id).filter((x) => done.has(x));
  S.justChecked = adding ? id : null;
  if (adding) haptic();
  const ex = plan.exercises.find((e) => e.id === id);
  const total = seriesCount(ex);
  const sets = { ...(S.store.get(`sets:${iso}`) || {}) };
  S.fillFrom[id] = setsDone(ex, iso) / total;
  if (adding) sets[id] = total;
  else delete sets[id];
  S.store.setMany({ [`ex:${iso}`]: ids.length ? ids : null, [`sets:${iso}`]: Object.keys(sets).length ? sets : null });
  if (adding && ids.length === plan.exercises.length && dayStatus(iso) !== "Fait") toast("Séance complète, pense à la pointer");
}

/* ----- séries : la case de l'exercice se remplit comme une jauge ----- */
function setsDone(ex, iso) {
  const total = seriesCount(ex);
  const n = (S.store.get(`sets:${iso}`) || {})[ex.id];
  if (typeof n === "number") return Math.min(n, total);
  return doneSet(iso).has(ex.id) ? total : 0; // coché avant l'arrivée des séries
}

function changeSets(id, delta) {
  const iso = S.selected;
  const plan = planFor(S.program, iso);
  const ex = plan.exercises.find((e) => e.id === id);
  if (!ex) return;
  const total = seriesCount(ex);
  const before = setsDone(ex, iso);
  const after = clamp(before + delta, 0, total);
  if (after === before) {
    if (delta > 0) toast("Toutes les séries sont déjà faites · appui long pour en retirer");
    return;
  }
  const sets = { ...(S.store.get(`sets:${iso}`) || {}) };
  if (after) sets[id] = after;
  else delete sets[id];
  const done = doneSet(iso);
  const wasDone = done.has(id);
  if (after >= total) done.add(id);
  else done.delete(id);
  const ids = plan.exercises.map((e) => e.id).filter((x) => done.has(x));
  S.fillFrom[id] = before / total;
  S.justChecked = !wasDone && after >= total ? id : null;
  S.store.setMany({ [`sets:${iso}`]: Object.keys(sets).length ? sets : null, [`ex:${iso}`]: ids.length ? ids : null });
  haptic(after >= total ? 20 : 8);
  if (delta < 0) { toast(`Série retirée · ${after}/${total}`); return; }
  const allDone = ids.length === plan.exercises.length;
  // Repos automatique après chaque série (sauf après la toute dernière de la séance).
  if (S.prefs.autoTimer && restSeconds(ex.rest) && !allDone) startTimer(ex);
  if (allDone && dayStatus(iso) !== "Fait") toast("Séance complète, pense à la pointer");
}

/** La jauge glisse de l'ancienne valeur vers la nouvelle. */
function animateFills() {
  const from = S.fillFrom;
  S.fillFrom = {};
  const els = document.querySelectorAll(".ex-fill[data-to]");
  if (!els.length) return;
  for (const el of els) {
    const id = el.closest(".ex").dataset.ex;
    if (id in from && !reducedMotion()) el.style.transform = `scaleX(${from[id]})`;
  }
  requestAnimationFrame(() => requestAnimationFrame(() => {
    for (const el of els) {
      el.classList.add("animate");
      el.style.transform = `scaleX(${el.dataset.to})`;
    }
  }));
}

// Appui long sur la case : retire une série.
let pressTimer = null;
let pressStart = null;
document.addEventListener("pointerdown", (e) => {
  const hit = e.target.closest && e.target.closest(".ex-hit");
  if (!hit) return;
  pressStart = { x: e.clientX, y: e.clientY, id: e.pointerId };
  clearTimeout(pressTimer);
  pressTimer = setTimeout(() => {
    pressTimer = null;
    S.suppressClickUntil = performance.now() + 600;
    changeSets(hit.dataset.id, -1);
  }, 520);
});
document.addEventListener("pointermove", (e) => {
  if (!pressTimer || !pressStart || e.pointerId !== pressStart.id) return;
  if (Math.hypot(e.clientX - pressStart.x, e.clientY - pressStart.y) > 10) { clearTimeout(pressTimer); pressTimer = null; }
});
for (const t of ["pointerup", "pointercancel"]) {
  document.addEventListener(t, () => { clearTimeout(pressTimer); pressTimer = null; });
}
document.addEventListener("contextmenu", (e) => { if (e.target.closest && e.target.closest(".ex-hit")) e.preventDefault(); });

// La barre de progression glisse vers sa nouvelle valeur au lieu de sauter.
const progressSpring = new Spring(0, { onUpdate: (v) => paintProgress(v) });
let progressDate = "";
function paintProgress(v) {
  const bar = $("#progress span");
  if (bar) bar.style.transform = `scaleX(${clamp(v, 0, 1)})`;
}
function syncProgress() {
  const el = $("#progress");
  if (!el) return;
  const n = Number(el.getAttribute("aria-valuemax")) || 1;
  const target = Number(el.getAttribute("aria-valuenow")) / n;
  if (progressDate !== S.selected || reducedMotion()) {
    progressDate = S.selected;
    progressSpring.set(target);
  } else if (progressSpring.target !== target) {
    progressSpring.to(target, { damping: 1, response: 0.4, precision: 0.002 });
  }
  paintProgress(progressSpring.value);
}

/** Après avoir coché, l'exercice suivant vient se placer sous les yeux. */
function revealNext() {
  const id = S.justChecked;
  S.justChecked = null;
  if (!id) return;
  const ring = document.querySelector(`.ex[data-ex="${CSS.escape(id)}"] .ring`);
  if (ring && !reducedMotion()) ring.classList.add("pop");
  const next = $(".ex.is-next");
  if (!next) return;
  const r = next.getBoundingClientRect();
  const bottomLimit = innerHeight - (isDesktop() ? 24 : 150);
  if (r.top < 70 || r.bottom > bottomLimit) {
    next.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" });
  }
}

function exerciseHTML(ex, i, done = new Set(), next = null) {
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
  const range = repRange(ex.reps);
  let logBtn = "";
  if (range) {
    const today = (S.store.get(`log:${S.selected}`) || {})[ex.id];
    const last = lastLog(ex.id, S.selected);
    logBtn = `<button class="pill log-btn press" data-action="edit-log" data-id="${esc(ex.id)}">${
      today ? `<small>Noté</small><b>${esc(fmtSet(today))}</b>`
      : last ? `<small>Dernière fois</small><b>${esc(fmtSet(last))}</b>`
      : `<small>Charge</small><b>Noter</b>`}</button>`;
  }
  const actions = [logBtn, restBtn, loadBtn].filter(Boolean);
  const showMethod = ex.method && !(usesRM(ex) && /%/.test(ex.method));
  const isDone = done.has(ex.id);
  const isNext = ex.id === next;
  const total = seriesCount(ex);
  const nSets = setsDone(ex, S.selected);
  const frac = nSets / total;
  const counter = total > 1 && nSets > 0 && nSets < total ? ` <span class="badge sets">${nSets}/${total}</span>` : "";
  return `<article class="ex ${isDone ? "is-done" : ""} ${isNext ? "is-next" : ""}" data-ex="${esc(ex.id)}">
    <span class="ex-fill" data-to="${frac}" style="transform:scaleX(${frac})" aria-hidden="true"></span>
    <button class="ex-hit" data-action="set-add" data-id="${esc(ex.id)}"
      aria-label="${esc(ex.name)} : ${nSets} série${nSets > 1 ? "s" : ""} sur ${total}. Toucher pour ajouter une série, appui long pour en retirer une."></button>
    <button class="ex-check" data-action="toggle-ex" data-id="${esc(ex.id)}" aria-pressed="${isDone}"
      aria-label="${esc(ex.name)} : ${isDone ? "fait, toucher pour décocher" : "toucher pour cocher"}">
      <span class="ring"><span class="n">${i + 1}</span>${ICON.check}</span></button>
    <div class="ex-body"><h3>${esc(ex.name)}${counter}${isNext && !counter ? ' <span class="badge next">EN COURS</span>' : ""}</h3>
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
    <div class="group-list"><button class="list-row danger row-press" data-action="clear-day" data-date="${iso}" ${st ? "" : "disabled"}>Effacer le pointage</button></div>
    ${dayExtrasHTML(iso)}`);
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
    <p class="t-eyebrow list-title" style="margin-top:1.4rem">Séance</p>
    <div class="group-list">
      <label class="list-row"><span class="grow">Lancer le repos après chaque série</span>
        <input type="checkbox" class="switch" id="pref-autotimer" ${S.prefs.autoTimer ? "checked" : ""}></label>
    </div>
    <p class="t-eyebrow list-title">Programme</p>
    <div class="group-list"><button class="list-row danger row-press" data-action="program-reset">Revenir au programme d'origine</button></div>
    <p class="note pad">Pour modifier une séance : onglet Séances, puis « Modifier » au-dessus des exercices.</p>
    <p class="t-eyebrow list-title">Écran d'accueil</p>
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
  return JSON.stringify({ ...buildExport(out, S.start), profile, program: S.program }, null, 2);
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
  if (file.size > LIMITS.importBytes) return err("Fichier trop volumineux (1 Mo maximum).");
  let text;
  try { text = await file.text(); } catch { return err("Impossible de lire ce fichier."); }
  let program = null;
  try {
    const p = JSON.parse(text).program;
    if (p && Array.isArray(p.days) && checkProgram(p).length === 0) program = p;
  } catch { /* vérifié juste après */ }
  const r = validateImport(text, program ? buildContext(program, S.start) : S.ctx);
  if (!r.ok) return err(r.error);
  let profile = null;
  try {
    const p = JSON.parse(text).profile;
    if (p && typeof p.firstName === "string") profile = { firstName: p.firstName.slice(0, 40), goal: p.goal && Number.isFinite(p.goal.from) && Number.isFinite(p.goal.to) ? p.goal : null };
  } catch { /* déjà validé */ }
  S.modal = { kind: "import", entries: r.entries, count: r.count, profile, program };
  setSheetContent(sheet("Restaurer cette sauvegarde ?", esc(file.name), `
    <div class="group-list"><div class="list-row result"><small>Valeurs à restaurer</small><b>${r.count}</b></div></div>
    <p class="note pad">Les éléments du fichier remplacent leurs valeurs actuelles ; tout le reste est conservé.${program ? " Ton programme sera aussi remplacé par celui du fichier." : ""} Rien ne change tant que tu n'as pas confirmé.</p>
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
    case "toggle-ex": return toggleExercise(id);
    case "set-add": return changeSets(id, 1);
    case "edit-log": return openLog(id);
    case "log-save": return saveLog();
    case "log-clear": return clearLog();
    case "bw-add": return openWeighIn(S.today);
    case "bw-edit": return openWeighIn(el.dataset.date);
    case "bw-save": return saveWeighIn();
    case "bw-delete": return deleteWeighIn();
    case "ex-history": return openHistory(id);
    case "edit-start": S.editing = true; renderAll(); return;
    case "edit-done": saveDayTitle(); S.editing = false; renderAll(); return;
    case "ex-edit": return openExEditor(id);
    case "ex-add": return openExEditor(null);
    case "ex-save": return saveExEditor();
    case "ex-delete": return deleteExercise();
    case "ex-move": return moveExercise(id, Number(el.dataset.dir));
    case "program-reset": return resetProgram();
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
      if (m.program) {
        saveProgramData(m.program);
        S.program = m.program;
        S.ctx = buildContext(m.program, S.start);
      }
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

let noteTimer = null;
document.addEventListener("input", (e) => {
  if (e.target.id === "session-note") {
    const iso = e.target.dataset.date;
    const value = e.target.value;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => saveNote(iso, value), 500);
    return;
  }
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
  if (e.target.id === "session-note") { clearTimeout(noteTimer); saveNote(e.target.dataset.date, e.target.value); return; }
  if (e.target.id === "cal-month") goToMonth(e.target.value);
  else if (e.target.id === "day-title") saveDayTitle(true);
  else if (e.target.id === "pref-autotimer") {
    S.prefs = { ...S.prefs, autoTimer: e.target.checked };
    savePrefs(S.prefs);
    toast(e.target.checked ? "Repos automatique activé" : "Repos automatique désactivé");
  }
  else if (e.target.id === "ef-bw") { const r = $("#ef-pct-row"); if (r) r.hidden = e.target.checked; }
  else if (e.target.id === "ef-drop") { const r = $("#ef-drop-row"); if (r) r.hidden = !e.target.checked; }
  else if (e.target.id === "import-file") handleImportFile(e.target);
});

document.addEventListener("keydown", (e) => {
  const open = sheetCtl && sheetCtl.state === "open";
  if (e.key === "Escape" && open) { e.preventDefault(); closeModal(); return; }
  if (e.key === "Enter" && e.target.id === "day-title") { e.preventDefault(); e.target.blur(); return; }
  if (e.key === "Enter" && open && e.target.id && e.target.id.startsWith("ef-") && e.target.tagName === "INPUT" && e.target.type !== "checkbox") {
    e.preventDefault();
    saveExEditor();
    return;
  }
  if (e.key === "Enter" && open && e.target.id && e.target.id.startsWith("pf-")) {
    e.preventDefault();
    saveProfileFromForm();
    return;
  }
  if (e.key === "Enter" && open && ["lg-w", "lg-r"].includes(e.target.id)) { e.preventDefault(); saveLog(); return; }
  if (e.key === "Enter" && open && e.target.id === "bw-input") { e.preventDefault(); saveWeighIn(); return; }
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
