import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import DashboardNav from "@/components/dashboard/DashboardNav";
import {
  DELIVERABLE_FREQUENCY_LABELS,
  DeliverableFrequency,
  formatDate,
} from "@/lib/deals/types";

const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  pending:   { label: "Pending",   cls: "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/25 dark:text-yellow-400" },
  submitted: { label: "Submitted", cls: "bg-blue-50 text-blue-700 dark:bg-blue-900/25 dark:text-blue-400" },
  approved:  { label: "Approved",  cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-400" },
  rejected:  { label: "Rejected",  cls: "bg-red-50 text-red-600 dark:bg-red-900/25 dark:text-red-400" },
};

function normalizeFrequency(f: string | null | undefined): DeliverableFrequency {
  if (f === "daily" || f === "weekly" || f === "monthly" || f === "season" || f === "one_time") return f;
  return "one_time";
}

interface DeliverableRow {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  frequency: string | null;
  status: string;
  partnership_id: string;
}

interface DealInfo {
  id: string;
  title: string;
  brand_display_name: string | null;
  team_display_name: string | null;
}

export default async function AthleteDeliverablesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
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

  // Direct active deals
  const { data: directRows } = await supabase
    .from("partnerships")
    .select("id, title, brand_display_name, team_display_name")
    .eq("athlete_id", user.id)
    .eq("status", "active");

  const directDeals = (directRows ?? []) as DealInfo[];
  const directIds = new Set(directDeals.map((d) => d.id));

  // Accepted team deals
  const { data: teamInviteRows } = await service
    .from("team_athlete_invitations")
    .select("team_id")
    .eq("email", userEmail)
    .not("accepted_at", "is", null);

  const myTeamIds = (teamInviteRows ?? []).map((r: { team_id: string }) => r.team_id);

  let teamDeals: DealInfo[] = [];
  if (myTeamIds.length > 0) {
    const { data: teamDealRows } = await service
      .from("partnerships")
      .select("id, title, brand_display_name, team_display_name")
      .in("team_id", myTeamIds)
      .eq("status", "active");

    const allTeamDeals = (teamDealRows ?? []).filter(
      (r: { id: string }) => !directIds.has(r.id)
    ) as DealInfo[];

    const teamDealIds = allTeamDeals.map((d) => d.id);
    const { data: partRows } = teamDealIds.length
      ? await supabase
          .from("partnership_participants")
          .select("partnership_id, status")
          .eq("athlete_id", user.id)
          .eq("status", "accepted")
          .in("partnership_id", teamDealIds)
      : { data: [] };

    const acceptedIds = new Set(
      (partRows ?? []).map((p: { partnership_id: string }) => p.partnership_id)
    );
    teamDeals = allTeamDeals.filter((d) => acceptedIds.has(d.id));
  }

  const allDeals = [...directDeals, ...teamDeals];
  const allDealIds = allDeals.map((d) => d.id);
  const dealMap = new Map(allDeals.map((d) => [d.id, d]));

  const { data: deliverableRows } = allDealIds.length
    ? await service
        .from("deliverables")
        .select("id, title, description, due_date, frequency, status, partnership_id")
        .in("partnership_id", allDealIds)
        .order("due_date", { ascending: true })
    : { data: [] };

  const deliverables = (deliverableRows ?? []) as DeliverableRow[];

  const pending   = deliverables.filter((d) => d.status === "pending");
  const submitted = deliverables.filter((d) => d.status === "submitted");
  const approved  = deliverables.filter((d) => d.status === "approved");
  const rejected  = deliverables.filter((d) => d.status === "rejected");

  const athleteName = `${profile.first_name} ${profile.last_name}`.trim();

  const submitHref = (d: DeliverableRow) =>
    `/dashboard/athlete-dashboard/deals/${d.partnership_id}/deliverables/${d.id}`;
  const dealHref = (d: DeliverableRow) =>
    `/dashboard/athlete-dashboard/deals/${d.partnership_id}`;

  return (
    <div className="min-h-screen bg-[#f9fafb] dark:bg-[#0d1117]">
      <DashboardNav role="athlete" name={athleteName} />
      <main className="mx-auto max-w-3xl px-6 py-10 md:px-10">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#1f7ae0]">My Deliverables</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-black dark:text-white">Deliverables</h1>
          <p className="mt-1 text-sm text-black/45 dark:text-white/40">
            All deliverables across your active deals.
          </p>
        </div>

        {/* Summary stats */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: "Pending",   value: pending.length,   cls: "text-yellow-600 dark:text-yellow-400" },
            { label: "Submitted", value: submitted.length, cls: "text-blue-600 dark:text-blue-400" },
            { label: "Approved",  value: approved.length,  cls: "text-emerald-600 dark:text-emerald-400" },
            { label: "Rejected",  value: rejected.length,  cls: "text-red-600 dark:text-red-400" },
          ].map(({ label, value, cls }) => (
            <div key={label} className="rounded-2xl border border-black/6 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#161b27]">
              <p className="text-xs text-black/40 dark:text-white/35">{label}</p>
              <p className={`mt-1 text-2xl font-black ${cls}`}>{value}</p>
            </div>
          ))}
        </div>

        {deliverables.length === 0 ? (
          <div className="rounded-2xl border border-black/6 bg-white py-16 text-center shadow-sm dark:border-white/10 dark:bg-[#161b27]">
            <p className="text-4xl">📋</p>
            <p className="mt-3 font-semibold text-black/60 dark:text-white/50">No deliverables yet</p>
            <p className="mt-1 text-sm text-black/35 dark:text-white/30">
              Deliverables will appear here once you have active deals.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {[
              { title: "Action Required", items: [...rejected, ...pending], actionable: true },
              { title: "Submitted — Awaiting Review", items: submitted, actionable: false },
              { title: "Approved", items: approved, actionable: false },
            ]
              .filter(({ items }) => items.length > 0)
              .map(({ title, items, actionable }) => (
                <section key={title}>
                  <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-black/35 dark:text-white/30">
                    {title}
                  </h2>
                  <div className="overflow-hidden rounded-2xl border border-black/8 bg-white shadow-sm dark:border-white/8 dark:bg-[#161b27]">
                    <div className="divide-y divide-black/5 dark:divide-white/5">
                      {items.map((del) => {
                        const freq = normalizeFrequency(del.frequency);
                        const statusInfo = STATUS_STYLES[del.status] ?? STATUS_STYLES.pending;
                        const deal = dealMap.get(del.partnership_id);
                        const canSubmit = actionable && (del.status === "pending" || del.status === "rejected");
                        return (
                          <div key={del.id} className="flex items-start gap-4 px-6 py-5">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-semibold text-black dark:text-white">{del.title}</p>
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusInfo.cls}`}>
                                  {statusInfo.label}
                                </span>
                              </div>
                              {deal && (
                                <Link
                                  href={dealHref(del)}
                                  className="mt-0.5 block text-xs text-[#1f7ae0] hover:underline"
                                >
                                  {deal.title}
                                  {deal.brand_display_name ? ` · ${deal.brand_display_name}` : ""}
                                </Link>
                              )}
                              {del.description && (
                                <p className="mt-1 text-sm text-black/55 dark:text-white/45">{del.description}</p>
                              )}
                              <p className="mt-0.5 text-xs text-black/40 dark:text-white/35">
                                {DELIVERABLE_FREQUENCY_LABELS[freq]}
                                {del.due_date ? ` · Due ${formatDate(del.due_date)}` : ""}
                              </p>
                            </div>
                            {canSubmit && (
                              <Link
                                href={submitHref(del)}
                                className="shrink-0 rounded-lg bg-[#1f7ae0] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1a6bc9]"
                              >
                                {del.status === "rejected" ? "Resubmit" : "Submit proof"}
                              </Link>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </section>
              ))}
          </div>
        )}
      </main>
    </div>
  );
}
