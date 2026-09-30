import Image from "next/image";
import { initialsFor } from "@/lib/athletes/photo";

/**
 * An athlete's face, or their initials when there is no photo.
 *
 * Deliberately has NO "use client" directive and no server-only imports, so it renders in
 * server components (the deal pages, the roster page) and is bundled into the client where
 * a client component imports it (TeamRosterClient). It never fetches — it is handed an
 * already-presigned, already-authorized URL. Resolving photos is
 * lib/athletes/visibility.ts's job, and keeping that out of here is what stops a list view
 * from quietly leaking an athlete nobody checked the viewer was connected to.
 *
 * Uses next/image rather than a plain <img> because these render in lists: an athlete may
 * have uploaded a 5 MB photo, and a 24-athlete roster showing them at 40px would otherwise
 * pull ~120 MB. next/image resizes server-side and caches for `minimumCacheTTL`. That only
 * works because next.config.ts whitelists the `/athletes/**` path — without it every avatar
 * 400s — and because presignAthletePhotoDownload snaps the signing timestamp to a 15-minute
 * window, so the URL stays byte-identical across renders and the cache actually hits.
 */

const SIZES = {
  sm: 32,
  md: 40,
  lg: 64,
  xl: 96,
} as const;

export type AvatarSize = keyof typeof SIZES;

/** Initials scale with the circle; a 32px circle cannot carry 18px type. */
const TEXT_CLASS: Record<AvatarSize, string> = {
  sm: "text-[11px]",
  md: "text-xs",
  lg: "text-base",
  xl: "text-2xl",
};

export default function AthleteAvatar({
  photoUrl,
  firstName,
  lastName,
  size = "md",
  className = "",
}: {
  photoUrl?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  size?: AvatarSize;
  className?: string;
}) {
  const px = SIZES[size];
  const initials = initialsFor(firstName, lastName);
  const name = `${firstName ?? ""} ${lastName ?? ""}`.trim();

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-full border border-black/8 bg-[#f9fafb] dark:border-white/12 dark:bg-[#222833] ${className}`}
      style={{ width: px, height: px }}
    >
      {photoUrl ? (
        <Image
          src={photoUrl}
          alt={name ? `${name}'s profile photo` : "Athlete profile photo"}
          width={px}
          height={px}
          className="h-full w-full object-cover"
        />
      ) : (
        <div
          className={`flex h-full w-full items-center justify-center font-black text-black/30 dark:text-white/25 ${TEXT_CLASS[size]}`}
          /* The initials are decorative — the athlete's name is always rendered as real text
             next to this in every current caller, so announcing "MC" as well is noise. */
          aria-hidden="true"
        >
          {initials}
        </div>
      )}
    </div>
  );
}

/**
 * Overlapping row of faces for a headline count ("14 athletes joined").
 *
 * `total` is passed separately rather than inferred from `athletes.length` because the two
 * legitimately differ: an athlete who was added to a deal but has not finished onboarding
 * has no profile to show, and silently shrinking the count to match the faces would
 * misreport the deal.
 */
export function AthleteFacePile({
  athletes,
  total,
  max = 5,
  size = "md",
}: {
  athletes: { id: string; firstName: string; lastName: string; photoUrl: string | null }[];
  total?: number;
  max?: number;
  size?: AvatarSize;
}) {
  const shown = athletes.slice(0, max);
  const count = total ?? athletes.length;
  const remainder = count - shown.length;

  if (count === 0) return null;

  return (
    <div className="flex items-center">
      <div className="flex -space-x-2">
        {shown.map((a) => (
          <AthleteAvatar
            key={a.id}
            photoUrl={a.photoUrl}
            firstName={a.firstName}
            lastName={a.lastName}
            size={size}
            className="ring-2 ring-white dark:ring-[#161b27]"
          />
        ))}
      </div>
      {remainder > 0 && (
        <span className="ml-2 text-xs font-semibold text-black/45 dark:text-white/40">
          +{remainder}
        </span>
      )}
    </div>
  );
}
