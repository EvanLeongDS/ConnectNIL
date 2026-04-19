import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import DashboardNav from "@/components/dashboard/DashboardNav";
import {
  DEAL_STATUS_COLORS,
  DEAL_CATEGORY_LABELS,
  DELIVERABLE_FREQUENCY_LABELS,
  formatCurrency,
  formatDate,
} from "@/lib/deals/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TeamInfo {
  id: string;
  team_name: string;
  school: string;
  sport: string;
  division: string | null;
  manager_first_name: string;
  manager_last_name: string;
  num_players: number;
}

interface RosterMember {
  email: string;
  first_name: string | null;
  last_name: string | null;
  sport: string | null;
  graduation_year: number | null;
  isSelf: boolean;
}

interface TeamDeal {
  id: string;
  title: string;
  deal_type: string | null;
  status: string;
  total_value: number | null;
  start_date: string | null;
  end_date: string | null;
  brand_display_name: string | null;
  season: string | null;
  myStatus: "invited" | "accepted" | "declined" | null;
}

interface DealDeliverable {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: string;
  frequency: string;
  partnership_id: string;
  dealTitle: string;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function AthleteTeamPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.user_metadata?.role !== "athlete") redirect("/dashboard");

  const { data: profile } = await supabase
    .from("athlete_profiles")
    .select("first_name, last_name")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) redirect("/onboarding/athlete");

  const service = createServiceClient();
  const userEmail = user.email!.toLowerCase();

  // 1. Find teams the athlete has accepted invitations for
  const { data: acceptedInvites } = await service
    .from("team_athlete_invitations")
    .select("team_id")
    .eq("email", userEmail)
    .not("accepted_at", "is", null);

  const teamIds = (acceptedInvites ?? []).map((i: { team_id: string }) => i.team_id);

  if (teamIds.length === 0) {
    return (
      <div className="min-h-screen bg-[#f9fafb] dark:bg-[#0d1117]">
        <DashboardNav
          role="athlete"
          name={`${profile.first_name} ${profile.last_name}`}
        />
        <main className="mx-auto max-w-3xl px-6 py-10 md:px-10">
          <div className="mb-8">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#1f7ae0]">My Team</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-black dark:text-white">Team Roster</h1>
          </div>
          <div className="rounded-2xl border border-black/6 bg-white py-16 text-center shadow-sm dark:border-white/10 dark:bg-[#161b27] dark:shadow-none">
            <div className="text-4xl">🏅</div>
            <p className="mt-3 font-semibold text-black/60 dark:text-white/50">No team yet</p>
            <p className="mt-1 text-sm text-black/35 dark:text-white/30">
              A team manager will send you an invite link to join a roster.
            </p>
          </div>
        </main>
      </div>
    );
  }

  // 2. Fetch team profiles
  const { data: teamProfileRows } = await service
    .from("team_profiles")
    .select("id, team_name, school, sport, division, manager_first_name, manager_last_name, num_players")
    .in("id", teamIds);

  const teamProfiles = (teamProfileRows ?? []) as TeamInfo[];

  // 3. Fetch all accepted athletes on these teams
  const { data: allInviteRows } = await service
    .from("team_athlete_invitations")
    .select("team_id, email")
    .in("team_id", teamIds)
    .not("accepted_at", "is", null);

  const allInvites = (allInviteRows ?? []) as { team_id: string; email: string }[];

  // Map emails → profile ids via the profiles table
  const allEmails = [...new Set(allInvites.map((i) => i.email.toLowerCase()))];

  const { data: profileRows } = allEmails.length
    ? await service.from("profiles").select("id, email").in("email", allEmails)
    : { data: [] };

  const emailToId = new Map<string, string>();
  (profileRows ?? []).forEach((p: { id: string; email: string | null }) => {
    if (p.email) emailToId.set(p.email.toLowerCase(), p.id);
  });

  // Fetch athlete profile details for those IDs
  const profileIds = [...emailToId.values()];
  const { data: athleteProfileRows } = profileIds.length
    ? await service
        .from("athlete_profiles")
        .select("id, first_name, last_name, sport, graduation_year")
        .in("id", profileIds)
    : { data: [] };

  const idToDetails = new Map<
    string,
    { first_name: string; last_name: string; sport: string; graduation_year: number }
  >();
  (
    athleteProfileRows ?? []
  ).forEach(
    (a: {
      id: string;
      first_name: string;
      last_name: string;
      sport: string;
      graduation_year: number;
    }) => idToDetails.set(a.id, a)
  );

  // 4. Fetch partnerships for these teams
  const { data: partnershipRows } = await service
    .from("partnerships")
    .select(
      "id, title, deal_type, status, total_value, start_date, end_date, brand_display_name, team_id, season"
    )
    .in("team_id", teamIds)
    .order("created_at", { ascending: false });

  const partnerships = (partnershipRows ?? []) as (TeamDeal & { team_id: string })[];
  const partnershipIds = partnerships.map((p) => p.id);

  // 5. Athlete's participation status in each deal
  const { data: participationRows } = partnershipIds.length
    ? await service
        .from("partnership_participants")
        .select("partnership_id, status")
        .eq("athlete_id", user.id)
        .in("partnership_id", partnershipIds)
    : { data: [] };

  const participationMap = new Map<string, "invited" | "accepted" | "declined">();
  (participationRows ?? []).forEach(
    (p: { partnership_id: string; status: string }) => {
      if (p.status === "invited" || p.status === "accepted" || p.status === "declined") {
        participationMap.set(p.partnership_id, p.status);
      }
    }
  );

  // 6. Deliverables for team partnerships
  const { data: deliverableRows } = partnershipIds.length
    ? await service
        .from("deliverables")
        .select("id, title, description, due_date, status, frequency, partnership_id")
        .in("partnership_id", partnershipIds)
        .order("due_date", { ascending: true })
    : { data: [] };

  const deliverables = (deliverableRows ?? []) as DealDeliverable[];
  const dealTitleMap = new Map(partnerships.map((p) => [p.id, p.title]));
  const deliverablesByDeal = new Map<string, DealDeliverable[]>();
  deliverables.forEach((d) => {
    const list = deliverablesByDeal.get(d.partnership_id) ?? [];
    list.push({ ...d, dealTitle: dealTitleMap.get(d.partnership_id) ?? "Deal" });
    deliverablesByDeal.set(d.partnership_id, list);
  });

  // ─── Assemble per-team data ───────────────────────────────────────────────

  const teamsData = teamProfiles.map((team) => {
    const roster: RosterMember[] = allInvites
      .filter((i) => i.team_id === team.id)
      .map((i) => {
        const email = i.email.toLowerCase();
        const pid = emailToId.get(email);
        const details = pid ? idToDetails.get(pid) : undefined;
        return {
          email,
          first_name: details?.first_name ?? null,
          last_name: details?.last_name ?? null,
          sport: details?.sport ?? null,
          graduation_year: details?.graduation_year ?? null,
          isSelf: email === userEmail,
        };
      })
      .sort((a, b) => {
        // Self first, then alphabetical by last name
        if (a.isSelf) return -1;
        if (b.isSelf) return 1;
        return (a.last_name ?? a.email).localeCompare(b.last_name ?? b.email);
      });

    const deals: TeamDeal[] = partnerships
      .filter((p) => p.team_id === team.id)
      .map((p) => ({
        id: p.id,
        title: p.title,
        deal_type: p.deal_type,
        status: p.status,
        total_value: p.total_value,
        start_date: p.start_date,
        end_date: p.end_date,
        brand_display_name: p.brand_display_name,
        season: p.season,
        myStatus: participationMap.get(p.id) ?? null,
      }));

    return { team, roster, deals };
  });

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#f9fafb] dark:bg-[#0d1117]">
      <DashboardNav
        role="athlete"
        name={`${profile.first_name} ${profile.last_name}`}
      />

      <main className="mx-auto max-w-4xl px-6 py-10 md:px-10">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#1f7ae0]">My Team</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-black dark:text-white">
            Team Roster
          </h1>
          <p className="mt-1 text-sm text-black/45 dark:text-white/40">
            Your team, teammates, and active deals.
          </p>
        </div>

        <div className="space-y-10">
          {teamsData.map(({ team, roster, deals }) => {
            const activeDeals = deals.filter((d) => d.status !== "cancelled");
            const myDelivs = deals.flatMap(
              (d) => deliverablesByDeal.get(d.id) ?? []
            );
            const pendingDelivs = myDelivs.filter(
              (d) => d.status === "pending" || d.status === "submitted"
            );

            return (
              <div key={team.id} className="space-y-6">
                {/* Team header card */}
                <div className="rounded-2xl border border-black/6 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#161b27] dark:shadow-none">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-[#1f7ae0]">
                        {team.sport}
                      </p>
                      <h2 className="mt-1 text-2xl font-black text-black dark:text-white">
                        {team.team_name}
                      </h2>
                      <p className="mt-0.5 text-sm text-black/50 dark:text-white/40">
                        {team.school}
                        {team.division ? ` · ${team.division}` : ""}
                      </p>
                    </div>

                    {/* Manager */}
                    <div className="shrink-0 rounded-xl border border-black/8 bg-[#f9fafb] px-4 py-3 dark:border-white/8 dark:bg-white/[0.04]">
                      <p className="text-xs text-black/40 dark:text-white/35">Team Manager</p>
                      <p className="mt-0.5 text-sm font-semibold text-black dark:text-white">
                        {team.manager_first_name} {team.manager_last_name}
                      </p>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="mt-5 flex gap-6 border-t border-black/5 pt-5 dark:border-white/5">
                    <div>
                      <p className="text-xs text-black/40 dark:text-white/35">Accepted athletes</p>
                      <p className="mt-0.5 text-lg font-black text-black dark:text-white">{roster.length}</p>
                    </div>
                    <div>
                      <p className="text-xs text-black/40 dark:text-white/35">Roster size</p>
                      <p className="mt-0.5 text-lg font-black text-black dark:text-white">{team.num_players}</p>
                    </div>
                    <div>
                      <p className="text-xs text-black/40 dark:text-white/35">Team deals</p>
                      <p className="mt-0.5 text-lg font-black text-black dark:text-white">{activeDeals.length}</p>
                    </div>
                    {pendingDelivs.length > 0 && (
                      <div>
                        <p className="text-xs text-black/40 dark:text-white/35">Pending tasks</p>
                        <p className="mt-0.5 text-lg font-black text-amber-500">{pendingDelivs.length}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Roster */}
                <Section title="Roster">
                  {roster.length === 0 ? (
                    <EmptyState icon="👥" text="No accepted athletes yet." />
                  ) : (
                    <div className="divide-y divide-black/5 dark:divide-white/5">
                      {roster.map((member) => (
                        <div
                          key={member.email}
                          className="flex items-center gap-4 py-3 first:pt-0 last:pb-0"
                        >
                          {/* Avatar circle */}
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1f7ae0]/10 text-sm font-bold text-[#1f7ae0]">
                            {member.first_name
                              ? member.first_name[0].toUpperCase()
                              : member.email[0].toUpperCase()}
                          </div>

                          <div className="min-w-0 flex-1">
                            {member.first_name ? (
                              <>
                                <p className="text-sm font-semibold text-black dark:text-white">
                                  {member.first_name} {member.last_name}
                                  {member.isSelf && (
                                    <span className="ml-2 rounded-full bg-[#1f7ae0]/10 px-2 py-0.5 text-[10px] font-bold text-[#1f7ae0]">
                                      You
                                    </span>
                                  )}
                                </p>
                                <p className="text-xs text-black/40 dark:text-white/35">
                                  {member.sport ?? "Athlete"}
                                  {member.graduation_year
                                    ? ` · Class of ${member.graduation_year}`
                                    : ""}
                                </p>
                              </>
                            ) : (
                              <p className="text-sm text-black/50 dark:text-white/40">
                                {member.email}
                                {member.isSelf && (
                                  <span className="ml-2 rounded-full bg-[#1f7ae0]/10 px-2 py-0.5 text-[10px] font-bold text-[#1f7ae0]">
                                    You
                                  </span>
                                )}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>

                {/* Team Deals */}
                <Section title="Team Deals">
                  {activeDeals.length === 0 ? (
                    <EmptyState
                      icon="🤝"
                      text="No team deals yet."
                      sub="When your team manager creates a deal, it will appear here."
                    />
                  ) : (
                    <div className="space-y-3">
                      {activeDeals.map((deal) => (
                        <Link
                          key={deal.id}
                          href={`/dashboard/athlete-dashboard/deals/${deal.id}`}
                          className="flex items-center gap-4 rounded-xl border border-black/5 bg-[#f9fafb] px-4 py-3 transition hover:border-black/10 hover:bg-black/[0.02] dark:border-white/8 dark:bg-white/[0.04] dark:hover:border-white/15 dark:hover:bg-white/[0.07]"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-black dark:text-white">
                              {deal.title}
                            </p>
                            <p className="mt-0.5 text-xs text-black/40 dark:text-white/35">
                              {deal.brand_display_name ?? "Brand deal"}
                              {deal.deal_type
                                ? ` · ${DEAL_CATEGORY_LABELS[deal.deal_type] ?? deal.deal_type}`
                                : ""}
                              {deal.season ? ` · ${deal.season}` : ""}
                              {deal.start_date ? ` · Started ${formatDate(deal.start_date)}` : ""}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                            {deal.myStatus === "invited" && (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                                Opt in needed
                              </span>
                            )}
                            {deal.myStatus === "accepted" && (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                                Opted in
                              </span>
                            )}
                            {deal.total_value != null && deal.total_value > 0 && (
                              <span className="text-sm font-semibold text-black dark:text-white">
                                {formatCurrency(deal.total_value)}
                              </span>
                            )}
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                DEAL_STATUS_COLORS[
                                  deal.status as keyof typeof DEAL_STATUS_COLORS
                                ] ?? ""
                              }`}
                            >
                              {deal.status}
                            </span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </Section>

                {/* Deliverables */}
                {myDelivs.length > 0 && (
                  <Section title="My Deliverables">
                    <div className="space-y-3">
                      {myDelivs.map((d) => (
                        <div
                          key={d.id}
                          className="rounded-xl border border-black/5 bg-[#f9fafb] px-4 py-3 dark:border-white/8 dark:bg-white/[0.04]"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-black dark:text-white">
                                {d.title}
                              </p>
                              <p className="mt-0.5 text-xs text-black/40 dark:text-white/35">
                                {d.dealTitle}
                                {" · "}
                                {DELIVERABLE_FREQUENCY_LABELS[
                                  d.frequency as keyof typeof DELIVERABLE_FREQUENCY_LABELS
                                ] ?? d.frequency}
                                {d.due_date ? ` · Due ${formatDate(d.due_date)}` : ""}
                              </p>
                              {d.description && (
                                <p className="mt-1 text-xs text-black/50 dark:text-white/40">
                                  {d.description}
                                </p>
                              )}
                            </div>
                            <DeliverableStatusBadge status={d.status} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-black/6 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#161b27] dark:shadow-none">
      <h2 className="mb-5 text-xs font-bold uppercase tracking-wider text-black/40 dark:text-white/35">
        {title}
      </h2>
      {children}
    </div>
  );
}

function EmptyState({
  icon,
  text,
  sub,
}: {
  icon: string;
  text: string;
  sub?: string;
}) {
  return (
    <div className="py-6 text-center">
      <div className="mb-2 text-3xl">{icon}</div>
      <p className="text-sm font-medium text-black/50 dark:text-white/45">{text}</p>
      {sub && <p className="mt-1 text-xs text-black/30 dark:text-white/25">{sub}</p>}
    </div>
  );
}

const DELIVERABLE_STATUS_STYLES: Record<string, string> = {
  pending:
    "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/25 dark:text-yellow-400",
  submitted:
    "bg-blue-50 text-blue-700 dark:bg-blue-900/25 dark:text-blue-400",
  approved:
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-400",
  rejected:
    "bg-red-50 text-red-600 dark:bg-red-900/25 dark:text-red-400",
};

function DeliverableStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
        DELIVERABLE_STATUS_STYLES[status] ?? "bg-black/8 text-black/50 dark:bg-white/8 dark:text-white/45"
      }`}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
