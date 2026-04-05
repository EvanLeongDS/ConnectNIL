import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const CAMPAIGN_VALUES = ["social_media", "in_person", "content_creation"] as const;

function normalizeWebsiteUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

function isValidPhone(val: string) {
  return /^[\d\s\-().+]{7,15}$/.test(val.trim());
}

function formatSocialHandle(val: string) {
  const t = val.trim();
  if (!t) return null;
  return t.startsWith("@") ? t.slice(1) : t;
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.user_metadata?.role !== "brand-manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const companyName = typeof body.companyName === "string" ? body.companyName.trim() : "";
  const firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
  const lastName = typeof body.lastName === "string" ? body.lastName.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const city = typeof body.city === "string" ? body.city.trim() : "";
  const state = typeof body.state === "string" ? body.state.trim() : "";
  const industry = typeof body.industry === "string" ? body.industry.trim() : "";
  const budgetRange = typeof body.budgetRange === "string" ? body.budgetRange.trim() : "";
  const companyDescription =
    typeof body.companyDescription === "string" ? body.companyDescription.trim() : "";
  const teamDescription = typeof body.teamDescription === "string" ? body.teamDescription.trim() : "";

  if (!companyName) return NextResponse.json({ error: "Company name is required." }, { status: 400 });
  if (!firstName) return NextResponse.json({ error: "First name is required." }, { status: 400 });
  if (!lastName) return NextResponse.json({ error: "Last name is required." }, { status: 400 });
  if (!isValidPhone(phone)) return NextResponse.json({ error: "Valid phone number is required." }, { status: 400 });
  if (!city) return NextResponse.json({ error: "City is required." }, { status: 400 });
  if (!state) return NextResponse.json({ error: "State is required." }, { status: 400 });
  if (!industry) return NextResponse.json({ error: "Industry is required." }, { status: 400 });
  if (!budgetRange) return NextResponse.json({ error: "Budget range is required." }, { status: 400 });
  if (!companyDescription) return NextResponse.json({ error: "Company description is required." }, { status: 400 });
  if (companyDescription.length < 100) {
    return NextResponse.json(
      { error: "Company description must be at least 100 characters." },
      { status: 400 }
    );
  }
  if (!teamDescription) {
    return NextResponse.json({ error: "Ideal collegiate team description is required." }, { status: 400 });
  }

  const targetAudience = body.targetAudience as string[] | undefined;
  const preferredSports = body.preferredSports as string[] | undefined;
  const preferredSchools = body.preferredSchools as string[] | undefined;
  const campaignTypes = body.campaignTypes as string[] | undefined;

  if (!Array.isArray(targetAudience) || targetAudience.length === 0) {
    return NextResponse.json({ error: "Select at least one target audience." }, { status: 400 });
  }
  if (!Array.isArray(preferredSports) || preferredSports.length === 0) {
    return NextResponse.json({ error: "Select at least one preferred sport." }, { status: 400 });
  }
  if (!Array.isArray(preferredSchools) || preferredSchools.length === 0) {
    return NextResponse.json({ error: "Add at least one preferred school." }, { status: 400 });
  }
  if (!Array.isArray(campaignTypes) || campaignTypes.length === 0) {
    return NextResponse.json({ error: "Select at least one campaign type." }, { status: 400 });
  }
  for (const c of campaignTypes) {
    if (!CAMPAIGN_VALUES.includes(c as (typeof CAMPAIGN_VALUES)[number])) {
      return NextResponse.json({ error: "Invalid campaign type." }, { status: 400 });
    }
  }

  const websiteRaw = typeof body.websiteUrl === "string" ? body.websiteUrl.trim() : "";
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

  const linkedinRaw = typeof body.socialLinkedin === "string" ? body.socialLinkedin.trim() : "";
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

  const { error } = await supabase
    .from("brand_profiles")
    .update({
      company_name: companyName,
      first_name: firstName,
      last_name: lastName,
      phone,
      city,
      state,
      industry,
      budget_range: budgetRange,
      company_description: companyDescription,
      team_description: teamDescription,
      target_audience: targetAudience,
      preferred_sports: preferredSports,
      preferred_schools: preferredSchools,
      campaign_types: campaignTypes,
      website_url: websiteUrl,
      social_instagram: formatSocialHandle(String(body.socialInstagram ?? "")),
      social_x: formatSocialHandle(String(body.socialX ?? "")),
      social_linkedin: socialLinkedin,
    })
    .eq("id", user.id);

  if (error) {
    console.error("brand profile update:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
