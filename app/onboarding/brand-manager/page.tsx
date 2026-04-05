"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AuthNav from "@/components/auth/AuthNav";

// ── Constants ─────────────────────────────────────────────────────────────────

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

const CITIES_BY_STATE: Record<string, string[]> = {
  AL: ["Birmingham","Huntsville","Mobile","Montgomery","Tuscaloosa","Hoover","Dothan","Auburn","Decatur","Madison"],
  AK: ["Anchorage","Fairbanks","Juneau","Sitka","Ketchikan","Wasilla","Kenai","Kodiak","Bethel","Palmer"],
  AZ: ["Phoenix","Tucson","Mesa","Chandler","Scottsdale","Glendale","Gilbert","Tempe","Peoria","Surprise"],
  AR: ["Little Rock","Fort Smith","Fayetteville","Springdale","Jonesboro","North Little Rock","Conway","Rogers","Pine Bluff","Bentonville"],
  CA: ["Los Angeles","San Diego","San Jose","San Francisco","Fresno","Sacramento","Long Beach","Oakland","Bakersfield","Anaheim","Santa Ana","Riverside","Irvine","San Mateo", "Belmont","Stockton","Chula Vista","Fremont","San Bernardino","Modesto","Fontana","Santa Clarita","Glendale","Huntington Beach","Santa Rosa","Moreno Valley","Oxnard","Oceanside"],
  CO: ["Denver","Colorado Springs","Aurora","Fort Collins","Lakewood","Thornton","Arvada","Westminster","Pueblo","Centennial","Boulder","Highlands Ranch","Greeley","Longmont","Loveland"],
  CT: ["Bridgeport","New Haven","Stamford","Hartford","Waterbury","Norwalk","Danbury","New Britain","West Hartford","Greenwich","Hamden","Bristol","Meriden","Milford","Stratford"],
  DE: ["Wilmington","Dover","Newark","Middletown","Smyrna","Milford","Seaford","Georgetown","Elsmere","New Castle"],
  DC: ["Washington"],
  FL: ["Jacksonville","Miami","Tampa","Orlando","St. Petersburg","Hialeah","Port St. Lucie","Tallahassee","Cape Coral","Fort Lauderdale","Pembroke Pines","Hollywood","Gainesville","Miramar","Coral Springs","Clearwater","Miami Gardens","Palm Bay","Lakeland","Pompano Beach","West Palm Beach","Davie","Boca Raton","Deltona","Sunrise"],
  GA: ["Atlanta","Augusta","Columbus","Macon","Savannah","Athens","Sandy Springs","Roswell","Johns Creek","Albany","Warner Robins","Alpharetta","Marietta","Valdosta","Smyrna","Dunwoody","Rome","East Point","Peachtree City"],
  HI: ["Honolulu","Hilo","Kailua","Kapolei","Pearl City","Waipahu","Kaneohe","Mililani","Ewa Beach","Kahului"],
  ID: ["Boise","Nampa","Meridian","Idaho Falls","Pocatello","Caldwell","Coeur d'Alene","Twin Falls","Lewiston","Post Falls"],
  IL: ["Chicago","Aurora","Joliet","Naperville","Rockford","Springfield","Elgin","Peoria","Champaign","Waukegan","Bloomington","Decatur","Evanston","Schaumburg","Bolingbrook"],
  IN: ["Indianapolis","Fort Wayne","Evansville","South Bend","Carmel","Fishers","Bloomington","Hammond","Gary","Muncie","Lafayette","Terre Haute","Kokomo","Anderson","Noblesville"],
  IA: ["Des Moines","Cedar Rapids","Davenport","Sioux City","Iowa City","Waterloo","Ames","West Des Moines","Council Bluffs","Dubuque"],
  KS: ["Wichita","Overland Park","Kansas City","Olathe","Topeka","Lawrence","Shawnee","Manhattan","Lenexa","Salina"],
  KY: ["Louisville","Lexington","Bowling Green","Owensboro","Covington","Richmond","Georgetown","Florence","Hopkinsville","Nicholasville"],
  LA: ["New Orleans","Baton Rouge","Shreveport","Metairie","Lafayette","Lake Charles","Bossier City","Kenner","Monroe","Alexandria"],
  ME: ["Portland","Lewiston","Bangor","South Portland","Auburn","Biddeford","Sanford","Saco","Augusta","Westbrook"],
  MD: ["Baltimore","Frederick","Rockville","Gaithersburg","Bowie","Hagerstown","Annapolis","College Park","Salisbury","Laurel"],
  MA: ["Boston","Worcester","Springfield","Cambridge","Lowell","Brockton","New Bedford","Fall River","Lynn","Quincy","Newton","Somerville","Lawrence","Framingham","Haverhill","Waltham","Malden","Brookline"],
  MI: ["Detroit","Grand Rapids","Warren","Sterling Heights","Ann Arbor","Lansing","Flint","Dearborn","Livonia","Westland","Troy","Southfield","Kalamazoo","Saginaw","Pontiac","Muskegon","Holland","Novi"],
  MN: ["Minneapolis","St. Paul","Rochester","Duluth","Bloomington","Brooklyn Park","Plymouth","Maple Grove","Woodbury","St. Cloud","Eagan","Eden Prairie","Coon Rapids","Burnsville","Blaine"],
  MS: ["Jackson","Gulfport","Southaven","Hattiesburg","Biloxi","Meridian","Tupelo","Greenville","Olive Branch","Horn Lake"],
  MO: ["Kansas City","St. Louis","Springfield","Columbia","Independence","Lee's Summit","O'Fallon","St. Joseph","St. Charles","Blue Springs","Joplin","Florissant","Chesterfield","Jefferson City"],
  MT: ["Billings","Missoula","Great Falls","Bozeman","Butte","Helena","Kalispell","Havre","Anaconda","Miles City"],
  NE: ["Omaha","Lincoln","Bellevue","Grand Island","Kearney","Fremont","Hastings","Norfolk","Columbus","Papillion"],
  NV: ["Las Vegas","Henderson","Reno","North Las Vegas","Sparks","Carson City","Fernley","Elko","Mesquite","Boulder City"],
  NH: ["Manchester","Nashua","Concord","Derry","Rochester","Salem","Dover","Merrimack","Londonderry","Hudson"],
  NJ: ["Newark","Jersey City","Paterson","Elizabeth","Edison","Woodbridge","Lakewood","Toms River","Hamilton","Trenton","Clifton","Camden","Brick","Cherry Hill","Passaic"],
  NM: ["Albuquerque","Las Cruces","Rio Rancho","Santa Fe","Roswell","Farmington","Clovis","Hobbs","Alamogordo","Carlsbad"],
  NY: ["New York City","Buffalo","Rochester","Yonkers","Syracuse","Albany","New Rochelle","Mount Vernon","Schenectady","Utica","Brooklyn","Queens","Bronx","Staten Island","Manhattan","Long Island","Binghamton","White Plains","Troy","Niagara Falls"],
  NC: ["Charlotte","Raleigh","Greensboro","Durham","Winston-Salem","Fayetteville","Cary","Wilmington","High Point","Concord","Asheville","Gastonia","Jacksonville","Chapel Hill","Rocky Mount"],
  ND: ["Fargo","Bismarck","Grand Forks","Minot","West Fargo","Williston","Dickinson","Mandan","Jamestown","Wahpeton"],
  OH: ["Columbus","Cleveland","Cincinnati","Toledo","Akron","Dayton","Parma","Canton","Youngstown","Lorain","Hamilton","Springfield","Kettering","Elyria","Middletown"],
  OK: ["Oklahoma City","Tulsa","Norman","Broken Arrow","Lawton","Edmond","Moore","Midwest City","Enid","Stillwater"],
  OR: ["Portland","Salem","Eugene","Gresham","Hillsboro","Beaverton","Bend","Medford","Springfield","Corvallis","Albany","Tigard","Lake Oswego","Redmond"],
  PA: ["Philadelphia","Pittsburgh","Allentown","Erie","Reading","Scranton","Bethlehem","Lancaster","Harrisburg","Altoona","York","Wilkes-Barre","Chester","Norristown"],
  RI: ["Providence","Cranston","Warwick","Pawtucket","East Providence","Woonsocket","Coventry","Cumberland","North Providence","South Kingstown"],
  SC: ["Columbia","Charleston","North Charleston","Mount Pleasant","Rock Hill","Greenville","Summerville","Goose Creek","Hilton Head Island","Sumter"],
  SD: ["Sioux Falls","Rapid City","Aberdeen","Brookings","Watertown","Mitchell","Yankton","Pierre","Huron","Vermillion"],
  TN: ["Memphis","Nashville","Knoxville","Chattanooga","Clarksville","Murfreesboro","Franklin","Jackson","Johnson City","Bartlett","Hendersonville","Kingsport","Smyrna","Germantown"],
  TX: ["Houston","San Antonio","Dallas","Austin","Fort Worth","El Paso","Arlington","Corpus Christi","Plano","Laredo","Lubbock","Garland","Irving","Amarillo","Grand Prairie","Brownsville","McKinney","Frisco","Pasadena","Mesquite","Killeen","McAllen","Carrollton","Midland","Waco","Denton","Abilene","Beaumont","Round Rock"],
  UT: ["Salt Lake City","West Valley City","Provo","West Jordan","Orem","Sandy","Ogden","St. George","Layton","Taylorsville","South Jordan","Lehi","Logan"],
  VT: ["Burlington","South Burlington","Rutland","Barre","Montpelier","Winooski","St. Albans","Newport","Vergennes","Brattleboro"],
  VA: ["Virginia Beach","Norfolk","Chesapeake","Richmond","Newport News","Alexandria","Hampton","Roanoke","Portsmouth","Suffolk","Lynchburg","Charlottesville","Harrisonburg","Leesburg","Arlington"],
  WA: ["Seattle","Spokane","Tacoma","Vancouver","Bellevue","Everett","Kent","Renton","Kirkland","Bellingham","Kennewick","Federal Way","Yakima","Redmond","Marysville"],
  WV: ["Charleston","Huntington","Morgantown","Parkersburg","Wheeling","Weirton","Fairmont","Martinsburg","Beckley","Clarksburg"],
  WI: ["Milwaukee","Madison","Green Bay","Kenosha","Racine","Appleton","Waukesha","Oshkosh","Eau Claire","Janesville","West Allis","La Crosse","Sheboygan","Wausau"],
  WY: ["Cheyenne","Casper","Laramie","Gillette","Rock Springs","Sheridan","Green River","Evanston","Riverton","Jackson"],
};

function isValidCity(city: string, stateAbbr: string): boolean {
  if (!stateAbbr || !city.trim()) return false;
  const cities = CITIES_BY_STATE[stateAbbr] ?? [];
  return cities.some((c) => c.toLowerCase() === city.trim().toLowerCase());
}

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
  { value: "social_media", label: "Social Media", desc: "Instagram posts, TikToks, stories, and reels" },
  { value: "in_person", label: "In-Person", desc: "Game day appearances, events, and activations" },
  { value: "content_creation", label: "Content Creation", desc: "Photos, videos, and branded content" },
];

const SECTIONS = ["Company", "Business", "Targeting", "Online"];

function isValidPhone(val: string) {
  return /^[\d\s\-().+]{7,15}$/.test(val.trim());
}

function formatSocialHandle(val: string) {
  return val.startsWith("@") ? val.slice(1) : val.trim();
}

function normalizeWebsiteUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

function isValidOptionalWebsite(raw: string): boolean {
  const t = raw.trim();
  if (!t) return true;
  try {
    const u = new URL(normalizeWebsiteUrl(t)!);
    return Boolean(u.hostname?.includes("."));
  } catch {
    return false;
  }
}

const UNIVERSITIES = [
  "Abilene Christian University", "Air Force Academy", "Alabama A&M University",
  "Appalachian State University", "Arizona State University", "Auburn University",
  "Ball State University", "Baylor University", "Binghamton University",
  "Boston College", "Boston University", "Bowling Green State University",
  "Brigham Young University", "Brown University", "Bryant University",
  "Bucknell University", "Butler University", "Cal Poly San Luis Obispo",
  "California State University Fullerton", "California State University Long Beach",
  "Clemson University", "Cleveland State University", "Coastal Carolina University",
  "Colgate University", "College of Charleston", "College of Holy Cross",
  "Colorado State University", "Columbia University", "Cornell University",
  "Dartmouth College", "Davidson College", "Duke University",
  "East Carolina University", "Eastern Michigan University", "Elon University",
  "Florida A&M University", "Florida Atlantic University", "Florida State University",
  "Fordham University", "Fresno State University", "Furman University",
  "George Mason University", "George Washington University", "Georgetown University",
  "Georgia Institute of Technology", "Georgia State University", "Gonzaga University",
  "Harvard University", "Hofstra University", "Howard University",
  "Illinois State University", "Indiana University Bloomington", "Iowa State University",
  "James Madison University", "Kansas State University", "Kent State University",
  "Lafayette College", "Lehigh University", "Liberty University",
  "Louisiana State University", "Louisiana Tech University", "Loyola Marymount University",
  "Loyola University Chicago", "Marquette University", "Marshall University",
  "Memphis University", "Michigan State University", "Middle Tennessee State University",
  "Mississippi State University", "Missouri State University", "Monmouth University",
  "Montana State University", "Morehead State University", "Murray State University",
  "Navy", "New Mexico State University", "Niagara University",
  "North Carolina State University", "North Dakota State University",
  "Northeastern University", "Northern Arizona University", "Northwestern University",
  "Notre Dame University", "Ohio State University", "Ohio University",
  "Oklahoma State University", "Old Dominion University", "Oregon State University",
  "Penn State University", "Princeton University", "Providence College",
  "Purdue University", "Quinnipiac University", "Rhode Island University",
  "Rice University", "Rutgers University", "Sacred Heart University",
  "Saint Joseph's University", "Saint Louis University", "Sam Houston State University",
  "San Diego State University", "San Jose State University", "Santa Clara University",
  "Seton Hall University", "South Carolina State University", "South Dakota State University",
  "Southern Methodist University", "Stanford University", "Stony Brook University",
  "Syracuse University", "Temple University", "Tennessee State University",
  "Texas A&M University", "Texas Christian University", "Texas State University",
  "Texas Tech University", "Toledo University", "Troy University",
  "Tulane University", "UCLA", "UNC Charlotte", "UNC Greensboro",
  "University of Akron", "University of Alabama", "University of Arizona",
  "University of Arkansas", "University of California Berkeley",
  "University of Central Florida", "University of Cincinnati",
  "University of Colorado Boulder", "University of Connecticut",
  "University of Dayton", "University of Delaware", "University of Denver",
  "University of Florida", "University of Georgia", "University of Hawaii",
  "University of Houston", "University of Illinois", "University of Iowa",
  "University of Kansas", "University of Kentucky", "University of Louisville",
  "University of Maryland", "University of Massachusetts Amherst",
  "University of Miami", "University of Michigan", "University of Minnesota",
  "University of Mississippi", "University of Missouri", "University of Nebraska",
  "University of Nevada Las Vegas", "University of Nevada Reno",
  "University of New Hampshire", "University of New Mexico",
  "University of North Carolina", "University of North Dakota",
  "University of Notre Dame", "University of Oklahoma", "University of Oregon",
  "University of Pennsylvania", "University of Pittsburgh", "University of Rhode Island",
  "University of Richmond", "University of San Diego", "University of South Carolina",
  "University of South Florida", "University of Southern California",
  "University of Tennessee", "University of Texas at Austin", "University of Utah",
  "University of Virginia", "University of Washington", "University of Wisconsin",
  "Utah State University", "Vanderbilt University", "Villanova University",
  "Virginia Commonwealth University", "Virginia Tech", "Wake Forest University",
  "Washington State University", "West Virginia University", "William & Mary",
  "Xavier University", "Yale University",
];

// ── Components ────────────────────────────────────────────────────────────────

const inputCls =
  "w-full rounded-xl border border-black/12 bg-white px-4 py-3 text-sm text-black placeholder-black/30 shadow-sm transition focus:border-[#1f7ae0] focus:outline-none focus:ring-2 focus:ring-[#1f7ae0]/20 dark:border-white/12 dark:bg-[#1c2333] dark:text-white dark:placeholder-white/30 dark:focus:border-[#1f7ae0]";

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

function CheckboxGrid({
  options, selected, onChange,
}: {
  options: string[];
  selected: string[];
  onChange: (val: string[]) => void;
}) {
  function toggle(item: string) {
    onChange(
      selected.includes(item)
        ? selected.filter((s) => s !== item)
        : [...selected, item]
    );
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
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
              active
                ? "border-[#1f7ae0] bg-[#1f7ae0] text-white"
                : "border-black/15 bg-white text-black/70 hover:border-[#1f7ae0]/50 dark:border-white/15 dark:bg-white/5 dark:text-white/70"
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BrandManagerOnboardingPage() {
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [userEmail, setUserEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [cityTouched, setCityTouched] = useState(false);
  const [industry, setIndustry] = useState("");
  const [industryOther, setIndustryOther] = useState("");
  const [budgetRange, setBudgetRange] = useState("");
  const [companyDescription, setCompanyDescription] = useState("");
  const [targetAudience, setTargetAudience] = useState<string[]>([]);

  const [teamDescription, setTeamDescription] = useState("");
  const [preferredSports, setPreferredSports] = useState<string[]>([]);
  const [schoolInput, setSchoolInput] = useState("");
  const [preferredSchools, setPreferredSchools] = useState<string[]>([]);
  const [campaignTypes, setCampaignTypes] = useState<string[]>([]);

  const [websiteUrl, setWebsiteUrl] = useState("");
  const [socialInstagram, setSocialInstagram] = useState("");
  const [socialX, setSocialX] = useState("");
  const [socialLinkedin, setSocialLinkedin] = useState("");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setUserEmail(data.user.email);
    });
  }, []);

  function addSchool() {
    const val = schoolInput.trim();
    if (val && !preferredSchools.includes(val)) {
      setPreferredSchools((prev) => [...prev, val]);
    }
    setSchoolInput("");
  }

  function removeSchool(s: string) {
    setPreferredSchools((prev) => prev.filter((x) => x !== s));
  }

  function validateStep(s: number): string | null {
    if (s === 1) {
      if (!companyName.trim()) return "Company name is required.";
      if (!firstName.trim()) return "First name is required.";
      if (!lastName.trim()) return "Last name is required.";
      if (!isValidPhone(phone)) return "Please enter a valid phone number.";
      if (!state) return "Please select a state.";
      if (!isValidCity(city, state)) return "Please enter a valid city for the selected state.";
    }
    if (s === 2) {
      if (!industry) return "Please select an industry.";
      if (industry === "Other" && !industryOther.trim()) return "Please describe your industry.";
      if (!budgetRange) return "Please select a budget range.";
      if (targetAudience.length === 0) return "Please select at least one target audience.";
      if (!companyDescription.trim()) return "Please add a company description.";
      if (companyDescription.trim().length < 100) {
        return "Company description must be at least 100 characters.";
      }
    }
    if (s === 3) {
      if (!teamDescription.trim()) return "Please describe your ideal collegiate team.";
      if (preferredSports.length === 0) return "Select at least one preferred sport.";
      if (preferredSchools.length === 0) return "Add at least one preferred school.";
      if (campaignTypes.length === 0) return "Select at least one campaign type.";
    }
    if (s === 4) {
      if (!isValidOptionalWebsite(websiteUrl)) {
        return "Enter a valid website URL (e.g. https://example.com or example.com).";
      }
      if (socialLinkedin.trim()) {
        try {
          const u = new URL(normalizeWebsiteUrl(socialLinkedin)!);
          if (!u.hostname?.includes(".")) return "Enter a valid LinkedIn profile URL.";
        } catch {
          return "Enter a valid LinkedIn profile URL.";
        }
      }
    }
    return null;
  }

  function handleNext() {
    setGlobalError(null);
    const err = validateStep(step);
    if (err) {
      setGlobalError(err);
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
        return;
      }
    }

    setSubmitting(true);
    const finalIndustry = industry === "Other" ? industryOther.trim() : industry;
    const websiteStored = websiteUrl.trim() ? normalizeWebsiteUrl(websiteUrl) : null;

    try {
      const res = await fetch("/api/onboarding/brand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: companyName.trim(),
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phone.trim(),
          city: city.trim(),
          state,
          industry: finalIndustry,
          budget_range: budgetRange,
          company_description: companyDescription.trim(),
          team_description: teamDescription.trim(),
          target_audience: targetAudience,
          preferred_sports: preferredSports,
          preferred_schools: preferredSchools,
          campaign_types: campaignTypes,
          website_url: websiteStored,
          social_instagram: socialInstagram.trim() ? formatSocialHandle(socialInstagram) : null,
          social_x: socialX.trim() ? formatSocialHandle(socialX) : null,
          social_linkedin: socialLinkedin.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setGlobalError(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      router.refresh();
      router.push("/dashboard/brand-dashboard");
    } catch {
      setGlobalError("Network error — please check your connection and try again.");
    } finally {
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
            Set up your brand
          </h1>
          <p className="mt-2 text-black/50 dark:text-white/45">
            Help athletes understand who you are and what you&apos;re looking for.
          </p>
        </div>

        <ProgressBar current={step} total={4} labels={SECTIONS} />

        <form
          onSubmit={step === 4 ? handleSubmit : (e) => { e.preventDefault(); handleNext(); }}
          className="space-y-8"
        >
          {step === 1 && (
            <div className="space-y-5">
              <SectionTitle title="Company & contact" subtitle="How brands and athletes can reach you." />

              <Field label="Company Name" required>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className={inputCls}
                  placeholder="Acme Sports Co."
                />
              </Field>

              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="First Name" required>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className={inputCls}
                    placeholder="Alex"
                  />
                </Field>
                <Field label="Last Name" required>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className={inputCls}
                    placeholder="Johnson"
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
                {phoneTouched && phoneValid && (
                  <p className="text-xs text-green-600 dark:text-green-400">✓ Valid phone number</p>
                )}
                {phoneTouched && !phoneValid && (
                  <p className="text-xs text-red-500">Enter a valid phone number (7–15 digits/symbols).</p>
                )}
              </Field>

              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="State" required>
                  <select
                    value={state}
                    onChange={(e) => {
                      setState(e.target.value);
                      setCity("");
                      setCityTouched(false);
                    }}
                    className={`${inputCls} cursor-pointer`}
                  >
                    <option value="">Select state</option>
                    {US_STATES.map((st) => (
                      <option key={st.abbr} value={st.abbr}>
                        {st.name}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="City" required>
                  <input
                    type="text"
                    list="city-list"
                    value={city}
                    onChange={(e) => {
                      setCity(e.target.value);
                      setCityTouched(false);
                    }}
                    onBlur={() => setCityTouched(true)}
                    disabled={!state}
                    autoComplete="off"
                    placeholder={state ? "Enter your city" : "Select a state first"}
                    className={`${inputCls} disabled:cursor-not-allowed disabled:opacity-40 ${
                      cityTouched && city
                        ? isValidCity(city, state)
                          ? "border-green-500 focus:border-green-500 focus:ring-green-500/20"
                          : "border-red-400 focus:border-red-400 focus:ring-red-400/20"
                        : ""
                    }`}
                  />
                  <datalist id="city-list">
                    {(CITIES_BY_STATE[state] ?? []).map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                  {cityTouched && city && !isValidCity(city, state) && (
                    <p className="text-xs text-red-500">
                      Not a recognized city in{" "}
                      {US_STATES.find((x) => x.abbr === state)?.name ?? "this state"}.
                    </p>
                  )}
                  {cityTouched && city && isValidCity(city, state) && (
                    <p className="text-xs text-green-600 dark:text-green-400">✓ Verified city</p>
                  )}
                </Field>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <SectionTitle title="Industry & story" subtitle="Who you serve and what you do." />

              <Field label="Industry" required>
                <select
                  value={industry}
                  onChange={(e) => {
                    setIndustry(e.target.value);
                    setIndustryOther("");
                  }}
                  className={`${inputCls} cursor-pointer`}
                >
                  <option value="">Select your industry</option>
                  {INDUSTRIES.map((i) => (
                    <option key={i} value={i}>
                      {i}
                    </option>
                  ))}
                </select>
                {industry === "Other" && (
                  <input
                    type="text"
                    value={industryOther}
                    onChange={(e) => setIndustryOther(e.target.value)}
                    className={`${inputCls} mt-2`}
                    placeholder="Describe your industry..."
                    autoFocus
                  />
                )}
              </Field>

              <Field label="Budget Range" required hint="per campaign">
                <select
                  value={budgetRange}
                  onChange={(e) => setBudgetRange(e.target.value)}
                  className={`${inputCls} cursor-pointer`}
                >
                  <option value="">Select a budget range</option>
                  {BUDGET_RANGES.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Target Audience" required hint="select all that apply">
                <CheckboxGrid
                  options={TARGET_AUDIENCES}
                  selected={targetAudience}
                  onChange={setTargetAudience}
                />
                {targetAudience.length === 0 && (
                  <p className="mt-1 text-xs text-black/40 dark:text-white/35">Select at least one.</p>
                )}
              </Field>

              <Field label="Company Description" required hint="100–300 characters">
                <textarea
                  value={companyDescription}
                  onChange={(e) => setCompanyDescription(e.target.value.slice(0, 300))}
                  rows={3}
                  className={`${inputCls} resize-none`}
                  placeholder="Briefly describe what your company does and what you're about..."
                />
                <p
                  className={`text-right text-xs ${
                    companyDescription.length >= 280
                      ? "text-red-500"
                      : companyDescription.trim().length > 0 && companyDescription.trim().length < 100
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-black/30 dark:text-white/30"
                  }`}
                >
                  {companyDescription.length}/300
                  {companyDescription.trim().length < 100 && (
                    <span className="ml-2">(min 100)</span>
                  )}
                </p>
              </Field>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <SectionTitle
                title="Campaign targeting"
                subtitle="Ideal collegiate team, sports, schools, and campaign types are required."
              />

              <Field label="Ideal Collegiate Team" required hint="max 200 characters">
                <textarea
                  value={teamDescription}
                  onChange={(e) => setTeamDescription(e.target.value.slice(0, 200))}
                  rows={3}
                  className={`${inputCls} resize-none`}
                  placeholder="e.g. D1 women's soccer or lacrosse teams with strong social presence..."
                />
                <p
                  className={`text-right text-xs ${
                    teamDescription.length >= 180 ? "text-red-500" : "text-black/30 dark:text-white/30"
                  }`}
                >
                  {teamDescription.length}/200
                </p>
              </Field>

              <Field label="Preferred Sports" required hint="select at least one">
                <CheckboxGrid
                  options={SPORTS}
                  selected={preferredSports}
                  onChange={setPreferredSports}
                />
                {preferredSports.length === 0 && (
                  <p className="mt-1 text-xs text-black/40 dark:text-white/35">Select at least one sport.</p>
                )}
              </Field>

              <Field label="Preferred Schools" required hint="add at least one">
                <div className="flex gap-2">
                  <input
                    type="text"
                    list="brand-university-list"
                    value={schoolInput}
                    onChange={(e) => setSchoolInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addSchool();
                      }
                    }}
                    className={inputCls}
                    placeholder="Type a school and press Enter"
                    autoComplete="off"
                  />
                  <datalist id="brand-university-list">
                    {UNIVERSITIES.map((u) => (
                      <option key={u} value={u} />
                    ))}
                  </datalist>
                  <button
                    type="button"
                    onClick={addSchool}
                    className="shrink-0 rounded-xl bg-[#1f7ae0] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:scale-[1.02]"
                  >
                    Add
                  </button>
                </div>
                {preferredSchools.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {preferredSchools.map((sch) => (
                      <span
                        key={sch}
                        className="flex items-center gap-1.5 rounded-full bg-[#dbeafe] px-3 py-1 text-sm font-medium text-[#1f7ae0] dark:bg-[#1a2f5a] dark:text-[#93c5fd]"
                      >
                        {sch}
                        <button
                          type="button"
                          onClick={() => removeSchool(sch)}
                          className="text-[#1f7ae0]/60 hover:text-[#1f7ae0] dark:text-[#93c5fd]/60 dark:hover:text-[#93c5fd]"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </Field>

              <Field label="Campaign type" required hint="select at least one">
                <div className="space-y-3">
                  {CAMPAIGN_TYPES.map((ct) => {
                    const active = campaignTypes.includes(ct.value);
                    return (
                      <button
                        key={ct.value}
                        type="button"
                        onClick={() =>
                          setCampaignTypes((prev) =>
                            active ? prev.filter((x) => x !== ct.value) : [...prev, ct.value]
                          )
                        }
                        className={`w-full rounded-xl border p-4 text-left transition ${
                          active
                            ? "border-[#1f7ae0] bg-[#dbeafe] dark:bg-[#1a2f5a]"
                            : "border-black/10 bg-white hover:border-[#1f7ae0]/40 dark:border-white/10 dark:bg-white/5"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-sm font-bold ${
                              active ? "text-[#1f7ae0] dark:text-[#93c5fd]" : "text-black dark:text-white"
                            }`}
                          >
                            {ct.label}
                          </span>
                          <span
                            className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-black ${
                              active ? "bg-[#1f7ae0] text-white" : "border border-black/20 dark:border-white/20"
                            }`}
                          >
                            {active ? "✓" : ""}
                          </span>
                        </div>
                        <p
                          className={`mt-0.5 text-xs ${
                            active
                              ? "text-[#1f7ae0]/80 dark:text-[#93c5fd]/70"
                              : "text-black/45 dark:text-white/35"
                          }`}
                        >
                          {ct.desc}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </Field>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5">
              <SectionTitle
                title="Online presence"
                subtitle="Optional — website and social links help athletes verify your brand."
              />

              <div className="flex flex-wrap gap-2">
                {["Website", "Instagram", "X", "LinkedIn"].map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-[#1f7ae0]/30 bg-[#dbeafe]/50 px-3 py-1 text-xs font-semibold text-[#1f7ae0] dark:border-[#93c5fd]/30 dark:bg-[#1a2f5a]/50 dark:text-[#93c5fd]"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              <div className="space-y-4 rounded-2xl border border-black/8 bg-[#f9fafb] p-5 dark:border-white/8 dark:bg-[#161b27]">
                <Field label="Website" hint="(optional)">
                  <input
                    type="text"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    className={inputCls}
                    placeholder="https://yourbrand.com or yourbrand.com"
                  />
                </Field>

                <Field label="Instagram" hint="(optional)">
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-black/40 dark:text-white/35">
                      @
                    </span>
                    <input
                      type="text"
                      value={socialInstagram}
                      onChange={(e) => setSocialInstagram(formatSocialHandle(e.target.value))}
                      className={`${inputCls} pl-8`}
                      placeholder="yourbrand"
                    />
                  </div>
                </Field>

                <Field label="X (Twitter)" hint="(optional)">
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-black/40 dark:text-white/35">
                      @
                    </span>
                    <input
                      type="text"
                      value={socialX}
                      onChange={(e) => setSocialX(formatSocialHandle(e.target.value))}
                      className={`${inputCls} pl-8`}
                      placeholder="yourbrand"
                    />
                  </div>
                </Field>

                <Field label="LinkedIn" hint="(optional — profile URL)">
                  <input
                    type="text"
                    value={socialLinkedin}
                    onChange={(e) => setSocialLinkedin(e.target.value)}
                    className={inputCls}
                    placeholder="https://linkedin.com/company/yourbrand"
                  />
                </Field>
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
                {submitting ? "Saving..." : "Complete Brand Profile →"}
              </button>
            )}
          </div>
        </form>
      </main>
    </div>
  );
}
