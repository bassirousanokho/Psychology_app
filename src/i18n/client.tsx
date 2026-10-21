"use client";

import { createContext, useContext, useMemo } from "react";
import { makeI18n, type I18n, type Lang, type Vars } from "./core";
import type { MessageKey } from "./messages";

const I18nContext = createContext<I18n>(makeI18n("fr"));

/** Gives client components the practice's language (set in the dashboard / portal layouts). */
export function I18nProvider({
  lang,
  locale,
  children,
}: {
  lang: Lang;
  locale?: string;
  children: React.ReactNode;
}) {
  const value = useMemo(() => makeI18n(lang, locale), [lang, locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  return useContext(I18nContext);
}

/** Translated text, for places that can't call the hook (e.g. table column headers). */
export function T({ k, vars }: { k: MessageKey; vars?: Vars }) {
  const { t } = useI18n();
  return <>{t(k, vars)}</>;
}
