"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { profileInputClass } from "@/lib/profile/inputClass";

const US_STATES: { abbr: string; name: string }[] = [
  { abbr: "AL", name: "Alabama" }, { abbr: "AK", name: "Alaska" },
  { abbr: "AZ", name: "Arizona" }, { abbr: "AR", name: "Arkansas" },
  { abbr: "CA", name: "California" }, { abbr: "CO", name: "Colorado" },
  { abbr: "CT", name: "Connecticut" }, { abbr: "DE", name: "Delaware" },
  { abbr: "DC", name: "District of Columbia" }, { abbr: "FL", name: "Florida" },
  { abbr: "GA", name: "Georgia" }, { abbr: "HI", name: "Hawaii" },
  { abbr: "ID", name: "Idaho" }, { abbr: "IL", name: "Illinois" },
  { abbr: "IN", name: "Indiana" }, { abbr: "IA", name: "Iowa" },
  { abbr: "KS", name: "Kansas" }, { abbr: "KY", name: "Kentucky" },
  { abbr: "LA", name: "Louisiana" }, { abbr: "ME", name: "Maine" },
  { abbr: "MD", name: "Maryland" }, { abbr: "MA", name: "Massachusetts" },
  { abbr: "MI", name: "Michigan" }, { abbr: "MN", name: "Minnesota" },
  { abbr: "MS", name: "Mississippi" }, { abbr: "MO", name: "Missouri" },
  { abbr: "MT", name: "Montana" }, { abbr: "NE", name: "Nebraska" },
  { abbr: "NV", name: "Nevada" }, { abbr: "NH", name: "New Hampshire" },
  { abbr: "NJ", name: "New Jersey" }, { abbr: "NM", name: "New Mexico" },
  { abbr: "NY", name: "New York" }, { abbr: "NC", name: "North Carolina" },
  { abbr: "ND", name: "North Dakota" }, { abbr: "OH", name: "Ohio" },
  { abbr: "OK", name: "Oklahoma" }, { abbr: "OR", name: "Oregon" },
  { abbr: "PA", name: "Pennsylvania" }, { abbr: "RI", name: "Rhode Island" },
  { abbr: "SC", name: "South Carolina" }, { abbr: "SD", name: "South Dakota" },
  { abbr: "TN", name: "Tennessee" }, { abbr: "TX", name: "Texas" },
  { abbr: "UT", name: "Utah" }, { abbr: "VT", name: "Vermont" },
  { abbr: "VA", name: "Virginia" }, { abbr: "WA", name: "Washington" },
  { abbr: "WV", name: "West Virginia" }, { abbr: "WI", name: "Wisconsin" },
  { abbr: "WY", name: "Wyoming" },
];

const INDUSTRIES = [
  "Apparel & Fashion", "Beauty & Personal Care", "Education",
  "Entertainment & Media", "Finance & Banking", "Food & Beverage",
  "Health & Wellness", "Sports & Athletics", "Technology",
  "Travel & Hospitality", "Other",
];

const BUDGET_RANGES = [
  "Under $1,000",
  "$1,000 – $5,000",
  "$5,000 – $25,000",
  "$25,000 – $100,000",
  "$100,000+",
];

const TARGET_AUDIENCES = [
  "College Athletes",
  "College Students",
  "High School Athletes",
  "Young Adults (18–25)",
  "General Sports Fans",
  "Parents of Athletes",
  "Health & Fitness Enthusiasts",
];

const SPORTS = [
  "Baseball", "Basketball", "Beach Volleyball", "Cross Country",
  "Equestrian", "Fencing", "Field Hockey", "Football",
  "Golf", "Gymnastics", "Ice Hockey", "Lacrosse",
  "Rowing", "Rugby", "Skiing", "Soccer",
  "Softball", "Swimming & Diving", "Tennis", "Track & Field",
  "Volleyball", "Water Polo", "Wrestling", "Other",
];

const CAMPAIGN_TYPES = [
  { value: "social_media", label: "Social Media", desc: "Instagram, TikTok, stories, reels" },
  { value: "in_person", label: "In-Person", desc: "Events and activations" },
  { value: "content_creation", label: "Content Creation", desc: "Photos, videos, branded content" },
];

export type BrandProfilePayload = {
  company_name: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  city: string;
  state: string;
  industry: string;
  budget_range: string;
  company_description: string;
  team_description: string | null;
  target_audience: string[] | null;
  preferred_sports: string[] | null;
  preferred_schools: string[] | null;
  campaign_types: string[] | null;
  website_url: string | null;
  social_instagram: string | null;
  social_x: string | null;
  social_linkedin: string | null;
};

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
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
      {options.map((opt) => {
        const active = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-all ${
              active
                ? "border-[#1f7ae0] bg-[#1f7ae0] text-white shadow-sm"
                : "border-black/12 bg-white text-black/65 hover:border-[#1f7ae0]/50 dark:border-white/12 dark:bg-white/5 dark:text-white/65"
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

export default function BrandProfileEditor({
  profile,
  redirectAfterSave,
}: {
  profile: BrandProfilePayload;
  redirectAfterSave?: string;
}) {
  const router = useRouter();
  const [companyName, setCompanyName] = useState(profile.company_name);
  const [firstName, setFirstName] = useState(profile.first_name);
  const [lastName, setLastName] = useState(profile.last_name);
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [city, setCity] = useState(profile.city);
  const [state, setState] = useState(profile.state);
  const [industry, setIndustry] = useState(profile.industry);
  const [budgetRange, setBudgetRange] = useState(profile.budget_range);
  const [companyDescription, setCompanyDescription] = useState(profile.company_description);
  const [teamDescription, setTeamDescription] = useState(profile.team_description ?? "");
  const [targetAudience, setTargetAudience] = useState<string[]>(profile.target_audience ?? []);
  const [preferredSports, setPreferredSports] = useState<string[]>(profile.preferred_sports ?? []);
  const [preferredSchools, setPreferredSchools] = useState<string[]>(profile.preferred_schools ?? []);
  const [campaignTypes, setCampaignTypes] = useState<string[]>(profile.campaign_types ?? []);
  const [websiteUrl, setWebsiteUrl] = useState(profile.website_url ?? "");
  const [socialInstagram, setSocialInstagram] = useState(profile.social_instagram ?? "");
  const [socialX, setSocialX] = useState(profile.social_x ?? "");
  const [socialLinkedin, setSocialLinkedin] = useState(profile.social_linkedin ?? "");
  const [schoolInput, setSchoolInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  function addSchool() {
    const t = schoolInput.trim();
    if (!t) return;
    if (preferredSchools.some((s) => s.toLowerCase() === t.toLowerCase())) {
      setSchoolInput("");
      return;
    }
    setPreferredSchools((prev) => [...prev, t]);
    setSchoolInput("");
  }

  function toggleCampaign(value: string) {
    setCampaignTypes((prev) => (prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (companyDescription.trim().length < 100) {
      setMessage({ type: "err", text: "Company description must be at least 100 characters." });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/profile/brand", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName,
          firstName,
          lastName,
          phone,
          city,
          state,
          industry,
          budgetRange,
          companyDescription,
          teamDescription,
          targetAudience,
          preferredSports,
          preferredSchools,
          campaignTypes,
          websiteUrl,
          socialInstagram,
          socialX,
          socialLinkedin,
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

      <Field label="Company name" required>
        <input className={profileInputClass} value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Manager first name" required>
          <input className={profileInputClass} value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
        </Field>
        <Field label="Manager last name" required>
          <input className={profileInputClass} value={lastName} onChange={(e) => setLastName(e.target.value)} required />
        </Field>
      </div>

      <Field label="Phone" required>
        <input className={profileInputClass} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="City" required>
          <input className={profileInputClass} value={city} onChange={(e) => setCity(e.target.value)} required />
        </Field>
        <Field label="State" required>
          <select className={`${profileInputClass} cursor-pointer`} value={state} onChange={(e) => setState(e.target.value)} required>
            <option value="">Select state</option>
            {US_STATES.map((s) => (
              <option key={s.abbr} value={s.abbr}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Industry" required>
          <select className={`${profileInputClass} cursor-pointer`} value={industry} onChange={(e) => setIndustry(e.target.value)} required>
            <option value="">Select industry</option>
            {INDUSTRIES.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Budget range" required>
          <select
            className={`${profileInputClass} cursor-pointer`}
            value={budgetRange}
            onChange={(e) => setBudgetRange(e.target.value)}
            required
          >
            <option value="">Select range</option>
            {BUDGET_RANGES.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Company description" required hint="min 100 characters">
        <textarea
          className={`${profileInputClass} min-h-[100px] resize-y`}
          value={companyDescription}
          onChange={(e) => setCompanyDescription(e.target.value)}
          required
          minLength={100}
        />
        <p
          className={`mt-1 text-right text-xs ${
            companyDescription.trim().length > 0 && companyDescription.trim().length < 100
              ? "text-amber-600 dark:text-amber-400"
              : "text-black/35 dark:text-white/30"
          }`}
        >
          {companyDescription.trim().length}/100 minimum
        </p>
      </Field>

      <Field label="Ideal collegiate team" required>
        <textarea
          className={`${profileInputClass} min-h-[80px] resize-y`}
          value={teamDescription}
          onChange={(e) => setTeamDescription(e.target.value)}
          placeholder="Describe the types of teams you want to partner with…"
          required
        />
      </Field>

      <div>
        <p className="mb-2 text-sm font-semibold text-black dark:text-white">
          Target audience <span className="text-[#1f7ae0]">*</span>
        </p>
        <ChipToggle options={TARGET_AUDIENCES} selected={targetAudience} onChange={setTargetAudience} />
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-black dark:text-white">
          Preferred sports <span className="text-[#1f7ae0]">*</span>
        </p>
        <ChipToggle options={SPORTS} selected={preferredSports} onChange={setPreferredSports} />
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-black dark:text-white">
          Preferred schools <span className="text-[#1f7ae0]">*</span>
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            className={`${profileInputClass} min-w-[200px] flex-1`}
            value={schoolInput}
            onChange={(e) => setSchoolInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSchool();
              }
            }}
            placeholder="School name"
          />
          <button
            type="button"
            onClick={addSchool}
            className="rounded-xl bg-[#1f7ae0] px-4 py-3 text-sm font-semibold text-white"
          >
            Add
          </button>
        </div>
        {preferredSchools.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {preferredSchools.map((s) => (
              <span
                key={s}
                className="inline-flex items-center gap-1 rounded-full border border-black/8 bg-[#f9fafb] px-3 py-1 text-xs font-medium dark:border-white/8 dark:bg-[#1c2333]"
              >
                {s}
                <button type="button" className="text-black/40 hover:text-red-500 dark:text-white/40" onClick={() => setPreferredSchools((p) => p.filter((x) => x !== s))}>
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-black dark:text-white">
          Campaign types <span className="text-[#1f7ae0]">*</span>
        </p>
        <div className="space-y-2">
          {CAMPAIGN_TYPES.map((ct) => {
            const active = campaignTypes.includes(ct.value);
            return (
              <button
                key={ct.value}
                type="button"
                onClick={() => toggleCampaign(ct.value)}
                className={`w-full rounded-xl border p-3 text-left text-sm transition ${
                  active
                    ? "border-[#1f7ae0] bg-[#dbeafe] dark:bg-[#1a2f5a]"
                    : "border-black/10 bg-white dark:border-white/10 dark:bg-white/5"
                }`}
              >
                <span className="font-bold text-black dark:text-white">{ct.label}</span>
                <span className="ml-2 text-black/50 dark:text-white/45">{ct.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-xs font-bold uppercase tracking-wider text-black/35 dark:text-white/30">Online</p>
      <Field label="Website (optional)">
        <input className={profileInputClass} value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://…" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Instagram handle">
          <input className={profileInputClass} value={socialInstagram} onChange={(e) => setSocialInstagram(e.target.value)} />
        </Field>
        <Field label="X handle">
          <input className={profileInputClass} value={socialX} onChange={(e) => setSocialX(e.target.value)} />
        </Field>
      </div>
      <Field label="LinkedIn URL (optional)">
        <input className={profileInputClass} value={socialLinkedin} onChange={(e) => setSocialLinkedin(e.target.value)} />
      </Field>

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
