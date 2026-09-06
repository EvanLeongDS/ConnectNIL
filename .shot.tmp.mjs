/**
 * Screenshots the three dashboard Overview pages at 1280x900, one per role, and reports
 * whether each page actually fits the viewport.
 *
 * Temporary harness. Delete after use.
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { launchChrome, attachToPage, evaluate } from "./.rt-cdp.tmp.mjs";

for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
  if (m) process.env[m[1].trim()] ??= m[2].trim();
}
const ORIGIN = (process.env.SHOT_ORIGIN || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const sb = createClient(SB_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const anonSb = createClient(SB_URL, ANON, { auth: { persistSession: false } });

const { data: list, error: listErr } = await sb.auth.admin.listUsers({ perPage: 200 });
if (listErr) throw listErr;

const wanted = {
  "team-manager": "/dashboard/team-dashboard",
  athlete: "/dashboard/athlete-dashboard",
  "brand-manager": "/dashboard/brand-dashboard",
};

// Prefer the account with the most partnerships so the panels are not all empty states.
const { data: parts } = await sb.from("partnerships").select("athlete_id, team_id, brand_id");
const score = new Map();
for (const p of parts ?? []) {
  for (const id of [p.athlete_id, p.team_id, p.brand_id]) {
    if (id) score.set(id, (score.get(id) ?? 0) + 1);
  }
}

const picks = {};
for (const role of Object.keys(wanted)) {
  const candidates = list.users
    .filter((u) => u.user_metadata?.role === role && u.email)
    .sort((a, b) => (score.get(b.id) ?? 0) - (score.get(a.id) ?? 0));
  if (candidates[0]) picks[role] = candidates[0];
  console.log(
    `${role}: ${candidates.length} accounts, picked ${candidates[0]?.email ?? "none"} (${
      score.get(candidates[0]?.id) ?? 0
    } deals)`
  );
}

const chrome = await launchChrome({ headless: true });
const cdp = await attachToPage(chrome.port);
try {
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Network.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: Number(process.env.SHOT_W || 1280),
    height: Number(process.env.SHOT_H || 900),
    deviceScaleFactor: 1,
    mobile: false,
  });

  for (const [role, path_] of Object.entries(wanted)) {
    const user = picks[role];
    if (!user) continue;
    await cdp.send("Network.clearBrowserCookies");

    const { data: link, error: linkErr } = await sb.auth.admin.generateLink({
      type: "magiclink",
      email: user.email,
      options: { redirectTo: `${ORIGIN}/auth/callback` },
    });
    if (linkErr) throw linkErr;

    const { data: otp, error: otpErr } = await anonSb.auth.verifyOtp({
      token_hash: link.properties.hashed_token,
      type: "magiclink",
    });
    if (otpErr) throw otpErr;

    const jar = [];
    const capture = createServerClient(SB_URL, ANON, {
      cookieEncoding: "base64url",
      cookies: { getAll: () => [], setAll: (l) => jar.push(...l) },
    });
    await capture.auth.setSession({
      access_token: otp.session.access_token,
      refresh_token: otp.session.refresh_token,
    });
    await new Promise((r) => setTimeout(r, 300));
    for (const c of jar) {
      await cdp.send("Network.setCookie", {
        name: c.name,
        value: c.value,
        domain: "localhost",
        path: "/",
        httpOnly: false,
        secure: false,
        sameSite: "Lax",
      });
    }

    await cdp.send("Page.navigate", { url: ORIGIN + path_ });
    await cdp.waitFor("Page.loadEventFired").catch(() => {});
    await new Promise((r) => setTimeout(r, 2500));

    const info = JSON.parse(
      await evaluate(
        cdp,
        `JSON.stringify({
           href: location.href,
           scrollH: document.documentElement.scrollHeight,
           innerH: window.innerHeight,
           bodyScrollW: document.body.scrollWidth,
           innerW: window.innerWidth
         })`
      )
    );
    const out = `shot-${role}.png`;
    const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(out, Buffer.from(shot.data, "base64"));
    console.log(
      `${role}: ${info.href}\n  page ${info.scrollH}px vs viewport ${info.innerH}px -> ${
        info.scrollH <= info.innerH + 1 ? "NO SCROLL" : "SCROLLS " + (info.scrollH - info.innerH) + "px"
      }; horizontal ${info.bodyScrollW}/${info.innerW}\n  wrote ${out}`
    );
  }
} finally {
  chrome.proc.kill();
}
