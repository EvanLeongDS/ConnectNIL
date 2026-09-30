import AthleteAvatar from "@/components/dashboard/AthleteAvatar";
import type { DealParticipant } from "@/lib/athletes/visibility";

/**
 * The athletes on a deal, with their photos and how they responded.
 *
 * Renders the LIST BODY only — no label wrapper — because the two callers each have their
 * own section primitive with slightly different padding (`Block` on the brand contract,
 * `ContractSection` on the team one). Each wraps this.
 *
 * Takes already-resolved, already-authorized participants. Resolution is
 * lib/athletes/visibility.ts#resolveDealParticipants, which re-checks that the viewer owns
 * the deal before returning anyone.
 *
 * `total` is separate from `participants.length` on purpose: an athlete who was added to a
 * deal but has not finished onboarding has no profile row and cannot be rendered, and
 * quietly showing a smaller number would misreport who is actually on the contract.
 */

const STATUS_META: Record<
  DealParticipant["status"],
  { label: string; className: string }
> = {
  accepted: {
    label: "Opted in",
    className: "bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  },
  invited: {
    label: "Awaiting response",
    className: "bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  },
  declined: {
    label: "Declined",
    className: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  },
};

export default function DealParticipantList({
  participants,
  total,
  emptyHint,
}: {
  participants: DealParticipant[];
  total: number;
  emptyHint?: string;
}) {
  if (total === 0) {
    return (
      <p className="text-sm text-black/35 dark:text-white/30">
        {emptyHint ?? "No individual athletes have been added to this deal."}
      </p>
    );
  }

  // Every participant is un-renderable — they exist, but none has onboarded.
  const unresolved = total - participants.length;

  return (
    <div>
      <ul className="space-y-2">
        {participants.map(({ athlete, status }) => {
          const meta = STATUS_META[status];
          return (
            <li key={athlete.id} className="flex items-center gap-3">
              <AthleteAvatar
                photoUrl={athlete.photoUrl}
                firstName={athlete.firstName}
                lastName={athlete.lastName}
                size="md"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-black dark:text-white">
                  {athlete.fullName}
                </p>
                <p className="truncate text-xs text-black/35 dark:text-white/30">
                  {[
                    athlete.sport,
                    athlete.graduationYear ? `Class of ${athlete.graduationYear}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.className}`}
              >
                {meta.label}
              </span>
            </li>
          );
        })}
      </ul>

      {unresolved > 0 && (
        <p className="mt-3 text-xs text-black/35 dark:text-white/30">
          {unresolved === 1
            ? "1 more athlete is on this deal but hasn't finished setting up their profile."
            : `${unresolved} more athletes are on this deal but haven't finished setting up their profiles.`}
        </p>
      )}
    </div>
  );
}
