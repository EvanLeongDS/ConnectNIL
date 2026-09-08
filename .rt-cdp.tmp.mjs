// Minimal Chrome DevTools Protocol client. Uses `ws`, already in the dependency tree
// via @supabase/realtime-js - no new packages.
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import WebSocket from "ws";

const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((p) => fs.existsSync(p));

export async function launchChrome({ port = 9222, headless = true } = {}) {
  if (!CHROME) throw new Error("no chrome/edge binary found");
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "cnil-cdp-"));
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--disable-gpu",
    "--disable-extensions", "--disable-background-networking",
    "--window-size=1280,900",
    "about:blank",
  ];
  if (headless) args.unshift("--headless=new");
  const proc = spawn(CHROME, args, { stdio: "ignore" });
  // wait for the debug endpoint
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) return { proc, port, profile };
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  proc.kill();
  throw new Error("chrome debug port never opened");
}

export async function attachToPage(port) {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = list.find((t) => t.type === "page");
  if (!page) throw new Error("no page target");
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  await new Promise((res, rej) => { ws.once("open", res); ws.once("error", rej); });

  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.on("message", (buf) => {
    const msg = JSON.parse(buf.toString());
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? rej(new Error(`${msg.error.message} (${JSON.stringify(msg.error.data ?? "")})`)) : res(msg.result);
    } else if (msg.method) {
      for (const l of listeners) l(msg.method, msg.params);
    }
  });

  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const mid = ++id;
      pending.set(mid, { res, rej });
      ws.send(JSON.stringify({ id: mid, method, params }));
      setTimeout(() => { if (pending.delete(mid)) rej(new Error(`${method} timed out`)); }, 45000);
    });

  const on = (fn) => { listeners.push(fn); return () => listeners.splice(listeners.indexOf(fn), 1); };

  const waitFor = (method, pred = () => true, ms = 30000) =>
    new Promise((res, rej) => {
      const off = on((m, p) => { if (m === method && pred(p)) { off(); clearTimeout(t); res(p); } });
      const t = setTimeout(() => { off(); rej(new Error(`waitFor ${method} timed out`)); }, ms);
    });

  return { send, on, waitFor, close: () => ws.close() };
}

/** Evaluate JS in the page and return the plain value. Throws on page-side exceptions. */
export async function evaluate(cdp, expression, { awaitPromise = true } = {}) {
  const r = await cdp.send("Runtime.evaluate", {
    expression, awaitPromise, returnByValue: true, userGesture: true,
  });
  if (r.exceptionDetails) {
    throw new Error("page JS threw: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  }
  return r.result?.value;
}
