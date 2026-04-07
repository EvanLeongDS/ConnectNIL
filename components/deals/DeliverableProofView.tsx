import Image from "next/image";
import { parseProofImageUrls } from "@/lib/deals/deliverableProof";

interface Props {
  description?: string | null;
  imageUrls?: unknown;
  className?: string;
}

export default function DeliverableProofView({ description, imageUrls, className = "" }: Props) {
  const urls = parseProofImageUrls(imageUrls);
  if (!description?.trim() && urls.length === 0) return null;

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
      {urls.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {urls.map((url) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="relative aspect-square overflow-hidden rounded-lg border border-black/6 bg-black/5 dark:border-white/10"
            >
              <Image src={url} alt="Deliverable proof" fill className="object-cover" sizes="(max-width: 640px) 50vw, 200px" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
