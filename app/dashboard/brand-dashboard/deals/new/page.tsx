import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardNav from "@/components/dashboard/DashboardNav";
import ProposeDealForm from "@/components/deals/ProposeDealForm";
import Link from "next/link";

interface Props {
  searchParams: Promise<{ teamId?: string; teamName?: string }>;
}

export default async function NewDealPage({ searchParams }: Props) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.user_metadata?.role !== "brand-manager") redirect("/dashboard");

  const { data: profile } = await supabase
    .from("brand_profiles")
    .select("company_name, first_name, last_name")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) redirect("/onboarding/brand-manager");

  const params = await searchParams;
  const preselectedTeamId = params.teamId?.trim() || undefined;
  const preselectedTeamName = params.teamName
    ? decodeURIComponent(params.teamName)
    : undefined;

  const name =
    profile.company_name ||
    `${profile.first_name} ${profile.last_name}`.trim() ||
    "Brand";

  return (
    <div className="min-h-screen bg-[#f9fafb] dark:bg-[#0d1117]">
      <DashboardNav role="brand-manager" name={name} />
      <main className="mx-auto max-w-2xl px-6 py-10 md:px-10">
        {/* The wizard's own footer only shows "Back" from step 2 onward, so step 1 had no
            exit at all except the top nav. */}
        <div className="mb-6 flex items-center gap-2 text-sm">
          <Link
            href="/dashboard/brand-dashboard/deals"
            className="text-black/40 hover:text-black dark:text-white/35 dark:hover:text-white"
          >
            Deals
          </Link>
          <span className="text-black/25 dark:text-white/20">/</span>
          <span className="text-black/60 dark:text-white/50">New proposal</span>
        </div>

        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#1f7ae0]">
            Brand Deals
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-black dark:text-white">
            Propose a deal
          </h1>
          <p className="mt-1 text-sm text-black/45 dark:text-white/40">
            Build your NIL partnership agreement step by step. The team manager will review and accept or decline.
          </p>
        </div>

        <ProposeDealForm
          preselectedTeamId={preselectedTeamId}
          preselectedTeamName={preselectedTeamName}
        />
      </main>
    </div>
  );
}
