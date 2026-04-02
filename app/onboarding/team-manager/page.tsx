"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AuthNav from "@/components/auth/AuthNav";

// ── Constants ─────────────────────────────────────────────────────────────────

const SPORTS = ["Basketball", "Soccer", "Lacrosse", "Track & Field", "Volleyball", "Football", "Baseball", "Softball", "Swimming & Diving", "Tennis", "Cross Country", "Field Hockey", "Ice Hockey", "Wrestling", "Golf", "Rowing", "Other"];
const DIVISIONS = ["D1", "D2", "D3", "NAIA", "Club"];
const BRAND_TYPES = ["Apparel", "Food & Beverage", "Fitness & Wellness", "Technology", "Local Businesses", "Beauty", "Finance", "Entertainment", "Other"];
const DEAL_TYPES = [
  { value: "social_media", label: "Social Media", desc: "Posts, stories, reels across platforms" },
  { value: "events", label: "Events", desc: "Game day activations & in-person appearances" },
  { value: "content_creation", label: "Content Creation", desc: "Photos, videos & branded content" },
];
const AVAILABILITY_OPTIONS = [
  { value: "low", label: "Low", desc: "1–2 deals per semester" },
  { value: "medium", label: "Medium", desc: "3–5 deals per semester" },
  { value: "high", label: "High", desc: "6+ deals per semester" },
];

const SECTIONS = ["Team Info", "Contact", "Roster", "Partnerships"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function isValidPhone(val: string) {
  return /^[\d\s\-().+]{7,15}$/.test(val.trim());
}

// ── Sub-components ────────────────────────────────────────────────────────────

const inputCls =
  "w-full rounded-xl border border-black/12 bg-white px-4 py-3 text-sm text-black placeholder-black/30 shadow-sm transition focus:border-[#1f7ae0] focus:outline-none focus:ring-2 focus:ring-[#1f7ae0]/20 dark:border-white/12 dark:bg-[#1c2333] dark:text-white dark:placeholder-white/30 dark:focus:border-[#1f7ae0]";

function Field({ label, hint, required = false, children }: {
  label: string; hint?: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-sm font-semibold text-black dark:text-white">
        {label}
        {required && <span className="text-[#1f7ae0]">*</span>}
        {hint && <span className="text-xs font-normal text-black/40 dark:text-white/35">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

function ProgressBar({ current, total, labels }: { current: number; total: number; labels: string[] }) {
  return (
    <div className="mb-10">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-black/60 dark:text-white/50">
          Step {current} of {total}
        </p>
        <p className="text-sm font-bold text-[#1f7ae0]">{labels[current - 1]}</p>
      </div>
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-black/8 dark:bg-white/10">
        <div
          className="h-full rounded-full bg-[#1f7ae0] transition-all duration-500"
          style={{ width: `${(current / total) * 100}%` }}
        />
      </div>
      <div className="mt-3 flex justify-between">
        {labels.map((label, i) => (
          <div key={label} className="flex flex-col items-center gap-1">
            <div className={`h-2 w-2 rounded-full transition-colors ${i < current ? "bg-[#1f7ae0]" : "bg-black/15 dark:bg-white/15"}`} />
            <span className={`hidden text-[10px] font-medium sm:block ${i < current ? "text-[#1f7ae0]" : "text-black/30 dark:text-white/25"}`}>
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-xs font-bold uppercase tracking-widest text-[#1f7ae0]">{title}</h2>
      {subtitle && <p className="mt-1 text-xs text-black/40 dark:text-white/35">{subtitle}</p>}
    </div>
  );
}

function ChipToggle({ options, selected, onChange }: {
  options: string[]; selected: string[]; onChange: (v: string[]) => void;
}) {
  function toggle(item: string) {
    onChange(selected.includes(item) ? selected.filter((s) => s !== item) : [...selected, item]);
  }
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = selected.includes(opt);
        return (
          <button key={opt} type="button" onClick={() => toggle(opt)}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-all ${
              active
                ? "border-[#1f7ae0] bg-[#1f7ae0] text-white shadow-sm"
                : "border-black/12 bg-white text-black/65 hover:border-[#1f7ae0]/50 dark:border-white/12 dark:bg-white/5 dark:text-white/65"
            }`}>
            {opt}
          </button>
        );
      })}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TeamManagerOnboardingPage() {
  const router = useRouter();
  const supabase = createClient();
  const emailInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Auth
  const [userEmail, setUserEmail] = useState("");

  // Section 1 — Team Info
  const [school, setSchool] = useState("");
  const [teamName, setTeamName] = useState("");
  const [sport, setSport] = useState("");
  const [division, setDivision] = useState("");
  const [numPlayers, setNumPlayers] = useState("");

  // Section 2 — Contact
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneTouched, setPhoneTouched] = useState(false);

  // Section 3 — Roster
  const [emailInput, setEmailInput] = useState("");
  const [emailInputError, setEmailInputError] = useState("");
  const [athleteEmails, setAthleteEmails] = useState<string[]>([]);

  // Section 4 — Partnerships
  const [interestedBrands, setInterestedBrands] = useState<string[]>([]);
  const [preferredDeals, setPreferredDeals] = useState<string[]>([]);
  const [availability, setAvailability] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setUserEmail(data.user.email);
    });
  }, []);

  // ── Per-step validation ──
  function validateStep(s: number): string | null {
    if (s === 1) {
      if (!school.trim()) return "School name is required.";
      if (!teamName.trim()) return "Team name is required.";
      if (!sport) return "Please select a sport.";
      if (!numPlayers || parseInt(numPlayers) < 1) return "Please enter a valid number of players.";
    }
    if (s === 2) {
      if (!firstName.trim()) return "First name is required.";
      if (!lastName.trim()) return "Last name is required.";
      if (!isValidPhone(phone)) return "Please enter a valid phone number.";
    }
    if (s === 4) {
      if (interestedBrands.length === 0) return "Select at least one brand type.";
      if (preferredDeals.length === 0) return "Select at least one deal type.";
      if (!availability) return "Please select your availability.";
    }
    return null;
  }

  function handleNext() {
    setGlobalError(null);
    const err = validateStep(step);
    if (err) { setGlobalError(err); return; }
    setStep((s) => s + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleBack() {
    setGlobalError(null);
    setStep((s) => s - 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function addAthleteEmail() {
    setEmailInputError("");
    const val = emailInput.trim();
    if (!val) return;
    if (!isValidEmail(val)) { setEmailInputError("Enter a valid email address."); return; }
    if (athleteEmails.includes(val)) { setEmailInputError("This email is already added."); return; }
    setAthleteEmails((prev) => [...prev, val]);
    setEmailInput("");
    emailInputRef.current?.focus();
  }

  function removeAthleteEmail(email: string) {
    setAthleteEmails((prev) => prev.filter((e) => e !== email));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setGlobalError(null);
    const err = validateStep(4);
    if (err) { setGlobalError(err); return; }

    setSubmitting(true);

    try {
      const res = await fetch("/api/onboarding/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          school: school.trim(),
          team_name: teamName.trim(),
          sport,
          division: division || null,
          num_players: parseInt(numPlayers),
          manager_first_name: firstName.trim(),
          manager_last_name: lastName.trim(),
          phone: phone.trim(),
          athlete_emails: athleteEmails,
          interested_brands: interestedBrands,
          preferred_deals: preferredDeals,
          availability,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setGlobalError(data.error ?? "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }

      router.refresh();
      router.push("/dashboard/team-dashboard");
    } catch {
      setGlobalError("Network error — please check your connection and try again.");
      setSubmitting(false);
    }
  }

  const phoneValid = phone.trim().length > 0 && isValidPhone(phone);

  return (
    <div className="min-h-screen bg-white dark:bg-[#0d1117]">
      <AuthNav />

      <main className="mx-auto max-w-2xl px-6 pb-20 pt-28 md:px-8">
        <div className="mb-8">
          <h1 className="text-4xl font-black tracking-tight text-black dark:text-white">
            Set up your team
          </h1>
          <p className="mt-2 text-black/50 dark:text-white/45">
            Help brands discover and connect with your team.
          </p>
        </div>

        <ProgressBar current={step} total={4} labels={SECTIONS} />

        <form onSubmit={step === 4 ? handleSubmit : (e) => { e.preventDefault(); handleNext(); }}>

          {/* ── Step 1: Team Information ── */}
          {step === 1 && (
            <div className="space-y-5">
              <SectionTitle title="Team Information" subtitle="Tell us about your team's basics." />

              <Field label="School" required>
                <input type="text" value={school} onChange={(e) => setSchool(e.target.value)}
                  className={inputCls} placeholder="Boston University" />
              </Field>

              <Field label="Team Name" required>
                <input type="text" value={teamName} onChange={(e) => setTeamName(e.target.value)}
                  className={inputCls} placeholder="Women's Lacrosse" />
              </Field>

              <Field label="Sport" required>
                <select value={sport} onChange={(e) => setSport(e.target.value)}
                  className={`${inputCls} cursor-pointer`}>
                  <option value="" disabled>Select a sport</option>
                  {SPORTS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>

              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Division" hint="(optional)">
                  <select value={division} onChange={(e) => setDivision(e.target.value)}
                    className={`${inputCls} cursor-pointer`}>
                    <option value="">Select division</option>
                    {DIVISIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </Field>

                <Field label="Number of Players" required>
                  <input type="number" min={1} max={200} value={numPlayers}
                    onChange={(e) => setNumPlayers(e.target.value)}
                    className={inputCls} placeholder="e.g. 24" />
                </Field>
              </div>
            </div>
          )}

          {/* ── Step 2: Contact Information ── */}
          {step === 2 && (
            <div className="space-y-5">
              <SectionTitle title="Contact Information" subtitle="How can brands reach you?" />

              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="First Name" required>
                  <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)}
                    className={inputCls} placeholder="Jordan" />
                </Field>
                <Field label="Last Name" required>
                  <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)}
                    className={inputCls} placeholder="Smith" />
                </Field>
              </div>

              <Field label="Email">
                <input type="email" value={userEmail} readOnly
                  className={`${inputCls} cursor-not-allowed opacity-60`} />
              </Field>

              <Field label="Phone Number" required>
                <input type="tel" value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onBlur={() => setPhoneTouched(true)}
                  className={`${inputCls} ${phoneTouched
                    ? phoneValid
                      ? "border-green-500 focus:border-green-500 focus:ring-green-500/20"
                      : "border-red-400 focus:border-red-400 focus:ring-red-400/20"
                    : ""}`}
                  placeholder="+1 (555) 000-0000" />
                {phoneTouched && phoneValid && (
                  <p className="text-xs text-green-600 dark:text-green-400">✓ Valid phone number</p>
                )}
                {phoneTouched && !phoneValid && (
                  <p className="text-xs text-red-500">Enter a valid phone number.</p>
                )}
              </Field>
            </div>
          )}

          {/* ── Step 3: Roster Setup ── */}
          {step === 3 && (
            <div className="space-y-5">
              <SectionTitle
                title="Roster Setup"
                subtitle="Add your athletes' emails so they can be connected to your team. You can skip this and add them later."
              />

              <Field label="Add Athlete Emails" hint="(optional)">
                <div className="flex gap-2">
                  <input
                    ref={emailInputRef}
                    type="email"
                    value={emailInput}
                    onChange={(e) => { setEmailInput(e.target.value); setEmailInputError(""); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAthleteEmail(); } }}
                    className={`${inputCls} ${emailInputError ? "border-red-400 focus:border-red-400 focus:ring-red-400/20" : ""}`}
                    placeholder="athlete@university.edu"
                  />
                  <button type="button" onClick={addAthleteEmail}
                    className="shrink-0 rounded-xl bg-[#1f7ae0] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:scale-[1.02]">
                    Add
                  </button>
                </div>
                {emailInputError && <p className="text-xs text-red-500">{emailInputError}</p>}
              </Field>

              {athleteEmails.length > 0 && (
                <div className="rounded-xl border border-black/8 bg-[#f9fafb] p-4 dark:border-white/8 dark:bg-white/3">
                  <p className="mb-3 text-xs font-bold uppercase tracking-widest text-black/40 dark:text-white/35">
                    {athleteEmails.length} athlete{athleteEmails.length !== 1 ? "s" : ""} added
                  </p>
                  <ul className="space-y-2">
                    {athleteEmails.map((email) => (
                      <li key={email} className="flex items-center justify-between rounded-lg bg-white px-4 py-2.5 shadow-sm dark:bg-white/5">
                        <span className="text-sm text-black dark:text-white">{email}</span>
                        <button type="button" onClick={() => removeAthleteEmail(email)}
                          className="ml-3 text-sm text-black/30 transition hover:text-red-500 dark:text-white/30 dark:hover:text-red-400">
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {athleteEmails.length === 0 && (
                <div className="rounded-xl border border-dashed border-black/15 p-6 text-center dark:border-white/15">
                  <p className="text-sm text-black/35 dark:text-white/30">
                    No athletes added yet. Add emails above or skip this step.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Step 4: Partnership Preferences ── */}
          {step === 4 && (
            <div className="space-y-6">
              <SectionTitle title="Partnership Preferences" subtitle="What kinds of brand deals are you looking for?" />

              <Field label="Interested Brand Types" required hint="select all that apply">
                <ChipToggle options={BRAND_TYPES} selected={interestedBrands} onChange={setInterestedBrands} />
                {interestedBrands.length === 0 && (
                  <p className="mt-1 text-xs text-black/35 dark:text-white/30">Select at least one.</p>
                )}
              </Field>

              <Field label="Preferred Deal Types" required>
                <div className="space-y-3">
                  {DEAL_TYPES.map((dt) => {
                    const active = preferredDeals.includes(dt.value);
                    return (
                      <button key={dt.value} type="button"
                        onClick={() => setPreferredDeals((prev) =>
                          active ? prev.filter((x) => x !== dt.value) : [...prev, dt.value]
                        )}
                        className={`w-full rounded-xl border p-4 text-left transition-all ${
                          active
                            ? "border-[#1f7ae0] bg-[#dbeafe] dark:bg-[#1a2f5a]"
                            : "border-black/10 bg-white hover:border-[#1f7ae0]/40 dark:border-white/10 dark:bg-white/5"
                        }`}>
                        <div className="flex items-center justify-between">
                          <span className={`text-sm font-bold ${active ? "text-[#1f7ae0] dark:text-[#93c5fd]" : "text-black dark:text-white"}`}>
                            {dt.label}
                          </span>
                          <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-black transition-all ${
                            active ? "bg-[#1f7ae0] text-white" : "border border-black/20 dark:border-white/20"
                          }`}>
                            {active ? "✓" : ""}
                          </span>
                        </div>
                        <p className={`mt-0.5 text-xs ${active ? "text-[#1f7ae0]/75 dark:text-[#93c5fd]/70" : "text-black/40 dark:text-white/35"}`}>
                          {dt.desc}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </Field>

              <Field label="Estimated Availability" required>
                <div className="grid gap-3 sm:grid-cols-3">
                  {AVAILABILITY_OPTIONS.map((opt) => {
                    const active = availability === opt.value;
                    return (
                      <button key={opt.value} type="button" onClick={() => setAvailability(opt.value)}
                        className={`rounded-xl border p-4 text-left transition-all ${
                          active
                            ? "border-[#1f7ae0] bg-[#dbeafe] dark:bg-[#1a2f5a]"
                            : "border-black/10 bg-white hover:border-[#1f7ae0]/40 dark:border-white/10 dark:bg-white/5"
                        }`}>
                        <p className={`text-sm font-bold ${active ? "text-[#1f7ae0] dark:text-[#93c5fd]" : "text-black dark:text-white"}`}>
                          {opt.label}
                        </p>
                        <p className={`mt-0.5 text-xs ${active ? "text-[#1f7ae0]/75 dark:text-[#93c5fd]/70" : "text-black/40 dark:text-white/35"}`}>
                          {opt.desc}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </Field>
            </div>
          )}

          {/* ── Error ── */}
          {globalError && (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">
              {globalError}
            </div>
          )}

          {/* ── Navigation ── */}
          <div className="mt-8 flex gap-3">
            {step > 1 && (
              <button type="button" onClick={handleBack}
                className="flex items-center gap-2 rounded-full border border-black/15 bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-black/5 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5M12 5l-7 7 7 7"/>
                </svg>
                Back
              </button>
            )}

            {step < 4 ? (
              <button type="submit"
                className="ml-auto rounded-full bg-[#1f7ae0] px-8 py-3 text-sm font-semibold text-white shadow-sm transition hover:scale-[1.02]">
                Continue →
              </button>
            ) : (
              <button type="submit" disabled={submitting}
                className="ml-auto rounded-full bg-[#1f7ae0] px-8 py-3.5 text-sm font-semibold text-white shadow-md transition hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100">
                {submitting ? "Creating team..." : "Create Team →"}
              </button>
            )}
          </div>
        </form>
      </main>
    </div>
  );
}
