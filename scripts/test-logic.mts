/**
 * Pure-logic tests for the deal/deliverable/proof helpers.  Run:  npm run test:logic
 *
 * The project has no test framework, and these functions are the ones where a silent
 * mistake is expensive: money that renders differently from what Stripe charges, a status
 * predicate that hides the Submit button, a review flag that says "clean" about an image
 * nothing ever looked at.
 *
 * Deliberately limited to modules that are pure and dependency-free, so this runs with no
 * database, no AWS and no network:
 *   lib/deals/types.ts            money formatting, deliverable status vocabulary
 *   lib/deals/proofAnalysis.ts    moderation / brand-mention verdicts
 *   lib/deals/deliverableProof.ts S3 key shapes, MIME allowlist, magic bytes
 *
 * Node runs the TypeScript directly via --experimental-strip-types (Node 22.6+).
 */
import {
  formatCurrency,
  formatCents,
  installmentAmountCents,
  computeNumMonths,
  isAwaitingSubmission,
  isNotStarted,
  normalizeDeliverableStatus,
  deliverableStatusMeta,
  AWAITING_SUBMISSION_STATUSES,
} from "../lib/deals/types.ts";
import {
  brandMentionNeedles,
  detectBrandMention,
  isModerationFlagged,
  parseProofAnalysis,
  proofReviewFlag,
  type ProofModerationLabel,
} from "../lib/deals/proofAnalysis.ts";
import {
  isValidProofKey,
  isAllowedProofImageType,
  parseProofImageRefs,
  sniffImageMime,
  thumbKeyFor,
  S3_REF_PREFIX,
  PROOF_MAX_IMAGES,
} from "../lib/deals/deliverableProof.ts";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) {
    passed++;
  } else {
    failed++;
    failures.push(`${name}\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`);
  }
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
}

function section(title: string) {
  console.log(`\n── ${title} ${"─".repeat(Math.max(0, 62 - title.length))}`);
}

/* ══ Money ══════════════════════════════════════════════════════════════════
 * The bug: formatCurrency rounded to whole dollars while installmentAmountCents
 * produced exact cents, so a button read "Pay $333" and Stripe charged $333.33. */
section("money");

const thirds = [1, 2, 3].map((n) => installmentAmountCents(1000, 3, n));
eq("3 installments of $1000 sum to exactly 100000 cents", thirds.reduce((a, b) => a + b, 0), 100000);
eq("installments split 33333/33333/33334", thirds, [33333, 33333, 33334]);
eq("cents are shown when they exist", formatCents(thirds[0]), "$333.33");
eq("last installment shows its extra cent", formatCents(thirds[2]), "$333.34");
eq("round figures stay clean (no .00)", formatCurrency(25000), "$25,000");
eq("thousands separator survives", formatCurrency(1234567), "$1,234,567");
eq("$0 renders as $0, not an em dash", formatCurrency(0), "$0");
eq("0 cents likewise", formatCents(0), "$0");
eq("null is genuinely unknown", formatCurrency(null), "—");
eq("undefined is genuinely unknown", formatCents(undefined), "—");
eq("NaN never reaches the user as 'NaN'", formatCurrency(NaN), "—");
eq("5% platform fee on an odd installment", formatCents(Math.round(33333 * 0.95)), "$316.66");
eq("a penny renders as a penny", formatCents(1), "$0.01");
eq("negative amounts keep their sign", formatCurrency(-42.5), "-$42.50");

// Rounding must never lose or invent money, at any term length.
let moneyDrift = 0;
for (const total of [1000, 999.99, 0.03, 12345.67, 1]) {
  for (const months of [1, 2, 3, 7, 12, 24]) {
    const sum = Array.from({ length: months }, (_, i) =>
      installmentAmountCents(total, months, i + 1)
    ).reduce((a, b) => a + b, 0);
    if (sum !== Math.round(total * 100)) moneyDrift++;
  }
}
eq("installments always sum to the total (30 combinations)", moneyDrift, 0);

eq("computeNumMonths: missing dates fall back to 1", computeNumMonths(null, null), 1);
eq("computeNumMonths: a one-year term", computeNumMonths("2026-01-01", "2026-12-31"), 12);

/* ══ Deliverable status ═════════════════════════════════════════════════════
 * The bug: migration 017 renamed 'pending' -> 'not_started' and backfilled, but every
 * predicate still tested for 'pending', so no Submit button ever rendered. Live rows now
 * hold BOTH spellings, so every predicate has to accept both. */
section("deliverable status (both spellings must work)");

eq("legacy 'pending' can submit", isAwaitingSubmission("pending"), true);
eq("current 'not_started' can submit", isAwaitingSubmission("not_started"), true);
eq("'rejected' can resubmit", isAwaitingSubmission("rejected"), true);
eq("'submitted' cannot re-submit", isAwaitingSubmission("submitted"), false);
eq("'approved' cannot re-submit", isAwaitingSubmission("approved"), false);
eq("null cannot submit", isAwaitingSubmission(null), false);
eq("undefined cannot submit", isAwaitingSubmission(undefined), false);
eq("junk cannot submit", isAwaitingSubmission("wat"), false);

eq("isNotStarted excludes rejected (counted separately)", isNotStarted("rejected"), false);
eq("isNotStarted covers the legacy spelling", isNotStarted("pending"), true);
eq("isNotStarted covers the current spelling", isNotStarted("not_started"), true);

eq("normalize folds legacy onto current", normalizeDeliverableStatus("pending"), "not_started");
eq("normalize preserves submitted", normalizeDeliverableStatus("submitted"), "submitted");
eq("normalize preserves rejected", normalizeDeliverableStatus("rejected"), "rejected");
eq("normalize is total (junk -> not_started)", normalizeDeliverableStatus("wat"), "not_started");
eq("normalize handles null", normalizeDeliverableStatus(null), "not_started");

eq("legacy rows get a human label", deliverableStatusMeta("pending").label, "Not started");
eq("junk still gets a human label", deliverableStatusMeta("wat").label, "Not started");
eq("no unstyled pill for legacy rows", deliverableStatusMeta("pending").cls.length > 0, true);
eq("no unstyled pill for junk", deliverableStatusMeta("wat").cls.length > 0, true);
eq("legacy and current render identically", deliverableStatusMeta("pending"), deliverableStatusMeta("not_started"));

// The submit route passes this array to a Postgres .in() filter to make the status
// transition an atomic claim. If it disagreed with the predicate, the API and the UI would
// disagree about who may submit.
for (const st of ["not_started", "pending", "submitted", "approved", "rejected"]) {
  eq(`claim list matches predicate for '${st}'`,
     (AWAITING_SUBMISSION_STATUSES as readonly string[]).includes(st),
     isAwaitingSubmission(st));
}

/* ══ Proof analysis ═════════════════════════════════════════════════════════ */
section("proof analysis verdicts");

/* Every entry here comes from Rekognition's DetectModerationLabels, which only ever returns
 * unsafe-content categories — general labels like "Sports" never appear. So the name is not
 * a discriminator and confidence is the only question; the floor is 60. */
const lowConfidence: ProofModerationLabel[] = [{ name: "Suggestive", parent: "", confidence: 41 }];
const atFloor: ProofModerationLabel[] = [{ name: "Suggestive", parent: "", confidence: 60 }];
const explicit: ProofModerationLabel[] = [{ name: "Explicit Nudity", parent: "", confidence: 92 }];
eq("a clean image (no moderation labels at all) is not flagged", isModerationFlagged([]), false);
eq("below the confidence floor is not flagged", isModerationFlagged(lowConfidence), false);
eq("exactly at the floor IS flagged (>=, not >)", isModerationFlagged(atFloor), true);
eq("high-confidence explicit content is flagged", isModerationFlagged(explicit), true);
eq("one confident label among several flags the set",
   isModerationFlagged([...lowConfidence, ...explicit]), true);

const needles = brandMentionNeedles("Gatorade", "@gatorade");
eq("needles are derived from the brand", needles.length > 0, true);
eq("a mention in OCR text is detected", detectBrandMention(["Fueled by Gatorade today"], needles).matched, true);
eq("unrelated text is not a mention", detectBrandMention(["great practice"], needles).matched, false);
eq("no needles means no false positive", detectBrandMention(["anything"], []).matched, false);
eq("no text means no false positive", detectBrandMention([], needles).matched, false);

eq("garbage proof_analysis parses to empty, never throws", parseProofAnalysis("not json"), {});
eq("null proof_analysis parses to empty", parseProofAnalysis(null), {});

// proofReviewFlag is the guard against telling a reviewer "clean" about an unanalysed image.
const key = "deals/p/d/img.png";
eq("no analysis at all is pending, never clean", proofReviewFlag({}, [key]), "pending");
eq("no images at all is pending", proofReviewFlag({}, []), "pending");

const analysed = parseProofAnalysis({
  [key]: {
    analyzedAt: new Date().toISOString(),
    thumbKey: null, sniffedMime: "image/png", bytes: 10,
    moderation: { flagged: false, labels: [] },
    brandMention: { matched: true, matchedOn: ["gatorade"] },
    textLines: ["gatorade"],
  },
});
eq("a clean analysed image reads clean", proofReviewFlag(analysed, [key]), "clean");

const errored = parseProofAnalysis({
  [key]: {
    analyzedAt: new Date().toISOString(),
    thumbKey: null, sniffedMime: null, bytes: 0,
    moderation: { flagged: false, labels: [] },
    brandMention: { matched: false, matchedOn: [] },
    textLines: [],
    error: "rekognition failed",
  },
});
eq("a FAILED analysis is pending, not clean", proofReviewFlag(errored, [key]), "pending");

/* ══ Proof key shapes ═══════════════════════════════════════════════════════
 * isValidProofKey is a security boundary: it stops a caller submitting an object key that
 * belongs to somebody else's deal. */
section("proof keys and image types");

const pid = "11111111-1111-4111-8111-111111111111";
const did = "22222222-2222-4222-8222-222222222222";
const good = `deals/${pid}/${did}/33333333-3333-4333-8333-333333333333.png`;

eq("a well-formed key for this deliverable is accepted", isValidProofKey(good, pid, did), true);
eq("a key for ANOTHER deliverable is rejected", isValidProofKey(good, pid, "44444444-4444-4444-8444-444444444444"), false);
eq("a key for ANOTHER partnership is rejected", isValidProofKey(good, "55555555-5555-4555-8555-555555555555", did), false);
eq("path traversal is rejected", isValidProofKey(`deals/${pid}/${did}/../../etc/passwd`, pid, did), false);
eq("a key outside deals/ is rejected", isValidProofKey(`thumbs/${pid}/${did}/x.png`, pid, did), false);
eq("an empty key is rejected", isValidProofKey("", pid, did), false);

eq("jpeg is allowed", isAllowedProofImageType("image/jpeg"), true);
eq("png is allowed", isAllowedProofImageType("image/png"), true);
eq("svg is NOT allowed (script vector)", isAllowedProofImageType("image/svg+xml"), false);
eq("pdf is NOT allowed", isAllowedProofImageType("application/pdf"), false);
eq("empty type is NOT allowed", isAllowedProofImageType(""), false);

eq("PNG magic bytes are recognised",
   sniffImageMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
eq("JPEG magic bytes are recognised",
   sniffImageMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
eq("random bytes sniff as nothing", sniffImageMime(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])), null);

// thumbs/ must stay OUTSIDE deals/, or the Lambda's own output re-triggers it in a loop.
eq("thumbnails live outside the deals/ trigger prefix", thumbKeyFor(good).startsWith("deals/"), false);
eq("thumbnails live under thumbs/", thumbKeyFor(good).startsWith("thumbs/"), true);

eq("dual-mode reads: an s3 ref parses as s3",
   parseProofImageRefs([`${S3_REF_PREFIX}${good}`]), [{ kind: "s3", key: good }]);
eq("dual-mode reads: a legacy URL still parses",
   parseProofImageRefs(["https://x.supabase.co/storage/v1/object/public/a.png"]),
   [{ kind: "url", url: "https://x.supabase.co/storage/v1/object/public/a.png" }]);
eq("garbage refs are dropped, not rendered", parseProofImageRefs([null, 42, ""]), []);
eq("a non-array is tolerated", parseProofImageRefs("nope"), []);
eq("the image cap is a sane number", PROOF_MAX_IMAGES > 0 && PROOF_MAX_IMAGES <= 20, true);

/* ══ Summary ════════════════════════════════════════════════════════════════ */
console.log(`\n${"═".repeat(66)}`);
if (failed > 0) {
  console.log(`\n${failed} FAILED:\n`);
  failures.forEach((f) => console.log(`  • ${f}\n`));
}
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
