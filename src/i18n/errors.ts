// Server actions and form validation return English messages; this maps them to
// French for display. Unknown messages are shown as they are.
import type { Lang } from "./core";

const EXACT: Record<string, string> = {
  // Generic
  "Unauthorized": "Non autorisé",
  "Not authenticated": "Vous devez être connecté",
  "Something went wrong": "Une erreur est survenue",
  "Failed": "Échec",
  "The email could not be sent": "Le courriel n'a pas pu être envoyé",
  "Patient has no email address on file": "Aucune adresse courriel n'est enregistrée pour ce patient",
  // Patients
  "Patient not found": "Patient introuvable",
  "Patient not found in this workspace": "Patient introuvable dans ce cabinet",
  "Patient not found in Recently deleted": "Patient introuvable dans « Supprimés récemment »",
  "Failed to create patient": "Impossible de créer le patient",
  "Failed to update patient": "Impossible de modifier le patient",
  "Failed to delete patient": "Impossible de supprimer le patient",
  "Failed to restore patient": "Impossible de restaurer le patient",
  "Failed to delete patient permanently": "Impossible de supprimer définitivement le patient",
  "This patient has invoices, which must be kept for 10 years. They can stay in Recently deleted.":
    "Ce patient a des factures, qui doivent être conservées. Il peut rester dans « Supprimés récemment ».",
  "Patient already has portal access": "Ce patient a déjà accès au portail",
  "Invalid form data": "Formulaire invalide",
  "First name is required": "Le prénom est obligatoire",
  "Last name is required": "Le nom est obligatoire",
  "Invalid email address": "Adresse courriel invalide",
  "Invalid phone number": "Numéro de téléphone invalide",
  "Invalid date of birth": "Date de naissance invalide",
  "Keep pronouns under 40 characters": "40 caractères maximum",
  "Enter a valid amount": "Saisissez un montant valide",
  // Calendar / sessions
  "Please select a patient": "Veuillez choisir un patient",
  "Start time is required": "L'heure de début est obligatoire",
  "End time is required": "L'heure de fin est obligatoire",
  "End time must be after start time": "La fin doit être après le début",
  "Appointment not found": "Rendez-vous introuvable",
  "Session not found": "Séance introuvable",
  "Failed to create appointment": "Impossible de créer le rendez-vous",
  "Failed to update appointment": "Impossible de modifier le rendez-vous",
  "Failed to delete appointment": "Impossible de supprimer le rendez-vous",
  "Failed to reschedule": "Impossible de déplacer la séance",
  "Failed to create the series": "Impossible de créer la série",
  "Invalid time": "Heure invalide",
  "Time spent must be in half-hour steps": "Le temps passé se saisit par demi-heure",
  "Completed sessions can only be changed from the session page":
    "Une séance terminée ne se modifie que depuis la page de la séance",
  "This session has an invoice and can no longer change status":
    "Cette séance est facturée : son statut ne peut plus changer",
  "A session can only be marked no-show once it has started":
    "Une séance ne peut être marquée « absent » qu'une fois commencée",
  "Enter a valid fee": "Saisissez des frais valides",
  "Only scheduled sessions (or uninvoiced hourly work) can be moved":
    "Seules les séances prévues (ou le travail horaire non facturé) peuvent être déplacées",
  "This session has notes, an invoice or documents. Cancel it instead.":
    "Cette séance a des notes, une facture ou des documents : annulez-la plutôt.",
  "Every date in this series clashes with another session": "Toutes les dates de cette série sont déjà prises",
  "This session is not part of a series": "Cette séance ne fait pas partie d'une série",
  "This session was cancelled": "Cette séance a été annulée",
  "Write a few words or upload a note file first": "Écrivez quelques mots ou téléversez une note d'abord",
  "Failed to save draft": "Impossible d'enregistrer le brouillon",
  "Failed to mark session as complete": "Impossible de terminer la séance",
  "Failed to reopen session": "Impossible de rouvrir la séance",
  // Billing
  "Invoice not found": "Facture introuvable",
  "Invoice already exists": "Une facture existe déjà",
  "Failed to create invoice": "Impossible de créer la facture",
  "This invoice is already paid": "Cette facture est déjà payée",
  "A receipt can only be sent for a paid invoice": "Un reçu ne peut être envoyé que pour une facture payée",
  "Only completed sessions or charged cancellations can be invoiced":
    "Seules les séances terminées ou les annulations facturées peuvent être facturées",
  "No email provider is configured: the invoice was not sent":
    "Aucun service de courriel n'est configuré : la facture n'a pas été envoyée",
  "No email provider is configured: the receipt was not sent":
    "Aucun service de courriel n'est configuré : le reçu n'a pas été envoyé",
  "No email provider is configured: the statement was created but not sent":
    "Aucun service de courriel n'est configuré : le relevé a été créé mais pas envoyé",
  "Pick a valid period": "Choisissez une période valide",
  // Rates
  "Pick a date": "Choisissez une date",
  "Pick the date the new rate applies from": "Choisissez la date d'entrée en vigueur du nouveau tarif",
  "Rate change not found": "Changement de tarif introuvable",
  "Only upcoming changes can be cancelled": "Seuls les changements à venir peuvent être annulés",
  // Documents
  "Document not found": "Document introuvable",
  "Unsupported file type": "Type de fichier non pris en charge",
  "PDF exceeds 16 MB limit": "Le PDF dépasse 16 Mo",
  "Image exceeds 8 MB limit": "L'image dépasse 8 Mo",
  "Image exceeds 5 MB": "L'image dépasse 5 Mo",
  "Use a PNG, JPEG or WebP image": "Utilisez une image PNG, JPEG ou WebP",
  "Invalid upload": "Téléversement invalide",
  "Invalid image slot": "Emplacement d'image invalide",
  // Messages
  "Add a subject": "Ajoutez un objet",
  "Write a message": "Écrivez un message",
  "Subject is too long": "L'objet est trop long",
  "Message is too long": "Le message est trop long",
  // Settings
  "Practice name is required": "Le nom du cabinet est obligatoire",
  "Select at least one working day": "Choisissez au moins un jour travaillé",
  "Day must end after it starts": "La journée doit finir après son début",
  "Must be 0 or greater": "Doit être supérieur ou égal à 0",
  "Must be between 0 and 100": "Doit être entre 0 et 100",
  "At least 1": "Au moins 1",
  "At least 1 year": "Au moins 1 an",
  "At most 30 days": "30 jours maximum",
  "Enter an amount": "Saisissez un montant",
  "Enter a number": "Saisissez un nombre",
  "Enter a rate": "Saisissez un taux",
  "Invalid data": "Données invalides",
  // Portal
  "This day is not available": "Ce jour n'est pas disponible",
  "This time slot is outside working hours": "Ce créneau est en dehors des heures d'ouverture",
  "This slot is no longer available": "Ce créneau n'est plus disponible",
  "No practitioner found in this workspace": "Aucun praticien dans ce cabinet",
};

// Messages with a variable part
const PATTERNS: [RegExp, (...m: string[]) => string][] = [
  [/^Overlaps with (.+)'s session$/, (name) => `Chevauche la séance de ${name}`],
  [/^The slot is now taken by (.+)'s session$/, (name) => `Le créneau est maintenant pris par la séance de ${name}`],
  [/^Choose 2 to (\d+) sessions$/, (n) => `Choisissez entre 2 et ${n} séances`],
  [/^Could not delete (\d+) file\(s\) from storage\. Try again\.$/, (n) => `${n} fichier(s) n'ont pas pu être supprimés. Réessayez.`],
  [/^The email could not be sent: (.+)$/, (err) => `Le courriel n'a pas pu être envoyé : ${err}`],
  [/^(SIRET|ADELI|RPPS|NEQ) must be (\d+) digits$/, (f, n) => `Le ${f} doit comporter ${n} chiffres`],
];

export function translateError(lang: Lang, message: string | undefined): string {
  if (!message) return lang === "fr" ? EXACT["Something went wrong"] : "Something went wrong";
  if (lang === "en") return message;
  if (message in EXACT) return EXACT[message];
  for (const [re, fr] of PATTERNS) {
    const m = message.match(re);
    if (m) return fr(...m.slice(1));
  }
  return message;
}
