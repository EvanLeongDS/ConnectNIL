/**
 * Full browser round trip for the deliverable-proof S3 upload.
 * Drives real Chrome over CDP: magic-link login -> proof form -> presigned PUTs -> commit.
 * Captures every network request so we can prove no image bytes hit our own origin.
 *
 * Temporary harness. Delete after use.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { launchChrome, attachToPage, evaluate } from "./.rt-cdp.tmp.mjs";

for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
  if (m) process.env[m[1].trim()] ??= m[2].trim();
}
const ORIGIN = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
let fail = 0;
const ok = (n, c, x = "") => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${x ? " :: " + x : ""}`);
  if (!c) fail++;
  return c;
};
const step = (n) => console.log(`\n=== ${n} ===`);

/* 1. preconditions */
step("preconditions");
const sb = createClient(SB_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anonSb = createClient(SB_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
try {
  const { error } = await sb.from("partnerships").select("id").limit(1);
  if (error) throw new Error(error.message);
  ok(`supabase reachable (${new URL(SB_URL).host})`, true);
} catch (e) {
  ok("supabase reachable", false, e.message);
  console.log("\nABORT: fix NEXT_PUBLIC_SUPABASE_URL / keys in .env.local first.");
  process.exit(1);
}
try {
  const r = await fetch(ORIGIN, { redirect: "manual" });
  ok(`dev server responding at ${ORIGIN}`, r.status > 0, `HTTP ${r.status}`);
} catch (e) {
  ok(`dev server responding at ${ORIGIN}`, false, e.cause?.code || e.message);
  console.log("\nABORT: start it with `npm run dev` first.");
  process.exit(1);
}
ok("PROOF_STORAGE_DRIVER=s3", process.env.PROOF_STORAGE_DRIVER === "s3", String(process.env.PROOF_STORAGE_DRIVER));

/* 2. fixture */
step("fixture");
const { data: deals } = await sb
  .from("partnerships")
  .select("id,title,status,athlete_id,team_id")
  .eq("status", "active");
const activeIds = new Set((deals ?? []).map((d) => d.id));
const { data: dels } = await sb
  .from("deliverables")
  .select("id,partnership_id,title,status,proof_description,proof_image_urls,submitted_at")
  .order("id", { ascending: true });
const cand = (dels ?? []).find(
  (d) => activeIds.has(d.partnership_id) && ["pending", "rejected"].includes(d.status)
);
if (!cand) {
  console.log("  no submittable deliverable on an active deal.");
  console.log(`  active deals=${(deals ?? []).length} deliverables=${(dels ?? []).length}`);
  const counts = {};
  for (const d of dels ?? []) counts[d.status] = (counts[d.status] || 0) + 1;
  console.log(`  statuses: ${JSON.stringify(counts)}`);
  console.log("\nABORT: need one active partnership with a pending/rejected deliverable.");
  process.exit(1);
}
const deal = deals.find((d) => d.id === cand.partnership_id);
const submitterId = deal.athlete_id ?? deal.team_id;
const { data: authUser } = await sb.auth.admin.getUserById(submitterId);
const email = authUser?.user?.email;
const role = authUser?.user?.user_metadata?.role;
ok("found active deal + submittable deliverable", true, `deal=${deal.id} deliverable=${cand.id} status=${cand.status}`);
ok("submitter resolved with a role", Boolean(email && role), `${email} role=${role}`);
const isTeam = role === "team-manager";
const dash = isTeam ? "team-dashboard" : "athlete-dashboard";
const proofUrl = `${ORIGIN}/dashboard/${dash}/deals/${deal.id}/deliverables/${cand.id}`;

const before = {
  status: cand.status,
  proof_description: cand.proof_description,
  proof_image_urls: cand.proof_image_urls,
  submitted_at: cand.submitted_at,
};
console.log(`  will restore afterwards: ${JSON.stringify(before).slice(0, 140)}`);

/* 3. login link */
step("magic-link session");
const { data: link, error: linkErr } = await sb.auth.admin.generateLink({
  type: "magiclink",
  email,
  options: { redirectTo: `${ORIGIN}/auth/callback` },
});
if (!ok("magic link generated", !linkErr, linkErr?.message)) process.exit(1);

/* 4. test images */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cnil-proof-"));
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64"
);
const files = [1, 2].map((i) => {
  const p = path.join(tmp, `proof-${i}.png`);
  fs.writeFileSync(p, png);
  return p;
});

/* 5. drive the browser */
step("browser");
const chrome = await launchChrome({ headless: true });
const cdp = await attachToPage(chrome.port);
const reqs = [];
cdp.on((m, p) => {
  if (m === "Network.requestWillBeSent") {
    reqs.push({
      id: p.requestId,
      url: p.request.url,
      method: p.request.method,
      postDataLen: p.request.postData?.length ?? null,
      status: null,
    });
  } else if (m === "Network.responseReceived") {
    const r = reqs.find((x) => x.id === p.requestId);
    if (r) r.status = p.response.status;
  }
});
try {
  await cdp.send("Network.enable");
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");

  // A server-side admin.generateLink cannot use PKCE - there is no client-held
  // code_verifier - so its action_link hands back tokens in the URL *fragment* (implicit
  // flow). The app's /auth/callback only handles ?code=, and correctly refuses. So redeem
  // the token here and inject the session cookie exactly as @supabase/ssr would write it,
  // letting the library do the encoding rather than hand-rolling the format.
  const { data: otp, error: otpErr } = await anonSb.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: "magiclink",
  });
  if (!ok("verifyOtp redeemed the token for a session", Boolean(otp?.session) && !otpErr, otpErr?.message)) {
    throw new Error("could not obtain a session");
  }
  const jar = [];
  const capture = createServerClient(SB_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookieEncoding: "base64url",
    cookies: { getAll: () => [], setAll: (list) => jar.push(...list) },
  });
  await capture.auth.setSession({
    access_token: otp.session.access_token,
    refresh_token: otp.session.refresh_token,
  });
  await new Promise((r) => setTimeout(r, 300));
  ok("@supabase/ssr produced session cookies", jar.length > 0,
     jar.map((c) => `${c.name} (${c.value.length}b)`).join(", "));
  for (const c of jar) {
    await cdp.send("Network.setCookie", {
      name: c.name, value: c.value, domain: "localhost", path: "/",
      httpOnly: false, secure: false, sameSite: "Lax",
    });
  }
  await cdp.send("Page.navigate", { url: `${ORIGIN}/dashboard` });
  await cdp.waitFor("Page.loadEventFired").catch(() => {});
  await new Promise((r) => setTimeout(r, 1800));
  const afterLogin = await evaluate(cdp, "location.href");
  ok("middleware accepted the session (not bounced to /login)", !/\/login/.test(afterLogin), afterLogin);

  await cdp.send("Page.navigate", { url: proofUrl });
  await cdp.waitFor("Page.loadEventFired").catch(() => {});
  // Dev-mode route compilation can take many seconds on a cold .next cache, so poll for
  // the form rather than assuming a fixed delay is enough.
  let hasForm = false;
  for (let i = 0; i < 45; i++) {
    hasForm = await evaluate(
      cdp,
      "Boolean(document.querySelector('#proof-description') && document.querySelector('input[type=file]'))"
    ).catch(() => false);
    if (hasForm) break;
    await new Promise((r) => setTimeout(r, 800));
  }
  if (!ok("proof form rendered", hasForm, await evaluate(cdp, "location.href"))) {
    throw new Error("form not present");
  }

  const inputObj = await cdp.send("Runtime.evaluate", {
    expression: "document.querySelector('input[type=file]')",
  });
  await cdp.send("DOM.enable");
  await cdp.send("DOM.setFileInputFiles", { files, objectId: inputObj.result.objectId });
  await new Promise((r) => setTimeout(r, 900));
  const thumbs = await evaluate(cdp, "document.querySelectorAll('img[alt^=\"proof-\"]').length");
  ok("two files attached to the form", thumbs === 2, `${thumbs} thumbnails`);

  const desc =
    "Round-trip verification of the S3 presigned upload path. ".repeat(4) +
    "Posted to Instagram and TikTok with the agreed hashtags and tagged the brand account as specified in the deal terms.";
  const descLen = await evaluate(
    cdp,
    `(() => {
      const el = document.querySelector('#proof-description');
      const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      set.call(el, ${JSON.stringify(desc)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return el.value.length;
    })()`
  );
  ok("description accepted by React state", descLen >= 150, `${descLen} chars`);
  const enabled = await evaluate(cdp, "!document.querySelector('button[type=submit]').disabled");
  ok("submit button enabled", enabled);

  reqs.length = 0;
  await evaluate(cdp, "document.querySelector('button[type=submit]').click(); true");
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (reqs.some((r) => /\/submit$/.test(r.url) && r.status)) break;
  }
  await new Promise((r) => setTimeout(r, 1500));

  /* 6. network shape */
  step("network shape (the whole point)");
  const presign = reqs.filter((r) => r.url.includes("/proof-upload-url"));
  const puts = reqs.filter((r) => r.method === "PUT" && /\.s3\.[a-z0-9-]+\.amazonaws\.com/.test(r.url));
  const submits = reqs.filter((r) => /\/submit$/.test(r.url));
  ok("exactly 1 POST to proof-upload-url", presign.length === 1, `${presign.length} (status ${presign[0]?.status})`);
  ok("presign POST returned 200", presign[0]?.status === 200);
  ok("2 direct PUTs to *.s3.*.amazonaws.com", puts.length === 2, puts.map((p) => p.status).join(","));
  ok("both S3 PUTs returned 200", puts.length === 2 && puts.every((p) => p.status === 200));
  ok("exactly 1 POST to /submit", submits.length === 1, `status ${submits[0]?.status}`);
  ok("submit returned 200", submits[0]?.status === 200);
  const big = reqs.filter((r) => r.url.startsWith(ORIGIN) && (r.postDataLen ?? 0) > 10240);
  ok(
    "NO same-origin request carries image bytes (>10KB body)",
    big.length === 0,
    big.map((r) => `${r.url} ${r.postDataLen}B`).join(" | ") || "largest same-origin body is small"
  );
  console.log("  captured:");
  for (const r of reqs.filter((r) => /proof-upload-url|amazonaws|\/submit$/.test(r.url))) {
    console.log(`    ${String(r.status).padEnd(4)} ${r.method.padEnd(5)} ${r.url.slice(0, 116)}`);
  }

  /* 7. persisted state + render */
  step("database + render");
  const { data: after } = await sb
    .from("deliverables")
    .select("status,proof_description,proof_image_urls,submitted_at")
    .eq("id", cand.id)
    .maybeSingle();
  ok("deliverable status is now submitted", after?.status === "submitted", String(after?.status));
  const refs = after?.proof_image_urls ?? [];
  ok("2 refs persisted", Array.isArray(refs) && refs.length === 2, JSON.stringify(refs).slice(0, 170));
  ok(
    "refs stored as s3:// KEYS, not URLs",
    Array.isArray(refs) && refs.every((r) => typeof r === "string" && r.startsWith("s3://deals/"))
  );
  ok("no presigned URL leaked into the DB", !JSON.stringify(refs).includes("X-Amz-Signature"));

  await cdp.send("Page.navigate", { url: `${ORIGIN}/dashboard/${dash}/deals/${deal.id}` });
  await cdp.waitFor("Page.loadEventFired").catch(() => {});
  await new Promise((r) => setTimeout(r, 2500));
  const imgs = await evaluate(
    cdp,
    'Array.from(document.querySelectorAll(\'img[alt="Deliverable proof"]\')).map(i=>i.currentSrc||i.src)'
  );
  ok("proof thumbnails rendered on the deal page", (imgs?.length ?? 0) >= 2, `${imgs?.length} imgs`);
  ok(
    "thumbnails go through the next/image optimizer",
    (imgs ?? []).length > 0 && (imgs ?? []).every((s) => s.includes("/_next/image")),
    (imgs ?? [])[0]?.slice(0, 90)
  );
  const broken = await evaluate(
    cdp,
    'Array.from(document.querySelectorAll(\'img[alt="Deliverable proof"]\')).filter(i=>i.naturalWidth===0).length'
  );
  ok("no broken proof images (naturalWidth > 0)", broken === 0, `${broken} broken`);

  const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(process.cwd(), "roundtrip-proof.png"), Buffer.from(shot.data, "base64"));
  console.log("  screenshot: roundtrip-proof.png");

  /* 8. restore */
  step("restore original row");
  const s3keys = (Array.isArray(refs) ? refs : [])
    .filter((r) => typeof r === "string" && r.startsWith("s3://"))
    .map((r) => r.slice(5));
  const S3M = await import("./lib/aws/s3.ts");
  await S3M.deleteProofObjects(s3keys);
  await sb.from("deliverables").update(before).eq("id", cand.id);
  const { data: restored } = await sb
    .from("deliverables")
    .select("status,proof_image_urls")
    .eq("id", cand.id)
    .maybeSingle();
  ok("deliverable restored to its original state", restored?.status === before.status, `status=${restored?.status}`);
  const heads = await Promise.all(s3keys.map((k) => S3M.headProofObject(k)));
  ok("test S3 objects deleted", heads.every((h) => h === null));
} catch (e) {
  console.log(`\n  HARNESS ERROR: ${e.message}`);
  fail++;
  try {
    const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(process.cwd(), "roundtrip-failure.png"), Buffer.from(shot.data, "base64"));
    console.log("  failure screenshot: roundtrip-failure.png");
    console.log("  url at failure:", await evaluate(cdp, "location.href").catch(() => "?"));
    const txt = await evaluate(cdp, "document.body?.innerText?.slice(0,700)").catch(() => "");
    if (txt) console.log("  page text:\n" + txt.split("\n").map((l) => "    " + l).join("\n"));
  } catch {}
} finally {
  cdp.close();
  chrome.proc.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(`\n${fail === 0 ? "ROUND TRIP PASSED" : fail + " CHECK(S) FAILED"}`);
process.exit(fail === 0 ? 0 : 1);
