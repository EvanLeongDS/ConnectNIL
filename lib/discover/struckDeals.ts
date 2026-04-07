import type { SupabaseClient } from "@supabase/supabase-js";

const STRUCK_STATUSES = ["active", "completed"] as const;

/** Brand IDs the team already has an active or completed partnership with. */
export async function getStruckBrandIdsForTeam(
  service: SupabaseClient,
  teamManagerId: string
): Promise<Set<string>> {
  const { data, error } = await service
    .from("partnerships")
    .select("brand_id")
    .eq("team_id", teamManagerId)
    .in("status", [...STRUCK_STATUSES]);

  if (error) {
    console.error("getStruckBrandIdsForTeam:", error);
    return new Set();
  }
  return new Set((data ?? []).map((r) => r.brand_id as string).filter(Boolean));
}

/** Team manager IDs the brand already has an active or completed partnership with. */
export async function getStruckTeamIdsForBrand(
  service: SupabaseClient,
  brandManagerId: string
): Promise<Set<string>> {
  const { data, error } = await service
    .from("partnerships")
    .select("team_id")
    .eq("brand_id", brandManagerId)
    .in("status", [...STRUCK_STATUSES])
    .not("team_id", "is", null);

  if (error) {
    console.error("getStruckTeamIdsForBrand:", error);
    return new Set();
  }
  return new Set((data ?? []).map((r) => r.team_id as string).filter(Boolean));
}
