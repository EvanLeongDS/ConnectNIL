/**
 * S3 access for deliverable proof images and athlete profile photos. SERVER ONLY.
 *
 * Never import this from a "use client" module. The pure, client-safe helpers (key shapes,
 * MIME allowlists, magic bytes) live in lib/deals/deliverableProof.ts for proofs and
 * lib/athletes/photo.ts for profile photos.
 *
 * Everything below is key-agnostic — it is bound to the bucket and the credentials, not to
 * any prefix. The two features share one bucket and differ only in key prefix
 * (`deals/` vs `athletes/`), which is what keeps the proof-analysis Lambda off avatars.
 */
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";

/**
 * Env naming: S3_* is authoritative. The AWS_* names are accepted only OFF Vercel.
 *
 * Why the split: Vercel functions execute on AWS Lambda, whose runtime injects its own
 * AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_SESSION_TOKEN / AWS_REGION. Honouring
 * those names in production is worse than useless — the platform's execution-role keys
 * would satisfy isS3Configured(), so the app would report itself configured and then sign
 * every request with credentials that have no access to the proof bucket. (Worse still,
 * they are temporary credentials and AWS_SESSION_TOKEN is not part of a static credential
 * pair, so they could not work even in principle.) Off Vercel the same names are a
 * convenience that keeps existing .env.local and `aws configure` setups working.
 */
const ON_VERCEL = process.env.VERCEL === "1";

function env(...names: string[]): string {
  for (const n of names) {
    const v = process.env[n];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

/** Reads `preferred`, falling back to the ambient AWS_* name only when not on Vercel. */
function envOffVercel(preferred: string, awsFallback: string): string {
  return ON_VERCEL ? env(preferred) : env(preferred, awsFallback);
}

export const S3_BUCKET = env("S3_BUCKET", "S3_BUCKET_NAME");
const S3_REGION = envOffVercel("S3_REGION", "AWS_REGION") || "us-east-1";
const ROLE_ARN = env("AWS_ROLE_ARN");
const ACCESS_KEY_ID = envOffVercel("S3_ACCESS_KEY_ID", "AWS_ACCESS_KEY_ID");
const SECRET_ACCESS_KEY = envOffVercel("S3_SECRET_ACCESS_KEY", "AWS_SECRET_ACCESS_KEY");

/** How long a presigned GET stays valid. */
const READ_TTL = Number(process.env.PROOF_READ_URL_TTL ?? 3600);
/** Presigned PUTs are deliberately short-lived — the client uses them immediately. */
const WRITE_TTL = 300;
/** Signing-timestamp granularity for reads. See presignProofDownload. */
const READ_WINDOW_MS = 15 * 60 * 1000;

/**
 * An OIDC token exists on Vercel itself, and locally after `vercel env pull` writes
 * VERCEL_OIDC_TOKEN into .env.local. Note the role deployed by infra/ pins its trust policy
 * to `environment:production`, so a token pulled for local development is refused by STS —
 * which is why the static-key path below remains the normal one for localhost.
 */
const HAS_OIDC_TOKEN = ON_VERCEL || Boolean(env("VERCEL_OIDC_TOKEN"));

export type S3CredentialMode = "oidc" | "static" | "none";

/**
 * OIDC wins whenever it is usable, so setting AWS_ROLE_ARN is the single switch that moves
 * a deployment off static keys — and unsetting it is an instant rollback, because the keys
 * are still read the moment the role is gone. Migrate by setting AWS_ROLE_ARN *first* and
 * only deleting S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY once the deployment is verified.
 */
export function s3CredentialMode(): S3CredentialMode {
  if (ROLE_ARN && HAS_OIDC_TOKEN) return "oidc";
  if (ACCESS_KEY_ID && SECRET_ACCESS_KEY) return "static";
  return "none";
}

export function isS3Configured(): boolean {
  return Boolean(S3_BUCKET) && s3CredentialMode() !== "none";
}

/** Secret-free description of how storage resolved, for diagnostics. Never returns values. */
export function describeS3Config(): {
  bucket: boolean;
  region: string;
  credentials: S3CredentialMode;
  roleArnSet: boolean;
  staticKeysSet: boolean;
  onVercel: boolean;
  driver: "s3" | "supabase";
  driverRequested: string;
} {
  return {
    bucket: Boolean(S3_BUCKET),
    region: S3_REGION,
    credentials: s3CredentialMode(),
    roleArnSet: Boolean(ROLE_ARN),
    staticKeysSet: Boolean(ACCESS_KEY_ID && SECRET_ACCESS_KEY),
    onVercel: ON_VERCEL,
    driver: proofStorageDriver(),
    driverRequested: process.env.PROOF_STORAGE_DRIVER ?? "(unset)",
  };
}

/** Logged once per process rather than per request — this is a boot-time misconfiguration. */
let warnedUnconfigured = false;

/**
 * Which storage backend new submissions are written to.
 *
 * Reads are ALWAYS dual-mode regardless of this flag (see parseProofImageRefs), so
 * flipping it never makes an existing proof unrenderable. Asking for "s3" without usable
 * credentials still falls back to the legacy path rather than 500-ing — a half-configured
 * deployment should keep taking proof uploads — but it no longer does so QUIETLY: that
 * fallback also means no S3 event fires and the whole analysis pipeline silently never
 * runs, which is far too expensive a thing to leave undiagnosable in a log.
 */
export function proofStorageDriver(): "s3" | "supabase" {
  if (process.env.PROOF_STORAGE_DRIVER !== "s3") return "supabase";
  if (isS3Configured()) return "s3";
  if (!warnedUnconfigured) {
    warnedUnconfigured = true;
    console.error(
      "PROOF_STORAGE_DRIVER=s3 but S3 is not configured — falling back to the legacy Supabase " +
        "bucket. No S3 ObjectCreated event will fire, so the proof analysis pipeline will not " +
        "run at all. Set S3_BUCKET plus EITHER AWS_ROLE_ARN (Vercel OIDC) OR " +
        "S3_ACCESS_KEY_ID + S3_SECRET_ACCESS_KEY. bucket=%s roleArn=%s staticKeys=%s onVercel=%s",
      Boolean(S3_BUCKET),
      Boolean(ROLE_ARN),
      Boolean(ACCESS_KEY_ID && SECRET_ACCESS_KEY),
      ON_VERCEL
    );
  }
  return "supabase";
}

declare global {
  // eslint-disable-next-line no-var
  var __connectnilS3: S3Client | undefined;
}

/**
 * Explicit credentials, never the SDK's ambient default chain, so a platform-injected
 * AWS_* value can never silently win. The OIDC branch hands the SDK a *provider function*:
 * it mints a short-lived token per assume-role and refreshes it on expiry, so caching the
 * client across requests below stays correct.
 */
function credentials() {
  const mode = s3CredentialMode();
  if (mode === "oidc") return awsCredentialsProvider({ roleArn: ROLE_ARN });
  if (mode === "static") {
    return { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY };
  }
  // Write paths reach this only behind proofStorageDriver(), which is itself behind
  // isS3Configured(). READ paths have no such funnel — presignProofDownload is called during
  // page render, so its callers must check isS3Configured() themselves or an unconfigured
  // deployment 500s the whole page (see components/deals/DeliverableProofView.tsx, which
  // learned this the hard way). Throwing here is deliberate: better a loud failure than
  // signing requests with empty strings and getting an opaque 403 back from S3.
  throw new Error(
    "S3 is not configured: set AWS_ROLE_ARN (Vercel OIDC) or S3_ACCESS_KEY_ID + S3_SECRET_ACCESS_KEY."
  );
}

function s3(): S3Client {
  // Cached on globalThis so `next dev` hot reloads don't leak HTTP agents/sockets.
  if (!globalThis.__connectnilS3) {
    globalThis.__connectnilS3 = new S3Client({
      region: S3_REGION,
      credentials: credentials(),
    });
  }
  return globalThis.__connectnilS3;
}

/**
 * Presigned PUT for a direct browser upload. Content-Type and Content-Length are bound
 * into the signature, so the browser cannot upload a different type or an oversized body.
 *
 * If valid uploads ever start failing with 403 SignatureDoesNotMatch, drop "content-length"
 * from signableHeaders — the HeadObject check in the submit route is the authoritative size
 * guard either way.
 */
export function presignProofUpload(
  key: string,
  contentType: string,
  contentLength: number
): Promise<string> {
  return getSignedUrl(
    s3(),
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      ContentType: contentType,
      ContentLength: contentLength,
      // Deliberately NO ContentDisposition. `signableHeaders` ADDS to the signed set, it
      // does not restrict it, so any header set here lands in X-Amz-SignedHeaders and the
      // browser must then reproduce it exactly or S3 answers 403 SignatureDoesNotMatch.
      // The browser sends only Content-Type (plus the Content-Length it sets itself), and
      // sending Content-Disposition would additionally require widening the bucket CORS
      // AllowedHeaders. It buys nothing: browsers render image/* inline regardless.
      //
      // The matching bucket CORS rule is NOT managed by CDK — the bucket is imported. It is
      // documented, with the reasoning for each field, under "Bucket settings not managed
      // here" in infra/README.md, and checked by `npm run verify:s3`.
    }),
    {
      expiresIn: WRITE_TTL,
      signableHeaders: new Set(["host", "content-type", "content-length"]),
    }
  );
}

/**
 * Presigned GET, with the signing timestamp snapped to a 15-minute window.
 *
 * Without the snap, every render produces a fresh X-Amz-Date/X-Amz-Signature, so
 * next/image's {url,width,quality} cache key churns and every page view becomes a cache
 * miss -> re-fetch from S3 -> re-optimize. Snapping makes the URL byte-identical for all
 * renders inside the window. With READ_TTL=3600 and a 15-minute window, any URL handed out
 * still has at least 45 minutes of validity left.
 */
export function presignProofDownload(key: string): Promise<string> {
  const signingDate = new Date(Math.floor(Date.now() / READ_WINDOW_MS) * READ_WINDOW_MS);
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }), {
    expiresIn: READ_TTL,
    signingDate,
  });
}

export async function headProofObject(
  key: string
): Promise<{ contentLength: number; contentType: string } | null> {
  try {
    const r = await s3().send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    return { contentLength: r.ContentLength ?? 0, contentType: r.ContentType ?? "" };
  } catch {
    // The IAM policy deliberately omits s3:ListBucket, so a missing key returns 403
    // AccessDenied rather than 404. Both mean "not a usable object" — collapse them.
    return null;
  }
}

/** Reads only the first `n` bytes, for magic-byte sniffing. Never buffers the whole image. */
export async function readObjectPrefix(key: string, n = 16): Promise<Uint8Array | null> {
  try {
    const r = await s3().send(
      new GetObjectCommand({ Bucket: S3_BUCKET, Key: key, Range: `bytes=0-${n - 1}` })
    );
    if (!r.Body) return null;
    return await (r.Body as { transformToByteArray(): Promise<Uint8Array> }).transformToByteArray();
  } catch {
    return null;
  }
}

/**
 * Best-effort batch delete. Never throws: cleanup must not be able to fail a user request.
 *
 * DeleteObjects is the BATCH api - it returns HTTP 200 with a per-key `Errors` array rather
 * than throwing when individual keys are denied or missing. Checking only for a thrown
 * exception would make a permissions problem look like a successful cleanup and leak
 * orphaned objects forever, so the response body is inspected explicitly.
 *
 * Quiet is deliberately left off: in quiet mode successful deletes are omitted, and we want
 * the Deleted count to confirm the cleanup actually happened.
 */
export async function deleteProofObjects(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    const res = await s3().send(
      new DeleteObjectsCommand({
        Bucket: S3_BUCKET,
        Delete: { Objects: keys.map((Key) => ({ Key })) },
      })
    );
    const errors = res.Errors ?? [];
    if (errors.length > 0) {
      console.error(
        "s3 proof cleanup: %d of %d objects were NOT deleted (orphans left behind): %s",
        errors.length,
        keys.length,
        errors.map((e) => `${e.Key} [${e.Code}] ${e.Message}`).join(" | ")
      );
    }
  } catch (e) {
    console.error("s3 proof cleanup failed (non-fatal):", e);
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Athlete profile photos (`athletes/` prefix).
 *
 * These delegate to the proof helpers above, which are bound only to the bucket and are
 * key-agnostic. They exist under their own names rather than having callers reach for
 * `presignProofUpload` for an avatar: the proof functions carry deals-specific reasoning in
 * their doc comments, and a reader who sees presignProofUpload() in a profile route
 * reasonably wonders which of that reasoning still applies.
 *
 * IMPORTANT — the `athletes/` prefix must be granted in the Vercel OIDC role's IAM policy
 * (infra/lib/foundation-stack.ts). That policy is a per-prefix allowlist, so without it
 * every production PUT returns 403. The failure is invisible at presign time, because
 * getSignedUrl is pure local HMAC and makes no AWS call: the route answers 200 with a
 * valid-looking URL and only the browser's PUT fails.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Presigned PUT for a direct browser avatar upload. See presignProofUpload for the
 *  signed-header reasoning — the browser must send Content-Type and nothing else. */
export function presignAthletePhotoUpload(
  key: string,
  contentType: string,
  contentLength: number
): Promise<string> {
  return presignProofUpload(key, contentType, contentLength);
}

/**
 * Presigned GET for rendering an avatar.
 *
 * Inherits the 15-minute signing-timestamp snap, which matters MORE here than it does for
 * proofs: an avatar is rendered on every roster row, every deal participant list and every
 * face pile, so a signature that churned per render would make next/image miss its cache on
 * every single one and re-fetch each face from S3.
 */
export function presignAthletePhotoDownload(key: string): Promise<string> {
  return presignProofDownload(key);
}

export function headAthletePhotoObject(
  key: string
): Promise<{ contentLength: number; contentType: string } | null> {
  return headProofObject(key);
}

/** Best-effort cleanup of superseded avatars. Never throws — see deleteProofObjects. */
export function deleteAthletePhotoObjects(keys: string[]): Promise<void> {
  return deleteProofObjects(keys);
}

/**
 * Presigns many avatars at once, for list views (roster, participant lists, face piles).
 *
 * Deduplicates first, so a roster that renders the same athlete twice signs once. Signing
 * is local HMAC with no network call, so this is cheap — but it is O(n) work on a hot
 * render path, and the dedupe plus the shared 15-minute window keep it off the critical
 * path in practice.
 *
 * Returns a Map keyed by the ORIGINAL key. Callers that hold a nullable photo_key can look
 * up misses safely; a key that fails to sign is simply absent, and the caller falls back to
 * initials rather than rendering a broken image.
 */
export async function presignAthletePhotos(
  keys: (string | null | undefined)[]
): Promise<Map<string, string>> {
  const unique = Array.from(
    new Set(keys.filter((k): k is string => typeof k === "string" && k.length > 0))
  );
  const out = new Map<string, string>();
  if (unique.length === 0) return out;

  const signed = await Promise.all(
    unique.map(async (key) => {
      try {
        return [key, await presignAthletePhotoDownload(key)] as const;
      } catch (e) {
        // One unsignable key must not blank out an entire roster.
        console.error("athlete photo presign failed for %s (non-fatal):", key, e);
        return null;
      }
    })
  );
  for (const entry of signed) {
    if (entry) out.set(entry[0], entry[1]);
  }
  return out;
}
