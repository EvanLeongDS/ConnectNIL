import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import DashboardNav from "@/components/dashboard/DashboardNav";
import { isAwaitingSubmission } from "@/lib/deals/types";
import {
  EmptyState,
  ListRow,
  LoadError,
  OverviewHeader,
  OverviewMain,
  Panel,
  PanelRow,
  StatCard,
  StatRow,
  dealTypeLabel,
  formatCurrency,
  formatDate,
  tallyDeliverables,
} from "@/components/dashboard/ui";

interface Partnership {
  id: string;
  title: string;
  deal_type: string | null;
  status: string;
  total_value: number | null;
  start_date: string | null;
  end_date: string | null;
  brand_id: string;
  brand_display_name?: string | null;
  team_display_name?: string | null;
}

interface Deliverable {
  id: string;
  title: string;
  due_date: string | null;
  status: string;
  partnership_id: string;
}

function profileCompletion(p: Record<string, unknown>): number {
  const fields = [
    "first_name", "last_name", "phone", "school",
    "graduation_year", "sport", "team", "instagram_handle",
    "bio", "tiktok_handle", "twitter_handle", "snapchat_handle",
  ];
  const filled = fields.filter((f) => !!p[f]).length;
  return Math.round((filled / fields.length) * 100);
}

/**
 * Overview = deals in flight and work owed. Profile details live on Profile, the full
 * deliverable list (including approved history) on Deliverables, payments on Deals.
 */
export default async function AthleteDashboard() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.user_metadata?.role !== "athlete") redirect("/dashboard");

  const { data: profile } = await supabase
    .from("athlete_profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) redirect("/onboarding/athlete");

  const { data: partnerships, error: partnershipsError } = await supabase
    .from("partnerships")
    .select("id, title, deal_type, status, total_value, start_date, end_date, brand_id, brand_display_name, team_display_name")
    .eq("athlete_id", user.id)
    .order("created_at", { ascending: false });

  const deals = (partnerships ?? []) as Partnership[];
  const activeDeals = deals.filter((d) => d.status === "active");
  const pendingDeals = deals.filter((d) => d.status === "pending");

  // Use service client to find team deals by team membership — this works even
  // when partnership_participants wasn't populated at proposal time (e.g. athlete
  // joined after the deal was already created).
  const service = createServiceClient();
  const userEmail = user.email!.toLowerCase();

  const { data: teamInviteRows } = await service
    .from("team_athlete_invitations")
    .select("team_id")
    .eq("email", userEmail)
    .not("accepted_at", "is", null);

  const myTeamIds = (teamInviteRows ?? []).map((r: { team_id: string }) => r.team_id);

  let allTeamDeals: Partnership[] = [];
  if (myTeamIds.length > 0) {
    const { data: teamDealRows } = await service
      .from("partnerships")
      .select("id, title, deal_type, status, total_value, start_date, end_date, brand_display_name, team_display_name")
      .in("team_id", myTeamIds)
      .in("status", ["pending", "active"]);
    allTeamDeals = (teamDealRows ?? []) as Partnership[];
  }

  // Get the athlete's participation status for each team deal
  const teamDealIds = allTeamDeals.map((d) => d.id);
  const { data: participationRows } = teamDealIds.length
    ? await supabase
        .from("partnership_participants")
        .select("partnership_id, status")
        .eq("athlete_id", user.id)
        .in("partnership_id", teamDealIds)
    : { data: [] };

  const participationMap = new Map<string, string>();
  (participationRows ?? []).forEach(
    (p: { partnership_id: string; status: string }) =>
      participationMap.set(p.partnership_id, p.status)
  );

  // Deals the athlete hasn't accepted yet (invited or not yet in the table)
  const teamOptInDeals = allTeamDeals.filter((d) => {
    const s = participationMap.get(d.id);
    return s === "invited" || s === undefined;
  });

  // Active team deals the athlete has accepted
  const acceptedTeamDeals = allTeamDeals.filter(
    (d) => participationMap.get(d.id) === "accepted" && d.status === "active"
  );

  const allActiveDeals = [...activeDeals, ...acceptedTeamDeals];

  // Fetch deliverables for all deals the athlete is part of (active OR pending status).
  // We include accepted team deals of any partnership status so deliverables show up
  // even before the partnership is marked active. Use service client to bypass RLS.
  const acceptedTeamDealIds = allTeamDeals
    .filter((d) => participationMap.get(d.id) === "accepted" || participationMap.get(d.id) === undefined)
    .map((d) => d.id);

  const ownDealIds = deals
    .filter((d) => d.status === "active" || d.status === "pending")
    .map((d) => d.id);

  const allDealIdsForDeliverables = [...new Set([...ownDealIds, ...acceptedTeamDealIds])];

  const { data: deliverableRows } = allDealIdsForDeliverables.length
    ? await service
        .from("deliverables")
        .select("id, title, due_date, status, partnership_id")
        .in("partnership_id", allDealIdsForDeliverables)
        .order("due_date", { ascending: true })
    : { data: [] };

  const deliverables = (deliverableRows ?? []) as Deliverable[];
  const notStartedDelivs = deliverables.filter((d) => isAwaitingSubmission(d.status));
  const inReviewDelivs = deliverables.filter((d) => d.status === "submitted");
  const openTasks = [...notStartedDelivs, ...inReviewDelivs];

  const totalEarned = [...deals, ...acceptedTeamDeals]
    .filter((d) => d.status === "completed" || d.status === "active")
    .reduce((s, d) => s + (d.total_value ?? 0), 0);

  const completion = profileCompletion(profile as Record<string, unknown>);

  // Deliverables are already loaded above; roll them up per deal for the row progress bars.
  const progressByDeal = tallyDeliverables(deliverables);

  // Active first, then pending — one list beats two half-empty cards.
  const dealFeed = [...allActiveDeals, ...pendingDeals];

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#f9fafb] dark:bg-[#0d1117]">
      <DashboardNav
        role="athlete"
        name={[profile.first_name, profile.last_name].filter(Boolean).join(" ") || "Athlete"}
      />

      <OverviewMain>
        {partnershipsError && (
          <LoadError title="Could not load your deals" message={partnershipsError.message} />
        )}

        <OverviewHeader
          eyebrow="Athlete Dashboard"
          title={`Hey, ${profile.first_name ?? "Athlete"} 👋`}
          meta={[profile.team, profile.school, profile.graduation_year ? `Class of ${profile.graduation_year}` : null]
            .filter(Boolean)
            .join(" · ")}
          action={{ label: "Browse brands", href: "/dashboard/athlete-dashboard/discover" }}
        />

        {/* Action required — the one thing worth interrupting the layout for. */}
        {teamOptInDeals.length > 0 && (
          <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 dark:border-amber-700/40 dark:bg-amber-900/20">
            <p className="text-sm font-bold text-amber-800 dark:text-amber-300">
              Opt in to {teamOptInDeals.length === 1 ? "a team deal" : `${teamOptInDeals.length} team deals`}
            </p>
            <p className="min-w-0 flex-1 truncate text-xs text-amber-700/80 dark:text-amber-400/70">
              {teamOptInDeals.map((d) => d.title).join(" · ")}
            </p>
            <Link
              href={
                teamOptInDeals.length === 1
                  ? `/dashboard/athlete-dashboard/deals/${teamOptInDeals[0].id}`
                  : "/dashboard/athlete-dashboard/deals"
              }
              className="shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-amber-600 dark:bg-amber-600 dark:hover:bg-amber-500"
            >
              Review
            </Link>
          </div>
        )}

        <StatRow>
          <StatCard
            label="Active deals"
            href="/dashboard/athlete-dashboard/deals"
            value={String(allActiveDeals.length)}
            sub={allActiveDeals.length ? "In progress" : "None yet"}
            tone={allActiveDeals.length > 0 ? "accent" : undefined}
          />
          <StatCard
            label="Open tasks"
            href="/dashboard/athlete-dashboard/deliverables"
            value={String(openTasks.length)}
            sub={openTasks.length ? "Need attention" : "All clear"}
            tone={notStartedDelivs.length > 0 ? "warn" : undefined}
          />
          <StatCard label="Total earnings" value={formatCurrency(totalEarned)} sub="Across all deals" href="/dashboard/athlete-dashboard/deals" />
          <StatCard
            label="Profile"
            href="/dashboard/athlete-dashboard/profile"
            value={`${completion}%`}
            sub={completion === 100 ? "All done!" : "Complete it to attract brands"}
            bar={completion}
          />
        </StatRow>

        <PanelRow>
          <Panel wide title="Your deals" action={{ label: "All deals", href: "/dashboard/athlete-dashboard/deals" }}>
            {dealFeed.length === 0 ? (
              <EmptyState
                icon="🤝"
                text="No deals yet."
                sub="Once a brand partners with you, it will show here."
              />
            ) : (
              dealFeed.map((deal) => (
                <ListRow
                  key={deal.id}
                  href={`/dashboard/athlete-dashboard/deals/${deal.id}`}
                  title={deal.title}
                  meta={[
                    deal.brand_display_name,
                    (deal.deal_type && (dealTypeLabel[deal.deal_type] ?? deal.deal_type)) || "Deal",
                    deal.start_date ? formatDate(deal.start_date) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  value={deal.total_value ? formatCurrency(deal.total_value) : null}
                  pill={{ label: deal.status, status: deal.status }}
                  progress={progressByDeal.get(deal.id)}
                />
              ))
            )}
          </Panel>

          <Panel title="Your tasks" action={{ label: "All tasks", href: "/dashboard/athlete-dashboard/deliverables" }}>
            {openTasks.length === 0 ? (
              <EmptyState icon="✅" text="Nothing due." sub="New deliverables appear here when a deal starts." />
            ) : (
              openTasks.map((d) => {
                const submitted = d.status === "submitted";
                return (
                  <ListRow
                    key={d.id}
                    href={
                      submitted
                        ? `/dashboard/athlete-dashboard/deals/${d.partnership_id}`
                        : `/dashboard/athlete-dashboard/deals/${d.partnership_id}/deliverables/${d.id}`
                    }
                    title={d.title}
                    meta={d.due_date ? `Due ${formatDate(d.due_date)}` : undefined}
                    pill={{
                      label: submitted ? "in review" : d.status === "rejected" ? "rejected" : "to do",
                      status: submitted ? "submitted" : d.status === "rejected" ? "rejected" : "pending",
                    }}
                  />
                );
              })
            )}
          </Panel>
        </PanelRow>
      </OverviewMain>
    </div>
  );
}
