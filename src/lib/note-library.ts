// Common session note structures a practice can add and adapt.

export type LibraryNote = { key: string; name: string; body: string };

const fr: LibraryNote[] = [
  {
    key: "soap",
    name: "SOAP",
    body: `S — Subjectif (propos du client, motif, vécu depuis la dernière séance) :


O — Objectif (observations : présentation, affect, comportement) :


A — Analyse (compréhension clinique, évolution, risques) :


P — Plan (interventions, tâches, prochaine séance) :
`,
  },
  {
    key: "dap",
    name: "DAP",
    body: `D — Données (ce qui a été dit et observé) :


A — Analyse (interprétation clinique, progrès vers les objectifs) :


P — Plan (suite du traitement, prochaine séance) :
`,
  },
  {
    key: "birp",
    name: "BIRP",
    body: `B — Comportement (présentation, propos, humeur) :


I — Intervention (techniques et approches utilisées) :


R — Réponse (réaction du client aux interventions) :


P — Plan (prochaines étapes) :
`,
  },
  {
    key: "intake",
    name: "Évaluation initiale",
    body: `Motif de consultation :


Histoire du problème :


Antécédents (psychologiques, médicaux, médication) :


Contexte de vie (famille, travail, réseau de soutien) :


Évaluation du risque :


Impression clinique :


Objectifs et plan de traitement :
`,
  },
  {
    key: "closing",
    name: "Note de fin de suivi",
    body: `Durée et nombre de séances :

Motif initial :

Évolution et objectifs atteints :

Raison de la fin du suivi :

Recommandations :
`,
  },
];

const en: LibraryNote[] = [
  {
    key: "soap",
    name: "SOAP",
    body: `S — Subjective (client's report, concerns, since last session):


O — Objective (observations: presentation, affect, behaviour):


A — Assessment (clinical understanding, progress, risk):


P — Plan (interventions, homework, next session):
`,
  },
  {
    key: "dap",
    name: "DAP",
    body: `D — Data (what was said and observed):


A — Assessment (clinical interpretation, progress toward goals):


P — Plan (next steps in treatment, next session):
`,
  },
  {
    key: "birp",
    name: "BIRP",
    body: `B — Behaviour (presentation, statements, mood):


I — Intervention (techniques and approaches used):


R — Response (client's response to interventions):


P — Plan (next steps):
`,
  },
  {
    key: "intake",
    name: "Initial assessment",
    body: `Reason for consultation:


History of the problem:


History (psychological, medical, medication):


Life context (family, work, support network):


Risk assessment:


Clinical impression:


Goals and treatment plan:
`,
  },
  {
    key: "closing",
    name: "Closing summary",
    body: `Length and number of sessions:

Initial reason for consultation:

Progress and goals reached:

Reason for ending:

Recommendations:
`,
  },
];

export function noteLibrary(lang: "fr" | "en"): LibraryNote[] {
  return lang === "fr" ? fr : en;
}
