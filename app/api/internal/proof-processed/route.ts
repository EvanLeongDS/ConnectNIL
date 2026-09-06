import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { parseProofKey, parseProofImageRefs, thumbKeyFor } from "@/lib/deals/deliverableProof";
import {
  brandMentionNeedles,
  detectBrandMention,
  isModerationFlagged,
  parseProofAnalysis,
  proofReviewFlag,
  type ProofImageAnalysis,
  type ProofModerationLabel,
} from "@/lib/deals/proofAnalysis";

export const runtime = "nodejs";

/** Requests older than this are refused, so a captured body cannot be replayed later. */
const MAX_SKEW_MS = 5 * 60 * 1000;

/** OCR evidence is for a human reviewer, not a transcript. */
const MAX_TEXT_LINES = 40;
const MAX_LABELS = 20;

/**
 * POST /api/internal/proof-processed
 *
 * Called by the S3 pipeline Lambda (infra/lambda/proof-processor), never by a browser.
 *
 * Why the analysis is persisted here rather than by the Lambda writing to Postgres
 * directly: it keeps the Supabase service-role key out of AWS entirely, and it keeps the
 * Lambda out of a VPC (a NAT gateway would cost more per month than this whole pipeline).
 * The Lambda reports what S3 and Rekognition said; the brand-mention decision, which needs
 * brand_profiles, is made on this side where that data already lives.
 *
 * Authenticity is an HMAC over `${timestamp}.${rawBody}` with a shared secret. There is no
 * user session on this request — the signature IS the authorization.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.PROOF_PIPELINE_SECRET;
  if (!secret) {
    // Fail closed. An unset secret must never mean "accept anything".
    console.error("proof-processed: PROOF_PIPELINE_SECRET is not set");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const timestamp = request.headers.get("x-connectnil-timestamp") ?? "";
  const signature = request.headers.get("x-connectnil-signature") ?? "";
  const raw = await request.text();

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > MAX_SKEW_MS) {
    return NextResponse.json({ error: "Stale or missing timestamp" }, { status: 401 });
  }

  const expected = createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(signature, "hex");
  } catch {
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  }
  // timingSafeEqual throws on a length mismatch, so the length check has to come first.
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  }

  let body: PipelineReport;
  try {
    body = JSON.parse(raw) as PipelineReport;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const key = typeof body.key === "string" ? body.key : "";
  const parsed = parseProofKey(key);
  if (!parsed) {
    return NextResponse.json({ error: "Not a proof key" }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: deliverable, error: readErr } = await service
    .from("deliverables")
    .select("id, partnership_id, proof_image_urls, proof_analysis")
    .eq("id", parsed.deliverableId)
    .eq("partnership_id", parsed.partnershipId)
    .maybeSingle();

  if (readErr) {
    console.error("proof-processed: deliverable read failed:", readErr);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
  if (!deliverable) {
    // The upload happened but the submit call never landed, or the deal was deleted.
    // Nothing to attach the analysis to; ack so the Lambda does not retry forever.
    return NextResponse.json({ ok: true, applied: false, reason: "no-deliverable" });
  }

  const currentKeys = parseProofImageRefs(deliverable.proof_image_urls)
    .filter((r): r is { kind: "s3"; key: string } => r.kind === "s3")
    .map((r) => r.key);

  const { data: partnership } = await service
    .from("partnerships")
    .select("brand_id, brand_display_name")
    .eq("id", parsed.partnershipId)
    .maybeSingle();

  const { data: brand } = partnership?.brand_id
    ? await service
        .from("brand_profiles")
        .select("company_name, social_instagram")
        .eq("id", partnership.brand_id)
        .maybeSingle()
    : { data: null };

  const needles = brandMentionNeedles(
    brand?.company_name ?? partnership?.brand_display_name ?? null,
    brand?.social_instagram ?? null
  );

  const labels: ProofModerationLabel[] = Array.isArray(body.moderation?.labels)
    ? body.moderation.labels
        .filter((l): l is ProofModerationLabel => typeof l?.name === "string")
        .slice(0, MAX_LABELS)
        .map((l) => ({
          name: String(l.name),
          parent: typeof l.parent === "string" ? l.parent : "",
          confidence: typeof l.confidence === "number" ? l.confidence : 0,
        }))
    : [];

  const textLines: string[] = Array.isArray(body.textLines)
    ? body.textLines.filter((t): t is string => typeof t === "string").slice(0, MAX_TEXT_LINES)
    : [];

  const entry: ProofImageAnalysis = {
    analyzedAt: new Date().toISOString(),
    thumbKey: body.thumbKey === thumbKeyFor(key) ? body.thumbKey : null,
    sniffedMime: typeof body.sniffedMime === "string" ? body.sniffedMime : null,
    bytes: typeof body.bytes === "number" ? body.bytes : 0,
    moderation: { flagged: isModerationFlagged(labels), labels },
    brandMention: detectBrandMention(textLines, needles),
    textLines,
    ...(typeof body.error === "string" ? { error: body.error } : {}),
  };

  // Read-modify-write. Entries for keys this deliverable no longer references are dropped
  // here rather than on submit: the browser uploads to S3 before calling submit, so a
  // reset in that route could race this callback and erase an analysis that had already
  // landed. Pruning inside the same read-modify-write cannot.
  const merged = parseProofAnalysis(deliverable.proof_analysis);
  const next: typeof merged = {};
  for (const k of currentKeys) if (merged[k]) next[k] = merged[k];
  if (currentKeys.includes(key)) next[key] = entry;

  const { error: upErr } = await service
    .from("deliverables")
    .update({
      proof_analysis: next,
      proof_review_flag: proofReviewFlag(next, currentKeys),
    })
    .eq("id", deliverable.id);

  if (upErr) {
    console.error("proof-processed: update failed:", upErr);
    return NextResponse.json({ error: "Write failed" }, { status: 500 });
  }

  // applied:false when the object is no longer one of this deliverable's proofs — a
  // resubmit replaced it between upload and analysis. The stale entry is simply not stored.
  return NextResponse.json({ ok: true, applied: currentKeys.includes(key) });
}

/** The Lambda's report. Every field is treated as untrusted and re-validated above. */
type PipelineReport = {
  key?: unknown;
  thumbKey?: unknown;
  sniffedMime?: unknown;
  bytes?: unknown;
  error?: unknown;
  textLines?: unknown[];
  moderation?: { labels?: { name?: unknown; parent?: unknown; confidence?: unknown }[] };
};
