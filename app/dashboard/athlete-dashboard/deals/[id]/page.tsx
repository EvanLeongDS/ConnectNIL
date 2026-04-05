import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import DashboardNav from "@/components/dashboard/DashboardNav";
import AthleteDealOptIn from "@/components/deals/AthleteDealOptIn";
import {
  DealRow,
  DeliverableRow,
  DeliverableFrequency,
  DELIVERABLE_FREQUENCY_LABELS,
  DEAL_CATEGORY_LABELS,
  PAYMENT_TYPE_LABELS,
  formatCurrency,
  formatDate,
} from "@/lib/deals/types";

function normalizeFrequency(f: string | null | undefined): DeliverableFrequency {
  if (f === "daily" || f === "weekly" || f === "monthly" || f === "season" || f === "one_time") return f;
  return "one_time";
}

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AthleteDealDetailPage({ params }: Props) {
  const { id } = await params;
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

  const { data: deal } = await supabase.from("partnerships").select("*").eq("id", id).maybeSingle();
  if (!deal) notFound();

  const d = deal as DealRow;

  const isDirectAthlete = d.athlete_id === user.id;
  const { data: participation } = await supabase
    .from("partnership_participants")
    .select("status")
    .eq("partnership_id", id)
    .eq("athlete_id", user.id)
    .maybeSingle();

  if (!isDirectAthlete && !participation) notFound();

  const { data: deliverableRows } = await supabase
    .from("deliverables")
    .select("id, title, description, due_date, frequency, status, created_at")
    .eq("partnership_id", id)
    .order("created_at");

  const deliverables = (deliverableRows ?? []) as DeliverableRow[];
  const athleteName = `${profile.first_name} ${profile.last_name}`.trim();
  const showTeamOptIn = Boolean(participation && d.team_id);

  return (
    <div className="min-h-screen bg-[#f9fafb] dark:bg-[#0d1117]">
      <DashboardNav role="athlete" name={athleteName} />
      <main className="mx-auto max-w-3xl px-6 py-10 md:px-10">
        <div className="mb-6 flex items-center gap-2 text-sm">
          <Link
            href="/dashboard/athlete-dashboard/deals"
            className="text-black/40 hover:text-black dark:text-white/35 dark:hover:text-white"
          >
            Deals
          </Link>
          <span className="text-black/25 dark:text-white/20">/</span>
          <span className="text-black/60 dark:text-white/50">{d.title}</span>
        </div>

        <div className="overflow-hidden rounded-2xl border border-black/8 bg-white shadow-sm dark:border-white/8 dark:bg-[#161b27]">
          <div className="border-b border-black/6 bg-black/2 px-8 py-6 dark:border-white/6 dark:bg-white/3">
            <p className="text-xs font-bold uppercase tracking-widest text-black/35 dark:text-white/30">
              {d.team_id ? "Team NIL partnership" : "Your NIL partnership"}
            </p>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-black dark:text-white">{d.title}</h1>
            {d.description && (
              <p className="mt-1.5 text-sm leading-relaxed text-black/55 dark:text-white/45">{d.description}</p>
            )}
          </div>

          <div className="divide-y divide-black/5 dark:divide-white/5">
            <ContractSection label="Parties">
              <ContractRow k="Brand" v={d.brand_display_name ?? "—"} />
              {d.team_display_name && <ContractRow k="Team" v={d.team_display_name} />}
              {d.season && <ContractRow k="Season" v={d.season} />}
              {d.deal_type && (
                <ContractRow k="Category" v={DEAL_CATEGORY_LABELS[d.deal_type] ?? d.deal_type} />
              )}
            </ContractSection>

            <ContractSection label="Term">
              <ContractRow k="From" v={formatDate(d.start_date)} />
              <ContractRow k="Through" v={formatDate(d.end_date)} />
            </ContractSection>

            <ContractSection label="Compensation">
              <ContractRow k="Total value" v={formatCurrency(d.total_value)} />
              <ContractRow k="Payment" v={PAYMENT_TYPE_LABELS[d.payment_type] ?? d.payment_type} />
            </ContractSection>

            {deliverables.length > 0 && (
              <ContractSection label="Deliverables">
                <ol className="space-y-2">
                  {deliverables.map((del, i) => {
                    const freq = normalizeFrequency(del.frequency);
                    return (
                      <li key={del.id} className="text-sm text-black/70 dark:text-white/60">
                        <span className="font-semibold text-black dark:text-white">{i + 1}.</span>{" "}
                        <span className="text-[11px] font-bold uppercase tracking-wide text-[#1f7ae0] dark:text-[#8ec5ff]">
                          {DELIVERABLE_FREQUENCY_LABELS[freq]}
                        </span>{" "}
                        {del.title}
                      </li>
                    );
                  })}
                </ol>
              </ContractSection>
            )}

            {(d.brand_signer_name || d.team_signer_name || d.brand_signed_at || d.team_signed_at) && (
              <ContractSection label="Signatures">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase text-black/35 dark:text-white/30">Brand</p>
                    {d.brand_signer_name && (
                      <p className="mt-1 text-sm font-medium text-black dark:text-white">{d.brand_signer_name}</p>
                    )}
                    {d.brand_signed_at && (
                      <p className="text-xs text-black/40 dark:text-white/35">{formatDate(d.brand_signed_at)}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-black/35 dark:text-white/30">Team</p>
                    {d.team_signer_name && (
                      <p className="mt-1 text-sm font-medium text-black dark:text-white">{d.team_signer_name}</p>
                    )}
                    {d.team_signed_at && (
                      <p className="text-xs text-black/40 dark:text-white/35">{formatDate(d.team_signed_at)}</p>
                    )}
                  </div>
                </div>
              </ContractSection>
            )}
          </div>
        </div>

        {showTeamOptIn && participation && (
          <div className="mt-8">
            <AthleteDealOptIn dealId={id} status={participation.status as "invited" | "accepted" | "declined"} />
          </div>
        )}
      </main>
    </div>
  );
}

function ContractSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-8 py-5">
      <p className="mb-3 text-xs font-bold uppercase tracking-widest text-black/35 dark:text-white/30">{label}</p>
      {children}
    </div>
  );
}

function ContractRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-4 py-0.5 text-sm">
      <span className="w-32 shrink-0 text-black/40 dark:text-white/35">{k}</span>
      <span className="font-medium text-black/80 dark:text-white/70">{v}</span>
    </div>
  );
}
