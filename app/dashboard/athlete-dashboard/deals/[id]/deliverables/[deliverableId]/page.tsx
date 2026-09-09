import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import DashboardNav from "@/components/dashboard/DashboardNav";
import DeliverableProofForm from "@/components/deals/DeliverableProofForm";
import type { DealRow } from "@/lib/deals/types";
import { isAwaitingSubmission } from "@/lib/deals/types";

interface Props {
  params: Promise<{ id: string; deliverableId: string }>;
}

export default async function AthleteDeliverableProofPage({ params }: Props) {
  const { id: dealId, deliverableId } = await params;
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

  // Service client bypasses RLS — deal may only be accessible via team roster
  const service = createServiceClient();
  const { data: deal } = await service
    .from("partnerships")
    .select("*")
    .eq("id", dealId)
    .maybeSingle();
  if (!deal) notFound();
  const d = deal as DealRow;

  const isDirectAthlete = d.athlete_id === user.id;
  const { data: participation } = await supabase
    .from("partnership_participants")
    .select("status")
    .eq("partnership_id", dealId)
    .eq("athlete_id", user.id)
    .maybeSingle();

  // Check team membership for athletes not yet in partnership_participants
  let isOnTeam = false;
  if (!isDirectAthlete && !participation && d.team_id) {
    const userEmail = user.email?.toLowerCase();
    if (userEmail) {
      const { data: invite } = await service
        .from("team_athlete_invitations")
        .select("id")
        .eq("team_id", d.team_id)
        .eq("email", userEmail)
        .not("accepted_at", "is", null)
        .maybeSingle();
      isOnTeam = !!invite;
    }
  }

  if (!isDirectAthlete && !participation && !isOnTeam) notFound();

  const canSubmit =
    d.status === "active" &&
    (isDirectAthlete || participation?.status === "accepted");

  if (!canSubmit) {
    redirect(`/dashboard/athlete-dashboard/deals/${dealId}`);
  }

  const { data: row } = await service
    .from("deliverables")
    .select("id, title, description, due_date, frequency, status, partnership_id")
    .eq("id", deliverableId)
    .eq("partnership_id", dealId)
    .maybeSingle();

  if (!row) notFound();
  if (!isAwaitingSubmission(row.status)) {
    redirect(`/dashboard/athlete-dashboard/deals/${dealId}`);
  }

  const athleteName = `${profile.first_name} ${profile.last_name}`.trim();
  const dealHref = `/dashboard/athlete-dashboard/deals/${dealId}`;
  const successHref = `${dealHref}?proof=submitted`;

  return (
    <div className="min-h-screen bg-[#f9fafb] dark:bg-[#0d1117]">
      <DashboardNav role="athlete" name={athleteName} />
      <main className="mx-auto max-w-2xl px-6 py-10 md:px-10">
        {/* Breadcrumb */}
        <div className="mb-6 flex items-center gap-2 text-sm">
          <Link
            href="/dashboard/athlete-dashboard/deals"
            className="text-black/40 hover:text-black dark:text-white/35 dark:hover:text-white"
          >
            Deals
          </Link>
          <span className="text-black/25 dark:text-white/20">/</span>
          <Link
            href={dealHref}
            className="text-black/40 hover:text-black dark:text-white/35 dark:hover:text-white"
          >
            {d.title}
          </Link>
          <span className="text-black/25 dark:text-white/20">/</span>
          <span className="text-black/60 dark:text-white/50">Submit proof</span>
        </div>

        {/* Header */}
        <div className="mb-6 overflow-hidden rounded-2xl border border-black/8 bg-white p-8 shadow-sm dark:border-white/8 dark:bg-[#161b27]">
          <p className="text-xs font-bold uppercase tracking-widest text-[#1f7ae0]">
            Proof of deliverable
          </p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-black dark:text-white">
            {row.title}
          </h1>
          {row.description && (
            <p className="mt-1.5 text-sm leading-relaxed text-black/55 dark:text-white/45">
              {row.description}
            </p>
          )}
          {row.due_date && (
            <p className="mt-2 text-xs font-medium text-black/45 dark:text-white/35">
              Due{" "}
              {new Date(row.due_date).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          )}
          {row.status === "rejected" && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-300">
              This deliverable was rejected. Please address the brand&apos;s feedback and resubmit.
            </div>
          )}
        </div>

        {/* Form */}
        <div className="rounded-2xl border border-black/8 bg-white p-8 shadow-sm dark:border-white/8 dark:bg-[#161b27]">
          <DeliverableProofForm
            dealId={dealId}
            deliverableId={deliverableId}
            deliverableTitle={row.title}
            successHref={successHref}
            cancelHref={dealHref}
          />
        </div>
      </main>
    </div>
  );
}
