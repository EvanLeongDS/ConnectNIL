/**
 * Pre-flight check for the proof intelligence pipeline.  Run:  npm run verify:pipeline
 *
 * Exercises the real round trip with the credentials in .env.local: uploads a proof image
 * carrying EXIF GPS data, waits for the S3 event to reach the Lambda, and asserts that the
 * generated thumbnail exists, is WebP, is smaller, and carries no EXIF. Then checks that
 * the callback route refuses an unsigned and a replayed request, and that the thumbnail
 * write did not re-trigger the pipeline on itself.
 *
 * Companion to verify-s3.mjs, which covers the storage layer underneath this.
 *
 * Optional: set VERIFY_PARTNERSHIP_ID and VERIFY_DELIVERABLE_ID to the ids of a real
 * deliverable and the script will additionally assert that the analysis was persisted to
 * that row. Without them the callback correctly answers "no-deliverable" and that half of
 * the round trip is reported as skipped rather than silently passing.
 */
import fs from "node:fs";
import { randomUUID, createHmac } from "node:crypto";
import {
  S3Client, PutObjectCommand, GetObjectCommand,
  HeadObjectCommand, DeleteObjectsCommand,
} from "@aws-sdk/client-s3";

// minimal .env.local loader (same approach as verify-s3.mjs)
for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
  if (m) process.env[m[1].trim()] ??= m[2].trim();
}
const pick = (...n) => { for (const k of n) { const v = process.env[k]; if (v && v.trim()) return v.trim(); } return ""; };

const BUCKET = pick("S3_BUCKET", "S3_BUCKET_NAME");
const REGION = pick("S3_REGION", "AWS_REGION") || "us-east-1";
const SITE = pick("VERIFY_APP_URL", "NEXT_PUBLIC_SITE_URL") || "http://localhost:3000";
const SECRET = pick("PROOF_PIPELINE_SECRET");
const CALLBACK = `${SITE.replace(/\/$/, "")}/api/internal/proof-processed`;
const WAIT_MS = Number(process.env.VERIFY_WAIT_MS || 90_000);

const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: pick("S3_ACCESS_KEY_ID", "AWS_ACCESS_KEY_ID"),
    secretAccessKey: pick("S3_SECRET_ACCESS_KEY", "AWS_SECRET_ACCESS_KEY"),
  },
});

let failures = 0;
const check = (name, ok, extra = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${extra ? " :: " + extra : ""}`);
  if (!ok) failures++;
};
const skip = (name, why) => console.log(`  SKIP  ${name} :: ${why}`);

/* ── Test fixture ───────────────────────────────────────────────────────────────
 * A baseline JPEG with an APP1/Exif segment spliced in after SOI, carrying a GPS IFD
 * with one tag (GPSLatitudeRef). A phone photo's geotag looks like this, and stripping
 * it is a real safety property for a platform whose users are college athletes — so the
 * fixture has to actually carry EXIF or the assertion below proves nothing.
 */
function jpegWithExifGps() {
  const tiff = Buffer.alloc(44);
  tiff.write("II", 0, "ascii");        // little-endian
  tiff.writeUInt16LE(42, 2);           // TIFF magic
  tiff.writeUInt32LE(8, 4);            // offset of IFD0
  tiff.writeUInt16LE(1, 8);            // IFD0: one entry
  tiff.writeUInt16LE(0x8825, 10);      //   tag  = GPS IFD pointer
  tiff.writeUInt16LE(4, 12);           //   type = LONG
  tiff.writeUInt32LE(1, 14);           //   count
  tiff.writeUInt32LE(26, 18);          //   value = offset of the GPS IFD
  tiff.writeUInt32LE(0, 22);           // no IFD1
  tiff.writeUInt16LE(1, 26);           // GPS IFD: one entry
  tiff.writeUInt16LE(0x0001, 28);      //   tag  = GPSLatitudeRef
  tiff.writeUInt16LE(2, 30);           //   type = ASCII
  tiff.writeUInt32LE(2, 32);           //   count
  tiff.write("N\0", 36, "ascii");      //   value, inline (fits in 4 bytes)
  tiff.writeUInt32LE(0, 40);           // no next IFD

  const header = Buffer.from("Exif\0\0", "binary");
  const app1 = Buffer.concat([
    Buffer.from([0xff, 0xe1]),
    (() => { const b = Buffer.alloc(2); b.writeUInt16BE(header.length + tiff.length + 2); return b; })(),
    header,
    tiff,
  ]);

  // 8x8 solid baseline JPEG.
  const base = Buffer.from(
    "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a" +
    "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAAIAAgBAREA/8QAHwAAAQUBAQEB" +
    "AQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1Fh" +
    "ByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZ" +
    "WmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXG" +
    "x8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oACAEBAAA/APn+iiiv/9k=",
    "base64"
  );
  return Buffer.concat([base.subarray(0, 2), app1, base.subarray(2)]);
}

const hasJpegExif = (buf) => buf.includes(Buffer.from("Exif\0\0", "binary"));
/** In WebP, metadata lives in a chunk whose FourCC is literally "EXIF". */
const hasWebpExif = (buf) => buf.includes(Buffer.from("EXIF", "ascii"));
const isWebp = (b) =>
  b.length >= 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP";

const thumbKeyFor = (key) => `thumbs/${key.replace(/\.(jpg|png|webp|gif)$/, "")}.webp`;

const partnershipId = process.env.VERIFY_PARTNERSHIP_ID || randomUUID();
const deliverableId = process.env.VERIFY_DELIVERABLE_ID || randomUUID();
const usingRealRow = Boolean(process.env.VERIFY_PARTNERSHIP_ID && process.env.VERIFY_DELIVERABLE_ID);
const key = `deals/${partnershipId}/${deliverableId}/${randomUUID()}.jpg`;
const thumbKey = thumbKeyFor(key);

console.log(`bucket=${BUCKET}\nregion=${REGION}\ncallback=${CALLBACK}\nkey=${key}\n`);

const cleanup = [key, thumbKey, thumbKeyFor(thumbKey)];

try {
  const original = jpegWithExifGps();
  check("fixture JPEG really carries EXIF GPS", hasJpegExif(original), `${original.length} bytes`);

  await s3.send(new PutObjectCommand({
    Bucket: BUCKET, Key: key, Body: original, ContentType: "image/jpeg",
  }));
  check("PutObject under deals/ (fires the S3 event)", true);

  // ── Wait for the Lambda ────────────────────────────────────────────────────
  const deadline = Date.now() + WAIT_MS;
  let thumbHead = null;
  while (Date.now() < deadline) {
    try {
      thumbHead = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: thumbKey }));
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  check("thumbnail appears at thumbs/deals/...", Boolean(thumbHead),
        thumbHead ? `${thumbHead.ContentLength} bytes` : `not created within ${WAIT_MS / 1000}s`);

  if (thumbHead) {
    check("thumbnail Content-Type is image/webp", thumbHead.ContentType === "image/webp",
          String(thumbHead.ContentType));
    check("thumbnail is smaller than the original",
          (thumbHead.ContentLength ?? Infinity) < original.length,
          `${thumbHead.ContentLength} < ${original.length}`);

    const got = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: thumbKey }));
    const thumb = Buffer.from(await got.Body.transformToByteArray());
    check("thumbnail really is WebP (RIFF/WEBP magic)", isWebp(thumb));
    check("thumbnail carries no EXIF (GPS stripped)", !hasWebpExif(thumb));
  }

  // ── The thumbnail must not re-trigger the pipeline on itself ───────────────
  let selfTriggered = true;
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: thumbKeyFor(thumbKey) }));
  } catch {
    selfTriggered = false;
  }
  check("thumbnail did NOT re-trigger the pipeline (no thumbs/thumbs/...)", !selfTriggered);

  // ── Callback authentication ────────────────────────────────────────────────
  if (!SECRET) {
    skip("callback rejects a bad signature", "PROOF_PIPELINE_SECRET not set in .env.local");
    skip("callback rejects a replayed timestamp", "PROOF_PIPELINE_SECRET not set in .env.local");
  } else {
    const body = JSON.stringify({ key, bytes: 1, thumbKey, sniffedMime: "image/jpeg", textLines: [], moderation: { labels: [] } });
    const post = (ts, sig) => fetch(CALLBACK, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-connectnil-timestamp": ts,
        "x-connectnil-signature": sig,
      },
      body,
    });
    const sign = (ts) => createHmac("sha256", SECRET).update(`${ts}.${body}`).digest("hex");

    const now = Date.now().toString();
    const bad = await post(now, sign(now).replace(/.$/, (c) => (c === "0" ? "1" : "0")));
    check("callback rejects a bad signature", bad.status === 401, `HTTP ${bad.status}`);

    const stale = (Date.now() - 10 * 60 * 1000).toString();
    const replayed = await post(stale, sign(stale));
    check("callback rejects a replayed timestamp", replayed.status === 401, `HTTP ${replayed.status}`);

    const good = await post(now, sign(now));
    check("callback accepts a correctly signed request", good.ok, `HTTP ${good.status}`);
  }

  // ── Persistence ────────────────────────────────────────────────────────────
  if (!usingRealRow) {
    skip("analysis is persisted to the deliverable",
         "set VERIFY_PARTNERSHIP_ID and VERIFY_DELIVERABLE_ID to a real deliverable");
  } else {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data } = await supabase
      .from("deliverables")
      .select("proof_analysis, proof_review_flag")
      .eq("id", deliverableId)
      .maybeSingle();
    const entry = data?.proof_analysis?.[key];
    check("analysis row written for this key", Boolean(entry),
          entry ? `flag=${data.proof_review_flag}` : "no entry");
    if (entry) {
      check("analysis records the thumbnail key", entry.thumbKey === thumbKey, String(entry.thumbKey));
      check("analysis records a moderation verdict", typeof entry.moderation?.flagged === "boolean");
      check("analysis records a brand-mention verdict", typeof entry.brandMention?.matched === "boolean");
    }
  }
} finally {
  const res = await s3.send(new DeleteObjectsCommand({
    Bucket: BUCKET,
    Delete: { Objects: cleanup.map((Key) => ({ Key })) },
  })).catch((e) => ({ Errors: [{ Key: "(request failed)", Code: "", Message: String(e) }] }));
  const errs = (res.Errors ?? []).filter((e) => e.Code !== "NoSuchKey");
  if (errs.length) console.log(`  WARN  cleanup left objects behind: ${errs.map((e) => e.Key).join(", ")}`);
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
