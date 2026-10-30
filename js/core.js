// Logique partagée entre le serveur et le navigateur (aucune dépendance).
// Dates : chaînes « AAAA-MM-JJ » ; tous les calculs passent par UTC pour éviter
// tout décalage lié aux changements d'heure.

export const STATUSES = ["Fait", "Non fait", "Repos / annulé"];
export const MODES = ["PDC", "Lesté", "Assisté"];
export const LIMITS = {
  rmMax: 2000,
  bodyMax: 500,
  importBytes: 1000000,
  importEntries: 3000,
};
export const PERIOD_DAYS = 365;
export const WEEKDAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
export const WEEKDAYS_SHORT = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

/* ---------- Dates ---------- */

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidISO(s) {
  if (typeof s !== "string") return false;
  const m = ISO_RE.exec(s);
  if (!m) return false;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (y < 1970 || y > 2200) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function toUTC(iso) {
  const m = ISO_RE.exec(iso);
  return Date.UTC(+m[1], +m[2] - 1, +m[3]);
}

function fromUTC(ms) {
  const d = new Date(ms);
  const p = (n, l = 2) => String(n).padStart(l, "0");
  return `${p(d.getUTCFullYear(), 4)}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

export function addDays(iso, n) {
  return fromUTC(toUTC(iso) + n * 86400000);
}

export function diffDays(a, b) {
  return Math.round((toUTC(b) - toUTC(a)) / 86400000);
}

/** 0 = lundi … 6 = dimanche */
export function weekdayIndex(iso) {
  return (new Date(toUTC(iso)).getUTCDay() + 6) % 7;
}

export function daysInMonth(year, month1) {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

export function periodEnd(start) {
  return addDays(start, PERIOD_DAYS - 1);
}

export function buildPeriod(start) {
  const out = [];
  for (let i = 0; i < PERIOD_DAYS; i++) out.push(addDays(start, i));
  return out;
}

export function inPeriod(iso, start) {
  return isValidISO(iso) && iso >= start && iso <= periodEnd(start);
}

export function clampToPeriod(iso, start) {
  const end = periodEnd(start);
  return iso < start ? start : iso > end ? end : iso;
}

/** Date du jour dans un fuseau donné (par défaut Europe/Paris). */
export function todayInTZ(tz = "Europe/Paris", now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Numéro de semaine de programme. « 0 » = morceau de semaine initial. */
export function weekNumber(iso, start) {
  const startMon = addDays(start, -weekdayIndex(start));
  const base = Math.floor(diffDays(startMon, iso) / 7);
  return base + (weekdayIndex(start) === 0 ? 1 : 0);
}

export function weekLabel(iso, start) {
  return `Semaine ${String(weekNumber(iso, start)).padStart(2, "0")}`;
}

export function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export function formatLongFr(iso) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(toUTC(iso)));
}

export function formatDateFr(iso) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(toUTC(iso)));
}

export function monthLabelFr(ym) {
  const [y, m] = ym.split("-").map(Number);
  return capitalize(
    new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(
      new Date(Date.UTC(y, m - 1, 1)),
    ),
  );
}

export function dayNumber(iso) {
  return Number(iso.slice(8, 10));
}

export function shortDate(iso) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/** Mois civils couverts par la période (peut être 13). */
export function monthsOfPeriod(start) {
  const end = periodEnd(start);
  const out = [];
  let y = +start.slice(0, 4), m = +start.slice(5, 7);
  const ey = +end.slice(0, 4), em = +end.slice(5, 7);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

/** Premier jour de la période appartenant à ce mois. */
export function firstPeriodDayOfMonth(ym, start) {
  const first = `${ym}-01`;
  return clampToPeriod(first, start);
}

/** Grille de mois lundi → dimanche. Cases vides = null. */
export function monthGrid(ym, start) {
  const y = +ym.slice(0, 4), m = +ym.slice(5, 7);
  const first = `${ym}-01`;
  const lead = weekdayIndex(first);
  const n = daysInMonth(y, m);
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= n; d++) {
    const iso = `${ym}-${String(d).padStart(2, "0")}`;
    cells.push({ iso, inPeriod: inPeriod(iso, start) });
  }
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Regroupe des valeurs consécutives de même clé (mois, semaines…). */
export function groupRuns(items, keyFn) {
  const runs = [];
  for (const item of items) {
    const key = keyFn(item);
    const last = runs[runs.length - 1];
    if (last && last.key === key) last.length++;
    else runs.push({ key, length: 1, first: item });
  }
  return runs;
}

/* ---------- Programme ---------- */

export function programDay(program, iso) {
  const idx = weekdayIndex(iso) + 1;
  return program.days.find((d) => d.day === idx) || null;
}

export function planFor(program, iso) {
  const d = programDay(program, iso);
  if (!d) return { title: "Repos", exercises: [], isRest: true };
  const exercises = d.exercises || [];
  return { title: d.title || "Repos", exercises, isRest: exercises.length === 0, weekday: d.weekday };
}

export function exerciseIndex(program) {
  const map = new Map();
  for (const d of program.days) for (const ex of d.exercises || []) map.set(ex.id, ex);
  return map;
}

export function exerciseModes(ex) {
  if (Array.isArray(ex.modes)) return ex.modes;
  return ex.bodyweight ? ["PDC", "Lesté"] : [];
}

export function usesRM(ex) {
  return typeof ex.percent === "number";
}

/**
 * 25/10/2026 : mardi = Jambes (exercices « mer-1…5 »), mercredi = Épaules (« mar-1…5 »).
 * Remet dans cet ordre un programme encore à l'ancien ordre ; renvoie true s'il a été modifié.
 * Ne regarde que les exercices d'origine : jamais de double inversion, même si on relance.
 */
export function fixTueWedSwap(program) {
  if (!program || !Array.isArray(program.days)) return false;
  const tue = program.days.find((d) => d.day === 2), wed = program.days.find((d) => d.day === 3);
  if (!tue || !wed) return false;
  const has = (day, prefix) => (day.exercises || []).some((ex) => new RegExp(`^${prefix}-[1-5]$`).test(ex.id));
  if (!(has(tue, "mar") && !has(tue, "mer") && has(wed, "mer") && !has(wed, "mar"))) return false;
  [tue.title, wed.title] = [wed.title, tue.title];
  [tue.exercises, wed.exercises] = [wed.exercises, tue.exercises];
  return true;
}

/** Vérifie le fichier de programme ; renvoie la liste des erreurs. */
export function checkProgram(program) {
  const errors = [];
  if (!program || !Array.isArray(program.days)) return ["program.days doit être un tableau"];
  const seenDays = new Set();
  const seenIds = new Set();
  for (const d of program.days) {
    if (!Number.isInteger(d.day) || d.day < 1 || d.day > 7) errors.push(`Jour invalide : ${d.day}`);
    if (seenDays.has(d.day)) errors.push(`Jour en double : ${d.day}`);
    seenDays.add(d.day);
    if (!Array.isArray(d.exercises)) errors.push(`${d.weekday} : exercises doit être un tableau`);
    for (const ex of d.exercises || []) {
      const where = `${d.weekday} / ${ex.name || ex.id}`;
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(ex.id || "")) errors.push(`${where} : id invalide`);
      if (seenIds.has(ex.id)) errors.push(`${where} : id en double`);
      seenIds.add(ex.id);
      if (!ex.name) errors.push(`${where} : nom manquant`);
      if (ex.percent != null && !(typeof ex.percent === "number" && ex.percent > 0 && ex.percent <= 1.5))
        errors.push(`${where} : percent doit être décimal (ex. 0.75) ou null`);
      if (ex.dropPercent != null && !(typeof ex.dropPercent === "number" && ex.dropPercent > 0 && ex.dropPercent < 1))
        errors.push(`${where} : dropPercent doit être entre 0 et 1`);
      if (ex.rest && ex.rest !== "—" && restSeconds(ex.rest) == null)
        errors.push(`${where} : repos illisible (« ${ex.rest} »)`);
      if (Array.isArray(ex.modes) && ex.modes.some((m) => !MODES.includes(m)))
        errors.push(`${where} : modes invalides`);
    }
  }
  return errors;
}

/* ---------- Nombres et charges ---------- */

/** Arrondi d'affichage à 2 décimales, sans erreur binaire (61,875 → 61,88). */
export function roundDisplay(n) {
  return Number(Math.round(Number(n + "e2")) + "e-2");
}

export function formatKg(n) {
  return `${String(roundDisplay(n)).replace(".", ",")} kg`;
}

/** Charge de travail = 1RM × pourcentage (décimal, ex. 0.75). */
export function workingLoad(rm, percent) {
  if (typeof rm !== "number" || !Number.isFinite(rm) || rm <= 0) return null;
  if (typeof percent !== "number") return null;
  return rm * percent;
}

/** Charge du dropset = charge de travail × (1 − baisse). */
export function dropLoad(load, dropPercent) {
  if (load == null || typeof dropPercent !== "number") return null;
  return load * (1 - dropPercent);
}

/* ---------- Charges conseillées à partir du max ---------- */

/** Répétitions gardées en réserve dans les conseils (séries dures mais propres). */
export const RESERVE_REPS = 2;

/** Max estimé sur 1 répétition (formule d'Epley) à partir d'une série réussie. */
export function estimate1RM(weight, reps) {
  if (typeof weight !== "number" || !Number.isFinite(weight) || weight <= 0) return null;
  const r = Math.max(1, Math.round(reps || 1));
  return r === 1 ? weight : weight * (1 + r / 30);
}

/** « 3 × 8–12 » → { lo: 8, hi: 12 } ; une durée (« 30 s », « 15 min ») → null. */
export function repRange(reps) {
  if (typeof reps !== "string") return null;
  const s = reps.replace(/^\s*\d{1,2}\s*[×x]\s*/i, "").split("+")[0].trim();
  const m = /^(\d{1,3})(?:\s*[–-]\s*(\d{1,3}))?(.*)$/.exec(s);
  if (!m) return null;
  const rest = m[3].trim().toLowerCase();
  if (/^(s|sec|secondes?|min|minutes?|m|km|h)\b/.test(rest) || /^["']/.test(rest)) return null;
  const a = Number(m[1]), b = m[2] ? Number(m[2]) : a;
  const lo = Math.min(a, b), hi = Math.max(a, b);
  if (lo < 1 || hi > 50) return null;
  return { lo, hi };
}

/** Charge pour réussir `reps` répétitions en gardant RESERVE_REPS en réserve. */
export function loadForReps(oneRM, reps, reserve = RESERVE_REPS) {
  if (!oneRM) return null;
  return oneRM / (1 + (reps + reserve) / 30);
}

export const roundHalf = (x) => Math.round(x * 2) / 2;

/** Fourchette conseillée, arrondie à 0,5 kg : { heavy (peu de reps), light (beaucoup de reps) }. */
export function suggestedLoads(oneRM, range) {
  if (!oneRM || !range) return null;
  return { heavy: roundHalf(loadForReps(oneRM, range.lo)), light: roundHalf(loadForReps(oneRM, range.hi)) };
}

export function formatRange(a, b) {
  if (a == null) return "";
  if (b == null || a === b) return `≈ ${formatKg(a)}`;
  const lo = Math.min(a, b), hi = Math.max(a, b);
  return `≈ ${formatKg(lo).replace(" kg", "")}–${formatKg(hi)}`;
}

/**
 * Conseil à partir de « mon max » (série la plus lourde réussie : { weight, reps }).
 * Charge = max estimé × % si l'exercice en a un, sinon fourchette avec 2 rép. en réserve.
 * Renvoie { oneRM, lo, hi, dropLo, dropHi } (kg arrondis à 0,5) ou null.
 */
export function maxAdvice(ex, max) {
  const range = ex && repRange(ex.reps);
  if (!range || !max) return null;
  const oneRM = estimate1RM(max.weight, max.reps);
  if (!oneRM) return null;
  let lo, hi;
  if (typeof ex.percent === "number") lo = hi = roundHalf(oneRM * ex.percent);
  else ({ light: lo, heavy: hi } = suggestedLoads(oneRM, range));
  const out = { oneRM: roundDisplay(oneRM), lo, hi, dropLo: null, dropHi: null };
  if (ex.drop && typeof ex.dropPercent === "number") {
    out.dropLo = roundHalf(dropLoad(lo, ex.dropPercent));
    out.dropHi = roundHalf(dropLoad(hi, ex.dropPercent));
  }
  return out;
}

export function formatPercent(p) {
  return `${String(roundDisplay(p * 100)).replace(".", ",")} %`;
}

/**
 * Lecture d'un champ numérique (virgule ou point).
 * Renvoie { ok, value, empty, error }.
 */
export function parseDecimalInput(raw, { min = 0, minInclusive = false, max = Infinity, unit = "kg" } = {}) {
  const s = String(raw ?? "").trim();
  if (s === "") return { ok: true, value: null, empty: true };
  if (!/^\d+([.,]\d+)?$/.test(s)) {
    return { ok: false, error: `Entre un nombre en ${unit} (ex. 82,5).` };
  }
  const v = Number(s.replace(",", "."));
  if (!Number.isFinite(v)) return { ok: false, error: `Entre un nombre en ${unit} (ex. 82,5).` };
  if (minInclusive ? v < min : v <= min) {
    return { ok: false, error: minInclusive ? `La valeur doit être d'au moins ${min} ${unit}.` : `La valeur doit être supérieure à ${min}.` };
  }
  if (v > max) return { ok: false, error: `Maximum ${String(max).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ${unit}.` };
  return { ok: true, value: v };
}

/** Durée de repos en secondes (borne haute d'une fourchette) ; null si aucune. */
export function restSeconds(rest) {
  if (typeof rest !== "string") return null;
  const s = rest.replace(/\s+/g, " ").trim().toLowerCase();
  if (!s || s === "—" || s === "-") return null;
  const m = /^(\d+(?:[.,]\d+)?)(?:\s*[–-]\s*(\d+(?:[.,]\d+)?))?\s*(min|s)$/.exec(s);
  if (!m) return null;
  const hi = parseFloat((m[2] ?? m[1]).replace(",", "."));
  return Math.round(m[3] === "min" ? hi * 60 : hi);
}

export function formatClock(totalSeconds) {
  const s = Math.max(0, Math.ceil(totalSeconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function modeText(body) {
  if (!body || body.mode === "PDC") return "PDC";
  const w = formatKg(body.weight).replace(" kg", "");
  return body.mode === "Lesté" ? `+ ${w} kg` : `− ${w} kg`;
}

/* ---------- Statistiques ---------- */

/**
 * @param days  objet { 'AAAA-MM-JJ': statut }
 * @param scope 'all' (depuis le début) | 'month' (mois civil d'aujourd'hui)
 */
export function computeStats(days, start, today, scope = "all") {
  const end = periodEnd(start);
  let from = start;
  const to = today < end ? today : end;
  if (scope === "month") {
    const monthStart = `${today.slice(0, 8)}01`;
    if (monthStart > from) from = monthStart;
  }
  const r = { done: 0, missed: 0, rest: 0, toFill: 0, attendance: null };
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const st = days[d];
    if (st === "Fait") r.done++;
    else if (st === "Non fait") r.missed++;
    else if (st === "Repos / annulé") r.rest++;
    else if (d < today) r.toFill++;
  }
  const denom = r.done + r.missed;
  r.attendance = denom ? Math.round((r.done / denom) * 100) : null;
  return r;
}

/* ---------- CSV ---------- */

export function csvCell(v) {
  const s = v == null ? "" : String(v);
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildCsv(start, program, days) {
  const rows = [["Date", "Séance", "Statut"].join(";")];
  for (const iso of buildPeriod(start)) {
    rows.push([csvCell(iso), csvCell(planFor(program, iso).title), csvCell(days[iso] || "")].join(";"));
  }
  return "﻿" + rows.join("\r\n") + "\r\n";
}

/* ---------- Validation des entrées ---------- */

export function buildContext(program, start) {
  return { start, end: periodEnd(start), exercises: exerciseIndex(program) };
}

const KEY_EX = /^(rm|body|max):([A-Za-z0-9_-]{1,40})$/;
const KEY_DAY = /^day:(\d{4}-\d{2}-\d{2})$/;
const KEY_DONE = /^ex:(\d{4}-\d{2}-\d{2})$/;
const KEY_DATED = /^(log|bw|note|sets):(\d{4}-\d{2}-\d{2})$/;

/** Nombre de séries prévu : « 3 × 8–12 » → 3 ; sans « N × » → 1. */
export function seriesCount(ex) {
  const m = /^\s*(\d{1,2})\s*[×x]/i.exec((ex && ex.reps) || "");
  return m ? Math.max(1, Math.min(20, Number(m[1]))) : 1;
}
export const NOTE_MAX = 500;

function isFiniteNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}

/** Renvoie { ok:true, value } (valeur normalisée) ou { ok:false, error }. */
export function validateEntry(key, value, ctx) {
  if (typeof key !== "string") return { ok: false, error: "Clé invalide." };
  let m = KEY_DAY.exec(key);
  if (m) {
    if (!isValidISO(m[1])) return { ok: false, error: "Date impossible." };
    if (m[1] < ctx.start || m[1] > ctx.end) return { ok: false, error: "Date hors de la période suivie." };
    if (value === null) return { ok: true, value: null };
    if (!STATUSES.includes(value)) return { ok: false, error: "Statut inconnu." };
    return { ok: true, value };
  }
  m = KEY_DATED.exec(key);
  if (m) {
    const [, kind, iso] = m;
    if (!isValidISO(iso)) return { ok: false, error: "Date impossible." };
    if (iso < ctx.start || iso > ctx.end) return { ok: false, error: "Date hors de la période suivie." };
    if (value === null) return { ok: true, value: null };
    if (kind === "bw") {
      // Pesée du jour (kg).
      if (!isFiniteNumber(value) || value < 20 || value > 400) return { ok: false, error: "Poids de corps : entre 20 et 400 kg." };
      return { ok: true, value: roundDisplay(value) };
    }
    if (kind === "sets") {
      // Séries cochées ce jour : { idExercice: nombre }.
      if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "Séries invalides." };
      const out = {};
      for (const [id, n] of Object.entries(value)) {
        if (!ctx.exercises.has(id)) continue;
        if (!Number.isInteger(n) || n < 0 || n > 20) return { ok: false, error: "Nombre de séries invalide." };
        if (n > 0) out[id] = n;
      }
      return { ok: true, value: Object.keys(out).length ? out : null };
    }
    if (kind === "note") {
      if (typeof value !== "string") return { ok: false, error: "Note invalide." };
      const t = value.trim().slice(0, NOTE_MAX);
      return { ok: true, value: t || null };
    }
    // Charges notées ce jour : { idExercice: { w: kg | null, r: répétitions | null } }.
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "Charges invalides." };
    const out = {};
    for (const [id, set] of Object.entries(value)) {
      if (!ctx.exercises.has(id) || !set || typeof set !== "object") continue;
      const w = set.w === null || set.w === undefined ? null : set.w;
      const r = set.r === null || set.r === undefined ? null : set.r;
      if (w !== null && (!isFiniteNumber(w) || w < 0 || w > LIMITS.rmMax)) return { ok: false, error: "Charge invalide." };
      if (r !== null && (!Number.isInteger(r) || r < 1 || r > 100)) return { ok: false, error: "Répétitions invalides." };
      if (w === null && r === null) continue;
      out[id] = { w: w === null ? null : roundDisplay(w), r };
    }
    return { ok: true, value: Object.keys(out).length ? out : null };
  }
  m = KEY_DONE.exec(key);
  if (m) {
    // Exercices cochés pendant la séance de ce jour : liste d'identifiants.
    if (!isValidISO(m[1])) return { ok: false, error: "Date impossible." };
    if (m[1] < ctx.start || m[1] > ctx.end) return { ok: false, error: "Date hors de la période suivie." };
    if (value === null) return { ok: true, value: null };
    if (!Array.isArray(value) || value.length > 60) return { ok: false, error: "Liste d'exercices invalide." };
    const ids = [...new Set(value.filter((id) => typeof id === "string" && ctx.exercises.has(id)))];
    return { ok: true, value: ids.length ? ids : null };
  }
  m = KEY_EX.exec(key);
  if (!m) return { ok: false, error: "Clé inconnue." };
  const ex = ctx.exercises.get(m[2]);
  if (!ex) return { ok: false, error: "Exercice inconnu." };
  if (m[1] === "max") {
    // Meilleure série réussie : poids + répétitions.
    if (exerciseModes(ex).length) return { ok: false, error: "Cet exercice se règle au poids du corps." };
    if (value === null) return { ok: true, value: null };
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "Max invalide." };
    if (!isFiniteNumber(value.weight) || value.weight <= 0 || value.weight > LIMITS.rmMax)
      return { ok: false, error: `Le poids doit être entre 0 et ${LIMITS.rmMax} kg.` };
    if (!Number.isInteger(value.reps) || value.reps < 1 || value.reps > 30)
      return { ok: false, error: "Répétitions : entre 1 et 30." };
    return { ok: true, value: { weight: roundDisplay(value.weight), reps: value.reps } };
  }
  if (m[1] === "rm") {
    if (!usesRM(ex)) return { ok: false, error: "Cet exercice n'utilise pas de 1RM." };
    if (value === null) return { ok: true, value: null };
    if (!isFiniteNumber(value) || value <= 0 || value > LIMITS.rmMax)
      return { ok: false, error: `Le 1RM doit être un nombre entre 0 et ${LIMITS.rmMax} kg.` };
    return { ok: true, value: roundDisplay(value) };
  }
  const modes = exerciseModes(ex);
  if (!modes.length) return { ok: false, error: "Cet exercice n'a pas de réglage PDC / lesté." };
  if (value === null) return { ok: true, value: null };
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "Réglage invalide." };
  if (!modes.includes(value.mode)) return { ok: false, error: "Mode non autorisé pour cet exercice." };
  if (!isFiniteNumber(value.weight) || value.weight < 0 || value.weight > LIMITS.bodyMax)
    return { ok: false, error: `Le poids doit être entre 0 et ${LIMITS.bodyMax} kg.` };
  return { ok: true, value: { mode: value.mode, weight: value.mode === "PDC" ? 0 : roundDisplay(value.weight) } };
}

/** Valide un fichier de sauvegarde avant toute modification. */
export function validateImport(text, ctx) {
  if (typeof text !== "string") return { ok: false, error: "Fichier illisible." };
  if (new TextEncoder().encode(text).length > LIMITS.importBytes)
    return { ok: false, error: "Fichier trop volumineux (1 Mo maximum)." };
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    return { ok: false, error: "Ce fichier n'est pas un JSON valide." };
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return { ok: false, error: "Format de sauvegarde inconnu." };
  if (obj.version !== 1) return { ok: false, error: "Version de sauvegarde non prise en charge." };
  const entries = obj.entries;
  if (!entries || typeof entries !== "object" || Array.isArray(entries))
    return { ok: false, error: "La sauvegarde ne contient pas d'entrées." };
  const keys = Object.keys(entries);
  if (keys.length === 0) return { ok: false, error: "La sauvegarde est vide." };
  if (keys.length > LIMITS.importEntries)
    return { ok: false, error: `Trop d'entrées (${LIMITS.importEntries} maximum).` };
  const out = {};
  for (const k of keys) {
    const r = validateEntry(k, entries[k], ctx);
    if (!r.ok) return { ok: false, error: `${k} : ${r.error}` };
    out[k] = r.value;
  }
  return { ok: true, entries: out, count: keys.length };
}

export function buildExport(entries, start, now = new Date()) {
  return { version: 1, exportedAt: now.toISOString(), period: { start, end: periodEnd(start) }, entries };
}
