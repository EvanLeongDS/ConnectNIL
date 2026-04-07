export const PROOF_MIN_DESCRIPTION_LENGTH = 150;
export const PROOF_MAX_IMAGES = 10;
export const PROOF_MAX_FILE_BYTES = 5 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export function isAllowedProofImageType(mime: string): boolean {
  return ALLOWED_MIME.has(mime);
}

export function parseProofImageUrls(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((u): u is string => typeof u === "string" && u.length > 0);
  }
  return [];
}
