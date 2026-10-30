// Stockage local : tout reste sur cet appareil, dans l'app installée sur l'écran d'accueil.
// La copie de sécurité se fait par un fichier dans l'app Fichiers (voir main.js).
import { isValidISO } from "./core.js";

const PREFIX = "salle:v1:";

function read(key, fallback) {
  try {
    const text = localStorage.getItem(PREFIX + key);
    if (!text) return fallback;
    const value = JSON.parse(text);
    return value && typeof value === "object" ? value : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Profil de la personne : prénom, objectif, début du suivi (null tant que l'accueil n'est pas fait) et modèle choisi. */
export function loadProfile() {
  const p = read("profile", {});
  return {
    firstName: typeof p.firstName === "string" ? p.firstName.slice(0, 40) : "",
    goal: p.goal && Number.isFinite(p.goal.from) && Number.isFinite(p.goal.to) ? p.goal : null,
    start: isValidISO(p.start) ? p.start : null,
    template: typeof p.template === "string" ? p.template.slice(0, 40) : null,
  };
}

export function saveProfile(profile) {
  return write("profile", profile);
}

/** Des données existent-elles déjà sur ce téléphone (créées avant l'arrivée des profils) ? */
export function hasStoredData() {
  const entries = read("entries", {});
  const p = read("profile", {});
  return Object.keys(entries).length > 0 || read("program", null) !== null || !!(p.firstName || p.goal);
}

/** Efface toutes les données de l'app sur ce téléphone. */
export function clearAllData() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

/** Exécute une seule fois une mise à jour des données enregistrées. */
export function runOnce(name, fn) {
  const done = read("migrations", {});
  if (done[name]) return;
  fn();
  done[name] = Date.now();
  write("migrations", done);
}

/** Préférences de l'app (repos automatique…). */
export function loadPrefs() {
  const p = read("prefs", {});
  return { autoTimer: p.autoTimer !== false };
}

export function savePrefs(prefs) {
  return write("prefs", prefs);
}

/** Programme modifié dans l'app (sinon celui de js/data.js). */
export function loadProgram(fallback, check) {
  const p = read("program", null);
  if (p && Array.isArray(p.days) && check(p).length === 0) return p;
  return fallback;
}

export function saveProgramData(program) {
  return write("program", program);
}

export function clearProgram() {
  try {
    localStorage.removeItem(PREFIX + "program");
  } catch {
    /* ignoré */
  }
}

/** Demande au système de ne pas effacer le stockage de l'app. */
export async function askPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) await navigator.storage.persist();
  } catch {
    /* non pris en charge */
  }
}

export function createLocalStore({ onChange, onError }) {
  const raw = read("entries", {});
  const entries = new Map();
  for (const [k, v] of Object.entries(raw)) if (v !== null && v !== undefined) entries.set(k, { v });
  const meta = Object.assign({ lastChange: 0, lastBackup: 0 }, read("meta", {}));

  function persist() {
    const obj = {};
    for (const [k, e] of entries) obj[k] = e.v;
    const ok = write("entries", obj) && write("meta", meta);
    if (!ok) onError("Impossible d'enregistrer sur cet appareil. Fais une sauvegarde dans Fichiers.");
  }

  function apply(key, value) {
    if (value === null || value === undefined) entries.delete(key);
    else entries.set(key, { v: value });
  }

  return {
    get: (key) => (entries.has(key) ? entries.get(key).v : null),
    set(key, value, { silent = false } = {}) {
      apply(key, value);
      meta.lastChange = Date.now();
      persist();
      if (!silent) onChange();
    },
    setMany(changes) {
      for (const [key, value] of Object.entries(changes)) apply(key, value);
      meta.lastChange = Date.now();
      persist();
      onChange();
    },
    all: () => entries,
    size: () => entries.size,
    meta: () => ({ ...meta }),
    markBackup() {
      meta.lastBackup = Date.now();
      persist();
    },
    destroy() {},
  };
}
