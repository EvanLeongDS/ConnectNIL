import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import DashboardNav from "@/components/dashboard/DashboardNav";
import EditDealForm, { type EditDealInitial } from "@/components/deals/EditDealForm";
import type { DealRow, DeliverableRow, PaymentType } from "@/lib/deals/types";

interface Props {
  params: Promise<{ id: string }>;
}

function isPaymentType(v: string | null | undefined): v is PaymentType {
  return v === "one_time" || v === "monthly" || v === "per_deliverable";
}

export default async function BrandEditDealPage({ params }: Props) {
  const { id } = await params;
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

  const { data: deal } = await supabase
    .from("partnerships")
    .select("*")
    .eq("id", id)
    .eq("brand_id", user.id)
    .maybeSingle();

  if (!deal) notFound();
  const d = deal as DealRow;
  if (d.status !== "pending") {
    redirect(`/dashboard/brand-dashboard/deals/${id}`);
  }

  const { data: deliverableRows } = await supabase
    .from("deliverables")
    .select("id, title, description, due_date, frequency")
    .eq("partnership_id", id)
    .order("created_at");

  const name =
    profile.company_name ||
    `${profile.first_name} ${profile.last_name}`.trim() ||
    "Brand";

  const paymentType = isPaymentType(d.payment_type) ? d.payment_type : "one_time";

  const initial: EditDealInitial = {
    title: d.title,
    description: d.description ?? "",
    season: d.season ?? "",
    dealType: d.deal_type ?? "",
    totalValue: d.total_value != null ? String(d.total_value) : "",
    paymentType,
    paymentTerms: d.payment_terms ?? "Payment within 5 business days of signing.",
    startDate: d.start_date ?? "",
    endDate: d.end_date ?? "",
    nilUseDescription: d.nil_use_description ?? "",
    exclusivityClause: d.exclusivity_clause ?? "",
    requiresOptIn: Boolean(d.requires_opt_in),
  };

  return (
    <div className="min-h-screen bg-[#f9fafb] dark:bg-[#0d1117]">
      <DashboardNav role="brand-manager" name={name} />
      <main className="mx-auto max-w-2xl px-6 py-10 md:px-10">
        <div className="mb-8">
          <div className="mb-4 flex items-center gap-2 text-sm">
            <Link
              href={`/dashboard/brand-dashboard/deals/${id}`}
              className="text-black/40 hover:text-black dark:text-white/35 dark:hover:text-white"
            >
              Deal
            </Link>
            <span className="text-black/25 dark:text-white/20">/</span>
            <span className="text-black/60 dark:text-white/50">Edit</span>
          </div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[#1f7ae0]">Brand Deals</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-black dark:text-white">Edit proposal</h1>
          <p className="mt-1 text-sm text-black/45 dark:text-white/40">
            Changes apply while the team is still reviewing. You cannot edit after the team accepts or declines.
          </p>
        </div>

        <EditDealForm
          dealId={id}
          teamDisplayName={d.team_display_name ?? "Team"}
          initial={initial}
          initialDeliverables={(deliverableRows ?? []) as Pick<
            DeliverableRow,
            "id" | "title" | "description" | "due_date" | "frequency"
          >[]}
        />
      </main>
    </div>
  );
}
