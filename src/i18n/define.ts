/**
 * Messages for one area of the app, English and French side by side. TypeScript
 * fails if a French message is missing for an English key (and vice versa).
 */
export function defineMessages<const E extends Record<string, string>>(messages: {
  en: E;
  fr: { [K in keyof E]: string };
}) {
  return messages;
}
