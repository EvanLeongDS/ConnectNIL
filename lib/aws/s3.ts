/**
 * S3 access for deliverable proof images. SERVER ONLY.
 *
 * Never import this from a "use client" module. The pure, client-safe proof helpers
 * (key shapes, MIME allowlist, magic bytes) live in lib/deals/deliverableProof.ts.
 */
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Env naming: we read S3_* first and fall back to the AWS_* / S3_BUCKET_NAME names.
 *
 * Why both: Vercel functions execute on AWS Lambda, whose runtime injects its own
 * AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_SESSION_TOKEN / AWS_REGION. Relying on
 * AWS_* in production risks either being shadowed by the platform's own values or being
 * rejected as reserved. S3_* is the safe name to set on Vercel. The AWS_* fallback keeps
 * local .env.local setups working unchanged.
 *
 * Credentials are passed EXPLICITLY to the client below rather than left to the SDK's
 * default credential chain, so ambient platform AWS_* vars can never silently win.
 */
function env(...names: string[]): string {
  for (const n of names) {
    const v = process.env[n];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

export const S3_BUCKET = env("S3_BUCKET", "S3_BUCKET_NAME");
const S3_REGION = env("S3_REGION", "AWS_REGION") || "us-east-1";
const ACCESS_KEY_ID = env("S3_ACCESS_KEY_ID", "AWS_ACCESS_KEY_ID");
const SECRET_ACCESS_KEY = env("S3_SECRET_ACCESS_KEY", "AWS_SECRET_ACCESS_KEY");

/** How long a presigned GET stays valid. */
const READ_TTL = Number(process.env.PROOF_READ_URL_TTL ?? 3600);
/** Presigned PUTs are deliberately short-lived — the client uses them immediately. */
const WRITE_TTL = 300;
/** Signing-timestamp granularity for reads. See presignProofDownload. */
const READ_WINDOW_MS = 15 * 60 * 1000;

export function isS3Configured(): boolean {
  return Boolean(S3_BUCKET && ACCESS_KEY_ID && SECRET_ACCESS_KEY);
}

/**
 * Which storage backend new submissions are written to.
 *
 * Reads are ALWAYS dual-mode regardless of this flag (see parseProofImageRefs), so
 * flipping it never makes an existing proof unrenderable. The isS3Configured() guard is
 * belt-and-braces: an environment with the flag set but credentials missing quietly serves
 * the legacy path instead of 500-ing.
 */
export function proofStorageDriver(): "s3" | "supabase" {
  return process.env.PROOF_STORAGE_DRIVER === "s3" && isS3Configured() ? "s3" : "supabase";
}

declare global {
  // eslint-disable-next-line no-var
  var __connectnilS3: S3Client | undefined;
}

function s3(): S3Client {
  // Cached on globalThis so `next dev` hot reloads don't leak HTTP agents/sockets.
  if (!globalThis.__connectnilS3) {
    // TODO(security): swap for Vercel OIDC federation (awsCredentialsProvider from
    // @vercel/functions/oidc) to eliminate long-lived access keys entirely.
    globalThis.__connectnilS3 = new S3Client({
      region: S3_REGION,
      credentials: {
        accessKeyId: ACCESS_KEY_ID,
        secretAccessKey: SECRET_ACCESS_KEY,
      },
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
