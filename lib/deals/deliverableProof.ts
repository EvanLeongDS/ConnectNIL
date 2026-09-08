export const PROOF_MIN_DESCRIPTION_LENGTH = 150;
export const PROOF_MAX_IMAGES = 10;
export const PROOF_MAX_FILE_BYTES = 5 * 1024 * 1024;

/**
 * The proof image MIME allowlist.
 *
 * This module is imported by the CLIENT form (components/deals/DeliverableProofForm.tsx),
 * so it must stay free of server-only imports — never import @aws-sdk/* or anything from
 * lib/aws/ here.
 */
export const ALLOWED_PROOF_MIME_LIST = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

const ALLOWED_MIME = new Set<string>(ALLOWED_PROOF_MIME_LIST);

export function isAllowedProofImageType(mime: string): boolean {
  return ALLOWED_MIME.has(mime);
}

/**
 * Legacy reader: returns the raw strings out of proof_image_urls.
 * Kept for compatibility; prefer parseProofImageRefs below, which understands both
 * the legacy Supabase-URL format and the new S3-key format.
 */
export function parseProofImageUrls(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((u): u is string => typeof u === "string" && u.length > 0);
  }
  return [];
}

/* ────────────────────────────────────────────────────────────────────────────
 * S3 migration: deliverables.proof_image_urls holds a MIXED array of refs.
 *
 *   'https://<ref>.supabase.co/storage/v1/object/public/deliverable-proofs/...'
 *       -> legacy, written before the S3 migration. Rendered verbatim.
 *   's3://deals/<partnershipId>/<deliverableId>/<uuid>.<ext>'
 *       -> new. An S3 object KEY, presigned at render time.
 *
 * Never store a presigned URL in the database: it expires. Store the key.
 * ──────────────────────────────────────────────────────────────────────────── */

export const S3_REF_PREFIX = "s3://";
export const PROOF_KEY_ROOT = "deals";

export type ProofImageRef =
  | { kind: "s3"; key: string }
  | { kind: "url"; url: string };

/** Parses the mixed-format array. Unrecognised entries are dropped rather than thrown on. */
export function parseProofImageRefs(raw: unknown): ProofImageRef[] {
  if (!Array.isArray(raw)) return [];
  const out: ProofImageRef[] = [];
  for (const v of raw) {
    if (typeof v !== "string" || v.length === 0) continue;
    if (v.startsWith(S3_REF_PREFIX)) {
      const key = v.slice(S3_REF_PREFIX.length);
      if (key) out.push({ kind: "s3", key });
    } else if (v.startsWith("https://") || v.startsWith("http://")) {
      out.push({ kind: "url", url: v });
    }
  }
  return out;
}

export type ProofImageExt = "jpg" | "png" | "webp" | "gif";

export function extForProofMime(mime: string): ProofImageExt | null {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return null;
  }
}

export function proofObjectKey(
  partnershipId: string,
  deliverableId: string,
  uuid: string,
  ext: ProofImageExt
): string {
  return `${PROOF_KEY_ROOT}/${partnershipId}/${deliverableId}/${uuid}.${ext}`;
}

const UUID_SRC =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
// `\\.` not `\.`: this pattern is built in a template literal, where `\.` is not a
// recognised escape and collapses to a bare `.` — which matches ANY character. The
// separator has to be a literal dot, both to keep the shape check tight and because
// parseProofKey() splits the extension off at the last dot.
const PROOF_KEY_RE = new RegExp(
  `^${PROOF_KEY_ROOT}/${UUID_SRC}/${UUID_SRC}/${UUID_SRC}\\.(jpg|png|webp|gif)$`
);

/**
 * A key the client hands back at submit time is only acceptable if it is shaped exactly
 * like one the presign route would have minted, FOR THIS DELIVERABLE. The prefix check is
 * what stops a caller submitting a key belonging to someone else's deal.
 */
export function isValidProofKey(
  key: string,
  partnershipId: string,
  deliverableId: string
): boolean {
  return (
    PROOF_KEY_RE.test(key) &&
    key.startsWith(`${PROOF_KEY_ROOT}/${partnershipId}/${deliverableId}/`)
  );
}

/**
 * Splits a well-formed proof key back into its parts, or null if it isn't one.
 *
 * The S3-event Lambda and the callback route both need the ids, and neither of them has
 * the surrounding request context that isValidProofKey() checks against — so the shape
 * test lives here once and both read the ids out of the key itself.
 */
export function parseProofKey(
  key: string
): { partnershipId: string; deliverableId: string; uuid: string; ext: ProofImageExt } | null {
  if (!PROOF_KEY_RE.test(key)) return null;
  const [, partnershipId, deliverableId, file] = key.split("/");
  const dot = file.lastIndexOf(".");
  return {
    partnershipId,
    deliverableId,
    uuid: file.slice(0, dot),
    ext: file.slice(dot + 1) as ProofImageExt,
  };
}

/**
 * Where the generated thumbnail for a proof object lives.
 *
 * Deliberately OUTSIDE the `deals/` prefix. The pipeline Lambda is wired to
 * s3:ObjectCreated with a `deals/` prefix filter, so writing the thumbnail under
 * `thumbs/deals/...` cannot re-trigger the function that produced it. Moving thumbnails
 * back under `deals/` would create an infinite invocation loop and a real bill.
 */
export const PROOF_THUMB_ROOT = "thumbs";

export function thumbKeyFor(key: string): string {
  return `${PROOF_THUMB_ROOT}/${key.replace(/\.(jpg|png|webp|gif)$/, "")}.webp`;
}

/**
 * Magic-byte sniffing. The client's declared Content-Type is not trusted anywhere in the
 * submit path — this reads the actual leading bytes of the stored object instead.
 * Pass at least the first 12 bytes.
 */
export function sniffImageMime(head: Uint8Array): string | null {
  const b = head;
  // JPEG: FF D8 FF
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    b.length >= 8 &&
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  ) {
    return "image/png";
  }
  // GIF: "GIF87a" or "GIF89a"
  if (
    b.length >= 6 &&
    b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 &&
    b[3] === 0x38 && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61
  ) {
    return "image/gif";
  }
  // WebP: "RIFF" .... "WEBP"
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}
