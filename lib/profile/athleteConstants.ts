export const ATHLETE_SPORTS = [
  "Baseball", "Basketball", "Beach Volleyball", "Cross Country",
  "Equestrian", "Fencing", "Field Hockey", "Football",
  "Golf", "Gymnastics", "Ice Hockey", "Lacrosse",
  "Rowing", "Rugby", "Skiing", "Soccer",
  "Softball", "Swimming & Diving", "Tennis", "Track & Field",
  "Volleyball", "Water Polo", "Wrestling", "Other",
] as const;

const y = new Date().getFullYear();
export const GRAD_YEARS = Array.from({ length: 7 }, (_, i) => y + i);

export const SCHOOL_BANNED = [
  "high school", "hs", "middle school", "ms", "elementary",
  "junior high", "prep school",
];
