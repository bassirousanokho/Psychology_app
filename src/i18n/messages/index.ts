import common from "./common";
import shell from "./shell";
import overview from "./overview";
import patients from "./patients";
import calendar from "./calendar";
import session from "./session";
import billing from "./billing";
import settings from "./settings";
import portal from "./portal";

const areas = [common, shell, overview, patients, calendar, session, billing, settings, portal] as const;

type Areas = (typeof areas)[number];
// Distributes over the areas, so the result is the union of every area's keys
type KeysOf<T> = T extends { en: infer E } ? keyof E : never;
export type MessageKey = KeysOf<Areas> & string;

export const messages = {
  en: Object.assign({}, ...areas.map((a) => a.en)) as Record<MessageKey, string>,
  fr: Object.assign({}, ...areas.map((a) => a.fr)) as Record<MessageKey, string>,
};
