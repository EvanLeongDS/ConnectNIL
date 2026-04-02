"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AuthNav from "@/components/auth/AuthNav";

// ── Constants ────────────────────────────────────────────────────────────────

const SPORTS = [
  "Baseball", "Basketball", "Beach Volleyball", "Cross Country",
  "Equestrian", "Fencing", "Field Hockey", "Football",
  "Golf", "Gymnastics", "Ice Hockey", "Lacrosse",
  "Rowing", "Rugby", "Skiing", "Soccer",
  "Softball", "Swimming & Diving", "Tennis", "Track & Field",
  "Volleyball", "Water Polo", "Wrestling", "Other",
];

const UNIVERSITIES = [
  "Abilene Christian University", "Air Force Academy", "Alabama A&M University",
  "Appalachian State University", "Arizona State University", "Auburn University",
  "Ball State University", "Baylor University", "Binghamton University",
  "Boston College", "Boston University", "Bowling Green State University",
  "Brigham Young University", "Brown University", "Bryant University",
  "Bucknell University", "Butler University", "Cal Poly San Luis Obispo",
  "California State University Fullerton", "California State University Long Beach",
  "California State University Northridge", "Campbell University", "Canisius College",
  "Central Michigan University", "Charleston Southern University", "Citadel",
  "Clemson University", "Cleveland State University", "Coastal Carolina University",
  "Colgate University", "College of Charleston", "College of Holy Cross",
  "Colorado State University", "Columbia University", "Cornell University",
  "Dartmouth College", "Davidson College", "Delaware State University",
  "DePaul University", "Drake University", "Drexel University",
  "Duke University", "Duquesne University", "East Carolina University",
  "East Tennessee State University", "Eastern Michigan University",
  "Elon University", "Fairfield University", "Florida A&M University",
  "Florida Atlantic University", "Florida International University",
  "Florida State University", "Fordham University", "Fresno State University",
  "Furman University", "Gardner-Webb University", "George Mason University",
  "George Washington University", "Georgetown University", "Georgia Institute of Technology",
  "Georgia Southern University", "Georgia State University", "Gonzaga University",
  "Grambling State University", "Grand Canyon University", "Hampton University",
  "Harvard University", "High Point University", "Hofstra University",
  "Houston Baptist University", "Howard University", "Idaho State University",
  "Illinois State University", "Indiana State University", "Indiana University Bloomington",
  "Iowa State University", "Jackson State University", "Jacksonville State University",
  "Jacksonville University", "James Madison University", "Kansas State University",
  "Kennesaw State University", "Kent State University", "La Salle University",
  "Lafayette College", "Lamar University", "Lehigh University",
  "Liberty University", "Lipscomb University", "Long Beach State University",
  "Long Island University", "Louisiana State University", "Louisiana Tech University",
  "Louisville University", "Loyola Marymount University", "Loyola University Chicago",
  "Loyola University Maryland", "Manhattan College", "Marist College",
  "Marquette University", "Marshall University", "McNeese State University",
  "Memphis University", "Mercer University", "Miami University (Ohio)",
  "Michigan State University", "Middle Tennessee State University",
  "Mississippi State University", "Missouri State University", "Monmouth University",
  "Montana State University", "Montana University", "Morehead State University",
  "Morgan State University", "Mount St. Mary's University", "Murray State University",
  "Navy", "New Mexico State University", "Niagara University",
  "Nicholls State University", "Norfolk State University", "North Carolina A&T State University",
  "North Carolina Central University", "North Carolina State University",
  "North Dakota State University", "Northeastern University", "Northern Arizona University",
  "Northern Colorado University", "Northern Illinois University", "Northern Iowa University",
  "Northwestern State University", "Northwestern University", "Notre Dame University",
  "Oakland University", "Ohio State University", "Ohio University",
  "Oklahoma State University", "Old Dominion University", "Oral Roberts University",
  "Oregon State University", "Penn State University", "Portland State University",
  "Prairie View A&M University", "Presbyterian College", "Princeton University",
  "Providence College", "Purdue University", "Quinnipiac University",
  "Radford University", "Rhode Island University", "Rice University",
  "Rider University", "Robert Morris University", "Rutgers University",
  "Sacred Heart University", "Saint Francis University", "Saint Joseph's University",
  "Saint Louis University", "Saint Mary's College of California",
  "Sam Houston State University", "Samford University", "San Diego State University",
  "San Francisco University", "San Jose State University", "Santa Clara University",
  "Savannah State University", "Seattle University", "Seton Hall University",
  "Siena College", "South Carolina State University", "South Dakota State University",
  "South Florida University", "Southeast Missouri State University",
  "Southeastern Louisiana University", "Southern Illinois University",
  "Southern Methodist University", "Southern University", "Southern Utah University",
  "St. Bonaventure University", "St. John's University", "Stanford University",
  "Stephen F. Austin State University", "Stetson University", "Stony Brook University",
  "Syracuse University", "Temple University", "Tennessee State University",
  "Tennessee Tech University", "Texas A&M University", "Texas Christian University",
  "Texas Southern University", "Texas State University", "Texas Tech University",
  "The Citadel", "Toledo University", "Troy University",
  "Tulane University", "Tulsa University", "UC Davis",
  "UC Irvine", "UC Riverside", "UC San Diego",
  "UC Santa Barbara", "UCLA", "UMBC",
  "UNC Asheville", "UNC Charlotte", "UNC Greensboro",
  "UNC Wilmington", "University of Akron", "University of Alabama",
  "University of Arizona", "University of Arkansas", "University of California Berkeley",
  "University of Central Arkansas", "University of Central Florida",
  "University of Cincinnati", "University of Colorado Boulder",
  "University of Connecticut", "University of Dayton", "University of Delaware",
  "University of Denver", "University of Detroit Mercy", "University of Florida",
  "University of Georgia", "University of Hartford", "University of Hawaii",
  "University of Houston", "University of Idaho", "University of Illinois",
  "University of Iowa", "University of Kansas", "University of Kentucky",
  "University of Louisville", "University of Maine", "University of Maryland",
  "University of Massachusetts Amherst", "University of Memphis",
  "University of Miami", "University of Michigan", "University of Minnesota",
  "University of Mississippi", "University of Missouri", "University of Montana",
  "University of Nebraska", "University of Nevada Las Vegas", "University of Nevada Reno",
  "University of New Hampshire", "University of New Mexico", "University of New Orleans",
  "University of North Carolina", "University of North Dakota",
  "University of North Florida", "University of North Texas",
  "University of Northern Colorado", "University of Notre Dame",
  "University of Oklahoma", "University of Oregon", "University of Pacific",
  "University of Pennsylvania", "University of Pittsburgh", "University of Portland",
  "University of Rhode Island", "University of Richmond", "University of San Diego",
  "University of San Francisco", "University of South Alabama",
  "University of South Carolina", "University of South Dakota",
  "University of South Florida", "University of Southern California",
  "University of Southern Mississippi", "University of Tennessee",
  "University of Texas at Arlington", "University of Texas at Austin",
  "University of Texas at El Paso", "University of Texas at San Antonio",
  "University of Utah", "University of Vermont", "University of Virginia",
  "University of Washington", "University of Wisconsin", "University of Wyoming",
  "Utah State University", "Utah Valley University", "Valparaiso University",
  "Vanderbilt University", "Vermont University", "Villanova University",
  "Virginia Commonwealth University", "Virginia Military Institute",
  "Virginia Tech", "Wagner College", "Wake Forest University",
  "Washington State University", "Weber State University", "West Virginia University",
  "Western Illinois University", "Western Kentucky University",
  "Western Michigan University", "Wichita State University", "William & Mary",
  "Winthrop University", "Wisconsin-Milwaukee University", "Wofford College",
  "Wright State University", "Xavier University", "Yale University",
  "Youngstown State University",
];

const BANNED_TERMS = [
  "high school", "hs", "middle school", "ms", "elementary",
  "junior high", "prep school",
];

const currentYear = new Date().getFullYear();
const GRAD_YEARS = Array.from({ length: 7 }, (_, i) => currentYear + i);

const SECTIONS = ["About you", "School & sport", "Your pitch", "Social"];

// ── Helpers ──────────────────────────────────────────────────────────────────

function isValidSchool(val: string): { ok: boolean; message: string } {
  const lower = val.toLowerCase().trim();
  if (val.trim().length < 3) return { ok: false, message: "School name is too short." };
  for (const term of BANNED_TERMS) {
    if (lower.includes(term))
      return { ok: false, message: "Please enter a 4-year college or university." };
  }
  if (/^\d+$/.test(val.trim()))
    return { ok: false, message: "Please enter a valid school name." };
  const match = UNIVERSITIES.some(
    (u) => u.toLowerCase() === lower
  );
  if (!match)
    return {
      ok: true,
      message: "School not found in our list — double-check the spelling.",
    };
  return { ok: true, message: "" };
}

function isValidPhone(val: string) {
  return /^[\d\s\-().+]{7,15}$/.test(val.trim());
}

function formatHandle(val: string) {
  return val.startsWith("@") ? val.slice(1) : val;
}

// ── UI pieces (match brand / team onboarding) ────────────────────────────────

function Field({
  label,
  hint,
  required = false,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-black dark:text-white">
        {label}
        {required && <span className="text-[#1f7ae0]">*</span>}
        {hint && <span className="text-xs font-normal text-black/40 dark:text-white/35">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-black/12 bg-white px-4 py-3 text-sm text-black placeholder-black/30 shadow-sm transition focus:border-[#1f7ae0] focus:outline-none focus:ring-2 focus:ring-[#1f7ae0]/20 dark:border-white/12 dark:bg-[#1c2333] dark:text-white dark:placeholder-white/30 dark:focus:border-[#1f7ae0]";

function ProgressBar({ current, total, labels }: { current: number; total: number; labels: string[] }) {
  return (
    <div className="mb-10">
      <div className="mb-3 flex items-center justify-between">
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
            <div
              className={`h-2 w-2 rounded-full transition-colors ${
                i < current ? "bg-[#1f7ae0]" : "bg-black/15 dark:bg-white/15"
              }`}
            />
            <span
              className={`hidden text-[10px] font-medium sm:block ${
                i < current ? "text-[#1f7ae0]" : "text-black/30 dark:text-white/25"
              }`}
            >
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

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AthleteOnboardingPage() {
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState(1);
  const [userEmail, setUserEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [school, setSchool] = useState("");
  const [gradYear, setGradYear] = useState("");
  const [sport, setSport] = useState("");
  const [team, setTeam] = useState("");
  const [bio, setBio] = useState("");
  const [instagram, setInstagram] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [twitter, setTwitter] = useState("");
  const [snapchat, setSnapchat] = useState("");
  const [igFollowers, setIgFollowers] = useState("");
  const [ttFollowers, setTtFollowers] = useState("");
  const [twFollowers, setTwFollowers] = useState("");
  const [scFollowers, setScFollowers] = useState("");

  const [phoneTouched, setPhoneTouched] = useState(false);
  const [schoolTouched, setSchoolTouched] = useState(false);
  const [igTouched, setIgTouched] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setUserEmail(data.user.email);
    });
  }, []);

  const schoolStatus = schoolTouched ? isValidSchool(school) : null;
  const phoneValid = phone.trim().length > 0 && isValidPhone(phone);
  const igValid = instagram.trim().length > 0;

  function validateStep(s: number): string | null {
    if (s === 1) {
      if (!firstName.trim()) return "First name is required.";
      if (!lastName.trim()) return "Last name is required.";
      if (!isValidPhone(phone)) return "Please enter a valid phone number.";
    }
    if (s === 2) {
      const schoolCheck = isValidSchool(school);
      if (!schoolCheck.ok) return schoolCheck.message;
      if (!gradYear) return "Please select a graduation year.";
      if (!sport) return "Please select a sport.";
      if (!team.trim()) return "Team name is required.";
    }
    if (s === 3) {
      return null;
    }
    if (s === 4) {
      if (!instagram.trim()) return "Instagram handle is required.";
    }
    return null;
  }

  function handleNext() {
    setGlobalError(null);
    const err = validateStep(step);
    if (err) {
      setGlobalError(err);
      if (step === 2 && school.trim()) setSchoolTouched(true);
      return;
    }
    setStep((x) => x + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleBack() {
    setGlobalError(null);
    setStep((x) => x - 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setGlobalError(null);
    for (let s = 1; s <= 4; s++) {
      const err = validateStep(s);
      if (err) {
        setGlobalError(err);
        setStep(s);
        if (s === 2) setSchoolTouched(true);
        if (s === 4) setIgTouched(true);
        return;
      }
    }

    setSubmitting(true);

    try {
      const res = await fetch("/api/onboarding/athlete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
          school: school.trim(),
          graduation_year: parseInt(gradYear, 10),
          sport,
          team: team.trim(),
          bio: bio.trim() || null,
          instagram_handle: instagram ? formatHandle(instagram) : null,
          tiktok_handle: tiktok ? formatHandle(tiktok) : null,
          twitter_handle: twitter ? formatHandle(twitter) : null,
          snapchat_handle: snapchat ? formatHandle(snapchat) : null,
          instagram_followers: igFollowers ? parseInt(igFollowers, 10) : null,
          tiktok_followers: ttFollowers ? parseInt(ttFollowers, 10) : null,
          twitter_followers: twFollowers ? parseInt(twFollowers, 10) : null,
          snapchat_followers: scFollowers ? parseInt(scFollowers, 10) : null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setGlobalError(data.error ?? "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }

      router.refresh();
      router.push("/dashboard/athlete-dashboard");
    } catch {
      setGlobalError("Network error — please check your connection and try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-white dark:bg-[#0d1117]">
      <AuthNav />

      <main className="mx-auto max-w-2xl px-6 pb-20 pt-28 md:px-8">
        <div className="mb-8">
          <h1 className="text-4xl font-black tracking-tight text-black dark:text-white">
            Tell us about yourself
          </h1>
          <p className="mt-2 text-black/50 dark:text-white/45">
            This info helps brands find and connect with you.
          </p>
        </div>

        <ProgressBar current={step} total={4} labels={SECTIONS} />

        <form
          onSubmit={step === 4 ? handleSubmit : (e) => { e.preventDefault(); handleNext(); }}
          className="space-y-8"
        >
          {step === 1 && (
            <div className="space-y-5">
              <SectionTitle title="About you" subtitle="Name and how brands can reach you." />

              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="First Name" required>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className={inputCls}
                    placeholder="Jane"
                  />
                </Field>
                <Field label="Last Name" required>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className={inputCls}
                    placeholder="Smith"
                  />
                </Field>
              </div>

              <Field label="Email">
                <input
                  type="email"
                  value={userEmail}
                  readOnly
                  className={`${inputCls} cursor-not-allowed opacity-60`}
                />
              </Field>

              <Field label="Phone Number" required>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onBlur={() => setPhoneTouched(true)}
                  className={`${inputCls} ${
                    phoneTouched
                      ? phoneValid
                        ? "border-green-500 focus:border-green-500 focus:ring-green-500/20"
                        : "border-red-400 focus:border-red-400 focus:ring-red-400/20"
                      : ""
                  }`}
                  placeholder="+1 (555) 000-0000"
                />
                {phoneTouched && !phoneValid && (
                  <p className="text-xs text-red-500">Enter a valid phone number.</p>
                )}
                {phoneTouched && phoneValid && (
                  <p className="text-xs text-green-600 dark:text-green-400">✓ Valid phone number</p>
                )}
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <SectionTitle
                title="School & sport"
                subtitle="Where you play and when you graduate."
              />

              <Field label="School" required hint="4-year college or university">
                <input
                  type="text"
                  list="university-list"
                  value={school}
                  onChange={(e) => {
                    setSchool(e.target.value);
                    setSchoolTouched(false);
                  }}
                  onBlur={() => setSchoolTouched(true)}
                  className={`${inputCls} ${
                    schoolTouched && school
                      ? !schoolStatus?.ok
                        ? "border-red-400 focus:border-red-400 focus:ring-red-400/20"
                        : schoolStatus.message
                          ? "border-yellow-400 focus:border-yellow-400 focus:ring-yellow-400/20"
                          : "border-green-500 focus:border-green-500 focus:ring-green-500/20"
                      : ""
                  }`}
                  placeholder="Boston University"
                  autoComplete="off"
                />
                <datalist id="university-list">
                  {UNIVERSITIES.map((u) => (
                    <option key={u} value={u} />
                  ))}
                </datalist>
                {schoolTouched && school && schoolStatus && (
                  <p
                    className={`text-xs ${
                      !schoolStatus.ok
                        ? "text-red-500"
                        : schoolStatus.message
                          ? "text-yellow-600 dark:text-yellow-400"
                          : "text-green-600 dark:text-green-400"
                    }`}
                  >
                    {!schoolStatus.ok
                      ? schoolStatus.message
                      : schoolStatus.message
                        ? `⚠ ${schoolStatus.message}`
                        : "✓ Verified university"}
                  </p>
                )}
              </Field>

              <Field label="Graduation Year" required>
                <select
                  value={gradYear}
                  onChange={(e) => setGradYear(e.target.value)}
                  className={`${inputCls} cursor-pointer`}
                >
                  <option value="">Select year</option>
                  {GRAD_YEARS.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Sport" required>
                <select
                  value={sport}
                  onChange={(e) => setSport(e.target.value)}
                  className={`${inputCls} cursor-pointer`}
                >
                  <option value="">Select sport</option>
                  {SPORTS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Team" required hint="e.g. Women's Lacrosse, Men's Basketball">
                <input
                  type="text"
                  value={team}
                  onChange={(e) => setTeam(e.target.value)}
                  className={inputCls}
                  placeholder="Women's Lacrosse"
                />
              </Field>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <SectionTitle
                title="Your pitch to brands"
                subtitle="Optional — tell partners what makes you a great fit."
              />

              <Field label="Bio" hint="(optional — max 280 characters)">
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value.slice(0, 280))}
                  rows={4}
                  className={`${inputCls} resize-none`}
                  placeholder="Tell brands who you are, what you stand for, and why they should partner with you..."
                />
                <p
                  className={`text-right text-xs ${
                    bio.length >= 260 ? "text-red-500" : "text-black/30 dark:text-white/30"
                  }`}
                >
                  {bio.length}/280
                </p>
              </Field>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5">
              <SectionTitle
                title="Social media"
                subtitle="Instagram is required; add other platforms and follower counts if you like."
              />

              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Instagram" required>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-black/40 dark:text-white/35">
                      @
                    </span>
                    <input
                      type="text"
                      value={instagram}
                      onChange={(e) => {
                        setInstagram(formatHandle(e.target.value));
                        setIgTouched(true);
                      }}
                      onBlur={() => setIgTouched(true)}
                      className={`${inputCls} pl-8 ${
                        igTouched
                          ? igValid
                            ? "border-green-500 focus:border-green-500 focus:ring-green-500/20"
                            : "border-red-400 focus:border-red-400 focus:ring-red-400/20"
                          : ""
                      }`}
                      placeholder="yourhandle"
                    />
                  </div>
                  {igTouched && !igValid && (
                    <p className="text-xs text-red-500">Instagram handle is required.</p>
                  )}
                  {igTouched && igValid && (
                    <p className="text-xs text-green-600 dark:text-green-400">✓</p>
                  )}
                </Field>

                <Field label="TikTok" hint="(optional)">
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-black/40 dark:text-white/35">
                      @
                    </span>
                    <input
                      type="text"
                      value={tiktok}
                      onChange={(e) => setTiktok(formatHandle(e.target.value))}
                      className={`${inputCls} pl-8`}
                      placeholder="yourhandle"
                    />
                  </div>
                </Field>

                {instagram && (
                  <Field label="Instagram followers" hint="(optional)">
                    <input
                      type="number"
                      min={0}
                      value={igFollowers}
                      onChange={(e) => setIgFollowers(e.target.value)}
                      className={inputCls}
                      placeholder="e.g. 1000"
                    />
                  </Field>
                )}

                {tiktok && (
                  <Field label="TikTok followers" hint="(optional)">
                    <input
                      type="number"
                      min={0}
                      value={ttFollowers}
                      onChange={(e) => setTtFollowers(e.target.value)}
                      className={inputCls}
                      placeholder="e.g. 1000"
                    />
                  </Field>
                )}

                <Field label="X (Twitter)" hint="(optional)">
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-black/40 dark:text-white/35">
                      @
                    </span>
                    <input
                      type="text"
                      value={twitter}
                      onChange={(e) => setTwitter(formatHandle(e.target.value))}
                      className={`${inputCls} pl-8`}
                      placeholder="yourhandle"
                    />
                  </div>
                </Field>

                <Field label="Snapchat" hint="(optional)">
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-black/40 dark:text-white/35">
                      @
                    </span>
                    <input
                      type="text"
                      value={snapchat}
                      onChange={(e) => setSnapchat(formatHandle(e.target.value))}
                      className={`${inputCls} pl-8`}
                      placeholder="username"
                    />
                  </div>
                </Field>

                {twitter && (
                  <Field label="X (Twitter) followers" hint="(optional)">
                    <input
                      type="number"
                      min={0}
                      value={twFollowers}
                      onChange={(e) => setTwFollowers(e.target.value)}
                      className={inputCls}
                      placeholder="e.g. 1000"
                    />
                  </Field>
                )}

                {snapchat && (
                  <Field label="Snapchat followers" hint="(optional — story subs or comparable reach)">
                    <input
                      type="number"
                      min={0}
                      value={scFollowers}
                      onChange={(e) => setScFollowers(e.target.value)}
                      className={inputCls}
                      placeholder="e.g. 5000"
                    />
                  </Field>
                )}
              </div>
            </div>
          )}

          {globalError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
              {globalError}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            {step > 1 && (
              <button
                type="button"
                onClick={handleBack}
                className="flex items-center gap-2 rounded-full border border-black/15 bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-black/5 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M19 12H5M12 5l-7 7 7 7" />
                </svg>
                Back
              </button>
            )}

            {step < 4 ? (
              <button
                type="submit"
                className="ml-auto rounded-full bg-[#1f7ae0] px-8 py-3 text-sm font-semibold text-white shadow-sm transition hover:scale-[1.02]"
              >
                Continue →
              </button>
            ) : (
              <button
                type="submit"
                disabled={submitting}
                className="ml-auto rounded-full bg-[#1f7ae0] px-8 py-3.5 text-sm font-semibold text-white shadow-md transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
              >
                {submitting ? "Saving..." : "Complete Profile →"}
              </button>
            )}
          </div>
        </form>
      </main>
    </div>
  );
}
