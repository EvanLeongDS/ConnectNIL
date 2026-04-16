"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { profileInputClass } from "@/lib/profile/inputClass";
import {
  TEAM_GENDER_OPTIONS,
  TEAM_SPORT_BASES,
  composeTeamSport,
  parseTeamSport,
  type TeamGenderValue,
} from "@/lib/team/sportPicker";

const DIVISIONS = ["D1", "D2", "D3", "NAIA", "Club"];

const BRAND_TYPES = [
  "Apparel", "Food & Beverage", "Fitness & Wellness", "Technology", "Local Businesses", "Beauty", "Finance", "Entertainment", "Other",
];

const DEAL_TYPES = [
  { value: "social_media", label: "Social Media", desc: "Posts, stories, reels" },
  { value: "events", label: "Events", desc: "Game day activations" },
  { value: "content_creation", label: "Content Creation", desc: "Photos, videos, branded content" },
];

const AVAILABILITY_OPTIONS = [
  { value: "low", label: "Low", desc: "1–2 deals per semester" },
  { value: "medium", label: "Medium", desc: "3–5 deals per semester" },
  { value: "high", label: "High", desc: "6+ deals per semester" },
];

export type TeamProfilePayload = {
  school: string;
  team_name: string;
  sport: string;
  division: string | null;
  num_players: number;
  manager_first_name: string;
  manager_last_name: string;
  phone: string;
  interested_brands: string[] | null;
  preferred_deals: string[] | null;
  availability: string;
};

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-black dark:text-white">
        {label}
        {required && <span className="text-[#1f7ae0]"> *</span>}
        {hint && <span className="text-xs font-normal text-black/40 dark:text-white/35">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

function ChipToggle({
  options,
  selected,
  onChange,
}: {
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  function toggle(item: string) {
    onChange(selected.includes(item) ? selected.filter((s) => s !== item) : [...selected, item]);
  }
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => toggle(opt)}
          className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-all ${
            selected.includes(opt)
              ? "border-[#1f7ae0] bg-[#1f7ae0] text-white shadow-sm dark:border-[#1f7ae0]/70 dark:bg-[#1a3a6e] dark:text-white"
              : "border-black/12 bg-white text-black/65 hover:border-[#1f7ae0]/50 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/55 dark:hover:border-[#1f7ae0]/40"
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

export default function TeamProfileEditor({
  profile,
  redirectAfterSave,
}: {
  profile: TeamProfilePayload;
  redirectAfterSave?: string;
}) {
  const router = useRouter();
  const initial = useMemo(() => parseTeamSport(profile.sport), [profile.sport]);

  const [school, setSchool] = useState(profile.school);
  const [teamGender, setTeamGender] = useState<TeamGenderValue | "">(initial.gender);
  const [sportBase, setSportBase] = useState(initial.base || "");
  const [otherSport, setOtherSport] = useState(initial.otherDetail);
  const [division, setDivision] = useState(profile.division ?? "");
  const [numPlayers, setNumPlayers] = useState(String(profile.num_players));
  const [managerFirstName, setManagerFirstName] = useState(profile.manager_first_name);
  const [managerLastName, setManagerLastName] = useState(profile.manager_last_name);
  const [phone, setPhone] = useState(profile.phone);
  const [interestedBrands, setInterestedBrands] = useState<string[]>(profile.interested_brands ?? []);
  const [preferredDeals, setPreferredDeals] = useState<string[]>(profile.preferred_deals ?? []);
  const [availability, setAvailability] = useState(profile.availability);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const composedPreview = useMemo(() => {
    if (!teamGender || !sportBase) return null;
    if (sportBase === "Other" && !otherSport.trim()) return null;
    return composeTeamSport(teamGender as TeamGenderValue, sportBase, otherSport);
  }, [teamGender, sportBase, otherSport]);

  function toggleDeal(value: string) {
    setPreferredDeals((prev) => (prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (!teamGender) {
      setMessage({ type: "err", text: "Select men's team or women's team." });
      return;
    }
    if (!sportBase) {
      setMessage({ type: "err", text: "Select a sport." });
      return;
    }
    if (sportBase === "Other" && !otherSport.trim()) {
      setMessage({ type: "err", text: "Specify the sport." });
      return;
    }
    const n = parseInt(numPlayers, 10);
    if (!Number.isFinite(n) || n < 1) {
      setMessage({ type: "err", text: "Enter a valid roster size." });
      return;
    }
    const composedSport = composeTeamSport(teamGender as TeamGenderValue, sportBase, otherSport);
    setSaving(true);
    try {
      const res = await fetch("/api/profile/team", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          school,
          teamName: composedSport,
          sport: composedSport,
          division: division || null,
          numPlayers: n,
          managerFirstName,
          managerLastName,
          phone,
          interestedBrands,
          preferredDeals,
          availability,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "err", text: data.error ?? "Could not save." });
        setSaving(false);
        return;
      }
      setMessage({ type: "ok", text: "Profile saved." });
      if (redirectAfterSave) router.push(redirectAfterSave);
      else router.refresh();
    } catch {
      setMessage({ type: "err", text: "Network error. Try again." });
    }
    setSaving(false);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`space-y-6 rounded-2xl border border-black/6 bg-white p-6 shadow-sm dark:border-white/6 dark:bg-[#161b27] ${redirectAfterSave ? "mt-0" : "mt-8"}`}
    >
      <h2 className="text-xs font-bold uppercase tracking-wider text-black/35 dark:text-white/30">Edit profile</h2>

      {message && (
        <div
          className={`rounded-xl border px-3 py-2 text-sm ${
            message.type === "ok"
              ? "border-green-200 bg-green-50 text-green-800 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-300"
              : "border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300"
          }`}
        >
          {message.text}
        </div>
      )}

      <Field label="School" required>
        <input className={profileInputClass} value={school} onChange={(e) => setSchool(e.target.value)} required />
      </Field>

      <Field label="Team" required hint="men's or women's">
        <select
          className={`${profileInputClass} cursor-pointer`}
          value={teamGender}
          onChange={(e) => setTeamGender(e.target.value as TeamGenderValue | "")}
          required
        >
          <option value="" disabled>
            Select team
          </option>
          {TEAM_GENDER_OPTIONS.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Sport" required>
        <select
          className={`${profileInputClass} cursor-pointer`}
          value={sportBase}
          onChange={(e) => {
            setSportBase(e.target.value);
            if (e.target.value !== "Other") setOtherSport("");
          }}
          required
        >
          <option value="" disabled>
            Select a sport
          </option>
          {TEAM_SPORT_BASES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>

      {sportBase === "Other" && (
        <Field label="Specify sport" required>
          <input
            className={profileInputClass}
            value={otherSport}
            onChange={(e) => setOtherSport(e.target.value)}
            placeholder="e.g. Rugby"
            required
          />
        </Field>
      )}

      {composedPreview && (
        <div className="rounded-xl border border-[#1f7ae0]/25 bg-[#dbeafe]/50 px-4 py-3 text-sm dark:border-[#1f7ae0]/20 dark:bg-[#1f7ae0]/[0.07]">
          <span className="font-semibold text-[#1f7ae0] dark:text-[#93c5fd]">Team and sport: </span>
          <span className="text-black dark:text-white">{composedPreview}</span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Division">
          <select className={`${profileInputClass} cursor-pointer`} value={division} onChange={(e) => setDivision(e.target.value)}>
            <option value="">Optional</option>
            {DIVISIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Roster size" required>
          <input
            className={profileInputClass}
            type="number"
            min={1}
            max={200}
            value={numPlayers}
            onChange={(e) => setNumPlayers(e.target.value)}
            required
          />
        </Field>
      </div>

      <p className="text-xs font-bold uppercase tracking-wider text-black/35 dark:text-white/30">Manager contact</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" required>
          <input className={profileInputClass} value={managerFirstName} onChange={(e) => setManagerFirstName(e.target.value)} required />
        </Field>
        <Field label="Last name" required>
          <input className={profileInputClass} value={managerLastName} onChange={(e) => setManagerLastName(e.target.value)} required />
        </Field>
      </div>
      <Field label="Phone" required>
        <input className={profileInputClass} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
      </Field>

      <div>
        <p className="mb-2 text-sm font-semibold text-black dark:text-white">
          Interested brand types <span className="text-[#1f7ae0]">*</span>
        </p>
        <ChipToggle options={BRAND_TYPES} selected={interestedBrands} onChange={setInterestedBrands} />
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-black dark:text-white">
          Preferred deal types <span className="text-[#1f7ae0]">*</span>
        </p>
        <div className="space-y-2">
          {DEAL_TYPES.map((dt) => {
            const active = preferredDeals.includes(dt.value);
            return (
              <button
                key={dt.value}
                type="button"
                onClick={() => toggleDeal(dt.value)}
                className={`w-full rounded-xl border p-3 text-left text-sm transition ${
                  active
                    ? "border-[#1f7ae0] bg-[#dbeafe] dark:border-[#1f7ae0]/50 dark:bg-[#111e38]"
                    : "border-black/10 bg-white dark:border-white/8 dark:bg-white/[0.03]"
                }`}
              >
                <span className="font-bold text-black dark:text-white">{dt.label}</span>
                <span className="ml-2 text-black/50 dark:text-white/45">{dt.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-black dark:text-white">
          Deal availability <span className="text-[#1f7ae0]">*</span>
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {AVAILABILITY_OPTIONS.map((opt) => {
            const active = availability === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setAvailability(opt.value)}
                className={`rounded-xl border p-3 text-left text-sm transition ${
                  active
                    ? "border-[#1f7ae0] bg-[#dbeafe] dark:border-[#1f7ae0]/50 dark:bg-[#111e38]"
                    : "border-black/10 bg-white dark:border-white/8 dark:bg-white/[0.03]"
                }`}
              >
                <span className="font-bold text-black dark:text-white">{opt.label}</span>
                <p className="mt-0.5 text-xs text-black/45 dark:text-white/40">{opt.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="submit"
        disabled={saving}
        className="rounded-full bg-[#1f7ae0] px-8 py-3 text-sm font-semibold text-white shadow-sm transition hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
      >
        {saving ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
