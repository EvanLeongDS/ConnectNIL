/** Shared scoring helpers for the Discover recommendation system. */

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function overlapCount(a: string[] | null | undefined, b: string[] | null | undefined): number {
  if (!a?.length || !b?.length) return 0;
  const setB = new Set(b.map(norm));
  return a.filter((v) => setB.has(norm(v))).length;
}

// ── Athlete/Team → Brand scoring ─────────────────────────────────────────────

export interface AthleteContext {
  school: string;
  sport: string;
  state?: string;
}

export interface BrandRow {
  id: string;
  company_name: string;
  city: string;
  state: string;
  industry: string;
  budget_range: string;
  company_description: string;
  target_audience: string[] | null;
  preferred_sports: string[] | null;
  preferred_schools: string[] | null;
  campaign_types: string[] | null;
  website_url: string | null;
  social_instagram: string | null;
  social_x: string | null;
  social_linkedin: string | null;
}

export function scoreBrandForAthlete(brand: BrandRow, ctx: AthleteContext): number {
  let score = 0;
  const maxScore = 100;

  // Sport match (up to 35 pts)
  if (brand.preferred_sports?.length) {
    const sportMatch = brand.preferred_sports.some((s) => norm(s) === norm(ctx.sport));
    if (sportMatch) score += 35;
  } else {
    score += 10;
  }

  // School match (up to 30 pts)
  if (brand.preferred_schools?.length) {
    const schoolMatch = brand.preferred_schools.some((s) => norm(s) === norm(ctx.school));
    if (schoolMatch) score += 30;
  } else {
    score += 8;
  }

  // Location (state) match (up to 20 pts)
  if (ctx.state && norm(brand.state) === norm(ctx.state)) {
    score += 20;
  }

  // City / local match (up to 15 pts): brand HQ city appears in school name, e.g. Boston + "Boston University"
  const cityN = norm(brand.city);
  const schoolN = norm(ctx.school);
  if (cityN.length >= 3 && schoolN.length > 0 && schoolN.includes(cityN)) {
    score += 15;
  }

  // Has campaign types filled (up to 10 pts — shows engagement)
  if (brand.campaign_types?.length) score += 5;
  if (brand.target_audience?.length) score += 5;

  // Bonus for having website / social (up to 5 pts)
  if (brand.website_url) score += 2;
  if (brand.social_instagram) score += 1;
  if (brand.social_x) score += 1;
  if (brand.social_linkedin) score += 1;

  return Math.min(Math.round(score), maxScore);
}

// ── Brand → Team scoring ─────────────────────────────────────────────────────

export interface BrandContext {
  preferred_sports: string[] | null;
  preferred_schools: string[] | null;
  campaign_types: string[] | null;
  state: string;
}

export interface TeamRow {
  id: string;
  school: string;
  team_name: string;
  sport: string;
  division: string | null;
  num_players: number;
  availability: string;
  preferred_deals: string[] | null;
}

export function scoreTeamForBrand(team: TeamRow, ctx: BrandContext): number {
  let score = 0;
  const maxScore = 100;

  // Sport overlap (up to 35 pts)
  if (ctx.preferred_sports?.length) {
    if (ctx.preferred_sports.some((s) => norm(s) === norm(team.sport))) score += 35;
  } else {
    score += 10;
  }

  // School overlap (up to 30 pts)
  if (ctx.preferred_schools?.length) {
    if (ctx.preferred_schools.some((s) => norm(s) === norm(team.school))) score += 30;
  } else {
    score += 8;
  }

  // Deal type overlap (up to 15 pts)
  const dealOverlap = overlapCount(ctx.campaign_types, team.preferred_deals);
  score += Math.min(dealOverlap * 5, 15);

  // Team size bonus (up to 10 pts)
  if (team.num_players >= 20) score += 10;
  else if (team.num_players >= 10) score += 6;
  else score += 3;

  // Availability set (5 pts)
  if (norm(team.availability) && norm(team.availability) !== "none") score += 5;

  // Division (5 pts for D1)
  if (norm(team.division) === "d1" || norm(team.division) === "division 1" || norm(team.division) === "division i") {
    score += 5;
  }

  return Math.min(Math.round(score), maxScore);
}

export function matchLabel(score: number): { text: string; color: string } {
  if (score >= 70) return { text: "Great match", color: "text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-900/30" };
  if (score >= 45) return { text: "Good match", color: "text-blue-700 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/30" };
  if (score >= 25) return { text: "Fair match", color: "text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/30" };
  return { text: "Low match", color: "text-zinc-600 bg-zinc-100 dark:text-zinc-400 dark:bg-zinc-800" };
}
