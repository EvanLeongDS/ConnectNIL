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
  athlete_id: string | null;
  team_id: string | null;
}

/**
 * Overview = what is running and what is stuck. Company profile and campaign preferences
 * live on Profile; spend history and past campaigns live on Deals.
 */
export default async function BrandDashboard() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.user_metadata?.role !== "brand-manager") redirect("/dashboard");

  const { data: profile } = await supabase
    .from("brand_profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) redirect("/onboarding/brand-manager");

  const { data: partnerships, error: partnershipsError } = await supabase
    .from("partnerships")
    .select("id, title, deal_type, status, total_value, start_date, end_date, athlete_id, team_id")
    .eq("brand_id", user.id)
    .order("created_at", { ascending: false });

  const deals = (partnerships ?? []) as Partnership[];
  const activeDeals = deals.filter((d) => d.status === "active");
  const pendingDeals = deals.filter((d) => d.status === "pending");

  const uniqueAthletes = new Set(deals.filter((d) => d.athlete_id).map((d) => d.athlete_id)).size;
  const uniqueTeams = new Set(deals.filter((d) => d.team_id).map((d) => d.team_id)).size;

  // Deliverable completion per campaign — what a brand actually wants to know is whether
  // the athlete or team is delivering, not just that the deal exists.
  const { data: deliverableRows } = activeDeals.length
    ? await supabase
        .from("deliverables")
        .select("partnership_id, status")
        .in("partnership_id", activeDeals.map((d) => d.id))
    : { data: [] };
  const progressByDeal = tallyDeliverables(deliverableRows ?? []);

  const activeSpend = activeDeals.reduce((s, d) => s + (d.total_value ?? 0), 0);
  const totalSpent = deals
    .filter((d) => d.status === "completed")
    .reduce((s, d) => s + (d.total_value ?? 0), 0);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#f9fafb] dark:bg-[#0d1117]">
      <DashboardNav role="brand-manager" name={profile.company_name ?? "Brand"} />

      <OverviewMain>
        {partnershipsError && (
          <LoadError title="Could not load your deals" message={partnershipsError.message} />
        )}

        <OverviewHeader
          eyebrow="Brand Dashboard"
          title={profile.company_name}
          meta={[profile.industry, [profile.city, profile.state].filter(Boolean).join(", ")]
            .filter(Boolean)
            .join(" · ")}
          action={{ label: "Find teams", href: "/dashboard/brand-dashboard/discover" }}
        />

        <StatRow>
          <StatCard
            label="Active campaigns"
            href="/dashboard/brand-dashboard/deals"
            value={String(activeDeals.length)}
            sub={activeDeals.length ? "In progress" : "None yet"}
            tone={activeDeals.length > 0 ? "accent" : undefined}
          />
          <StatCard
            label="Partners"
            value={String(uniqueAthletes + uniqueTeams)}
            sub={`${uniqueAthletes} athletes · ${uniqueTeams} teams`}
          />
          <StatCard label="Active spend" value={formatCurrency(activeSpend)} sub="Across active deals" href="/dashboard/brand-dashboard/deals" />
          <StatCard label="Total spent" value={formatCurrency(totalSpent)} sub="Completed deals" href="/dashboard/brand-dashboard/deals" />
        </StatRow>

        <PanelRow>
          <Panel
            wide
            title="Active partnerships"
            action={{ label: "All deals", href: "/dashboard/brand-dashboard/deals" }}
          >
            {activeDeals.length === 0 ? (
              <EmptyState
                icon="📢"
                text="No active campaigns yet."
                sub="Reach out to athletes or teams to start a partnership."
              />
            ) : (
              activeDeals.map((deal) => (
                <ListRow
                  key={deal.id}
                  href={`/dashboard/brand-dashboard/deals/${deal.id}`}
                  title={deal.title}
                  meta={[
                    (deal.deal_type && (dealTypeLabel[deal.deal_type] ?? deal.deal_type)) || "Deal",
                    deal.team_id ? "Team deal" : deal.athlete_id ? "Athlete deal" : null,
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

          <Panel
            title="Awaiting response"
            action={{ label: "All deals", href: "/dashboard/brand-dashboard/deals" }}
          >
            {pendingDeals.length === 0 ? (
              <EmptyState icon="📨" text="No proposals out." sub="Offers you send appear here until answered." />
            ) : (
              pendingDeals.map((deal) => (
                <ListRow
                  key={deal.id}
                  href={`/dashboard/brand-dashboard/deals/${deal.id}`}
                  title={deal.title}
                  meta={deal.total_value != null ? formatCurrency(deal.total_value) : undefined}
                  pill={{ label: "pending", status: "pending" }}
                />
              ))
            )}
          </Panel>
        </PanelRow>
      </OverviewMain>
    </div>
  );
}
