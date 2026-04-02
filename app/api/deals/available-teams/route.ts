import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.user_metadata?.role !== "brand-manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const service = createServiceClient();

  const [{ data: inbound }, { data: outbound }] = await Promise.all([
    service
      .from("discovery_interests")
      .select("viewer_id")
      .eq("subject_id", user.id)
      .eq("subject_type", "brand")
      .eq("viewer_role", "team-manager")
      .in("response", ["committed", "exploring"]),
    service
      .from("discovery_interests")
      .select("subject_id")
      .eq("viewer_id", user.id)
      .eq("viewer_role", "brand-manager")
      .eq("subject_type", "team")
      .in("response", ["committed", "exploring"]),
  ]);

  const teamIds = [
    ...(inbound?.map((r) => r.viewer_id as string) ?? []),
    ...(outbound?.map((r) => r.subject_id as string) ?? []),
  ];
  const uniqueIds = [...new Set(teamIds)];

  if (uniqueIds.length === 0) return NextResponse.json({ teams: [] });

  const { data: teams } = await service
    .from("team_profiles")
    .select("id, school, team_name, sport, division, manager_first_name, manager_last_name")
    .in("id", uniqueIds)
    .eq("onboarding_complete", true);

  return NextResponse.json({ teams: teams ?? [] });
}
