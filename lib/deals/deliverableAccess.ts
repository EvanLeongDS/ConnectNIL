import { createClient, createServiceClient } from "@/lib/supabase/server";

type ServiceClient = ReturnType<typeof createServiceClient>;

export type ProofSubmissionAccess =
  | {
      ok: true;
      userId: string;
      role: "athlete" | "team-manager";
      service: ServiceClient;
      deliverable: { id: string; status: string };
    }
  | { ok: false; status: number; error: string };

/**
 * Single source of truth for "may this caller attach proof to this deliverable?"
 *
 * Called by BOTH the presign route and the submit route. Do NOT inline or copy this: the
 * presign route hands out a credential that can write to S3, so it must run exactly the
 * same checks as the route that commits the result. A copy would drift.
 *
 * Extracted verbatim from the original submit route so status codes and messages are
 * unchanged:
 *   401 "Unauthorized"
 *   403 "Forbidden"
 *   403 "You don't have access to this deal or it is not active."
 *   404 "Deliverable not found."
 *   409 "This deliverable cannot be submitted in its current state."
 *
 * Note the deliberate split of clients: partnership/participant lookups go through the
 * cookie-backed anon client so RLS is enforced, while the deliverable lookup uses the
 * service client. That asymmetry is intentional and predates this refactor.
 */
export async function authorizeProofSubmission(
  partnershipId: string,
  deliverableId: string
): Promise<ProofSubmissionAccess> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) return { ok: false, status: 401, error: "Unauthorized" };

  const role = user.user_metadata?.role as string | undefined;
  if (role !== "athlete" && role !== "team-manager") {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  const service = createServiceClient();

  let hasAccess = false;
  if (role === "team-manager") {
    const { data } = await supabase
      .from("partnerships")
      .select("id, status")
      .eq("id", partnershipId)
      .eq("team_id", user.id)
      .maybeSingle();
    hasAccess = !!data && data.status === "active";
  } else {
    const { data: directDeal } = await supabase
      .from("partnerships")
      .select("id, status")
      .eq("id", partnershipId)
      .eq("athlete_id", user.id)
      .maybeSingle();
    if (directDeal?.status === "active") {
      hasAccess = true;
    } else {
      const { data: pp } = await supabase
        .from("partnership_participants")
        .select("id")
        .eq("partnership_id", partnershipId)
        .eq("athlete_id", user.id)
        .eq("status", "accepted")
        .maybeSingle();
      if (pp) {
        const { data: dealData } = await supabase
          .from("partnerships")
          .select("status")
          .eq("id", partnershipId)
          .maybeSingle();
        hasAccess = dealData?.status === "active";
      }
    }
  }

  if (!hasAccess) {
    return {
      ok: false,
      status: 403,
      error: "You don't have access to this deal or it is not active.",
    };
  }

  const { data: deliverable } = await service
    .from("deliverables")
    .select("id, status, partnership_id")
    .eq("id", deliverableId)
    .eq("partnership_id", partnershipId)
    .maybeSingle();

  if (!deliverable) return { ok: false, status: 404, error: "Deliverable not found." };
  if (deliverable.status !== "pending" && deliverable.status !== "rejected") {
    return {
      ok: false,
      status: 409,
      error: "This deliverable cannot be submitted in its current state.",
    };
  }

  return {
    ok: true,
    userId: user.id,
    role,
    service,
    deliverable: { id: deliverable.id, status: deliverable.status },
  };
}
