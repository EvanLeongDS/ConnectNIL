/**
 * Athlete profile photo: key shape, MIME allowlist, and size cap.
 *
 * This module is imported by CLIENT components (the onboarding wizard and the profile
 * editor), so it must stay free of server-only imports — never import @aws-sdk/* or
 * anything from lib/aws/ here. The server-side S3 calls live in lib/aws/s3.ts.
 *
 * Mirrors lib/deals/deliverableProof.ts, which carries the same constraint for the same
 * reason. It is deliberately a SIBLING rather than an extension of that module: the proof
 * key helpers are also compiled into the CDK Lambda (infra/lambda/proof-processor imports
 * them), and widening them with avatar shapes would drag profile concerns into a function
 * that has no business knowing about them.
 */

/**
 * The generic magic-byte sniffer is genuinely shared — it inspects image bytes and knows
 * nothing about deals. Reimplementing it here would mean two copies of the same byte
 * tables drifting apart.
 */
export { sniffImageMime } from "@/lib/deals/deliverableProof";

/**
 * Deliberately NARROWER than the proof allowlist, which also permits image/gif. A GIF is
 * a reasonable format for a screenshot of a post; it is a poor one for a headshot, and
 * allowing it invites animated avatars, which is a product decision nobody has made.
 * A GIF uploaded with a lying Content-Type is still caught: the server sniffs the stored
 * bytes and requires the result to be in THIS list.
 */
export const ALLOWED_PHOTO_MIME_LIST = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

const ALLOWED_MIME = new Set<string>(ALLOWED_PHOTO_MIME_LIST);

export function isAllowedPhotoType(mime: string): boolean {
  return ALLOWED_MIME.has(mime);
}

/** The `accept` attribute for the file input, kept in sync with the allowlist above. */
export const PHOTO_ACCEPT_ATTR = ALLOWED_PHOTO_MIME_LIST.join(",");

/** Matches PROOF_MAX_FILE_BYTES. The server re-checks the real size with HeadObject. */
export const PHOTO_MAX_FILE_BYTES = 5 * 1024 * 1024;

export type PhotoExt = "jpg" | "png" | "webp";

export function extForPhotoMime(mime: string): PhotoExt | null {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return null;
  }
}

/**
 * Root prefix for every athlete photo object.
 *
 * MUST stay outside `deals/`: infra/lib/proof-pipeline-stack.ts wires the proof-analysis
 * Lambda to s3:ObjectCreated with a `deals/` prefix filter, and an avatar has no business
 * being run through Rekognition. It must also be granted explicitly in the Vercel OIDC
 * role's IAM policy (infra/lib/foundation-stack.ts) — that policy is an allowlist of
 * prefixes, so a new one is denied until it is added there and the stack is redeployed.
 */
export const PHOTO_KEY_ROOT = "athletes";

export function athletePhotoKey(athleteId: string, uuid: string, ext: PhotoExt): string {
  return `${PHOTO_KEY_ROOT}/${athleteId}/${uuid}.${ext}`;
}

const UUID_SRC =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
// `\\.` not `\.`: this pattern is built in a template literal, where `\.` is not a
// recognised escape and collapses to a bare `.` — which matches ANY character. The
// separator has to be a literal dot. Same trap as PROOF_KEY_RE; see the note there.
const PHOTO_KEY_RE = new RegExp(
  `^${PHOTO_KEY_ROOT}/${UUID_SRC}/${UUID_SRC}\\.(jpg|png|webp)$`
);

/**
 * A key the client hands back at save time is acceptable only if it is shaped exactly like
 * one the presign route would have minted FOR THIS ATHLETE. The `athleteId` prefix check is
 * what stops someone pointing their profile at another athlete's photo object — the shape
 * test alone would happily accept `athletes/<someone-else>/<uuid>.jpg`.
 *
 * Callers must pass the athlete id from the SERVER session, never from the request body.
 */
export function isValidAthletePhotoKey(key: string, athleteId: string): boolean {
  return (
    PHOTO_KEY_RE.test(key) && key.startsWith(`${PHOTO_KEY_ROOT}/${athleteId}/`)
  );
}

/** Shape check without ownership, for readers that already trust the key's provenance. */
export function isAthletePhotoKeyShape(key: string): boolean {
  return PHOTO_KEY_RE.test(key);
}

/**
 * Reads a photo_key column value, tolerating the historical `s3://` marker.
 *
 * Migration 021 stores bare keys, but deliverables.proof_image_urls stores `s3://`-prefixed
 * ones, and the two are easy to confuse when copying code between the paths. Accepting
 * both on READ costs one startsWith and removes a whole class of "the photo silently
 * doesn't render" bug. Writers must still store the bare key.
 */
export function normalizePhotoKey(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw) return null;
  const key = raw.startsWith("s3://") ? raw.slice("s3://".length) : raw;
  return isAthletePhotoKeyShape(key) ? key : null;
}

/** Initials fallback for when an athlete has no photo, or S3 is unconfigured. */
export function initialsFor(firstName?: string | null, lastName?: string | null): string {
  const a = (firstName ?? "").trim().charAt(0);
  const b = (lastName ?? "").trim().charAt(0);
  const initials = `${a}${b}`.toUpperCase();
  return initials || "?";
}
