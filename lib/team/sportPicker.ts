/** Base sports (no gender prefix) — used with Men's / Women's to build stored `sport` / `team_name`. */
export const TEAM_SPORT_BASES = [
  "Basketball",
  "Soccer",
  "Lacrosse",
  "Track & Field",
  "Volleyball",
  "Football",
  "Baseball",
  "Softball",
  "Swimming & Diving",
  "Tennis",
  "Cross Country",
  "Field Hockey",
  "Ice Hockey",
  "Wrestling",
  "Golf",
  "Rowing",
  "Other",
] as const;

export type TeamGenderValue = "mens" | "womens";

export const TEAM_GENDER_OPTIONS: { value: TeamGenderValue; label: string }[] = [
  { value: "mens", label: "Men's team" },
  { value: "womens", label: "Women's team" },
];

export function composeTeamSport(
  gender: TeamGenderValue,
  base: string,
  otherDetail?: string
): string {
  const prefix = gender === "womens" ? "Women's" : "Men's";
  const trimmedOther = otherDetail?.trim() ?? "";
  const core =
    base === "Other" && trimmedOther ? trimmedOther : base.trim();
  return `${prefix} ${core}`;
}

export type ParsedTeamSport = {
  gender: TeamGenderValue | "";
  base: string;
  otherDetail: string;
};

/** Reverse `composeTeamSport` for editing existing profiles; supports legacy values without a prefix. */
export function parseTeamSport(stored: string): ParsedTeamSport {
  const s = stored.trim();
  if (!s) return { gender: "", base: "", otherDetail: "" };

  const bases = new Set(TEAM_SPORT_BASES as readonly string[]);

  if (s.startsWith("Women's ")) {
    const rest = s.slice("Women's ".length).trim();
    if (bases.has(rest)) return { gender: "womens", base: rest, otherDetail: "" };
    return { gender: "womens", base: "Other", otherDetail: rest };
  }

  if (s.startsWith("Men's ")) {
    const rest = s.slice("Men's ".length).trim();
    if (bases.has(rest)) return { gender: "mens", base: rest, otherDetail: "" };
    return { gender: "mens", base: "Other", otherDetail: rest };
  }

  if (bases.has(s)) return { gender: "", base: s, otherDetail: "" };
  return { gender: "", base: "Other", otherDetail: s };
}
