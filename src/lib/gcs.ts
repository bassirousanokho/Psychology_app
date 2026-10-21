import { Storage } from "@google-cloud/storage";

// Uses Application Default Credentials: a downloaded service-account key
// (GOOGLE_APPLICATION_CREDENTIALS) locally, or the attached Cloud Run
// service account in production. See README "Google Cloud Storage setup".
const storage = new Storage();
const bucket = () => {
  const name = process.env.GCS_BUCKET_NAME;
  if (!name) throw new Error("GCS_BUCKET_NAME is not set");
  return storage.bucket(name);
};

const SIGNED_URL_TTL_MS = 15 * 60 * 1000;

export async function getUploadUrl(key: string, contentType: string): Promise<string> {
  const [url] = await bucket().file(key).getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + SIGNED_URL_TTL_MS,
    contentType,
  });
  return url;
}

export async function getSignedReadUrl(key: string): Promise<string> {
  const [url] = await bucket().file(key).getSignedUrl({
    version: "v4",
    action: "read",
    expires: Date.now() + SIGNED_URL_TTL_MS,
  });
  return url;
}

export async function deleteFile(key: string): Promise<void> {
  await bucket().file(key).delete({ ignoreNotFound: true });
}

/** Downloads a stored file (data exports). */
export async function downloadFile(key: string): Promise<Buffer> {
  const [data] = await bucket().file(key).download();
  return data;
}
