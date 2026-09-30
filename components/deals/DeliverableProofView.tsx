import Image from "next/image";
import { parseProofImageRefs } from "@/lib/deals/deliverableProof";
import { parseProofAnalysis, proofReviewFlag } from "@/lib/deals/proofAnalysis";
import { isS3Configured, presignProofDownload } from "@/lib/aws/s3";

interface Props {
  description?: string | null;
  imageUrls?: unknown;
  /** Raw deliverables.proof_analysis (migration 019). Omit to render without the verdict. */
  analysis?: unknown;
  /** Brand reviewers get the automated verdict; athletes and teams just see their proof. */
  showAnalysis?: boolean;
  className?: string;
}

/**
 * Server component. Resolves the mixed-format proof_image_urls array into renderable
 * srcs: legacy Supabase public URLs pass through verbatim, S3 keys are presigned here.
 *
 * Presigning is pure local HMAC - no network call, no AWS request, no cost - so doing it
 * per deliverable during render is microseconds. Safe to await inside the dashboard pages,
 * all three of which are async server components.
 *
 * The grid shows the pipeline's WebP thumbnail where one exists and the original only on
 * click. Proofs predating the pipeline, and legacy Supabase-hosted ones, have no thumbnail
 * and fall back to the full image exactly as before.
 */
export default async function DeliverableProofView({
  description,
  imageUrls,
  analysis,
  showAnalysis = false,
  className = "",
}: Props) {
  const refs = parseProofImageRefs(imageUrls);
  if (!description?.trim() && refs.length === 0) return null;

  const parsed = parseProofAnalysis(analysis);
  const s3Keys = refs.filter((r) => r.kind === "s3").map((r) => (r as { key: string }).key);
  const flag = proofReviewFlag(parsed, s3Keys);

  // Presigning throws when no S3 credentials resolve, and this is a server component
  // rendered mid-page by all three deal-detail routes — so an unguarded call takes the whole
  // page down with Next's bare error screen, not a broken thumbnail. That is reachable
  // through the documented rollback: unset AWS_ROLE_ARN / S3_* and every deal carrying an
  // S3-era proof 500s. Legacy Supabase refs need no credentials and must keep rendering.
  const s3Available = isS3Configured();

  const items = await Promise.all(
    refs.map(async (r) => {
      if (r.kind === "url") return { full: r.url, thumb: r.url, flagged: false };
      if (!s3Available) return null;
      const entry = parsed[r.key];
      const full = await presignProofDownload(r.key);
      return {
        full,
        thumb: entry?.thumbKey ? await presignProofDownload(entry.thumbKey) : full,
        flagged: Boolean(entry?.moderation.flagged),
      };
    })
  ).then((rows) => rows.filter((row): row is NonNullable<typeof row> => row !== null));

  const hiddenS3Count = s3Available ? 0 : s3Keys.length;

  const mentioned = s3Keys.some((k) => parsed[k]?.brandMention.matched);
  const matchedOn = [...new Set(s3Keys.flatMap((k) => parsed[k]?.brandMention.matchedOn ?? []))];

  return (
    <div className={`rounded-xl border border-black/8 bg-black/2 p-4 dark:border-white/8 dark:bg-white/5 ${className}`}>
      <p className="text-[11px] font-bold uppercase tracking-wide text-black/40 dark:text-white/35">
        Proof submitted
      </p>
      {description?.trim() && (
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-black/80 dark:text-white/75">
          {description.trim()}
        </p>
      )}

      {showAnalysis && s3Keys.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {flag === "flagged" && (
            <Badge tone="danger">Flagged by automated review — open each image before approving</Badge>
          )}
          {flag === "pending" && <Badge tone="muted">Not analysed</Badge>}
          {flag === "clean" && <Badge tone="ok">No moderation flags</Badge>}

          {flag !== "pending" &&
            (mentioned ? (
              <Badge tone="ok">
                Brand mention found{matchedOn.length > 0 ? `: ${matchedOn.join(", ")}` : ""}
              </Badge>
            ) : (
              <Badge tone="warn">No brand mention detected</Badge>
            ))}
        </div>
      )}

      {hiddenS3Count > 0 && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800/50 dark:bg-amber-900/20 dark:text-amber-200">
          {hiddenS3Count === 1 ? "1 proof image is" : `${hiddenS3Count} proof images are`} stored
          in S3 and cannot be displayed right now — image storage is not configured on this
          deployment. The {hiddenS3Count === 1 ? "image has" : "images have"} not been lost.
        </p>
      )}

      {items.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {items.map((item, i) => (
            <a
              key={i}
              href={item.full}
              target="_blank"
              rel="noopener noreferrer"
              className="relative aspect-square overflow-hidden rounded-lg border border-black/6 bg-black/5 dark:border-white/10"
            >
              {/* key is the index, not the src: presigned URLs rotate each signing window
                  and using them as React keys would remount the images needlessly. */}
              <Image
                src={item.thumb}
                alt="Deliverable proof"
                fill
                className="object-cover"
                sizes="(max-width: 640px) 50vw, 200px"
              />
              {showAnalysis && item.flagged && (
                <span className="absolute inset-x-0 bottom-0 bg-red-600/90 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                  Flagged
                </span>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function Badge({ tone, children }: { tone: "ok" | "warn" | "danger" | "muted"; children: React.ReactNode }) {
  const tones = {
    ok: "border-green-600/25 bg-green-600/10 text-green-700 dark:text-green-400",
    warn: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    danger: "border-red-600/30 bg-red-600/10 text-red-700 dark:text-red-400",
    muted: "border-black/10 bg-black/5 text-black/50 dark:border-white/10 dark:bg-white/5 dark:text-white/45",
  } as const;
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}
