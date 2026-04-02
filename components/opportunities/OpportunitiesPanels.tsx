import Link from "next/link";
import type { BrandOpportunityRow, TeamOpportunityRow } from "@/lib/discover/opportunities";

function responseBadge(response: "committed" | "exploring") {
  if (response === "committed") {
    return {
      label: "Ready to pursue a partnership",
      className:
        "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/35 dark:text-emerald-200",
    };
  }
  return {
    label: "Interested, still deciding",
    className: "bg-amber-100 text-amber-900 dark:bg-amber-900/35 dark:text-amber-200",
  };
}

function formatDealLabel(raw: string) {
  return raw
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

type PanelVariant = "incoming" | "outgoing";

const brandEmptyCopy: Record<PanelVariant, { title: string; body: string }> = {
  incoming: {
    title: "No opportunities yet",
    body: "When brands mark interest in your team on Discover, their details and contact info will show up here.",
  },
  outgoing: {
    title: "Nothing here yet",
    body: "When you choose “ready to pursue a partnership” or “interested, still deciding” for a brand on Discover, that brand’s contact details will appear here.",
  },
};

export function BrandOpportunitiesPanel({
  rows,
  variant = "incoming",
}: {
  rows: BrandOpportunityRow[];
  variant?: PanelVariant;
}) {
  const empty = brandEmptyCopy[variant];
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-black/10 bg-white p-12 text-center dark:border-white/10 dark:bg-[#161b27]">
        <p className="text-3xl">📬</p>
        <p className="mt-3 font-semibold text-black/50 dark:text-white/40">{empty.title}</p>
        <p className="mt-1 text-sm text-black/30 dark:text-white/25">{empty.body}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {rows.map((row) => {
        const badge = responseBadge(row.response);
        return (
          <article
            key={row.interestId}
            className="flex flex-col rounded-2xl border border-black/6 bg-white p-5 shadow-sm dark:border-white/6 dark:bg-[#161b27]"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badge.className}`}>
                {badge.label}
              </span>
              <span className="text-xs text-black/40 dark:text-white/35">
                Updated {new Date(row.updatedAt).toLocaleString()}
              </span>
            </div>

            <h2 className="text-lg font-bold text-black dark:text-white">{row.companyName}</h2>
            <p className="mt-0.5 text-sm text-black/50 dark:text-white/45">
              {row.industry} · {row.city}, {row.state} · {row.budgetRange}
            </p>

            <div className="mt-4 rounded-xl border border-[#1f7ae0]/25 bg-[#1f7ae0]/6 p-4 dark:border-[#1f7ae0]/35 dark:bg-[#1f7ae0]/10">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#1560b3] dark:text-[#8ec5ff]">
                Contact
              </p>
              <p className="mt-1 text-sm font-semibold text-black dark:text-white">
                {row.managerFirstName} {row.managerLastName}
              </p>
              <p className="mt-2 text-sm">
                <span className="text-black/45 dark:text-white/40">Email </span>
                {row.email ? (
                  <a href={`mailto:${row.email}`} className="font-medium text-[#1f7ae0] hover:underline">
                    {row.email}
                  </a>
                ) : (
                  <span className="text-black/35 dark:text-white/30">—</span>
                )}
              </p>
              <p className="mt-1 text-sm">
                <span className="text-black/45 dark:text-white/40">Phone </span>
                {row.phone ? (
                  <a href={`tel:${row.phone.replace(/\s/g, "")}`} className="font-medium text-[#1f7ae0] hover:underline">
                    {row.phone}
                  </a>
                ) : (
                  <span className="text-black/35 dark:text-white/30">—</span>
                )}
              </p>
            </div>

            {row.companyDescription ? (
              <p className="mt-4 line-clamp-4 text-sm leading-relaxed text-black/60 dark:text-white/50">
                {row.companyDescription}
              </p>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              {row.websiteUrl ? (
                <a
                  href={row.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-[#1f7ae0] hover:underline"
                >
                  Website
                </a>
              ) : null}
            </div>

            {(row.preferredSports?.length || row.campaignTypes?.length) ? (
              <div className="mt-4 space-y-2 border-t border-black/6 pt-4 dark:border-white/8">
                {row.preferredSports && row.preferredSports.length > 0 ? (
                  <div>
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-black/45 dark:text-white/40">
                      Preferred sports
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {row.preferredSports.slice(0, 6).map((s) => (
                        <span
                          key={s}
                          className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] font-medium dark:bg-white/10"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {row.campaignTypes && row.campaignTypes.length > 0 ? (
                  <div>
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-black/45 dark:text-white/40">
                      Campaign types
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {row.campaignTypes.slice(0, 5).map((t) => (
                        <span
                          key={t}
                          className="rounded-md border border-[#1f7ae0]/35 bg-[#1f7ae0]/8 px-2 py-0.5 text-[11px] font-medium text-[#1560b3] dark:border-[#1f7ae0]/45 dark:text-[#8ec5ff]"
                        >
                          {formatDealLabel(t)}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

const teamEmptyCopy: Record<PanelVariant, { title: string; body: string }> = {
  incoming: {
    title: "No opportunities yet",
    body: "When teams mark interest in your brand on Discover, their details and contact info will show up here.",
  },
  outgoing: {
    title: "Nothing here yet",
    body: "When you choose “ready to pursue a partnership” or “interested, still deciding” for a team on Discover, that team’s contact details will appear here.",
  },
};

export function TeamOpportunitiesPanel({
  rows,
  variant = "incoming",
  canPropose = false,
}: {
  rows: TeamOpportunityRow[];
  variant?: PanelVariant;
  canPropose?: boolean;
}) {
  const empty = teamEmptyCopy[variant];
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-black/10 bg-white p-12 text-center dark:border-white/10 dark:bg-[#161b27]">
        <p className="text-3xl">📬</p>
        <p className="mt-3 font-semibold text-black/50 dark:text-white/40">{empty.title}</p>
        <p className="mt-1 text-sm text-black/30 dark:text-white/25">{empty.body}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {rows.map((row) => {
        const badge = responseBadge(row.response);
        return (
          <article
            key={row.interestId}
            className="flex flex-col rounded-2xl border border-black/6 bg-white p-5 shadow-sm dark:border-white/6 dark:bg-[#161b27]"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badge.className}`}>
                {badge.label}
              </span>
              <span className="text-xs text-black/40 dark:text-white/35">
                Updated {new Date(row.updatedAt).toLocaleString()}
              </span>
            </div>

            <h2 className="text-lg font-bold leading-snug text-black dark:text-white">
              {row.school} {row.teamName}
            </h2>
            <p className="mt-0.5 text-sm text-black/50 dark:text-white/45">
              {row.division ? `${row.division} · ` : ""}
              {row.numPlayers} athletes · <span className="capitalize">{row.availability}</span>
            </p>

            <div className="mt-4 rounded-xl border border-[#1f7ae0]/25 bg-[#1f7ae0]/6 p-4 dark:border-[#1f7ae0]/35 dark:bg-[#1f7ae0]/10">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#1560b3] dark:text-[#8ec5ff]">
                Contact
              </p>
              <p className="mt-1 text-sm font-semibold text-black dark:text-white">
                {row.managerFirstName} {row.managerLastName}
              </p>
              <p className="mt-2 text-sm">
                <span className="text-black/45 dark:text-white/40">Email </span>
                {row.email ? (
                  <a href={`mailto:${row.email}`} className="font-medium text-[#1f7ae0] hover:underline">
                    {row.email}
                  </a>
                ) : (
                  <span className="text-black/35 dark:text-white/30">—</span>
                )}
              </p>
              <p className="mt-1 text-sm">
                <span className="text-black/45 dark:text-white/40">Phone </span>
                <a href={`tel:${row.phone.replace(/\s/g, "")}`} className="font-medium text-[#1f7ae0] hover:underline">
                  {row.phone}
                </a>
              </p>
            </div>

            {row.preferredDeals && row.preferredDeals.length > 0 ? (
              <div className="mt-4 border-t border-black/6 pt-4 dark:border-white/8">
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-black/45 dark:text-white/40">
                  Preferred deal types
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {row.preferredDeals.map((d) => (
                    <span
                      key={d}
                      className="rounded-full bg-[#1f7ae0]/10 px-2 py-0.5 text-[11px] font-medium text-[#1f7ae0]"
                    >
                      {formatDealLabel(d)}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {canPropose && (
              <div className="mt-auto pt-4">
                <Link
                  href={`/dashboard/brand-dashboard/deals/new?teamId=${row.teamId}&teamName=${encodeURIComponent(`${row.school} ${row.teamName}`)}`}
                  className="inline-block w-full rounded-xl bg-[#1f7ae0] px-4 py-2.5 text-center text-sm font-bold text-white hover:bg-[#1a6cc5]"
                >
                  Propose a deal →
                </Link>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
