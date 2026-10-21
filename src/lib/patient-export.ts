// Complete patient files as a ZIP archive (right of access / portability, or a
// full backup of the practice): details, sessions with their notes, messages,
// forms, invoices and the documents themselves. Streamed, so large practices
// don't have to fit in memory.

import { format } from "date-fns";
import { strToU8, Zip, ZipDeflate, ZipPassThrough } from "fflate";
import prisma from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { downloadFile } from "@/lib/gcs";
import { parseFields, responseText, type Answers } from "@/lib/forms";
import { langOf, type Lang } from "@/lib/format";

const README: Record<Lang, string> = {
  fr: `Export des dossiers patients
============================

Un dossier par patient :
- dossier.json : toutes les données (coordonnées, séances et notes, factures, messages, formulaires)
- notes/ : les notes de séance, une par fichier texte
- formulaires/ : les formulaires remplis, avec la signature électronique le cas échéant
- documents/ : les fichiers téléversés (documents partagés et notes téléversées)

Ce fichier contient des informations cliniques confidentielles : conservez-le en lieu sûr.
`,
  en: `Patient files export
====================

One folder per patient:
- dossier.json: all the data (details, sessions and notes, invoices, messages, forms)
- notes/: session notes, one text file each
- formulaires/: completed forms, with the electronic signature when there is one
- documents/: uploaded files (shared documents and uploaded notes)

This file contains confidential clinical information: keep it somewhere safe.
`,
};

/** A safe file or folder name (keeps accents, removes path characters). */
function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/\s+/g, " ").trim().slice(0, 120) || "_";
}

const iso = (d: Date | null) => d?.toISOString() ?? null;
const num = (d: { toString(): string } | null) => (d === null ? null : Number(d.toString()));

/**
 * ZIP of the given patients' files (all of the workspace's patients, including
 * those in Recently deleted, when `patientIds` is omitted).
 */
export function patientsZipStream(workspaceId: string, patientIds?: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const zip = new Zip((err, chunk, final) => {
        if (err) {
          controller.error(err);
          return;
        }
        controller.enqueue(chunk);
        if (final) controller.close();
      });
      const addText = (path: string, text: string) => {
        const file = new ZipDeflate(path, { level: 6 });
        zip.add(file);
        file.push(strToU8(text), true);
      };
      const addBinary = (path: string, data: Uint8Array) => {
        // PDFs and images are already compressed
        const file = new ZipPassThrough(path);
        zip.add(file);
        file.push(data, true);
      };

      try {
        const ws = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { language: true } });
        const lang = langOf(ws.language);
        addText("LISEZ-MOI.txt", README[lang]);

        const ids = patientIds
          ? patientIds
          : (await prisma.patient.findMany({ where: { workspaceId }, select: { id: true }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] })).map(
              (p) => p.id,
            );

        const usedFolders = new Set<string>();
        // One patient at a time, so memory stays bounded
        for (const id of ids) {
          const p = await prisma.patient.findFirst({
            where: { id, workspaceId },
            include: {
              appointments: { orderBy: { startTime: "asc" } },
              invoices: { orderBy: { createdAt: "asc" }, include: { lines: { orderBy: { position: "asc" } } } },
              messages: { orderBy: { createdAt: "asc" } },
              formRequests: { orderBy: { createdAt: "asc" } },
              documents: { orderBy: { createdAt: "asc" } },
              rateChanges: { orderBy: { effectiveFrom: "asc" } },
              statements: { orderBy: { createdAt: "asc" } },
            },
          });
          if (!p) continue;

          let folder = safeName(`${p.lastName} ${p.firstName}`);
          if (usedFolders.has(folder)) folder = `${folder} (${p.id.slice(-6)})`;
          usedFolders.add(folder);

          // Session notes as text files
          for (const a of p.appointments) {
            const notes = decrypt(a.sessionNotes)?.trim();
            if (!notes) continue;
            const header = [
              `${p.firstName} ${p.lastName}`,
              `${format(a.startTime, "yyyy-MM-dd HH:mm")} – ${format(a.endTime, "HH:mm")} · ${a.type} · ${a.status}`,
              a.noteCompletedAt ? `Finalisée / completed: ${format(a.noteCompletedAt, "yyyy-MM-dd HH:mm")}` : "Brouillon / draft",
              "",
              "",
            ].join("\n");
            addText(`${folder}/notes/${format(a.startTime, "yyyy-MM-dd_HHmm")}.txt`, header + notes + "\n");
          }

          // Completed forms
          const forms = p.formRequests.map((r) => {
            const fields = parseFields(r.fields);
            let answers: Answers = {};
            try {
              answers = r.answers ? (JSON.parse(decrypt(r.answers) ?? "{}") as Answers) : {};
            } catch {
              answers = {};
            }
            if (r.status === "COMPLETED") {
              const signature = r.signedAt
                ? `\n\nSignature : ${r.signatureName} — ${format(r.signedAt, "yyyy-MM-dd HH:mm")} (IP ${r.signerIp ?? "?"})\n`
                : "\n";
              addText(
                `${folder}/formulaires/${format(r.completedAt ?? r.createdAt, "yyyy-MM-dd")} ${safeName(r.name)}.txt`,
                responseText({ name: r.name, fields }, answers, lang) + signature,
              );
            }
            return {
              name: r.name,
              kind: r.kind,
              status: r.status,
              sentAt: iso(r.sentAt),
              completedAt: iso(r.completedAt),
              signature: r.signedAt ? { name: r.signatureName, signedAt: iso(r.signedAt), ip: r.signerIp, userAgent: r.signerUserAgent } : null,
              fields,
              answers,
            };
          });

          // Documents (shared files and uploaded notes)
          const usedNames = new Set<string>();
          const documents = [];
          for (const d of p.documents) {
            let name = safeName(d.name);
            if (usedNames.has(name)) name = `${format(d.createdAt, "yyyy-MM-dd_HHmmss")} ${name}`;
            usedNames.add(name);
            const path = `documents/${d.isSessionNote ? "notes/" : ""}${name}`;
            try {
              addBinary(`${folder}/${path}`, new Uint8Array(await downloadFile(d.fileKey)));
              documents.push({ name: d.name, file: path, type: d.fileType, size: d.fileSize, sharedWithPatient: d.sharedWithPatient, sessionNote: d.isSessionNote, uploadedAt: iso(d.createdAt) });
            } catch (err) {
              console.error("[export] document", d.id, err instanceof Error ? err.message : err);
              documents.push({ name: d.name, file: null, error: "missing from storage", uploadedAt: iso(d.createdAt) });
            }
          }

          const dossier = {
            exportedAt: new Date().toISOString(),
            patient: {
              id: p.id,
              firstName: p.firstName,
              lastName: p.lastName,
              email: p.email,
              phone: p.phone,
              dateOfBirth: p.dateOfBirth?.toISOString().slice(0, 10) ?? null,
              gender: p.gender,
              pronouns: p.pronouns,
              address: p.address,
              emergencyContact: { name: p.emergencyContactName, relation: p.emergencyContactRelation, phone: p.emergencyContactPhone },
              familyDoctor: { name: p.doctorName, phone: p.doctorPhone },
              sessionRate: num(p.tariff),
              backgroundNotes: p.backgroundNotes,
              remindersEnabled: p.remindersEnabled,
              createdAt: iso(p.createdAt),
              deletedAt: iso(p.deletedAt),
            },
            rateChanges: p.rateChanges.map((c) => ({
              amount: num(c.amount),
              previousAmount: num(c.previousAmount),
              effectiveFrom: c.effectiveFrom.toISOString().slice(0, 10),
              notifiedAt: iso(c.notifiedAt),
            })),
            sessions: p.appointments.map((a) => ({
              id: a.id,
              startTime: iso(a.startTime),
              endTime: iso(a.endTime),
              type: a.type,
              status: a.status,
              price: num(a.tariffAmount),
              cancelledAt: iso(a.cancelledAt),
              cancellationFee: num(a.cancellationFee),
              notes: decrypt(a.sessionNotes),
              noteCompletedAt: iso(a.noteCompletedAt),
            })),
            invoices: p.invoices.map((i) => ({
              number: i.invoiceNumber,
              kind: i.kind,
              status: i.status,
              issuedAt: iso(i.createdAt),
              dueDate: iso(i.dueDate),
              paidAt: iso(i.paidAt),
              amount: num(i.amount),
              tax: num(i.taxAmount),
              total: num(i.totalAmount),
              lines: i.lines.map((l) => ({
                description: l.description,
                quantity: num(l.quantity),
                unitPrice: num(l.unitPrice),
                discountPercent: num(l.discountPercent),
                amount: num(l.amount),
              })),
              notes: i.notes,
            })),
            statements: p.statements.map((s) => ({
              periodStart: s.periodStart.toISOString().slice(0, 10),
              periodEnd: s.periodEnd.toISOString().slice(0, 10),
              createdAt: iso(s.createdAt),
              sentAt: iso(s.sentAt),
            })),
            messages: p.messages.map((m) => ({
              sentAt: iso(m.createdAt),
              from: m.direction === "FROM_PATIENT" ? "patient" : "practitioner",
              subject: m.subject,
              body: decrypt(m.body),
              readAt: iso(m.readAt),
              attachments: p.documents.filter((d) => d.messageId === m.id).map((d) => d.name),
              emailNotice: m.status,
            })),
            forms,
            documents,
          };
          addText(`${folder}/dossier.json`, JSON.stringify(dossier, null, 2));
        }
        zip.end();
      } catch (err) {
        console.error("[export]", err);
        controller.error(err);
      }
    },
  });
}

export function zipResponse(stream: ReadableStream<Uint8Array>, filename: string): Response {
  return new Response(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
