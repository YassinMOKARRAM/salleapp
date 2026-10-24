// Mouvement « fluide » (WWDC 2018, Designing Fluid Interfaces) :
// ressorts interruptibles pilotés par amortissement + réponse, passage de vitesse,
// projection de l'élan et résistance élastique aux bords.

export const reducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Ressort paramétré comme chez Apple : `damping` (1 = sans rebond) et `response` (s).
 * Toujours animé depuis la valeur affichée, en conservant la vitesse en cours :
 * changer de cible en plein vol ne crée aucune cassure.
 */
export class Spring {
  constructor(value = 0, { onUpdate } = {}) {
    this.value = value;
    this.target = value;
    this.velocity = 0;
    this.onUpdate = onUpdate || null;
    this.onRest = null;
    this.damping = 1;
    this.response = 0.35;
    this.precision = 0.5;
    this.raf = 0;
    this.gen = 0;
    this.last = 0;
    this.step = this.step.bind(this);
  }

  get running() {
    return this.raf !== 0;
  }

  /** Place la valeur immédiatement (suivi 1:1 du doigt). */
  set(value) {
    this.stop();
    this.value = value;
    this.target = value;
    this.velocity = 0;
    if (this.onUpdate) this.onUpdate(value);
  }

  to(target, { damping = 1, response = 0.35, velocity, precision, onRest } = {}) {
    this.target = target;
    this.damping = damping;
    this.response = response;
    if (velocity !== undefined) this.velocity = velocity;
    if (precision !== undefined) this.precision = precision;
    this.onRest = onRest || null;
    if (!this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.step);
    }
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.onRest = null;
    this.gen++;
  }

  step(now) {
    const gen = this.gen;
    const dt = Math.min(0.064, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    // Conversion amortissement/réponse → raideur et frottement (masse = 1).
    const k = (2 * Math.PI / this.response) ** 2;
    const c = (4 * Math.PI * this.damping) / this.response;
    const n = Math.max(1, Math.ceil(dt / 0.004));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const a = -k * (this.value - this.target) - c * this.velocity;
      this.velocity += a * h;
      this.value += this.velocity * h;
    }
    const settled =
      Math.abs(this.value - this.target) < this.precision && Math.abs(this.velocity) < this.precision * 12;
    if (settled) {
      this.value = this.target;
      this.velocity = 0;
      this.raf = 0;
      const cb = this.onRest;
      this.onRest = null;
      if (this.onUpdate) this.onUpdate(this.value);
      if (gen === this.gen && cb) cb();
      return;
    }
    if (this.onUpdate) this.onUpdate(this.value);
    if (gen !== this.gen) return; // arrêté pendant la mise à jour
    this.raf = requestAnimationFrame(this.step);
  }
}

/** Point d'arrivée projeté d'un geste (décélération exponentielle, comme le défilement). */
export function project(velocity, decelerationRate = 0.998) {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** Résistance progressive au-delà d'une limite. */
export function rubberband(overshoot, dimension, constant = 0.55) {
  if (dimension <= 0) return 0;
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/** Vitesse (px/s) à partir des derniers mouvements du pointeur. */
export class VelocityTracker {
  constructor(windowMs = 100) {
    this.windowMs = windowMs;
    this.samples = [];
  }
  reset() {
    this.samples = [];
  }
  add(x, t = performance.now()) {
    this.samples.push({ x, t });
    while (this.samples.length > 2 && t - this.samples[0].t > this.windowMs) this.samples.shift();
  }
  /** Si le doigt s'est arrêté avant de relâcher, la vitesse est nulle. */
  velocity(now = performance.now()) {
    const s = this.samples;
    if (s.length < 2) return 0;
    const b = s[s.length - 1];
    if (now - b.t > this.windowMs) return 0;
    const recent = s.filter((p) => b.t - p.t <= this.windowMs);
    const a = recent.length >= 2 ? recent[0] : s[s.length - 2];
    const dt = (b.t - a.t) / 1000;
    return dt > 0 ? (b.x - a.x) / dt : 0;
  }
}

export const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

/** Retour haptique bref, réservé aux moments importants (sans effet si non pris en charge). */
export function haptic(ms = 10) {
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch {
    /* ignoré */
  }
}

/** Seuil avant de s'engager dans une direction (hystérésis). */
export const HYSTERESIS = 10;
