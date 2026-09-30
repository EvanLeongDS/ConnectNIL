/** Screenshots the signed-out pages (no auth needed). Temporary harness. */
import fs from "node:fs";
import { launchChrome, attachToPage, evaluate } from "./.rt-cdp.tmp.mjs";

const ORIGIN = process.env.SHOT_ORIGIN || "http://localhost:3010";
const pages = { login: "/login", signup: "/signup", role: "/role" };

const chrome = await launchChrome({ headless: true });
const cdp = await attachToPage(chrome.port);
try {
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });

  for (const [name, path_] of Object.entries(pages)) {
    await cdp.send("Page.navigate", { url: ORIGIN + path_ });
    await cdp.waitFor("Page.loadEventFired").catch(() => {});
    // The field animates in, so give GSAP a few seconds before capturing.
    await new Promise((r) => setTimeout(r, 4000));

    const info = JSON.parse(
      await evaluate(
        cdp,
        `JSON.stringify({
           href: location.href,
           seats: document.querySelectorAll('.sports-ball-seat').length,
           visible: [...document.querySelectorAll('.sports-ball-seat')]
             .filter(e => getComputedStyle(e).display !== 'none').length,
           tints: [...new Set([...document.querySelectorAll('.sports-ball-seat')]
             .filter(e => getComputedStyle(e).display !== 'none')
             .map(e => e.dataset.tint))],
           canvases: document.querySelectorAll('canvas').length
         })`
      )
    );
    const out = `shot-auth-${name}.png`;
    const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(out, Buffer.from(shot.data, "base64"));
    console.log(
      `${name}: ${info.href}\n  balls ${info.visible}/${info.seats} visible, tints=${JSON.stringify(
        info.tints
      )}, canvases=${info.canvases}\n  wrote ${out}`
    );
  }
} finally {
  chrome.proc.kill();
}
