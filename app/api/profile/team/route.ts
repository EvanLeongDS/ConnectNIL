import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const PREFERRED_DEALS = ["social_media", "events", "content_creation"] as const;

const AVAILABILITY = ["low", "medium", "high"] as const;

function isValidPhone(val: string) {
  return /^[\d\s\-().+]{7,15}$/.test(val.trim());
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.user_metadata?.role !== "team-manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const school = typeof body.school === "string" ? body.school.trim() : "";
  const teamName = typeof body.teamName === "string" ? body.teamName.trim() : "";
  const sport = typeof body.sport === "string" ? body.sport.trim() : "";
  const divisionRaw = typeof body.division === "string" ? body.division.trim() : "";
  const division = divisionRaw || null;
  const numPlayers =
    typeof body.numPlayers === "number" ? body.numPlayers : parseInt(String(body.numPlayers ?? ""), 10);
  const managerFirstName = typeof body.managerFirstName === "string" ? body.managerFirstName.trim() : "";
  const managerLastName = typeof body.managerLastName === "string" ? body.managerLastName.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const interestedBrands = body.interestedBrands as string[] | undefined;
  const preferredDeals = body.preferredDeals as string[] | undefined;
  const availability = typeof body.availability === "string" ? body.availability.trim() : "";

  if (!school) return NextResponse.json({ error: "School is required." }, { status: 400 });
  if (!teamName) return NextResponse.json({ error: "Team name is required." }, { status: 400 });
  if (!sport || sport.length < 2 || sport.length > 80) {
    return NextResponse.json({ error: "Enter a valid sport." }, { status: 400 });
  }
  if (!Number.isFinite(numPlayers) || numPlayers < 1 || numPlayers > 200) {
    return NextResponse.json({ error: "Enter a valid roster size (1–200)." }, { status: 400 });
  }
  if (!managerFirstName) return NextResponse.json({ error: "First name is required." }, { status: 400 });
  if (!managerLastName) return NextResponse.json({ error: "Last name is required." }, { status: 400 });
  if (!isValidPhone(phone)) return NextResponse.json({ error: "Valid phone number is required." }, { status: 400 });
  if (!Array.isArray(interestedBrands) || interestedBrands.length === 0) {
    return NextResponse.json({ error: "Select at least one brand type." }, { status: 400 });
  }
  if (!Array.isArray(preferredDeals) || preferredDeals.length === 0) {
    return NextResponse.json({ error: "Select at least one deal type." }, { status: 400 });
  }
  for (const d of preferredDeals) {
    if (!PREFERRED_DEALS.includes(d as (typeof PREFERRED_DEALS)[number])) {
      return NextResponse.json({ error: "Invalid deal type." }, { status: 400 });
    }
  }
  if (!availability || !AVAILABILITY.includes(availability as (typeof AVAILABILITY)[number])) {
    return NextResponse.json({ error: "Select availability." }, { status: 400 });
  }

  const { error } = await supabase
    .from("team_profiles")
    .update({
      school,
      team_name: teamName,
      sport,
      division,
      num_players: numPlayers,
      manager_first_name: managerFirstName,
      manager_last_name: managerLastName,
      phone,
      interested_brands: interestedBrands,
      preferred_deals: preferredDeals,
      availability,
    })
    .eq("id", user.id);

  if (error) {
    console.error("team profile update:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
