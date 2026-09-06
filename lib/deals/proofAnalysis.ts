/**
 * Shape and scoring for the automated proof analysis written by the S3 pipeline.
 *
 * Pure and dependency-free, like lib/deals/deliverableProof.ts, because three very
 * different callers share it: the Lambda that runs Rekognition (bundled by esbuild from
 * outside the Next.js app), the internal callback route that persists the result, and the
 * React components that render it. Never import server-only modules here.
 */

/** Rekognition returns 0-100. Below this we treat a moderation hit as noise. */
export const PROOF_MODERATION_MIN_CONFIDENCE = 60;

/** Longest edge of the JPEG handed to Rekognition. Well under its 5 MB Bytes limit. */
export const PROOF_ANALYSIS_MAX_DIM = 1568;

/** Longest edge of the generated thumbnail. */
export const PROOF_THUMB_MAX_DIM = 400;

export type ProofModerationLabel = {
  name: string;
  parent: string;
  confidence: number;
};

export type ProofBrandMention = {
  matched: boolean;
  /** Which needles hit — shown to the reviewer so the verdict is auditable, not magic. */
  matchedOn: string[];
};

export type ProofImageAnalysis = {
  analyzedAt: string;
  /** Object key of the generated thumbnail, or null if generation failed. */
  thumbKey: string | null;
  /** Magic-byte sniff of the stored object, independent of its declared Content-Type. */
  sniffedMime: string | null;
  bytes: number;
  moderation: {
    flagged: boolean;
    labels: ProofModerationLabel[];
  };
  brandMention: ProofBrandMention;
  /** Lines Rekognition read out of the image. Capped; this is evidence, not a transcript. */
  textLines: string[];
  /** Set when the pipeline ran but could not complete for this object. */
  error?: string;
};

/** deliverables.proof_analysis — keyed by the proof object key. */
export type ProofAnalysis = Record<string, ProofImageAnalysis>;

export type ProofReviewFlag = "flagged" | "clean" | "pending";

/* ──────────────────────────────────────────────────────────────────────────── */

/**
 * Collapses text to lowercase alphanumerics.
 *
 * Spaces go too, deliberately: OCR splits "MrBeast Tennis Balls" across lines and
 * sprinkles punctuation, so comparing space-free forms is what makes the match survive
 * real screenshots.
 */
export function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const COMPANY_SUFFIXES = /\b(inc|llc|ltd|co|corp|company|group|brands?)\b\.?/gi;

/**
 * The needles that count as "this brand was mentioned".
 *
 * Anything shorter than 3 characters after normalising is dropped — a two-letter needle
 * matches almost any screenshot and would make the verdict worthless.
 */
export function brandMentionNeedles(
  companyName: string | null | undefined,
  instagramHandle: string | null | undefined
): string[] {
  const out = new Set<string>();

  const add = (raw: string) => {
    const n = normalizeForMatch(raw);
    if (n.length >= 3) out.add(n);
  };

  if (companyName) {
    add(companyName);
    // Also the name with legal suffixes removed, so "MrBeast Tennis Balls LLC" still
    // matches a post that just says "MrBeast Tennis Balls".
    const stripped = companyName.replace(COMPANY_SUFFIXES, " ").trim();
    if (stripped && stripped !== companyName) add(stripped);
  }

  if (instagramHandle) {
    // Accepts "@handle", "handle", or a full profile URL.
    const handle = instagramHandle
      .trim()
      .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
      .replace(/\/.*$/, "")
      .replace(/^@/, "");
    if (handle) add(handle);
  }

  return [...out];
}

/**
 * Substring match of any needle against the OCR text, both normalised.
 *
 * Substring rather than token equality because Instagram renders handles glued to
 * surrounding glyphs ("@mrbeasttennis·2h") and OCR frequently keeps them joined.
 */
export function detectBrandMention(textLines: string[], needles: string[]): ProofBrandMention {
  const haystack = normalizeForMatch(textLines.join(" "));
  if (!haystack || needles.length === 0) return { matched: false, matchedOn: [] };

  const matchedOn = needles.filter((n) => haystack.includes(n));
  return { matched: matchedOn.length > 0, matchedOn };
}

/**
 * Whether a moderation result should stop a one-click approve.
 *
 * Rekognition reports a hierarchy — a top-level category ("Suggestive") and a specific
 * child ("Female Swimwear Or Underwear"). Both arrive as separate labels; the flag is on
 * if anything at all cleared the confidence floor.
 */
export function isModerationFlagged(labels: ProofModerationLabel[]): boolean {
  return labels.some((l) => l.confidence >= PROOF_MODERATION_MIN_CONFIDENCE);
}

/**
 * Rolls the per-image results up to the one value the deliverable row carries for cheap
 * filtering. "pending" means at least one image has no analysis yet — a proof submitted
 * before this pipeline existed reads that way and renders as "not analysed" rather than
 * as a false all-clear.
 */
export function proofReviewFlag(analysis: ProofAnalysis, imageKeys: string[]): ProofReviewFlag {
  if (imageKeys.length === 0) return "pending";
  if (imageKeys.some((k) => !analysis[k])) return "pending";
  if (imageKeys.some((k) => analysis[k].moderation.flagged)) return "flagged";
  return "clean";
}

/** Defensive read of the jsonb column. Malformed entries are dropped, never thrown on. */
export function parseProofAnalysis(raw: unknown): ProofAnalysis {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: ProofAnalysis = {};
  for (const [key, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const e = v as Partial<ProofImageAnalysis>;
    if (typeof e.analyzedAt !== "string") continue;
    out[key] = {
      analyzedAt: e.analyzedAt,
      thumbKey: typeof e.thumbKey === "string" ? e.thumbKey : null,
      sniffedMime: typeof e.sniffedMime === "string" ? e.sniffedMime : null,
      bytes: typeof e.bytes === "number" ? e.bytes : 0,
      moderation: {
        flagged: Boolean(e.moderation?.flagged),
        labels: Array.isArray(e.moderation?.labels) ? e.moderation.labels : [],
      },
      brandMention: {
        matched: Boolean(e.brandMention?.matched),
        matchedOn: Array.isArray(e.brandMention?.matchedOn) ? e.brandMention.matchedOn : [],
      },
      textLines: Array.isArray(e.textLines) ? e.textLines : [],
      ...(typeof e.error === "string" ? { error: e.error } : {}),
    };
  }
  return out;
}
