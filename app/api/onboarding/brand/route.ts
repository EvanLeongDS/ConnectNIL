import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

function normalizeWebsiteUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

    const body = await request.json();
    const service = createServiceClient();

    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    if (!phone || !/^[\d\s\-().+]{7,15}$/.test(phone)) {
      return NextResponse.json({ error: "Valid phone number is required." }, { status: 400 });
    }

    const teamDescription = typeof body.team_description === "string" ? body.team_description.trim() : "";
    if (!teamDescription) {
      return NextResponse.json({ error: "Ideal collegiate team description is required." }, { status: 400 });
    }

    const sports = body.preferred_sports as string[] | undefined;
    const schools = body.preferred_schools as string[] | undefined;
    const campaigns = body.campaign_types as string[] | undefined;
    if (!Array.isArray(sports) || sports.length === 0) {
      return NextResponse.json({ error: "Select at least one preferred sport." }, { status: 400 });
    }
    if (!Array.isArray(schools) || schools.length === 0) {
      return NextResponse.json({ error: "Add at least one preferred school." }, { status: 400 });
    }
    if (!Array.isArray(campaigns) || campaigns.length === 0) {
      return NextResponse.json({ error: "Select at least one campaign type." }, { status: 400 });
    }

    const websiteRaw = typeof body.website_url === "string" ? body.website_url.trim() : "";
    let websiteUrl: string | null = null;
    if (websiteRaw) {
      try {
        const u = new URL(normalizeWebsiteUrl(websiteRaw)!);
        if (!u.hostname?.includes(".")) {
          return NextResponse.json({ error: "Invalid website URL." }, { status: 400 });
        }
        websiteUrl = u.toString();
      } catch {
        return NextResponse.json({ error: "Invalid website URL." }, { status: 400 });
      }
    }

    const linkedinRaw = typeof body.social_linkedin === "string" ? body.social_linkedin.trim() : "";
    let socialLinkedin: string | null = null;
    if (linkedinRaw) {
      try {
        const u = new URL(normalizeWebsiteUrl(linkedinRaw)!);
        if (!u.hostname?.includes(".")) {
          return NextResponse.json({ error: "Invalid LinkedIn URL." }, { status: 400 });
        }
        socialLinkedin = u.toString();
      } catch {
        return NextResponse.json({ error: "Invalid LinkedIn URL." }, { status: 400 });
      }
    }

    const { error: profilesError } = await service.from("profiles").upsert(
      { id: user.id, email: user.email },
      { onConflict: "id" }
    );

    if (profilesError) {
      return NextResponse.json({ error: "Failed to create profile: " + profilesError.message }, { status: 500 });
    }

    const { error } = await service.from("brand_profiles").upsert({
      id: user.id,
      company_name: body.company_name,
      first_name: body.first_name,
      last_name: body.last_name,
      phone,
      city: body.city,
      state: body.state,
      industry: body.industry,
      budget_range: body.budget_range,
      company_description: body.company_description,
      team_description: teamDescription,
      target_audience: body.target_audience,
      preferred_sports: sports,
      preferred_schools: schools,
      campaign_types: campaigns,
      website_url: websiteUrl,
      social_instagram: body.social_instagram || null,
      social_x: body.social_x || null,
      social_linkedin: socialLinkedin,
      onboarding_complete: true,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Brand onboarding error:", msg);
    return NextResponse.json({ error: "Server error. Please try again." }, { status: 500 });
  }
}
