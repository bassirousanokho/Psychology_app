// Ready-made forms a practice can add and adapt. Starting points only: the
// practitioner reviews the wording (especially consent) before sending them.

import type { FormField, FormKind } from "./forms";

export type LibraryForm = {
  key: string;
  kind: FormKind;
  name: string;
  description: string;
  requiresSignature: boolean;
  fields: FormField[];
};

const fr: LibraryForm[] = [
  {
    key: "intake",
    kind: "INTAKE",
    name: "Formulaire d'accueil",
    description: "À remplir avant la première séance. Vos réponses sont confidentielles.",
    requiresSignature: false,
    fields: [
      { id: "h1", type: "heading", label: "Votre demande" },
      { id: "reason", type: "textarea", label: "Qu'est-ce qui vous amène à consulter ?", required: true },
      { id: "since", type: "text", label: "Depuis quand ces difficultés sont-elles présentes ?" },
      { id: "goals", type: "textarea", label: "Qu'aimeriez-vous que la thérapie vous apporte ?" },
      { id: "distress", type: "scale", label: "À quel point ces difficultés vous affectent-elles en ce moment ? (0 = pas du tout, 10 = énormément)" },
      { id: "h2", type: "heading", label: "Antécédents" },
      { id: "prevTherapy", type: "yesno", label: "Avez-vous déjà consulté un psychologue ou un psychothérapeute ?" },
      { id: "prevTherapyDetails", type: "textarea", label: "Si oui : quand, avec qui et pour quelle raison ?" },
      { id: "medication", type: "textarea", label: "Prenez-vous des médicaments actuellement ? Lesquels ?" },
      { id: "health", type: "textarea", label: "Problèmes de santé ou diagnostics à connaître" },
      {
        id: "safety",
        type: "yesno",
        label: "Au cours du dernier mois, avez-vous eu des idées de vous faire du mal ou de mettre fin à vos jours ?",
        help: "En cas d'urgence, appelez le 911 ou le 1 866 APPELLE (1 866 277-3553), 24 h/24.",
        required: true,
      },
      { id: "h3", type: "heading", label: "Situation actuelle" },
      { id: "occupation", type: "text", label: "Occupation (travail, études…)" },
      { id: "living", type: "text", label: "Avec qui vivez-vous ?" },
      { id: "support", type: "textarea", label: "Sur qui pouvez-vous compter dans votre entourage ?" },
      {
        id: "referral",
        type: "choice",
        label: "Comment avez-vous connu le cabinet ?",
        options: ["Médecin", "Proche", "Recherche en ligne", "Assurance / PAE", "Autre"],
      },
    ],
  },
  {
    key: "consent",
    kind: "CONSENT",
    name: "Consentement aux services psychologiques",
    description: "Merci de lire attentivement ce document avant de le signer. Posez toutes vos questions lors de la première séance.",
    requiresSignature: true,
    fields: [
      { id: "h1", type: "heading", label: "Nature des services" },
      {
        id: "p1",
        type: "paragraph",
        label:
          "La psychothérapie vise à vous aider à mieux comprendre et à surmonter vos difficultés. Elle peut faire émerger des émotions difficiles. Les objectifs et la durée du suivi sont discutés ensemble et révisés au besoin. Vous pouvez mettre fin au suivi à tout moment.",
      },
      { id: "h2", type: "heading", label: "Confidentialité et ses limites" },
      {
        id: "p2",
        type: "paragraph",
        label:
          "Ce que vous confiez est confidentiel et ne peut être communiqué sans votre autorisation écrite, sauf dans les cas prévus par la loi : danger grave et imminent de mort ou de blessures graves pour vous-même ou autrui, signalement à la protection de la jeunesse lorsque la sécurité ou le développement d'un enfant est compromis, ou ordonnance d'un tribunal.",
      },
      { id: "h3", type: "heading", label: "Dossier" },
      {
        id: "p3",
        type: "paragraph",
        label:
          "Un dossier est tenu pour chaque client, conformément à la réglementation professionnelle. Il est conservé de façon sécuritaire pendant au moins cinq ans après le dernier service. Vous pouvez le consulter ou en obtenir une copie sur demande.",
      },
      { id: "h4", type: "heading", label: "Honoraires et annulations" },
      {
        id: "p4",
        type: "paragraph",
        label:
          "Les honoraires sont payables le jour de la séance. Toute séance annulée moins de 48 heures à l'avance, ou manquée, peut être facturée en totalité. Un reçu vous est remis pour vos assurances.",
      },
      { id: "h5", type: "heading", label: "Communications" },
      {
        id: "p5",
        type: "paragraph",
        label:
          "Le courriel et le portail patient servent à la prise de rendez-vous et à l'échange de documents. Ils ne remplacent pas une séance et ne sont pas surveillés en continu : en cas d'urgence, appelez le 911.",
      },
      { id: "c1", type: "checkbox", label: "J'ai lu et compris les informations ci-dessus et j'ai pu poser mes questions.", required: true },
      { id: "c2", type: "checkbox", label: "Je consens à recevoir des services psychologiques.", required: true },
      { id: "c3", type: "checkbox", label: "J'accepte de recevoir des rappels de rendez-vous et des documents par courriel." },
    ],
  },
  {
    key: "checkin",
    kind: "QUESTIONNAIRE",
    name: "Suivi entre les séances",
    description: "Quelques questions pour préparer votre prochaine séance.",
    requiresSignature: false,
    fields: [
      { id: "mood", type: "scale", label: "Comment évaluez-vous votre humeur cette semaine ? (0 = très mauvaise, 10 = excellente)", required: true },
      { id: "anxiety", type: "scale", label: "Votre niveau d'anxiété cette semaine ? (0 = aucune, 10 = extrême)" },
      { id: "sleep", type: "choice", label: "Votre sommeil cette semaine", options: ["Bon", "Moyen", "Difficile"] },
      { id: "events", type: "textarea", label: "Événements marquants depuis la dernière séance" },
      { id: "topics", type: "textarea", label: "De quoi aimeriez-vous parler à la prochaine séance ?" },
    ],
  },
];

const en: LibraryForm[] = [
  {
    key: "intake",
    kind: "INTAKE",
    name: "Intake form",
    description: "Please fill this in before your first session. Your answers are confidential.",
    requiresSignature: false,
    fields: [
      { id: "h1", type: "heading", label: "Your request" },
      { id: "reason", type: "textarea", label: "What brings you to therapy?", required: true },
      { id: "since", type: "text", label: "How long have these difficulties been present?" },
      { id: "goals", type: "textarea", label: "What would you like therapy to help you with?" },
      { id: "distress", type: "scale", label: "How much are these difficulties affecting you right now? (0 = not at all, 10 = enormously)" },
      { id: "h2", type: "heading", label: "History" },
      { id: "prevTherapy", type: "yesno", label: "Have you seen a psychologist or psychotherapist before?" },
      { id: "prevTherapyDetails", type: "textarea", label: "If so: when, with whom and why?" },
      { id: "medication", type: "textarea", label: "Are you currently taking any medication? Which?" },
      { id: "health", type: "textarea", label: "Health conditions or diagnoses I should know about" },
      {
        id: "safety",
        type: "yesno",
        label: "In the past month, have you had thoughts of harming yourself or ending your life?",
        help: "In an emergency, call 911 or 988 (Suicide Crisis Helpline), 24/7.",
        required: true,
      },
      { id: "h3", type: "heading", label: "Current situation" },
      { id: "occupation", type: "text", label: "Occupation (work, studies…)" },
      { id: "living", type: "text", label: "Who do you live with?" },
      { id: "support", type: "textarea", label: "Who can you count on around you?" },
      {
        id: "referral",
        type: "choice",
        label: "How did you hear about the practice?",
        options: ["Doctor", "Friend or family", "Online search", "Insurance / EAP", "Other"],
      },
    ],
  },
  {
    key: "consent",
    kind: "CONSENT",
    name: "Consent to psychological services",
    description: "Please read this document carefully before signing. Ask any questions at your first session.",
    requiresSignature: true,
    fields: [
      { id: "h1", type: "heading", label: "Nature of the services" },
      {
        id: "p1",
        type: "paragraph",
        label:
          "Psychotherapy aims to help you understand and overcome your difficulties. It may bring up difficult emotions. Goals and length of treatment are discussed together and reviewed as needed. You may end therapy at any time.",
      },
      { id: "h2", type: "heading", label: "Confidentiality and its limits" },
      {
        id: "p2",
        type: "paragraph",
        label:
          "What you share is confidential and is not disclosed without your written consent, except where the law requires it: a serious and imminent risk of death or serious injury to yourself or others, a report to child protection services when a child's safety or development is at risk, or a court order.",
      },
      { id: "h3", type: "heading", label: "Records" },
      {
        id: "p3",
        type: "paragraph",
        label:
          "A record is kept for each client, as professional regulations require. It is stored securely for at least five years after the last service. You may consult it or obtain a copy on request.",
      },
      { id: "h4", type: "heading", label: "Fees and cancellations" },
      {
        id: "p4",
        type: "paragraph",
        label:
          "Fees are payable on the day of the session. A session cancelled less than 48 hours in advance, or missed, may be charged in full. You receive a receipt for your insurance.",
      },
      { id: "h5", type: "heading", label: "Communications" },
      {
        id: "p5",
        type: "paragraph",
        label:
          "Email and the patient portal are used for scheduling and sharing documents. They don't replace a session and aren't monitored continuously: in an emergency, call 911.",
      },
      { id: "c1", type: "checkbox", label: "I have read and understood the information above and was able to ask my questions.", required: true },
      { id: "c2", type: "checkbox", label: "I consent to receiving psychological services.", required: true },
      { id: "c3", type: "checkbox", label: "I agree to receive appointment reminders and documents by email." },
    ],
  },
  {
    key: "checkin",
    kind: "QUESTIONNAIRE",
    name: "Between-session check-in",
    description: "A few questions to prepare your next session.",
    requiresSignature: false,
    fields: [
      { id: "mood", type: "scale", label: "How would you rate your mood this week? (0 = very low, 10 = excellent)", required: true },
      { id: "anxiety", type: "scale", label: "Your anxiety level this week? (0 = none, 10 = extreme)" },
      { id: "sleep", type: "choice", label: "Your sleep this week", options: ["Good", "Fair", "Poor"] },
      { id: "events", type: "textarea", label: "Notable events since the last session" },
      { id: "topics", type: "textarea", label: "What would you like to talk about next session?" },
    ],
  },
];

// France: crisis line, child protection and records wording differ from Québec
const FRANCE_OVERRIDES: Record<string, string> = {
  safety_help: "En cas d'urgence, appelez le 15 ou le 3114 (numéro national de prévention du suicide), 24 h/24.",
  p2:
    "Ce que vous confiez est couvert par le secret professionnel et ne peut être communiqué sans votre accord, sauf dans les cas prévus par la loi : péril grave et imminent pour vous-même ou autrui, ou information des autorités lorsqu'un mineur ou une personne vulnérable est en danger.",
  p3:
    "Un dossier est tenu pour chaque patient et conservé de façon sécurisée. Vous pouvez y accéder ou en obtenir une copie sur demande, conformément au RGPD.",
};

export function formLibrary(lang: "fr" | "en", region?: string | null): LibraryForm[] {
  if (lang === "en") return en;
  if (region !== "FR") return fr;
  return fr.map((form) => ({
    ...form,
    fields: form.fields.map((f) => {
      if (f.id === "safety") return { ...f, help: FRANCE_OVERRIDES.safety_help };
      if (form.key === "consent" && FRANCE_OVERRIDES[f.id]) return { ...f, label: FRANCE_OVERRIDES[f.id] };
      return f;
    }),
  }));
}
