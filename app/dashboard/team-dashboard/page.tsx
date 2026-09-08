import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardNav from "@/components/dashboard/DashboardNav";
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

export const dynamic = "force-dynamic";

interface Partnership {
  id: string;
  title: string;
  deal_type: string | null;
  status: string;
  total_value: number | null;
  start_date: string | null;
  end_date: string | null;
  brand_id: string;
}

/**
 * Overview = the one screen a manager sees on login: how the team is doing, what is running,
 * and what is waiting on them. Everything else has its own nav destination —
 * team info and preferences live on Profile, the athlete list on Roster, history on Deals.
 */
export default async function TeamDashboard() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.user_metadata?.role !== "team-manager") redirect("/dashboard");

  const { data: profile } = await supabase
    .from("team_profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) redirect("/onboarding/team-manager");

  const { data: partnerships, error: partnershipsError } = await supabase
    .from("partnerships")
    .select("id, title, deal_type, status, total_value, start_date, end_date, brand_id")
    .eq("team_id", user.id)
    .order("created_at", { ascending: false });

  const deals = (partnerships ?? []) as Partnership[];
  const activeDeals = deals.filter((d) => d.status === "active");
  const pendingDeals = deals.filter((d) => d.status === "pending");

  const totalEarned = deals
    .filter((d) => d.status === "completed")
    .reduce((s, d) => s + (d.total_value ?? 0), 0);

  // Deliverable completion per deal — an "active" pill says nothing about whether the work
  // is actually getting done, which is the question a manager opens this page to answer.
  const { data: deliverableRows } = activeDeals.length
    ? await supabase
        .from("deliverables")
        .select("partnership_id, status")
        .in("partnership_id", activeDeals.map((d) => d.id))
    : { data: [] };
  const progressByDeal = tallyDeliverables(deliverableRows ?? []);

  const athleteEmails: string[] = profile.athlete_emails ?? [];
  const invitesSent = athleteEmails.length;
  const rosterPct =
    profile.num_players > 0 ? Math.min(100, Math.round((invitesSent / profile.num_players) * 100)) : 0;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#f9fafb] dark:bg-[#0d1117]">
      <DashboardNav
        role="team-manager"
        name={[profile.manager_first_name, profile.manager_last_name].filter(Boolean).join(" ") || "Team Manager"}
      />

      <OverviewMain>
        {partnershipsError && (
          <LoadError title="Could not load brand deals" message={partnershipsError.message} />
        )}

        <OverviewHeader
          eyebrow="Team Dashboard"
          title={profile.team_name}
          meta={[profile.sport, profile.division, profile.school].filter(Boolean).join(" · ")}
          action={{ label: "Find brands", href: "/dashboard/team-dashboard/discover" }}
        />

        <StatRow>
          <StatCard
            label="Active deals"
            value={String(activeDeals.length)}
            sub={activeDeals.length ? "In progress" : "None yet"}
            tone={activeDeals.length > 0 ? "accent" : undefined}
          />
          <StatCard
            label="Awaiting review"
            value={String(pendingDeals.length)}
            sub={pendingDeals.length ? "Needs your decision" : "All clear"}
            tone={pendingDeals.length > 0 ? "warn" : undefined}
          />
          <StatCard
            label="Roster invited"
            value={`${invitesSent}/${profile.num_players}`}
            sub={`${rosterPct}% coverage`}
            bar={rosterPct}
          />
          <StatCard label="Total earned" value={formatCurrency(totalEarned)} sub="Completed deals" />
        </StatRow>

        <PanelRow>
          <Panel wide title="Active brand deals" action={{ label: "All deals", href: "/dashboard/team-dashboard/deals" }}>
            {activeDeals.length === 0 ? (
              <EmptyState
                icon="🤝"
                text="No active brand deals yet."
                sub="Brands will reach out once your team profile is visible."
              />
            ) : (
              activeDeals.map((deal) => (
                <ListRow
                  key={deal.id}
                  href={`/dashboard/team-dashboard/deals/${deal.id}`}
                  title={deal.title}
                  meta={[
                    (deal.deal_type && (dealTypeLabel[deal.deal_type] ?? deal.deal_type)) || "Deal",
                    deal.start_date ? formatDate(deal.start_date) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  value={deal.total_value != null ? formatCurrency(deal.total_value) : null}
                  pill={{ label: "active", status: "active" }}
                  progress={progressByDeal.get(deal.id)}
                />
              ))
            )}
          </Panel>

          <Panel title="Needs your review" action={{ label: "Opportunities", href: "/dashboard/team-dashboard/opportunities" }}>
            {pendingDeals.length === 0 ? (
              <EmptyState icon="✅" text="Nothing waiting on you." sub="New brand proposals will land here." />
            ) : (
              pendingDeals.map((deal) => (
                <ListRow
                  key={deal.id}
                  href={`/dashboard/team-dashboard/deals/${deal.id}`}
                  title={deal.title}
                  meta={deal.total_value != null ? formatCurrency(deal.total_value) : undefined}
                  pill={{ label: "review", status: "pending" }}
                />
              ))
            )}
          </Panel>
        </PanelRow>
      </OverviewMain>
    </div>
  );
}
