/**
 * Pre-flight check for the deliverable-proof S3 setup.  Run:  npm run verify:s3
 *
 * Exercises the real round trip with the credentials in .env.local: presigned PUT and GET,
 * HeadObject, a 16-byte Range read, SSE-S3, the signing-window stability that keeps
 * next/image from re-fetching, and that the bucket refuses UNSIGNED reads. Writes one
 * tiny PNG under deals/ and deletes it again.
 *
 * Use this instead of `aws s3api head-bucket` if you have no AWS CLI installed.
 */
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import {
  S3Client, PutObjectCommand, GetObjectCommand,
  HeadObjectCommand, DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// minimal .env.local loader
for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
  if (m) process.env[m[1].trim()] ??= m[2].trim();
}
const pick = (...n) => { for (const k of n) { const v = process.env[k]; if (v && v.trim()) return v.trim(); } return ""; };
const BUCKET = pick("S3_BUCKET", "S3_BUCKET_NAME");
const REGION = pick("S3_REGION", "AWS_REGION") || "us-east-1";
const s3 = new S3Client({
  region: REGION,
  credentials: { accessKeyId: pick("S3_ACCESS_KEY_ID","AWS_ACCESS_KEY_ID"), secretAccessKey: pick("S3_SECRET_ACCESS_KEY","AWS_SECRET_ACCESS_KEY") },
});

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");
const key = `deals/${randomUUID()}/${randomUUID()}/${randomUUID()}.png`;
const step = (n, ok, extra="") => console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${extra ? " :: " + extra : ""}`);
let failures = 0;
const check = (n, ok, extra) => { step(n, ok, extra); if (!ok) failures++; };

console.log(`bucket=${BUCKET}\nregion=${REGION}\nkey=${key}\n`);
try {
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: png, ContentType: "image/png", ContentDisposition: "inline" }));
  check("PutObject under deals/ (IAM write scope)", true);

  const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
  check("HeadObject returns size + type", head.ContentLength === png.length && head.ContentType === "image/png",
        `size=${head.ContentLength} type=${head.ContentType} sse=${head.ServerSideEncryption}`);
  check("Encryption is SSE-S3 (AES256), not KMS", head.ServerSideEncryption === "AES256", String(head.ServerSideEncryption));

  const ranged = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key, Range: "bytes=0-15" }));
  const prefix = await ranged.Body.transformToByteArray();
  const isPng = prefix.length >= 8 && prefix[0]===0x89 && prefix[1]===0x50 && prefix[2]===0x4e && prefix[3]===0x47;
  check("Range read returns PNG magic bytes", isPng, `got ${prefix.length} bytes`);

  const getUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn: 3600 });
  check("Presigned GET is signed", getUrl.includes("X-Amz-Signature"));
  console.log(`        host: ${new URL(getUrl).host}`);
  const wildcardOk = /^[^.]+\.s3\.us-east-1\.amazonaws\.com$/.test(new URL(getUrl).host);
  check("Host matches next.config wildcard *.s3.us-east-1.amazonaws.com", wildcardOk, new URL(getUrl).host);

  const signedFetch = await fetch(getUrl);
  check("Presigned GET actually downloads", signedFetch.status === 200, `HTTP ${signedFetch.status}`);

  const unsignedUrl = getUrl.split("?")[0];
  const unsignedFetch = await fetch(unsignedUrl);
  check("Bucket is PRIVATE (unsigned GET refused)", unsignedFetch.status === 403 || unsignedFetch.status === 401,
        `HTTP ${unsignedFetch.status}`);

  // stable signing window
  const win = 15*60*1000;
  const d = new Date(Math.floor(Date.now()/win)*win);
  const a = await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn: 3600, signingDate: d });
  const b = await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn: 3600, signingDate: d });
  check("Snapped signingDate yields byte-identical URL", a === b);

  const putUrl = await getSignedUrl(s3, new PutObjectCommand({ Bucket: BUCKET, Key: key+".x", ContentType: "image/png", ContentLength: 10 }), { expiresIn: 300, signableHeaders: new Set(["host","content-type","content-length"]) });
  check("Presigned PUT mints with content-length signed", putUrl.includes("X-Amz-Signature") && /content-length/i.test(putUrl));

  // DeleteObjects is the batch api: denials come back in res.Errors, NOT as a throw.
  const del = await s3.send(new DeleteObjectsCommand({ Bucket: BUCKET, Delete: { Objects: [{ Key: key }] } }));
  const delErrors = del.Errors ?? [];
  check("DeleteObjects reports no per-key errors", delErrors.length === 0,
        delErrors.map(e => `${e.Code}: ${e.Message}`).join(" | "));
  const gone = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key })).then(()=>false).catch(()=>true);
  check("Test object actually removed", gone);
} catch (e) {
  console.log(`\n  ERROR ${e.name}: ${e.message}`);
  failures++;
}

// ---- CORS preflight -------------------------------------------------------------
// A preflight is an unauthenticated OPTIONS request - byte for byte what the browser
// sends before each presigned PUT. It needs no credentials, so there is no excuse for
// learning about a CORS misconfiguration from a user instead of from this script.
console.log("\nCORS preflight (browser sends this before every presigned PUT):");
const corsBase = `https://${BUCKET}.s3.${REGION}.amazonaws.com`;
async function preflight(origin) {
  const r = await fetch(`${corsBase}/deals/preflight-probe.png`, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "PUT",
      "Access-Control-Request-Headers": "content-type",
    },
  });
  const allow = r.headers.get("access-control-allow-origin");
  const ok = r.status === 200 && Boolean(allow);
  console.log(`  ${ok ? "PASS" : "FAIL"}  PUT from ${origin}`);
  if (ok) {
    console.log(`        methods=${r.headers.get("access-control-allow-methods")}`
      + ` headers=${r.headers.get("access-control-allow-headers")}`
      + ` expose=${r.headers.get("access-control-expose-headers")}`);
  } else {
    console.log(`        HTTP ${r.status} - add this origin under S3 -> Permissions -> CORS`);
  }
  return ok;
}
const origins = new Set(["http://localhost:3000"]);
const site = (process.env.NEXT_PUBLIC_SITE_URL || "").trim().replace(/\/+$/, "");
if (site) origins.add(site);
for (const o of origins) {
  if (!(await preflight(o))) failures++;
}
// Control: an unrelated origin must be refused, else CORS is a blanket "*".
const evil = await fetch(`${corsBase}/deals/preflight-probe.png`, {
  method: "OPTIONS",
  headers: { Origin: "https://evil.example.com", "Access-Control-Request-Method": "PUT" },
});
check(
  "Unrelated origin refused (CORS is not a blanket *)",
  evil.status !== 200 || !evil.headers.get("access-control-allow-origin"),
  `HTTP ${evil.status}`
);

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED"}`);
