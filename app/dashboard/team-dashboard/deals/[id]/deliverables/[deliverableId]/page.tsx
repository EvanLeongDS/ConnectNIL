import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import DashboardNav from "@/components/dashboard/DashboardNav";
import DeliverableProofForm from "@/components/deals/DeliverableProofForm";
import type { DealRow } from "@/lib/deals/types";

interface Props {
  params: Promise<{ id: string; deliverableId: string }>;
}

export default async function TeamDeliverableProofPage({ params }: Props) {
  const { id: dealId, deliverableId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.user_metadata?.role !== "team-manager") redirect("/dashboard");

  const { data: profile } = await supabase
    .from("team_profiles")
    .select("team_name, school, manager_first_name, manager_last_name")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) redirect("/onboarding/team-manager");

  const { data: deal } = await supabase
    .from("partnerships")
    .select("*")
    .eq("id", dealId)
    .eq("team_id", user.id)
    .maybeSingle();
  if (!deal) notFound();
  const d = deal as DealRow;

  if (d.status !== "active") {
    redirect(`/dashboard/team-dashboard/deals/${dealId}`);
  }

  const { data: row } = await supabase
    .from("deliverables")
    .select("id, title, status, partnership_id")
    .eq("id", deliverableId)
    .eq("partnership_id", dealId)
    .maybeSingle();

  if (!row) notFound();
  if (row.status !== "pending" && row.status !== "rejected") {
    redirect(`/dashboard/team-dashboard/deals/${dealId}`);
  }

  const managerName = `${profile.manager_first_name} ${profile.manager_last_name}`.trim();
  const dealHref = `/dashboard/team-dashboard/deals/${dealId}`;
  const successHref = `${dealHref}?proof=submitted`;

  return (
    <div className="min-h-screen bg-[#f9fafb] dark:bg-[#0d1117]">
      <DashboardNav role="team-manager" name={managerName} />
      <main className="mx-auto max-w-2xl px-6 py-10 md:px-10">
        <div className="mb-6 flex items-center gap-2 text-sm">
          <Link
            href="/dashboard/team-dashboard/deals"
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

        <div className="mb-6 overflow-hidden rounded-2xl border border-black/8 bg-white p-8 shadow-sm dark:border-white/8 dark:bg-[#161b27]">
          <p className="text-xs font-bold uppercase tracking-widest text-[#1f7ae0]">Proof of deliverable</p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-black dark:text-white">
            Upload images & description
          </h1>
          <p className="mt-2 text-sm text-black/50 dark:text-white/40">
            Submit on behalf of your team: at least 150 characters describing what was completed, plus at least one
            image (screenshots, photos, etc.).
          </p>
        </div>

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
