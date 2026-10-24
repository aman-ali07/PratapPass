#!/usr/bin/env node
// T-14 UX smoke: drives headless Chrome over CDP against a running build.
// Verifies responsive layout, touch targets, table-to-card collapse, skip link,
// and the global 404 state with real rendered pixels. No extra dependencies.
//
// Usage: node scripts/dev/ux-smoke.mjs [baseUrl]

import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE_URL = process.argv[2] ?? "http://localhost:3000";
const OUT_DIR = "/tmp/opencode/ux";
const PORT = 9223;
const PASSWORD = "DemoPassw0rd!";
const VERIFY_TOKEN = process.env.VERIFY_TOKEN ?? "";
const PASS_ID = process.env.PASS_ID ?? "";

mkdirSync(OUT_DIR, { recursive: true });
rmSync("/tmp/opencode/chrome-ux", { recursive: true, force: true });

function env(name) {
  const line = readFileSync(new URL("../../.env.local", import.meta.url), "utf8")
    .split("\n")
    .find((entry) => entry.startsWith(`${name}=`));
  if (!line) throw new Error(`${name} missing from .env.local`);
  return line.slice(name.length + 1).replace(/^["']|["']$/g, "").trim();
}

async function signIn(email) {
  const response = await fetch(`${env("NEXT_PUBLIC_SUPABASE_URL")}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: env("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!response.ok) throw new Error(`sign-in failed for ${email}: ${response.status}`);
  const session = await response.json();
  return `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
}

const failures = [];
let checks = 0;

function check(label, condition, detail = "") {
  checks += 1;
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const chrome = spawn(
  "/usr/bin/google-chrome",
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    `--remote-debugging-port=${PORT}`,
    "--user-data-dir=/tmp/opencode/chrome-ux",
    "about:blank",
  ],
  { stdio: "ignore" },
);

async function waitForChrome() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Chrome did not expose CDP in time");
}

await waitForChrome();
const target = await (
  await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })
).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});

let nextId = 0;
const pending = new Map();
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(JSON.stringify(message.error)));
  else resolve(message.result);
};

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? "evaluation failed");
  }
  return result.result.value;
}

async function setViewport(width, { touch = false } = {}) {
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height: 900,
    deviceScaleFactor: 1,
    mobile: touch,
  });
  await send("Emulation.setTouchEmulationEnabled", { enabled: touch, maxTouchPoints: touch ? 5 : 1 });
}

async function setSession(cookie) {
  await send("Network.setCookie", {
    name: "sb-127-auth-token",
    value: cookie,
    url: BASE_URL,
    path: "/",
    httpOnly: false,
    sameSite: "Lax",
  });
}

async function clearCookies() {
  await send("Network.clearBrowserCookies");
}

async function goto(path) {
  const expectedPath = new URL(path, BASE_URL).pathname;
  await send("Page.navigate", { url: `${BASE_URL}${path}` });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const state = await evaluate(`(() => {
      const main = document.querySelector("main");
      return location.pathname === ${JSON.stringify(expectedPath)}
        && document.readyState === "complete"
        && !!main
        && main.getAttribute("aria-busy") !== "true";
    })()`);
    if (state) {
      // Streaming can replace the fallback one frame later; let the tree settle.
      await new Promise((resolve) => setTimeout(resolve, 250));
      return;
    }
  }
  const actual = await evaluate("location.pathname");
  throw new Error(`page did not finish loading: ${path} (at ${actual})`);
}

async function screenshot(name) {
  const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(join(OUT_DIR, `${name}.png`), Buffer.from(shot.data, "base64"));
}

const layout = () =>
  evaluate(`(() => {
    const doc = document.documentElement;
    const main = document.querySelector("main");
    const skip = document.querySelector('a[href="#main-content"]');
    return {
      path: location.pathname,
      title: document.title,
      width: innerWidth,
      scrollWidth: doc.scrollWidth,
      mainTop: main ? main.getBoundingClientRect().top : -1,
      skip: skip ? { text: skip.textContent.trim(), height: skip.getBoundingClientRect().height } : null,
      buttons: [...document.querySelectorAll('[data-slot="button"]')]
        .filter((button) => button.offsetParent !== null)
        .map((button) => Math.round(button.getBoundingClientRect().height)),
      fields: [...document.querySelectorAll('[data-slot="input"], [data-slot="select-trigger"], [data-slot="textarea"]')]
        .filter((field) => field.offsetParent !== null)
        .map((field) => Math.round(field.getBoundingClientRect().height)),
      summaries: [...document.querySelectorAll("summary")]
        .filter((summary) => summary.offsetParent !== null)
        .map((summary) => Math.round(summary.getBoundingClientRect().height)),
      table: (() => {
        const header = document.querySelector('[data-slot="table-header"]');
        const row = document.querySelector('[data-slot="table-row"]');
        const cell = document.querySelector('[data-slot="table-cell"][data-label]');
        if (!row) return null;
        return {
          header: header ? getComputedStyle(header).display : "missing",
          row: getComputedStyle(row).display,
          cell: cell ? getComputedStyle(cell).display : "missing",
          label: cell ? getComputedStyle(cell, "::before").content : "missing",
        };
      })(),
    };
  })()`);

function checkNoOverflow(name, info) {
  check(`${name}: no horizontal overflow`, info.scrollWidth <= info.width + 1, `${info.scrollWidth} > ${info.width}`);
}

function checkTouchTargets(name, info) {
  const smallButtons = info.buttons.filter((height) => height < 44);
  const smallFields = info.fields.filter((height) => height < 44);
  const smallSummaries = info.summaries.filter((height) => height < 44);
  check(`${name}: visible buttons >= 44px`, smallButtons.length === 0, `heights ${info.buttons.join(",")}`);
  check(`${name}: visible fields >= 44px`, smallFields.length === 0, `heights ${info.fields.join(",")}`);
  check(`${name}: visible summaries >= 44px`, smallSummaries.length === 0, `heights ${info.summaries.join(",")}`);
}

try {
  await send("Page.enable");
  await send("Network.enable");
  await send("Runtime.enable");
  await send("Emulation.setFocusEmulationEnabled", { enabled: true });

  console.log("\nAnonymous pages (360px, touch)");
  await clearCookies();
  await setViewport(360, { touch: true });
  await goto("/login");
  let info = await layout();
  check("login: stylesheet applied (button >= 44px)", info.buttons.every((height) => height >= 44), `heights ${info.buttons.join(",")}`);
  checkTouchTargets("login", info);
  checkNoOverflow("login", info);
  check("login: skip link targets main", info.skip?.text === "Skip to content" && info.mainTop >= 0);
  await evaluate('document.querySelector(\'a[href="#main-content"]\').focus()');
  const skipVisible = await evaluate(`(() => {
    const link = document.querySelector('a[href="#main-content"]');
    const box = link.getBoundingClientRect();
    return box.width > 20 && box.height > 20;
  })()`);
  check("login: skip link becomes visible on focus", skipVisible);
  await screenshot("login-360");

  await goto("/this-page-does-not-exist");
  info = await layout();
  const notFound = await evaluate("document.body.innerText.includes('Page not found')");
  check("404: renders not-found state", notFound);
  checkNoOverflow("404", info);
  await screenshot("404-360");

  await goto("/verify");
  info = await layout();
  const gatePrompt = await evaluate(
    "document.body.innerText.includes(\"Open the link from a student's QR\")",
  );
  check("verify: anonymous users see sign-in guidance", gatePrompt);
  checkNoOverflow("verify", info);
  await screenshot("verify-360");

  if (VERIFY_TOKEN) {
    await goto(`/verify?token=${encodeURIComponent(VERIFY_TOKEN)}`);
    info = await layout();
    const resultText = await evaluate("document.body.innerText");
    check("verify result: outcome rendered", /expired|valid|revoked|not found/i.test(resultText));
    checkNoOverflow("verify result", info);
    await screenshot("verify-result-360");
  }

  console.log("\nGate security verify form (360px, touch)");
  await setSession(await signIn("security.demo@pratappass.test"));
  await goto("/verify");
  info = await layout();
  const inputWidth = await evaluate(
    "Math.round(document.querySelector('input[name=\"token\"]').getBoundingClientRect().width)",
  );
  check("verify: input spans mobile card", inputWidth >= 280, `${inputWidth}px`);
  checkNoOverflow("verify gate form", info);
  checkTouchTargets("verify gate form", info);
  await screenshot("verify-gate-360");

  console.log("\nAdmin pages (360px, touch)");
  await setSession(await signIn("admin.demo@pratappass.test"));
  for (const [path, name] of [
    ["/admin/departments", "departments"],
    ["/admin/users", "users"],
    ["/admin/rules", "rules"],
    ["/admin/analytics", "analytics"],
    ["/admin/audit", "audit"],
  ]) {
    await goto(path);
    info = await layout();
    check(`${name}: authenticated route rendered`, info.path === path, info.path);
    checkNoOverflow(name, info);
    checkTouchTargets(name, info);
    if (name === "analytics") {
      const nav = await evaluate(`(() => {
        const links = [...document.querySelectorAll('nav[aria-label="Admin sections"] a')];
        return {
          count: links.length,
          clipped: links.filter((link) => link.getBoundingClientRect().right > innerWidth + 1).length,
          scrolls: (() => {
            const box = document.querySelector('nav[aria-label="Admin sections"] > div');
            return box.scrollWidth > box.clientWidth + 1;
          })(),
        };
      })()`);
      check("analytics: all admin sections visible", nav.count === 5 && nav.clipped === 0, JSON.stringify(nav));
      check("analytics: admin nav does not scroll sideways", !nav.scrolls);
    }
    if (info.table) {
      check(`${name}: table header hidden on mobile`, info.table.header === "none", info.table.header);
      check(`${name}: rows render as cards`, info.table.row === "block", info.table.row);
      check(`${name}: labelled cells are flex`, info.table.cell === "flex", info.table.cell);
      check(`${name}: card label content present`, info.table.label.includes("Request") || info.table.label !== "none", info.table.label);
      const clippedRows = await evaluate(`(() => {
        const rows = [...document.querySelectorAll('main [data-slot="table-row"]')];
        return rows.filter((row) => row.getBoundingClientRect().right > innerWidth + 1).length;
      })()`);
      check(`${name}: cards fit mobile viewport`, clippedRows === 0, `${clippedRows} row(s) overflow`);
    } else {
      check(`${name}: data table present`, false);
    }
    await screenshot(`${name}-360`);
    if (name === "audit") {
      const stacked = await evaluate(`(() => {
        const actor = document.querySelector('[data-slot="table-cell"][data-label="Actor"]');
        const name = actor?.querySelector("span.font-medium");
        const role = actor?.querySelector("span.block");
        const entity = document.querySelector('[data-slot="table-cell"][data-label="Entity"]');
        const code = entity?.querySelector("code");
        const id = entity?.querySelector("span.block");
        return {
          actor: !role || role.getBoundingClientRect().top >= name.getBoundingClientRect().bottom - 1,
          entity: !id || id.getBoundingClientRect().top >= code.getBoundingClientRect().bottom - 1,
        };
      })()`);
      check("audit: multi-value cells stack", stacked.actor && stacked.entity, JSON.stringify(stacked));
      await evaluate(`(() => {
        const details = document.querySelector("main details");
        if (details) details.open = true;
        details?.scrollIntoView({ block: "center" });
      })()`);
      await new Promise((resolve) => setTimeout(resolve, 150));
      const metadata = await evaluate(`(() => {
        const pre = document.querySelector("main details pre");
        return pre ? { width: Math.round(pre.getBoundingClientRect().width), text: pre.textContent.length } : null;
      })()`);
      check("audit: metadata renders", !!metadata && metadata.text > 0, JSON.stringify(metadata));
      check("audit: metadata fits mobile viewport", !!metadata && metadata.width <= 360, JSON.stringify(metadata));
      checkNoOverflow("audit metadata", await layout());
      const clippedAfterOpen = await evaluate(`(() => {
        const rows = [...document.querySelectorAll('main [data-slot="table-row"]')];
        return rows.filter((row) => row.getBoundingClientRect().right > innerWidth + 1).length;
      })()`);
      check("audit: cards still fit after opening metadata", clippedAfterOpen === 0, `${clippedAfterOpen} row(s) overflow`);
      await screenshot("audit-metadata-360");
    }
  }

  console.log("\nEmpty states (360px, touch)");
  await goto("/admin/users?q=zzzznotfound");
  info = await layout();
  check(
    "users empty: message shown",
    await evaluate("document.body.innerText.includes('No users match this search.')"),
  );
  checkNoOverflow("users empty", info);
  await screenshot("users-empty-360");

  await goto("/admin/audit?from=2030-01-01&to=2030-01-02");
  info = await layout();
  check(
    "audit empty: message shown",
    await evaluate("document.body.innerText.includes('No entries match these filters.')"),
  );
  checkNoOverflow("audit empty", info);
  await screenshot("audit-empty-360");

  console.log("\nAdmin pages (768px, fine pointer)");
  await setViewport(768);
  await goto("/admin/analytics");
  info = await layout();
  check("analytics@768: table header visible", info.table?.header === "table-header-group", info.table?.header);
  check("analytics@768: rows render as table rows", info.table?.row === "table-row", info.table?.row);
  checkNoOverflow("analytics@768", info);
  await screenshot("analytics-768");

  console.log("\nAdmin pages (1440px, fine pointer)");
  await setViewport(1440);
  await goto("/admin/analytics");
  info = await layout();
  check("analytics@1440: table header visible", info.table?.header === "table-header-group", info.table?.header);
  checkNoOverflow("analytics@1440", info);
  await screenshot("analytics-1440");

  await goto("/admin/audit");
  info = await layout();
  checkNoOverflow("audit@1440", info);
  await screenshot("audit-1440");

  if (PASS_ID) {
    console.log("\nStudent pass (360px, touch)");
    await setSession(await signIn("aarav.demo@pratappass.test"));
    await setViewport(360, { touch: true });
    await goto(`/student/passes/${PASS_ID}`);
    info = await layout();
    const qrWidth = await evaluate(
      "(() => { const img = document.querySelector('img[alt*=\"QR\" i]'); return img ? Math.round(img.getBoundingClientRect().width) : -1; })()",
    );
    check("pass: QR image present", qrWidth > 0, `${qrWidth}px`);
    check("pass: QR fits mobile viewport", qrWidth > 0 && qrWidth <= 328, `${qrWidth}px`);
    checkNoOverflow("pass", info);
    await screenshot("pass-360");
  }

  console.log("\nReduced motion");
  await send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await clearCookies();
  await goto("/login");
  const transition = await evaluate(
    "getComputedStyle(document.querySelector('[data-slot=\"button\"]')).transitionDuration",
  );
  check(
    "reduced motion: transitions collapsed",
    Number.parseFloat(transition) <= 0.001,
    transition,
  );
  await send("Emulation.setEmulatedMedia", { features: [] });
} finally {
  ws.close();
  chrome.kill("SIGTERM");
}

console.log(`\n${checks - failures.length}/${checks} checks passed`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const failure of failures) console.log(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Screenshots: ${OUT_DIR}`);
}
