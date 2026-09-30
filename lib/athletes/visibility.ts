/**
 * Who may see an athlete's profile photo. SERVER ONLY.
 *
 * Never import this from a "use client" module — it pulls in lib/aws/s3.ts, and through it
 * @aws-sdk. Client components receive the already-resolved, already-authorized result as
 * props. The pure key helpers live in lib/athletes/photo.ts.
 *
 * ── Why this module exists ───────────────────────────────────────────────────
 * athlete_profiles RLS is self-only: the three policies in migration 002 are all
 * `auth.uid() = id`. A team manager or brand querying it with their own cookie-backed
 * client gets an EMPTY ARRAY AND NO ERROR — a silent failure that reads as "no athletes
 * have joined" rather than as a permissions problem. So every cross-role read has to go
 * through createServiceClient(), which bypasses RLS entirely.
 *
 * That makes the relationship check in this file the ONLY thing standing between a signed-in
 * brand manager and every athlete's row — phone number included. It deliberately lives
 * inside each resolver rather than being left to the caller, because "remember to also
 * filter by team_id" is exactly the kind of step a future page forgets.
 *
 * The policy (decided with the product owner, 2026-09-17) is CONNECTED PARTIES ONLY:
 *
 *   team manager  -> athletes who ACCEPTED an invite to their team
 *   brand manager -> athletes participating in a deal the brand owns
 *   athlete       -> themselves (handled by RLS; no service client needed)
 *
 * A blanket `role === "brand-manager"` check is NOT sufficient and must never be
 * substituted for one of these. Widening this to "any onboarded brand" was considered and
 * rejected: these are personal photos of college students.
 */
import type { createServiceClient } from "@/lib/supabase/server";
import { isS3Configured, presignAthletePhotos } from "@/lib/aws/s3";
import { normalizePhotoKey } from "@/lib/athletes/photo";

/** One athlete, ready to render. `photoUrl` is presigned and short-lived — never persist it. */
export type AthleteCard = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  sport: string | null;
  graduationYear: number | null;
  school: string | null;
  email: string | null;
  /** Presigned GET, or null when there is no photo / S3 is unconfigured / signing failed. */
  photoUrl: string | null;
};

/** An athlete a manager has invited who has not resolved to a real account yet. */
export type RosterEntry = {
  email: string;
  /** Null until the invite is accepted AND the athlete has completed onboarding. */
  athlete: AthleteCard | null;
  invitedAt: string | null;
  openedAt: string | null;
  acceptedAt: string | null;
};

/**
 * Deliberately the SERVICE client's type, not a generic SupabaseClient. Every function here
 * bypasses RLS, so accepting a cookie-backed client would compile and then silently return
 * nothing — the exact failure this module exists to prevent. `import type` is erased at
 * build time, so this pulls in no runtime code.
 */
type AnyClient = ReturnType<typeof createServiceClient>;

function norm(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Hydrates athlete ids into render-ready cards, presigning photos in one batch.
 *
 * DOES NO AUTHORIZATION. It is not exported: every caller must come through one of the
 * relationship-checked resolvers below, so there is no way to reach it with an unvetted
 * id list.
 */
async function hydrate(
  service: AnyClient,
  athleteIds: string[]
): Promise<Map<string, AthleteCard>> {
  const out = new Map<string, AthleteCard>();
  const ids = Array.from(new Set(athleteIds.filter(Boolean)));
  if (ids.length === 0) return out;

  const { data: rows, error } = await service
    .from("athlete_profiles")
    .select("id, first_name, last_name, sport, graduation_year, school, photo_key")
    .in("id", ids);

  if (error) {
    // Most likely migration 021 has not been applied, so photo_key does not exist. Left
    // unlogged this renders an empty roster, which reads as data loss rather than as a
    // pending migration.
    console.error("athlete hydrate failed (is migration 021 applied?):", error);
    return out;
  }

  type Row = {
    id: string;
    first_name: string | null;
    last_name: string | null;
    sport: string | null;
    graduation_year: number | null;
    school: string | null;
    photo_key: string | null;
  };
  const profiles = (rows ?? []) as Row[];

  // Presign every photo in one pass rather than once per row: signing is local HMAC, but
  // the shared 15-minute window only pays off if the whole list signs together.
  const keys = profiles.map((p) => normalizePhotoKey(p.photo_key));
  const urls = isS3Configured() ? await presignAthletePhotos(keys) : new Map<string, string>();

  // Emails live on `profiles`, not `athlete_profiles`.
  const { data: emailRows } = await service.from("profiles").select("id, email").in("id", ids);
  const emailById = new Map<string, string | null>();
  ((emailRows ?? []) as { id: string; email: string | null }[]).forEach((p) =>
    emailById.set(p.id, p.email)
  );

  profiles.forEach((p) => {
    const first = (p.first_name ?? "").trim();
    const last = (p.last_name ?? "").trim();
    const key = normalizePhotoKey(p.photo_key);
    out.set(p.id, {
      id: p.id,
      firstName: first,
      lastName: last,
      fullName: `${first} ${last}`.trim(),
      sport: p.sport,
      graduationYear: p.graduation_year,
      school: p.school,
      email: emailById.get(p.id) ?? null,
      photoUrl: (key && urls.get(key)) || null,
    });
  });

  return out;
}

/**
 * Maps invite emails to athlete account ids.
 *
 * The invite table has NO foreign key to the athlete — the link is the email string alone,
 * re-derived here, exactly as app/dashboard/athlete-dashboard/team/page.tsx already does.
 *
 * CASE: the `.in()` filter below is a case-SENSITIVE equality match against the raw column,
 * so lower-casing the values we search FOR does not protect against a mixed-case row in
 * `profiles.email` — such a row is missed by the filter entirely and that athlete renders
 * as a bare email with no name and no photo. This is safe in practice only because GoTrue
 * lower-cases addresses at signup, so `profiles.email` is already lower-case. It is NOT
 * defence in depth, and if that ever stops holding this is the query that breaks.
 * (Normalizing when building the map below is still needed: the INVITE emails are
 * inconsistently cased — send-athlete-invites lower-cases, mark-accepted stores as typed.)
 */
async function emailsToAthleteIds(
  service: AnyClient,
  emails: string[]
): Promise<Map<string, string>> {
  const wanted = Array.from(new Set(emails.map(norm).filter(Boolean)));
  const byEmail = new Map<string, string>();
  if (wanted.length === 0) return byEmail;

  const { data } = await service.from("profiles").select("id, email").in("email", wanted);
  ((data ?? []) as { id: string; email: string | null }[]).forEach((p) => {
    if (p.email) byEmail.set(norm(p.email), p.id);
  });
  return byEmail;
}

/**
 * The team manager's roster: every athlete they have invited, with accepted ones resolved
 * to real profiles and photos.
 *
 * AUTHORIZATION: scoped by `.eq("team_id", teamId)`. The caller must pass the team id from
 * the SERVER SESSION (`user.id` after asserting the team-manager role), never from a route
 * param or request body.
 *
 * Returns pending invites too, so the roster keeps showing who has not joined yet. An
 * athlete who accepted but has not finished onboarding comes back with `athlete: null` —
 * their athlete_profiles row does not exist yet, which mark-accepted's silent no-op update
 * makes a normal state rather than an error.
 */
export async function resolveTeamRoster(
  service: AnyClient,
  teamId: string
): Promise<RosterEntry[]> {
  const { data: inviteRows } = await service
    .from("team_athlete_invitations")
    .select("email, email_sent_at, opened_at, accepted_at")
    .eq("team_id", teamId);

  type Invite = {
    email: string;
    email_sent_at: string | null;
    opened_at: string | null;
    accepted_at: string | null;
  };
  const invites = (inviteRows ?? []) as Invite[];
  if (invites.length === 0) return [];

  // Only accepted invites are resolved. A pending invite is just an email someone typed —
  // it must not be able to surface a stranger's photo because the addresses happen to match.
  const acceptedEmails = invites.filter((i) => i.accepted_at).map((i) => i.email);
  const idByEmail = await emailsToAthleteIds(service, acceptedEmails);
  const cards = await hydrate(service, [...idByEmail.values()]);

  return invites
    .map((i) => {
      const id = idByEmail.get(norm(i.email));
      return {
        email: norm(i.email),
        athlete: (id && cards.get(id)) || null,
        invitedAt: i.email_sent_at,
        openedAt: i.opened_at,
        acceptedAt: i.accepted_at,
      };
    })
    .sort((a, b) => {
      // Joined athletes first, then by name/email so the list is stable across renders.
      const aJoined = a.athlete ? 0 : 1;
      const bJoined = b.athlete ? 0 : 1;
      if (aJoined !== bJoined) return aJoined - bJoined;
      return (a.athlete?.fullName || a.email).localeCompare(b.athlete?.fullName || b.email);
    });
}

/** An athlete on a deal, with how they responded to it. */
export type DealParticipant = {
  athlete: AthleteCard;
  status: "invited" | "accepted" | "declined";
};

function parseStatus(s: unknown): DealParticipant["status"] {
  return s === "accepted" || s === "declined" ? s : "invited";
}

/**
 * Athletes participating in one deal, for the brand or team that owns it.
 *
 * AUTHORIZATION: re-reads the partnership through the service client and requires the
 * viewer to be its brand or its team. Passing `viewerRole` wrong fails CLOSED — an
 * unrecognised role matches neither branch and returns [].
 *
 * The ownership check is done here rather than trusting that the calling page already
 * scoped its own query, because those two facts drift: a page that later starts resolving
 * the deal a different way would silently lose the check.
 */
export async function resolveDealParticipants(
  service: AnyClient,
  partnershipId: string,
  viewer: { id: string; role: "brand-manager" | "team-manager" }
): Promise<DealParticipant[]> {
  const { data: deal } = await service
    .from("partnerships")
    .select("id, brand_id, team_id")
    .eq("id", partnershipId)
    .maybeSingle();
  if (!deal) return [];

  const d = deal as { id: string; brand_id: string; team_id: string };
  const owns =
    (viewer.role === "brand-manager" && d.brand_id === viewer.id) ||
    (viewer.role === "team-manager" && d.team_id === viewer.id);
  if (!owns) return [];

  const { data: partRows } = await service
    .from("partnership_participants")
    .select("athlete_id, status")
    .eq("partnership_id", partnershipId);

  const parts = (partRows ?? []) as { athlete_id: string; status: string }[];
  if (parts.length === 0) return [];

  const cards = await hydrate(
    service,
    parts.map((p) => p.athlete_id)
  );

  return parts
    .map((p) => {
      const athlete = cards.get(p.athlete_id);
      // An athlete who was added to a deal but has not completed onboarding has no
      // athlete_profiles row. Dropping them is right for a face list — there is no name or
      // photo to show — but the count shown alongside must come from `parts`, not from
      // this array, or the deal appears to have fewer participants than it does.
      return athlete ? { athlete, status: parseStatus(p.status) } : null;
    })
    .filter((x): x is DealParticipant => x !== null)
    .sort((a, b) => a.athlete.fullName.localeCompare(b.athlete.fullName));
}

/**
 * Counts participants on a deal WITHOUT resolving identities — for headline numbers that
 * must stay truthful even when some athletes have not onboarded.
 */
export async function countDealParticipants(
  service: AnyClient,
  partnershipId: string
): Promise<number> {
  const { count } = await service
    .from("partnership_participants")
    .select("athlete_id", { count: "exact", head: true })
    .eq("partnership_id", partnershipId);
  return count ?? 0;
}
