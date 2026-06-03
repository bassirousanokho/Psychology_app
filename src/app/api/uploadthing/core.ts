import { createUploadthing, type FileRouter } from "uploadthing/next";
import { requireAuth } from "@/lib/tenant";

const f = createUploadthing();

export const ourFileRouter = {
  documentUploader: f({
    pdf:   { maxFileSize: "16MB", maxFileCount: 5 },
    image: { maxFileSize: "8MB",  maxFileCount: 5 },
  })
    .middleware(async () => {
      const { orgId, userId } = await requireAuth();
      return { orgId, userId };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      // We return the metadata so the client callback can call our Server Action
      // with the full context (patientId, appointmentId, etc.)
      return {
        uploadedBy: metadata.userId,
        orgId: metadata.orgId,
        url: file.ufsUrl ?? file.url,
        key: file.key,
        name: file.name,
        size: file.size,
        type: file.type,
      };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
