// Données de l'application : programme et date de début.
// Pour modifier le programme, change ce fichier puis remets-le sur GitHub.
// (Ton prénom et ton objectif ne sont pas ici : ils restent sur ton téléphone.)

export const CONFIG = {
  "appName": "Salle",
  "start": "2026-10-24",
  "timezone": "Europe/Paris"
};

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
      "day": 3,
      "weekday": "Mercredi",
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
