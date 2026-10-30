// Tests de la logique, sans dépendance : node tests/run.mjs
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  addDays, buildContext, buildExport, checkProgram, estimate1RM, fixTueWedSwap, formatClock, formatRange, maxAdvice,
  periodEnd, planFor, repRange, restSeconds, seriesCount, suggestedLoads, validateEntry, validateImport, weekLabel,
} from "../js/core.js";
import { CONFIG, PROGRAM } from "../js/data.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => readFileSync(root + p, "utf8");
let passed = 0;
const pending = [];
const test = (name, fn) => {
  const fail = (e) => { console.error(`ÉCHEC  ${name}\n${e.stack}`); process.exitCode = 1; };
  const ok = () => { passed++; console.log(`ok  ${name}`); };
  try {
    const r = fn();
    if (r && r.then) pending.push(r.then(ok, fail));
    else ok();
  } catch (e) { fail(e); }
};
const clone = (x) => structuredClone(x);
const ids = (p, day) => p.days.find((d) => d.day === day).exercises.map((e) => e.id);

/* ---------- programme ---------- */
test("programme valide", () => assert.deepEqual(checkProgram(PROGRAM), []));
test("mardi = Jambes, mercredi = Épaules, jeudi/vendredi = repos", () => {
  assert.equal(planFor(PROGRAM, "2026-10-27").title, "Jambes");
  assert.equal(planFor(PROGRAM, "2026-10-28").title, "Épaules + rappel pecs/bras");
  assert.ok(planFor(PROGRAM, "2026-10-29").isRest);
  assert.ok(planFor(PROGRAM, "2026-10-30").isRest);
});

const oldProgram = () => {
  const p = clone(PROGRAM);
  const tue = p.days.find((d) => d.day === 2), wed = p.days.find((d) => d.day === 3);
  [tue.title, wed.title] = [wed.title, tue.title];
  [tue.exercises, wed.exercises] = [wed.exercises, tue.exercises];
  return p;
};
test("ancien ordre enregistré : remis dans le bon ordre", () => {
  const p = oldProgram();
  assert.equal(p.days[1].title, "Épaules + rappel pecs/bras");
  assert.equal(fixTueWedSwap(p), true);
  assert.deepEqual(p, PROGRAM);
});
test("pas de double inversion (programme déjà bon, ou relancé)", () => {
  const p = clone(PROGRAM);
  assert.equal(fixTueWedSwap(p), false);
  assert.deepEqual(p, PROGRAM);
  const q = oldProgram();
  fixTueWedSwap(q);
  assert.equal(fixTueWedSwap(q), false);
  assert.deepEqual(q, PROGRAM);
});
test("exercices ajoutés dans l'app (id « mar-xxx ») : pas d'inversion à tort", () => {
  const p = clone(PROGRAM);
  p.days[1].exercises.push({ ...p.days[1].exercises[0], id: "mar-mh0abc12" });
  p.days[2].exercises.push({ ...p.days[2].exercises[0], id: "mer-mh0abc13" });
  assert.equal(fixTueWedSwap(p), false);
  const q = oldProgram();
  q.days[1].title = "Épaules perso";
  q.days[1].exercises.push({ ...q.days[1].exercises[0], id: "mar-mh0abc14" });
  assert.equal(fixTueWedSwap(q), true);
  assert.equal(q.days[2].title, "Épaules perso");
  assert.ok(ids(q, 3).includes("mar-mh0abc14"));
  assert.equal(ids(q, 2)[0], "mer-1");
});
test("migration via store.js : runOnce une seule fois, programme modifié corrigé", async () => {
  const mem = new Map();
  globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const store = await import("../js/store.js");
  store.saveProgramData(oldProgram());
  let runs = 0;
  const migrate = () => store.runOnce("swap-mardi-mercredi-v2", () => {
    runs++;
    const stored = store.loadProgram(null, checkProgram);
    if (stored && fixTueWedSwap(stored)) store.saveProgramData(stored);
  });
  migrate(); migrate();
  assert.equal(runs, 1);
  assert.equal(planFor(store.loadProgram(PROGRAM, checkProgram), "2026-10-27").title, "Jambes");
  assert.ok(mem.has("salle:v1:migrations"));
});

/* ---------- dates, séries, minuteur ---------- */
test("période et semaines", () => {
  assert.equal(CONFIG.start, "2026-10-24");
  assert.equal(periodEnd(CONFIG.start), "2027-10-23");
  assert.equal(weekLabel("2026-10-24", CONFIG.start), "Semaine 00");
  assert.equal(weekLabel("2026-10-25", CONFIG.start), "Semaine 00");
  assert.equal(weekLabel("2026-10-26", CONFIG.start), "Semaine 01");
  assert.equal(weekLabel(addDays("2026-10-26", 7), CONFIG.start), "Semaine 02");
});
test("minuteur : borne haute", () => {
  assert.equal(restSeconds("90–120 s"), 120);
  assert.equal(formatClock(restSeconds("90–120 s")), "02:00");
  assert.equal(restSeconds("2–3 min"), 180);
  assert.equal(restSeconds("—"), null);
});
test("nombre de séries", () => {
  assert.equal(seriesCount({ reps: "3 × 8–12" }), 3);
  assert.equal(seriesCount({ reps: "2 × 12" }), 2);
  assert.equal(seriesCount({ reps: "15 min" }), 1);
});

/* ---------- mon max ---------- */
const ex = (o) => ({ id: "lun-1", name: "X", reps: "3 × 8–12", percent: null, drop: false, dropPercent: null, bodyweight: false, ...o });
test("Epley et fourchette avec 2 rép. en réserve, arrondie à 0,5 kg", () => {
  assert.equal(estimate1RM(100, 1), 100);
  assert.ok(Math.abs(estimate1RM(70, 5) - 81.6667) < 1e-3);
  assert.deepEqual(suggestedLoads(80, { lo: 8, hi: 12 }), { heavy: 60, light: 54.5 });
  const a = maxAdvice(ex(), { weight: 70, reps: 5 });
  assert.equal(a.hi, 61.5); // 81,67 / (1 + 10/30) = 61,25 → 61,5
  assert.equal(a.lo, 55.5); // 81,67 / (1 + 14/30) = 55,68 → 55,5
  assert.equal(formatRange(a.lo, a.hi), "≈ 55,5–61,5 kg");
  for (const v of [a.lo, a.hi]) assert.equal(v * 2, Math.round(v * 2));
});
test("% du 1RM : max × %, arrondi", () => {
  const a = maxAdvice(ex({ percent: 0.75 }), { weight: 70, reps: 5 });
  assert.equal(a.lo, 61.5);
  assert.equal(a.hi, 61.5);
  assert.equal(formatRange(a.lo, a.hi), "≈ 61,5 kg");
});
test("dropset : la baisse s'applique à la charge", () => {
  const a = maxAdvice(ex({ drop: true, dropPercent: 0.25 }), { weight: 80, reps: 1 });
  assert.deepEqual([a.lo, a.hi], [54.5, 60]);
  assert.deepEqual([a.dropLo, a.dropHi], [41, 45]); // 54,5 × 0,75 = 40,9 ; 60 × 0,75 = 45
});
test("durées et poids du corps : pas de conseil", () => {
  assert.equal(repRange("15 min"), null);
  assert.equal(repRange("3 × 30 s"), null);
  assert.equal(maxAdvice(ex({ reps: "15 min" }), { weight: 50, reps: 5 }), null);
});
test("validation de max:<id> et inclusion dans la sauvegarde", () => {
  const ctx = buildContext(PROGRAM, CONFIG.start);
  assert.deepEqual(validateEntry("max:lun-1", { weight: 70.123, reps: 5 }, ctx), { ok: true, value: { weight: 70.12, reps: 5 } });
  assert.equal(validateEntry("max:lun-1", { weight: 70, reps: 31 }, ctx).ok, false);
  assert.equal(validateEntry("max:lun-1", { weight: 0, reps: 5 }, ctx).ok, false);
  assert.equal(validateEntry("max:sam-5", { weight: 10, reps: 5 }, ctx).ok, false); // gainage, poids du corps
  assert.equal(validateEntry("max:inconnu", { weight: 10, reps: 5 }, ctx).ok, false);
  const file = JSON.stringify(buildExport({ "max:lun-1": { weight: 70, reps: 5 }, "day:2026-10-27": "Fait" }, CONFIG.start));
  const r = validateImport(file, ctx);
  assert.equal(r.ok, true);
  assert.deepEqual(r.entries["max:lun-1"], { weight: 70, reps: 5 });
  assert.equal(validateImport(file.replace('"reps": 5', '"reps": 99').replace('"reps":5', '"reps":99'), ctx).ok, false);
  assert.equal(validateImport("pas du json", ctx).ok, false);
});

/* ---------- fichiers du site ---------- */
test("VERSION de sw.js = APP_VERSION de main.js = README", () => {
  const v = /const VERSION = "([^"]+)"/.exec(read("sw.js"))[1];
  assert.equal(/const APP_VERSION = "([^"]+)"/.exec(read("js/main.js"))[1], v);
  assert.ok(read("README.md").includes(v), "README à jour");
});
test("chemins relatifs et fichiers mis en cache présents", () => {
  const html = read("index.html");
  assert.ok(!/(href|src)="\//.test(html), "aucun chemin absolu dans index.html");
  assert.ok(!/"src": "\//.test(read("manifest.webmanifest")));
  const assets = [...read("sw.js").matchAll(/"\.\/([^"]*)"/g)].map((m) => m[1]).filter(Boolean);
  for (const a of assets) assert.ok(existsSync(root + a), `manquant : ${a}`);
  for (const m of read("js/main.js").matchAll(/from "(\.[^"]+)"/g)) assert.ok(assets.includes(`js/${m[1].slice(2)}`), m[1]);
});
test("plus de bandeau « Ajoute Salle à ton écran d'accueil »", () => {
  assert.ok(!/Ajoute Salle/i.test(read("js/main.js")));
});

await Promise.all(pending);
console.log(process.exitCode ? "\nDes tests échouent." : `\n${passed} tests réussis.`);
