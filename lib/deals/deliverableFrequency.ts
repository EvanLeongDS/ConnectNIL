import type { DeliverableFrequency } from "./types";

const FREQUENCIES: DeliverableFrequency[] = ["one_time", "daily", "weekly", "monthly", "season"];

export function parseDeliverableFrequency(v: unknown): DeliverableFrequency {
  if (typeof v === "string" && FREQUENCIES.includes(v as DeliverableFrequency)) {
    return v as DeliverableFrequency;
  }
  return "one_time";
}
