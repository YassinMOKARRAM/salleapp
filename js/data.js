// Modèles de programme proposés au premier lancement.
// Chaque personne part d'un modèle puis le modifie dans l'app : son programme, son prénom,
// son objectif et sa date de début restent sur son téléphone, jamais ici.
// Ne change jamais les `id` des exercices : les réglages, charges et séries y sont rattachés.

export const CONFIG = {
  "appName": "Salle",
  // Date de début des données créées avant l'arrivée des profils (premier utilisateur).
  "legacyStart": "2026-10-24"
};

/** Split 5 jours : le programme d'origine de l'app (identifiants inchangés). */
export const PROGRAM = {
  "version": 1,
  "days": [
    {
      "day": 1,
      "weekday": "Lundi",
      "title": "Dos + biceps",
      "exercises": [
        {
          "id": "lun-1",
          "name": "Tirage vertical",
          "reps": "3 × 8–12",
          "rest": "90–120 s",
          "method": "Au feeling",
          "percent": null,
          "rmKey": null,
          "drop": false,
          "dropPercent": null,
          "bodyweight": false
        },
        {
          "id": "lun-2",
          "name": "Rowing assis horizontal (machine)",
          "reps": "3 × 8–12",
          "rest": "90–120 s",
          "method": "Au feeling",
          "percent": null,
          "rmKey": null,
          "drop": false,
          "dropPercent": null,
          "bodyweight": false
        },
        {
          "id": "lun-3",
          "name": "Tirage poulie basse",
          "reps": "3 × 10–12",
          "rest": "90–120 s",
          "method": "Au feeling",
          "percent": null,
          "rmKey": null,
          "drop": false,
          "dropPercent": null,
          "bodyweight": false
        },
        {
          "id": "lun-4",
          "name": "Curl haltères",
          "reps": "3 × 10–12",
          "rest": "90–120 s",
          "method": "Au feeling",
          "percent": null,
          "rmKey": null,
          "drop": false,
          "dropPercent": null,
          "bodyweight": false
        },
        {
          "id": "lun-5",
          "name": "Curl poulie",
          "reps": "2 × 12–15",
          "rest": "90–120 s",
          "method": "Au feeling",
          "percent": null,
          "rmKey": null,
          "drop": false,
          "dropPercent": null,
          "bodyweight": false
        }
      ]
    },
    {
      "day": 2,
      "weekday": "Mardi",
      "title": "Jambes",
      "exercises": [
        {
          "id": "mer-1",
          "name": "Presse à cuisses",
          "reps": "3 × 8–12",
          "rest": "90–120 s",
          "method": "Au feeling",
          "percent": null,
          "rmKey": null,
          "drop": false,
          "dropPercent": null,
          "bodyweight": false
        },
        {
          "id": "mer-2",
          "name": "Leg extension",
          "reps": "3 × 10–12",
          "rest": "90–120 s",
          "method": "Au feeling",
          "percent": null,
          "rmKey": null,
          "drop": false,
          "dropPercent": null,
          "bodyweight": false
        },
        {
          "id": "mer-3",
          "name": "Leg curl",
          "reps": "3 × 10–12",
          "rest": "90–120 s",
          "method": "Au feeling",
          "percent": null,
          "rmKey": null,
          "drop": false,
          "dropPercent": null,
          "bodyweight": false
        },
        {
          "id": "mer-4",
          "name": "Hack squat",
          "reps": "3 × 8–12",
          "rest": "90–120 s",
          "method": "Au feeling",
          "percent": null,
          "rmKey": null,
          "drop": false,
          "dropPercent": null,
          "bodyweight": false
        },
        {
          "id": "mer-5",
          "name": "Mollets",
          "reps": "3 × 12–15",
          "rest": "90–120 s",
          "method": "Au feeling",
          "percent": null,
          "rmKey": null,
          "drop": false,
          "dropPercent": null,
          "bodyweight": false
        }
      ]
    },
    {
      "day": 3,
      "weekday": "Mercredi",
      "title": "Épaules + rappel pecs/bras",
      "exercises": [
        {
          "id": "mar-1",
          "name": "Développé épaules machine",
          "reps": "3 × 8–12",
          "rest": "90–120 s",
          "method": "Au feeling",
          "percent": null,
          "rmKey": null,
          "drop": false,
          "dropPercent": null,
          "bodyweight": false
        },
        {
          "id": "mar-2",
          "name": "Élévations latérales",
          "reps": "3 × 12–15",
          "rest": "90–120 s",
          "method": "Au feeling",
          "percent": null,
          "rmKey": null,
          "drop": false,
          "dropPercent": null,
          "bodyweight": false
        },
        {
          "id": "mar-3",
          "name": "Oiseau machine",
          "reps": "3 × 12–15",
          "rest": "90–120 s",
          "method": "Au feeling",
          "percent": null,
          "rmKey": null,
          "drop": false,
          "dropPercent": null,
          "bodyweight": false
        },
        {
          "id": "mar-4",
          "name": "Pec deck",
          "reps": "2 × 12",
          "rest": "90–120 s",
          "method": "Au feeling",
          "percent": null,
          "rmKey": null,
          "drop": false,
          "dropPercent": null,
          "bodyweight": false
        },
        {
          "id": "mar-5",
          "name": "Extension triceps poulie",
          "reps": "2 × 12",
          "rest": "90–120 s",
          "method": "Au feeling",
          "percent": null,
          "rmKey": null,
          "drop": false,
          "dropPercent": null,
          "bodyweight": false
        }
      ]
    },
    {
      "day": 4,
      "weekday": "Jeudi",
      "title": "Repos",
      "exercises": []
    },
    {
      "day": 5,
      "weekday": "Vendredi",
      "title": "Repos",
      "exercises": []
    },
    {
      "day": 6,
      "weekday": "Samedi",
      "title": "Cardio + full body",
      "exercises": [
        {
          "id": "sam-1",
          "name": "Cardio (vélo ou tapis)",
          "reps": "15 min",
          "rest": "—",
          "method": "Allure modérée",
          "percent": null,
          "rmKey": null,
          "drop": false,
          "dropPercent": null,
          "bodyweight": false
        },
        {
          "id": "sam-2",
          "name": "Pompes ou développé machine",
          "reps": "2 × 10",
          "rest": "90–120 s",
          "method": "Au feeling",
          "percent": null,
          "rmKey": null,
          "drop": false,
          "dropPercent": null,
          "bodyweight": false
        },
        {
          "id": "sam-3",
          "name": "Tirage vertical",
          "reps": "2 × 10",
          "rest": "90–120 s",
          "method": "Au feeling",
          "percent": null,
          "rmKey": null,
          "drop": false,
          "dropPercent": null,
          "bodyweight": false
        },
        {
          "id": "sam-4",
          "name": "Presse à cuisses",
          "reps": "2 × 12",
          "rest": "90–120 s",
          "method": "Au feeling",
          "percent": null,
          "rmKey": null,
          "drop": false,
          "dropPercent": null,
          "bodyweight": false
        },
        {
          "id": "sam-5",
          "name": "Gainage",
          "reps": "3 × 30 s",
          "rest": "90–120 s",
          "method": "Poids du corps",
          "percent": null,
          "rmKey": null,
          "drop": false,
          "dropPercent": null,
          "bodyweight": true,
          "modes": [
            "PDC",
            "Lesté"
          ]
        }
      ]
    },
    {
      "day": 7,
      "weekday": "Dimanche",
      "title": "Pecs + triceps",
      "exercises": [
        {
          "id": "dim-1",
          "name": "Développé couché machine",
          "reps": "3 × 8–12",
          "rest": "90–120 s",
          "method": "Au feeling",
          "percent": null,
          "rmKey": null,
          "drop": false,
          "dropPercent": null,
          "bodyweight": false
        },
        {
          "id": "dim-2",
          "name": "Développé incliné",
          "reps": "3 × 8–12",
          "rest": "90–120 s",
          "method": "Au feeling",
          "percent": null,
          "rmKey": null,
          "drop": false,
          "dropPercent": null,
          "bodyweight": false
        },
        {
          "id": "dim-3",
          "name": "Pec deck",
          "reps": "3 × 12",
          "rest": "90–120 s",
          "method": "Au feeling",
          "percent": null,
          "rmKey": null,
          "drop": false,
          "dropPercent": null,
          "bodyweight": false
        },
        {
          "id": "dim-4",
          "name": "Triceps poulie",
          "reps": "3 × 10–12",
          "rest": "90–120 s",
          "method": "Au feeling",
          "percent": null,
          "rmKey": null,
          "drop": false,
          "dropPercent": null,
          "bodyweight": false
        },
        {
          "id": "dim-5",
          "name": "Barre au front ou dips machine",
          "reps": "2 × 10–12",
          "rest": "90–120 s",
          "method": "Au feeling",
          "percent": null,
          "rmKey": null,
          "drop": false,
          "dropPercent": null,
          "bodyweight": false
        }
      ]
    }
  ]
};

const WEEKDAY_NAMES = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

const ex = (id, name, reps, more = {}) => ({
  id, name, reps, rest: "90–120 s", method: "Au feeling",
  percent: null, rmKey: null, drop: false, dropPercent: null, bodyweight: false, ...more,
});
const plank = (id) => ex(id, "Gainage", "3 × 30 s", { rest: "60 s", method: "Poids du corps", bodyweight: true, modes: ["PDC", "Lesté"] });

/** Semaine complète : { 1: { title, exercises }, … } ; les autres jours sont des jours de repos. */
function week(sessions) {
  return {
    version: 1,
    days: WEEKDAY_NAMES.map((weekday, i) => {
      const s = sessions[i + 1];
      return { day: i + 1, weekday, title: s ? s.title : "Repos", exercises: s ? s.exercises : [] };
    }),
  };
}

const FULL_BODY_3 = week({
  1: { title: "Full body A", exercises: [
    ex("fb-a1", "Presse à cuisses", "3 × 8–12"),
    ex("fb-a2", "Développé couché machine", "3 × 8–12"),
    ex("fb-a3", "Tirage vertical", "3 × 8–12"),
    ex("fb-a4", "Élévations latérales", "2 × 12–15"),
    plank("fb-a5"),
  ] },
  3: { title: "Full body B", exercises: [
    ex("fb-b1", "Leg curl", "3 × 10–12"),
    ex("fb-b2", "Développé épaules machine", "3 × 8–12"),
    ex("fb-b3", "Rowing assis (machine)", "3 × 8–12"),
    ex("fb-b4", "Curl haltères", "2 × 10–12"),
    ex("fb-b5", "Extension triceps poulie", "2 × 10–12"),
  ] },
  5: { title: "Full body C", exercises: [
    ex("fb-c1", "Hack squat", "3 × 8–12"),
    ex("fb-c2", "Développé incliné", "3 × 8–12"),
    ex("fb-c3", "Tirage poulie basse", "3 × 10–12"),
    ex("fb-c4", "Leg extension", "2 × 12–15"),
    ex("fb-c5", "Mollets", "3 × 12–15"),
  ] },
});

const UPPER_LOWER_4 = week({
  1: { title: "Haut du corps A", exercises: [
    ex("hb-h1", "Développé couché machine", "3 × 8–12"),
    ex("hb-h2", "Tirage vertical", "3 × 8–12"),
    ex("hb-h3", "Développé épaules machine", "3 × 10–12"),
    ex("hb-h4", "Curl haltères", "2 × 10–12"),
    ex("hb-h5", "Extension triceps poulie", "2 × 10–12"),
  ] },
  2: { title: "Bas du corps A", exercises: [
    ex("hb-b1", "Presse à cuisses", "3 × 8–12"),
    ex("hb-b2", "Leg curl", "3 × 10–12"),
    ex("hb-b3", "Leg extension", "3 × 10–12"),
    ex("hb-b4", "Mollets", "3 × 12–15"),
    plank("hb-b5"),
  ] },
  4: { title: "Haut du corps B", exercises: [
    ex("hb-h6", "Rowing assis (machine)", "3 × 8–12"),
    ex("hb-h7", "Développé incliné", "3 × 8–12"),
    ex("hb-h8", "Élévations latérales", "3 × 12–15"),
    ex("hb-h9", "Curl poulie", "2 × 12–15"),
    ex("hb-h10", "Pec deck", "2 × 12–15"),
  ] },
  5: { title: "Bas du corps B", exercises: [
    ex("hb-b6", "Hack squat", "3 × 8–12"),
    ex("hb-b7", "Leg curl", "3 × 10–12"),
    ex("hb-b8", "Fentes", "3 × 10–12"),
    ex("hb-b9", "Mollets", "3 × 12–15"),
  ] },
});

/** Modèles proposés, dans l'ordre d'affichage. */
export const TEMPLATES = [
  { id: "fullbody3", name: "Full body · 3 jours", summary: "Tout le corps à chaque séance · idéal pour débuter", program: FULL_BODY_3 },
  { id: "hautbas4", name: "Haut / bas · 4 jours", summary: "Haut et bas du corps en alternance", program: UPPER_LOWER_4 },
  { id: "split5", name: "Split · 5 jours", summary: "Un groupe musculaire par séance", program: PROGRAM },
  { id: "vide", name: "Programme vide", summary: "Tu crées tes séances toi-même", program: week({}) },
];

/** Copie du programme d'un modèle (split 5 jours si l'identifiant est inconnu). */
export function templateProgram(id) {
  const t = TEMPLATES.find((x) => x.id === id) || TEMPLATES.find((x) => x.id === "split5");
  return structuredClone(t.program);
}
