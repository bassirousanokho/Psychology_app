import { cache } from "react";
import { headers } from "next/headers";
import prisma from "@/lib/prisma";
import { makeI18n, toLang, type Lang } from "./core";
import { localeOf } from "@/lib/format";

/** The practice's language and region (cached per request). */
const getPracticeLocale = cache(async (workspaceId: string): Promise<{ lang: Lang; region: string | null }> => {
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { language: true, region: true },
  });
  return { lang: toLang(ws?.language), region: ws?.region ?? null };
});

/** Translation helpers for a server component of the practitioner dashboard. */
export async function getI18n(workspaceId: string) {
  const { lang, region } = await getPracticeLocale(workspaceId);
  return makeI18n(lang, localeOf(lang, region));
}

/** Language for pages without a practice (e.g. no portal access): the browser's preference. */
export async function getBrowserI18n() {
  const accept = (await headers()).get("accept-language") ?? "";
  return makeI18n(accept.split(",")[0]?.trim().toLowerCase().startsWith("en") ? "en" : "fr");
}

/** Translation helpers for a patient-portal server page. */
export function portalI18n(workspace: { language: string; region: string }) {
  const lang = toLang(workspace.language);
  return makeI18n(lang, localeOf(lang, workspace.region));
}
