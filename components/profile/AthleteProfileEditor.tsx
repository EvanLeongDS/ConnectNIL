"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ATHLETE_SPORTS, GRAD_YEARS, SCHOOL_BANNED } from "@/lib/profile/athleteConstants";
import { profileInputClass } from "@/lib/profile/inputClass";
import AthletePhotoPicker from "@/components/profile/AthletePhotoPicker";

export type AthleteProfilePayload = {
  first_name: string;
  last_name: string;
  phone: string;
  school: string;
  graduation_year: number;
  sport: string;
  team: string;
  bio: string | null;
  instagram_handle: string | null;
  tiktok_handle: string | null;
  twitter_handle: string | null;
  snapchat_handle: string | null;
  instagram_followers: number | null;
  tiktok_followers: number | null;
  twitter_followers: number | null;
  snapchat_followers: number | null;
  photo_key: string | null;
};

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-semibold text-black dark:text-white">
        {label}
        {required && <span className="text-[#1f7ae0]"> *</span>}
      </label>
      {children}
    </div>
  );
}

function followersString(n: number | null | undefined) {
  if (n === null || n === undefined) return "";
  return String(n);
}

export default function AthleteProfileEditor({
  profile,
  redirectAfterSave,
  photoUrl,
}: {
  profile: AthleteProfilePayload;
  /** When set, navigate here after a successful save (e.g. back to read-only profile). */
  redirectAfterSave?: string;
  /** Presigned URL for the CURRENT photo, resolved server-side. Null when there is none. */
  photoUrl?: string | null;
}) {
  const router = useRouter();
  const [firstName, setFirstName] = useState(profile.first_name);
  const [lastName, setLastName] = useState(profile.last_name);
  const [phone, setPhone] = useState(profile.phone);
  const [school, setSchool] = useState(profile.school);
  const [graduationYear, setGraduationYear] = useState(profile.graduation_year);
  const [sport, setSport] = useState(profile.sport);
  const [team, setTeam] = useState(profile.team);
  const [bio, setBio] = useState(profile.bio ?? "");
  const [instagramHandle, setInstagramHandle] = useState(profile.instagram_handle ?? "");
  const [tiktokHandle, setTiktokHandle] = useState(profile.tiktok_handle ?? "");
  const [twitterHandle, setTwitterHandle] = useState(profile.twitter_handle ?? "");
  const [snapchatHandle, setSnapchatHandle] = useState(profile.snapchat_handle ?? "");
  const [instagramFollowers, setInstagramFollowers] = useState(followersString(profile.instagram_followers));
  const [tiktokFollowers, setTiktokFollowers] = useState(followersString(profile.tiktok_followers));
  const [twitterFollowers, setTwitterFollowers] = useState(followersString(profile.twitter_followers));
  const [snapchatFollowers, setSnapchatFollowers] = useState(followersString(profile.snapchat_followers));

  const [photoKey, setPhotoKey] = useState<string | null>(profile.photo_key);
  const [photoUploading, setPhotoUploading] = useState(false);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const gradYearOptions = [...new Set([...GRAD_YEARS, profile.graduation_year])].sort((a, b) => a - b);
  const sportInList = ATHLETE_SPORTS.includes(sport as (typeof ATHLETE_SPORTS)[number]);

  function clientSchoolHint(): string | null {
    const lower = school.toLowerCase().trim();
    if (school.trim().length < 3) return null;
    for (const term of SCHOOL_BANNED) {
      if (lower.includes(term)) return "Use a 4-year college or university.";
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setSaving(true);
    try {
      const res = await fetch("/api/profile/athlete", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          phone,
          school,
          graduationYear,
          sport,
          team,
          bio: bio.trim() || null,
          instagramHandle,
          tiktokHandle,
          twitterHandle,
          snapchatHandle,
          instagramFollowers: instagramFollowers.trim() === "" ? null : instagramFollowers,
          tiktokFollowers: tiktokFollowers.trim() === "" ? null : tiktokFollowers,
          twitterFollowers: twitterFollowers.trim() === "" ? null : twitterFollowers,
          snapchatFollowers: snapchatFollowers.trim() === "" ? null : snapchatFollowers,
          /* Always sent, so null means "remove my photo". The route distinguishes an absent
             key (leave alone) from an explicit null, and this form always knows the
             athlete's intent — so it always states it. */
          photoKey,
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

  const schoolWarn = clientSchoolHint();

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

      <Field label="Profile photo">
        <AthletePhotoPicker
          value={photoKey}
          savedUrl={photoUrl}
          onChange={setPhotoKey}
          onBusyChange={setPhotoUploading}
          firstName={firstName}
          lastName={lastName}
          hint="This is how brands and your team manager see you."
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" required>
          <input className={profileInputClass} value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
        </Field>
        <Field label="Last name" required>
          <input className={profileInputClass} value={lastName} onChange={(e) => setLastName(e.target.value)} required />
        </Field>
      </div>

      <Field label="Phone" required>
        <input className={profileInputClass} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
      </Field>

      <Field label="School" required>
        <input className={profileInputClass} value={school} onChange={(e) => setSchool(e.target.value)} required />
        {schoolWarn && <p className="text-xs text-amber-600 dark:text-amber-400">{schoolWarn}</p>}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Graduation year" required>
          <select
            className={`${profileInputClass} cursor-pointer`}
            value={graduationYear}
            onChange={(e) => setGraduationYear(parseInt(e.target.value, 10))}
            required
          >
            {gradYearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Sport" required>
          <select className={`${profileInputClass} cursor-pointer`} value={sport} onChange={(e) => setSport(e.target.value)} required>
            {!sportInList && sport ? (
              <option value={sport}>
                {sport}
              </option>
            ) : null}
            {ATHLETE_SPORTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Team" required>
        <input className={profileInputClass} value={team} onChange={(e) => setTeam(e.target.value)} placeholder="e.g. Women's Soccer" required />
      </Field>

      <Field label="Bio">
        <textarea
          className={`${profileInputClass} min-h-[100px] resize-y`}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Tell brands about yourself…"
        />
      </Field>

      <p className="text-xs font-bold uppercase tracking-wider text-black/35 dark:text-white/30">Social (handles without @)</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Instagram">
          <input className={profileInputClass} value={instagramHandle} onChange={(e) => setInstagramHandle(e.target.value)} />
          <input
            className={`${profileInputClass} mt-2`}
            type="number"
            min={0}
            placeholder="Followers (optional)"
            value={instagramFollowers}
            onChange={(e) => setInstagramFollowers(e.target.value)}
          />
        </Field>
        <Field label="TikTok">
          <input className={profileInputClass} value={tiktokHandle} onChange={(e) => setTiktokHandle(e.target.value)} />
          <input
            className={`${profileInputClass} mt-2`}
            type="number"
            min={0}
            placeholder="Followers (optional)"
            value={tiktokFollowers}
            onChange={(e) => setTiktokFollowers(e.target.value)}
          />
        </Field>
        <Field label="X (Twitter)">
          <input className={profileInputClass} value={twitterHandle} onChange={(e) => setTwitterHandle(e.target.value)} />
          <input
            className={`${profileInputClass} mt-2`}
            type="number"
            min={0}
            placeholder="Followers (optional)"
            value={twitterFollowers}
            onChange={(e) => setTwitterFollowers(e.target.value)}
          />
        </Field>
        <Field label="Snapchat">
          <input className={profileInputClass} value={snapchatHandle} onChange={(e) => setSnapchatHandle(e.target.value)} />
          <input
            className={`${profileInputClass} mt-2`}
            type="number"
            min={0}
            placeholder="Followers (optional)"
            value={snapchatFollowers}
            onChange={(e) => setSnapchatFollowers(e.target.value)}
          />
        </Field>
      </div>

      <button
        type="submit"
        /* Also blocked mid-upload: saving then would PATCH the OLD key and strand the
           object that is still being written. */
        disabled={saving || photoUploading}
        className="rounded-full bg-[#1f7ae0] px-8 py-3 text-sm font-semibold text-white shadow-sm transition hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
      >
        {saving ? "Saving…" : photoUploading ? "Uploading photo…" : "Save changes"}
      </button>
    </form>
  );
}
