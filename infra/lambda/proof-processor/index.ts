/**
 * Proof intelligence pipeline.
 *
 * Fires on s3:ObjectCreated under `deals/`, i.e. every deliverable proof image the browser
 * uploads through the presigned PUT. For each object it:
 *
 *   1. reads the bytes once,
 *   2. sniffs the real MIME from magic bytes (the declared Content-Type is not trusted),
 *   3. normalises to a JPEG for Rekognition — which accepts ONLY JPEG and PNG, while the
 *      app allows WebP and GIF too, so passing the original through would silently skip
 *      analysis for those,
 *   4. runs moderation + text detection,
 *   5. writes an EXIF-stripped WebP thumbnail to `thumbs/deals/...`,
 *   6. reports to the app, HMAC-signed.
 *
 * It deliberately holds NO database credentials. The app owns the write; see
 * app/api/internal/proof-processed/route.ts for why.
 */
import { createHmac } from "node:crypto";
import {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  RekognitionClient,
  DetectModerationLabelsCommand,
  DetectTextCommand,
} from "@aws-sdk/client-rekognition";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import sharp from "sharp";
import type { S3Event, S3EventRecord } from "aws-lambda";

import {
  PROOF_MAX_FILE_BYTES,
  parseProofKey,
  sniffImageMime,
  thumbKeyFor,
} from "../../../lib/deals/deliverableProof";
import {
  PROOF_ANALYSIS_MAX_DIM,
  PROOF_MODERATION_MIN_CONFIDENCE,
  PROOF_THUMB_MAX_DIM,
  type ProofModerationLabel,
} from "../../../lib/deals/proofAnalysis";

const BUCKET = required("PROOF_BUCKET");
const CALLBACK_URL = required("CALLBACK_URL");
const SECRET_PARAM_NAME = required("SECRET_PARAM_NAME");

const s3 = new S3Client({});
const rekognition = new RekognitionClient({});
const ssm = new SSMClient({});

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}`);
  return v;
}

/** Cached across invocations on a warm container; one SSM read per cold start. */
let secretPromise: Promise<string> | undefined;

function getSecret(): Promise<string> {
  if (!secretPromise) secretPromise = loadSecret();
  return secretPromise;
}

async function loadSecret(): Promise<string> {
  try {
    const r = await ssm.send(
      new GetParameterCommand({ Name: SECRET_PARAM_NAME, WithDecryption: true })
    );
    const v = r.Parameter?.Value;
    if (!v) throw new Error(`SSM parameter ${SECRET_PARAM_NAME} is empty`);
    return v;
  } catch (e) {
    // Never leave a rejected promise cached — a transient SSM failure would otherwise
    // poison every later invocation on this warm container.
    secretPromise = undefined;
    throw e;
  }
}

export async function handler(event: S3Event): Promise<void> {
  // Sequential on purpose: a single upload batch is at most PROOF_MAX_IMAGES objects, and
  // sharp is memory-hungry enough that running them in parallel is how you find the
  // function's memory ceiling in production rather than here.
  for (const record of event.Records) {
    await processRecord(record);
  }
}

async function processRecord(record: S3EventRecord): Promise<void> {
  // S3 event keys are URL-encoded with spaces as '+'.
  const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));

  const parsed = parseProofKey(key);
  if (!parsed) {
    // Not a proof object. The prefix filter should prevent this; the guard is here because
    // a key that does not parse must never reach Rekognition and get billed for.
    console.warn("skipping non-proof key: %s", key);
    return;
  }

  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    const bytes = head.ContentLength ?? 0;
    if (bytes <= 0 || bytes > PROOF_MAX_FILE_BYTES) {
      await report(key, {
        key,
        bytes,
        thumbKey: null,
        sniffedMime: null,
        textLines: [],
        moderation: { labels: [] },
        error: `Unexpected object size ${bytes}`,
      });
      return;
    }

    const body = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const original = Buffer.from(await body.Body!.transformToByteArray());
    const sniffedMime = sniffImageMime(original.subarray(0, 16));

    // One decode, two outputs. `.rotate()` with no argument bakes in the EXIF orientation
    // and drops the tag; sharp writes no metadata unless asked, so GPS coordinates from a
    // phone camera do not survive into the thumbnail.
    const [analysisJpeg, thumbWebp] = await Promise.all([
      sharp(original)
        .rotate()
        .resize(PROOF_ANALYSIS_MAX_DIM, PROOF_ANALYSIS_MAX_DIM, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 85 })
        .toBuffer(),
      sharp(original)
        .rotate()
        .resize(PROOF_THUMB_MAX_DIM, PROOF_THUMB_MAX_DIM, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 78 })
        .toBuffer(),
    ]);

    const [moderation, text] = await Promise.all([
      detectModeration(analysisJpeg),
      detectText(analysisJpeg),
    ]);

    const thumbKey = thumbKeyFor(key);
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: thumbKey,
        Body: thumbWebp,
        ContentType: "image/webp",
        // No CacheControl: the app serves these through presigned GETs whose signing
        // window already controls how long a URL is reused.
      })
    );

    await report(key, {
      key,
      bytes,
      thumbKey,
      sniffedMime,
      textLines: text,
      moderation: { labels: moderation },
    });
  } catch (err) {
    console.error("proof processing failed for %s:", key, err);
    // Report the failure rather than swallowing it, so the reviewer sees "could not be
    // analysed" instead of an indefinite "pending" that looks like an all-clear.
    await report(key, {
      key,
      bytes: 0,
      thumbKey: null,
      sniffedMime: null,
      textLines: [],
      moderation: { labels: [] },
      error: err instanceof Error ? err.message : String(err),
    }).catch((e) => console.error("failure report also failed:", e));
    // Rethrow so the invocation is recorded as an error and, after retries, lands on the DLQ.
    throw err;
  }
}

async function detectModeration(jpeg: Buffer): Promise<ProofModerationLabel[]> {
  const r = await rekognition.send(
    new DetectModerationLabelsCommand({
      Image: { Bytes: jpeg },
      MinConfidence: PROOF_MODERATION_MIN_CONFIDENCE,
    })
  );
  return (r.ModerationLabels ?? []).map((l) => ({
    name: l.Name ?? "",
    parent: l.ParentName ?? "",
    confidence: l.Confidence ?? 0,
  }));
}

async function detectText(jpeg: Buffer): Promise<string[]> {
  const r = await rekognition.send(new DetectTextCommand({ Image: { Bytes: jpeg } }));
  // LINE detections only. Rekognition also returns a WORD for every word inside each line,
  // so keeping both would duplicate the whole transcript.
  return (r.TextDetections ?? [])
    .filter((d) => d.Type === "LINE" && d.DetectedText)
    .map((d) => d.DetectedText as string);
}

type Report = {
  key: string;
  bytes: number;
  thumbKey: string | null;
  sniffedMime: string | null;
  textLines: string[];
  moderation: { labels: ProofModerationLabel[] };
  error?: string;
};

async function report(key: string, payload: Report): Promise<void> {
  const secret = await getSecret();
  const raw = JSON.stringify(payload);
  const timestamp = Date.now().toString();
  const signature = createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex");

  const res = await fetch(CALLBACK_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-connectnil-timestamp": timestamp,
      "x-connectnil-signature": signature,
    },
    body: raw,
  });

  if (!res.ok) {
    throw new Error(`callback for ${key} returned ${res.status}: ${await res.text()}`);
  }
}
