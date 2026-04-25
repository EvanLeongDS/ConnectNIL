import type { SupabaseClient } from "@supabase/supabase-js";
import { getStruckBrandIdsForTeam, getStruckTeamIdsForBrand } from "@/lib/discover/struckDeals";

export type OpportunityResponse = "committed" | "exploring";

export type BrandOpportunityRow = {
  interestId: string;
  response: OpportunityResponse;
  updatedAt: string;
  email: string | null;
  phone: string | null;
  companyName: string;
  industry: string;
  city: string;
  state: string;
  budgetRange: string;
  companyDescription: string;
  websiteUrl: string | null;
  preferredSports: string[] | null;
  campaignTypes: string[] | null;
  managerFirstName: string;
  managerLastName: string;
};

export type TeamOpportunityRow = {
  interestId: string;
  teamId: string;
  response: OpportunityResponse;
  updatedAt: string;
  email: string | null;
  phone: string;
  school: string;
  teamName: string;
  sport: string;
  division: string | null;
  numPlayers: number;
  availability: string;
  preferredDeals: string[] | null;
  managerFirstName: string;
  managerLastName: string;
};

export async function loadBrandInquiriesForTeam(
  service: SupabaseClient,
  teamManagerId: string
): Promise<BrandOpportunityRow[]> {
  const struckBrandIds = await getStruckBrandIdsForTeam(service, teamManagerId);

  const { data: interests, error: intErr } = await service
    .from("discovery_interests")
    .select("id, viewer_id, response, updated_at")
    .eq("subject_type", "team")
    .eq("subject_id", teamManagerId)
    .eq("viewer_role", "brand-manager")
    .in("response", ["committed", "exploring"])
    .order("updated_at", { ascending: false });

  if (intErr || !interests?.length) {
    if (intErr) console.error("loadBrandInquiriesForTeam interests:", intErr);
    return [];
  }

  const interestsFiltered = interests.filter((r) => !struckBrandIds.has(r.viewer_id as string));
  if (interestsFiltered.length === 0) return [];

  const viewerIds = [...new Set(interestsFiltered.map((r) => r.viewer_id as string))];

  const [{ data: brands, error: brandErr }, { data: profiles, error: profErr }] = await Promise.all([
    service
      .from("brand_profiles")
      .select(
        "id, company_name, industry, city, state, budget_range, company_description, website_url, preferred_sports, campaign_types, first_name, last_name, phone"
      )
      .in("id", viewerIds),
    service.from("profiles").select("id, email").in("id", viewerIds),
  ]);

  if (brandErr) console.error("loadBrandInquiriesForTeam brands:", brandErr);
  if (profErr) console.error("loadBrandInquiriesForTeam profiles:", profErr);

  const brandById = new Map((brands ?? []).map((b) => [b.id as string, b]));
  const emailById = new Map((profiles ?? []).map((p) => [p.id as string, p.email as string | null]));

  return interestsFiltered
    .map((row) => {
      const b = brandById.get(row.viewer_id as string);
      if (!b) return null;
      return {
        interestId: row.id as string,
        response: row.response as OpportunityResponse,
        updatedAt: row.updated_at as string,
        email: emailById.get(row.viewer_id as string) ?? null,
        phone: (b.phone as string | null) ?? null,
        companyName: b.company_name as string,
        industry: b.industry as string,
        city: b.city as string,
        state: b.state as string,
        budgetRange: b.budget_range as string,
        companyDescription: b.company_description as string,
        websiteUrl: (b.website_url as string | null) ?? null,
        preferredSports: (b.preferred_sports as string[] | null) ?? null,
        campaignTypes: (b.campaign_types as string[] | null) ?? null,
        managerFirstName: b.first_name as string,
        managerLastName: b.last_name as string,
      } satisfies BrandOpportunityRow;
    })
    .filter(Boolean) as BrandOpportunityRow[];
}

export async function loadTeamInquiriesForBrand(
  service: SupabaseClient,
  brandManagerId: string
): Promise<TeamOpportunityRow[]> {
  const struckTeamIds = await getStruckTeamIdsForBrand(service, brandManagerId);

  const { data: interests, error: intErr } = await service
    .from("discovery_interests")
    .select("id, viewer_id, response, updated_at")
    .eq("subject_type", "brand")
    .eq("subject_id", brandManagerId)
    .eq("viewer_role", "team-manager")
    .in("response", ["committed", "exploring"])
    .order("updated_at", { ascending: false });

  if (intErr || !interests?.length) {
    if (intErr) console.error("loadTeamInquiriesForBrand interests:", intErr);
    return [];
  }

  const interestsFiltered = interests.filter((r) => !struckTeamIds.has(r.viewer_id as string));
  if (interestsFiltered.length === 0) return [];

  const viewerIds = [...new Set(interestsFiltered.map((r) => r.viewer_id as string))];

  const [{ data: teams, error: teamErr }, { data: profiles, error: profErr }] = await Promise.all([
    service
      .from("team_profiles")
      .select(
        "id, school, team_name, sport, division, num_players, availability, preferred_deals, manager_first_name, manager_last_name, phone"
      )
      .in("id", viewerIds),
    service.from("profiles").select("id, email").in("id", viewerIds),
  ]);

  if (teamErr) console.error("loadTeamInquiriesForBrand teams:", teamErr);
  if (profErr) console.error("loadTeamInquiriesForBrand profiles:", profErr);

  const teamById = new Map((teams ?? []).map((t) => [t.id as string, t]));
  const emailById = new Map((profiles ?? []).map((p) => [p.id as string, p.email as string | null]));

  return interestsFiltered
    .map((row) => {
      const t = teamById.get(row.viewer_id as string);
      if (!t) return null;
      return {
        interestId: row.id as string,
        teamId: row.viewer_id as string,
        response: row.response as OpportunityResponse,
        updatedAt: row.updated_at as string,
        email: emailById.get(row.viewer_id as string) ?? null,
        phone: t.phone as string,
        school: t.school as string,
        teamName: t.team_name as string,
        sport: t.sport as string,
        division: (t.division as string | null) ?? null,
        numPlayers: t.num_players as number,
        availability: t.availability as string,
        preferredDeals: (t.preferred_deals as string[] | null) ?? null,
        managerFirstName: t.manager_first_name as string,
        managerLastName: t.manager_last_name as string,
      } satisfies TeamOpportunityRow;
    })
    .filter(Boolean) as TeamOpportunityRow[];
}

/** Brands a team manager marked with positive interest (viewer sees brand's contact). */
export async function loadBrandsYouReachedOutTo(
  service: SupabaseClient,
  teamManagerId: string
): Promise<BrandOpportunityRow[]> {
  const { data: interests, error: intErr } = await service
    .from("discovery_interests")
    .select("id, subject_id, response, updated_at")
    .eq("viewer_id", teamManagerId)
    .eq("viewer_role", "team-manager")
    .eq("subject_type", "brand")
    .in("response", ["committed", "exploring"])
    .order("updated_at", { ascending: false });

  if (intErr || !interests?.length) {
    if (intErr) console.error("loadBrandsYouReachedOutTo interests:", intErr);
    return [];
  }

  const subjectIds = [...new Set(interests.map((r) => r.subject_id as string))];

  const [{ data: brands, error: brandErr }, { data: profiles, error: profErr }] = await Promise.all([
    service
      .from("brand_profiles")
      .select(
        "id, company_name, industry, city, state, budget_range, company_description, website_url, preferred_sports, campaign_types, first_name, last_name, phone"
      )
      .in("id", subjectIds),
    service.from("profiles").select("id, email").in("id", subjectIds),
  ]);

  if (brandErr) console.error("loadBrandsYouReachedOutTo brands:", brandErr);
  if (profErr) console.error("loadBrandsYouReachedOutTo profiles:", profErr);

  const brandById = new Map((brands ?? []).map((b) => [b.id as string, b]));
  const emailById = new Map((profiles ?? []).map((p) => [p.id as string, p.email as string | null]));

  return interests
    .map((row) => {
      const sid = row.subject_id as string;
      const b = brandById.get(sid);
      if (!b) return null;
      return {
        interestId: row.id as string,
        response: row.response as OpportunityResponse,
        updatedAt: row.updated_at as string,
        email: emailById.get(sid) ?? null,
        phone: (b.phone as string | null) ?? null,
        companyName: b.company_name as string,
        industry: b.industry as string,
        city: b.city as string,
        state: b.state as string,
        budgetRange: b.budget_range as string,
        companyDescription: b.company_description as string,
        websiteUrl: (b.website_url as string | null) ?? null,
        preferredSports: (b.preferred_sports as string[] | null) ?? null,
        campaignTypes: (b.campaign_types as string[] | null) ?? null,
        managerFirstName: b.first_name as string,
        managerLastName: b.last_name as string,
      } satisfies BrandOpportunityRow;
    })
    .filter(Boolean) as BrandOpportunityRow[];
}

/** Teams a brand manager marked with positive interest (viewer sees team's contact). */
export async function loadTeamsYouReachedOutTo(
  service: SupabaseClient,
  brandManagerId: string
): Promise<TeamOpportunityRow[]> {
  const { data: interests, error: intErr } = await service
    .from("discovery_interests")
    .select("id, subject_id, response, updated_at")
    .eq("viewer_id", brandManagerId)
    .eq("viewer_role", "brand-manager")
    .eq("subject_type", "team")
    .in("response", ["committed", "exploring"])
    .order("updated_at", { ascending: false });

  if (intErr || !interests?.length) {
    if (intErr) console.error("loadTeamsYouReachedOutTo interests:", intErr);
    return [];
  }

  const subjectIds = [...new Set(interests.map((r) => r.subject_id as string))];

  const [{ data: teams, error: teamErr }, { data: profiles, error: profErr }] = await Promise.all([
    service
      .from("team_profiles")
      .select(
        "id, school, team_name, sport, division, num_players, availability, preferred_deals, manager_first_name, manager_last_name, phone"
      )
      .in("id", subjectIds),
    service.from("profiles").select("id, email").in("id", subjectIds),
  ]);

  if (teamErr) console.error("loadTeamsYouReachedOutTo teams:", teamErr);
  if (profErr) console.error("loadTeamsYouReachedOutTo profiles:", profErr);

  const teamById = new Map((teams ?? []).map((t) => [t.id as string, t]));
  const emailById = new Map((profiles ?? []).map((p) => [p.id as string, p.email as string | null]));

  return interests
    .map((row) => {
      const sid = row.subject_id as string;
      const t = teamById.get(sid);
      if (!t) return null;
      return {
        interestId: row.id as string,
        teamId: sid,
        response: row.response as OpportunityResponse,
        updatedAt: row.updated_at as string,
        email: emailById.get(sid) ?? null,
        phone: t.phone as string,
        school: t.school as string,
        teamName: t.team_name as string,
        sport: t.sport as string,
        division: (t.division as string | null) ?? null,
        numPlayers: t.num_players as number,
        availability: t.availability as string,
        preferredDeals: (t.preferred_deals as string[] | null) ?? null,
        managerFirstName: t.manager_first_name as string,
        managerLastName: t.manager_last_name as string,
      } satisfies TeamOpportunityRow;
    })
    .filter(Boolean) as TeamOpportunityRow[];
}

export type CounterpartyResult =
  | { subjectType: "brand"; row: BrandOpportunityRow }
  | { subjectType: "team"; row: TeamOpportunityRow };

/** One row's worth of counterparty (subject) contact for the viewer's positive interest. */
export async function getCounterpartyContactForViewer(
  service: SupabaseClient,
  viewerId: string,
  subjectType: "brand" | "team",
  subjectId: string
): Promise<CounterpartyResult | null> {
  const { data: interest, error } = await service
    .from("discovery_interests")
    .select("id, response, updated_at")
    .eq("viewer_id", viewerId)
    .eq("subject_id", subjectId)
    .eq("subject_type", subjectType)
    .in("response", ["committed", "exploring"])
    .maybeSingle();

  if (error) {
    console.error("getCounterpartyContactForViewer:", error);
    return null;
  }
  if (!interest) return null;

  if (subjectType === "brand") {
    const { data: b } = await service
      .from("brand_profiles")
      .select(
        "id, company_name, industry, city, state, budget_range, company_description, website_url, preferred_sports, campaign_types, first_name, last_name, phone"
      )
      .eq("id", subjectId)
      .maybeSingle();
    const { data: p } = await service.from("profiles").select("email").eq("id", subjectId).maybeSingle();
    if (!b) return null;
    const row: BrandOpportunityRow = {
      interestId: interest.id as string,
      response: interest.response as OpportunityResponse,
      updatedAt: interest.updated_at as string,
      email: (p?.email as string | null) ?? null,
      phone: (b.phone as string | null) ?? null,
      companyName: b.company_name as string,
      industry: b.industry as string,
      city: b.city as string,
      state: b.state as string,
      budgetRange: b.budget_range as string,
      companyDescription: b.company_description as string,
      websiteUrl: (b.website_url as string | null) ?? null,
      preferredSports: (b.preferred_sports as string[] | null) ?? null,
      campaignTypes: (b.campaign_types as string[] | null) ?? null,
      managerFirstName: b.first_name as string,
      managerLastName: b.last_name as string,
    };
    return { subjectType: "brand", row };
  }

  const { data: t } = await service
    .from("team_profiles")
    .select(
      "id, school, team_name, sport, division, num_players, availability, preferred_deals, manager_first_name, manager_last_name, phone"
    )
    .eq("id", subjectId)
    .maybeSingle();
  const { data: p } = await service.from("profiles").select("email").eq("id", subjectId).maybeSingle();
  if (!t) return null;
  const row: TeamOpportunityRow = {
    interestId: interest.id as string,
    teamId: subjectId,
    response: interest.response as OpportunityResponse,
    updatedAt: interest.updated_at as string,
    email: (p?.email as string | null) ?? null,
    phone: t.phone as string,
    school: t.school as string,
    teamName: t.team_name as string,
    sport: t.sport as string,
    division: (t.division as string | null) ?? null,
    numPlayers: t.num_players as number,
    availability: t.availability as string,
    preferredDeals: (t.preferred_deals as string[] | null) ?? null,
    managerFirstName: t.manager_first_name as string,
    managerLastName: t.manager_last_name as string,
  };
  return { subjectType: "team", row };
}
