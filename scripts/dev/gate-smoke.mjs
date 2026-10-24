// T-11 evidence — the gate flow end-to-end against fresh, FULLY APPROVED
// fixtures (faculty → HOD through fn_decide_application, so the 0006 trigger
// issues each pass on the real transition). Proven here:
//   * public page + API classify by raw token (holder/department/window/exit
//     state only — the unique reason marker never reaches the surface);
//   * anonymous/student pass-code entry is refused (24-bit codes must not be
//     enumerable), while security resolves codes with whitespace/case noise;
//   * expired / revoked / unknown classifications;
//   * security-only recording: exit → duplicate exit → return → duplicate
//     return, return-without-exit (staff_rejected), rejection;
//   * every recording attempt appends exactly one log row bound to the security
//     user, and a valid return completes the application;
//   * read-only verification writes NO log rows (D-018).
// Run: node --env-file=.env.local scripts/dev/gate-smoke.mjs  (dev server up)
import { randomBytes } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const REASON_MARKER = "T11-REASON-MARKER-7f3a9c";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const student = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);
const faculty = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);
const hod = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);
const security = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

const fail = (label, detail) => {
  console.error(`FAIL ${label}:`, detail ?? "");
  process.exit(1);
};

function assert(condition, label, detail) {
  if (!condition) fail(label, detail);
}

const iso = (hours) => new Date(Date.now() + hours * 3600_000).toISOString();

async function signIn(client, email) {
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: "DemoPassw0rd!",
  });
  if (error || !data?.session) fail("login", `${email}: ${error?.message}`);
  return data;
}

/** SSR cookie shape used since T-06. */
function authCookie(session) {
  return (
    "sb-127-auth-token=base64-" +
    Buffer.from(JSON.stringify(session), "utf8").toString("base64url")
  );
}

function postJson(path, body, cookie) {
  return fetch(`${SITE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

function getPage(path, cookie) {
  return fetch(`${SITE}${path}`, {
    headers: cookie ? { Cookie: cookie } : {},
    redirect: "manual",
  });
}

async function logCount() {
  const { count, error } = await admin
    .from("gate_verification_logs")
    .select("id", { count: "exact", head: true });
  if (error) fail("log count", error.message);
  return count ?? 0;
}

/** The verification surface only — global chrome carries the institution's
 *  branding, which is not what the no-medical-data guarantee is about. */
function mainSurface(html) {
  const start = html.indexOf("<main");
  const end = html.indexOf("</main>");
  return start >= 0 && end > start ? html.slice(start, end) : html;
}

function assertPassSurface(html, label, markers) {
  const surface = mainSurface(html);
  for (const marker of markers) {
    assert(surface.includes(marker), `${label} marker`, marker);
  }
  assert(!surface.includes(REASON_MARKER), `${label} reason marker leak`, REASON_MARKER);
  assert(
    !surface.toLowerCase().includes("medical"),
    `${label} medical text leak in verification surface`,
  );
  assert(!surface.includes("Personal"), `${label} reason label leak`, "Personal");
}

async function approve(applicationId) {
  for (const [label, client] of [
    ["faculty", faculty],
    ["hod", hod],
  ]) {
    const { error } = await client.rpc("fn_decide_application", {
      p_application_id: applicationId,
      p_action: "approve",
      p_remarks: null,
    });
    if (error) fail(`fixture approve (${label})`, error.message);
  }
}

/** Fresh CSE personal application, approved through the REAL chain, then a
 *  window pinned to the case under test. */
async function seedPass(label) {
  const applicationId = crypto.randomUUID();
  const { error } = await student.rpc("fn_submit_application", {
    p_reason: "personal",
    p_departure_at: iso(2),
    p_expected_return_at: iso(6),
    p_explanation: `${REASON_MARKER} ${label}`,
    p_docs: [],
    p_application_id: applicationId,
  });
  if (error) fail("fn_submit_application", error.message);

  await approve(applicationId);

  const { data: pass, error: passError } = await admin
    .from("gate_passes")
    .select("id, pass_code, token_hash, valid_from, expires_at")
    .eq("application_id", applicationId)
    .single();
  if (passError || !pass) {
    fail("pass fixture", passError?.message ?? "trigger issued no pass");
  }

  const window =
    label === "expired"
      ? { valid_from: iso(-6), expires_at: iso(-1) }
      : { valid_from: iso(-1), expires_at: iso(4) };
  const { error: windowError } = await admin
    .from("gate_passes")
    .update(window)
    .eq("id", pass.id);
  if (windowError) fail("window fixture", windowError.message);

  const { data: raw, error: rawError } = await student.rpc("fn_pass_qr_token", {
    p_pass_id: pass.id,
  });
  if (rawError || typeof raw !== "string") {
    fail("raw token", rawError?.message ?? raw);
  }

  return { applicationId, pass: { ...pass, ...window }, raw };
}

// --- fixtures -----------------------------------------------------------------
const studentAuth = await signIn(student, "aarav.demo@pratappass.test");
const securityAuth = await signIn(security, "security.demo@pratappass.test");
await signIn(faculty, "faculty.demo@pratappass.test");
await signIn(hod, "hod.demo@pratappass.test");

const main = await seedPass("main");
const noExit = await seedPass("no-exit");
const expired = await seedPass("expired");
const revoked = await seedPass("revoked");
{
  const { error } = await admin
    .from("gate_passes")
    .update({ revoked_at: iso(-0.25) })
    .eq("id", revoked.pass.id);
  if (error) fail("revoke fixture", error.message);
}
const studentCookie = authCookie(studentAuth.session);
const securityCookie = authCookie(securityAuth.session);
console.log(
  "fixtures:",
  [main, noExit, expired, revoked]
    .map((fixture) => `${fixture.pass.pass_code} (${fixture.applicationId.slice(0, 8)})`)
    .join(", "),
);

const logsBefore = await logCount();
console.log("log rows before recording:", logsBefore);

// --- 1. public page + API: valid classification, nothing but the contract ----
const mainPath = `/verify?token=${encodeURIComponent(main.raw)}`;
const mainPage = await getPage(mainPath);
assert(mainPage.status === 200, "valid page status", mainPage.status);
assert(
  mainPage.headers.get("cache-control")?.includes("no-store"),
  "page cache-control",
  mainPage.headers.get("cache-control"),
);
assert(
  mainPage.headers.get("referrer-policy") === "no-referrer",
  "page referrer-policy",
  mainPage.headers.get("referrer-policy"),
);
assert(
  mainPage.headers.get("x-robots-tag")?.includes("noindex"),
  "page x-robots-tag",
  mainPage.headers.get("x-robots-tag"),
);
const mainHtml = await mainPage.text();
assertPassSurface(mainHtml, "valid page", [
  "Verify gate pass",
  "Aarav Demo",
  main.pass.pass_code,
  "Valid pass",
  "Not exited",
]);
assert(!mainHtml.includes("Record exit"), "anon page must not offer recording");
console.log(
  "valid page: 200, holder/code/window/state, no-store + no-referrer; no reason/health text; no record action for anon",
);

const verifyRes = await postJson("/api/gate/verify", { token: main.raw });
assert(verifyRes.status === 200, "api verify status", verifyRes.status);
assert(
  verifyRes.headers.get("cache-control") === "no-store",
  "api verify cache-control",
  verifyRes.headers.get("cache-control"),
);
const verifyJson = await verifyRes.json();
assert(verifyJson.result === "valid", "api verify result", verifyJson.result);
assert(
  verifyJson.pass?.holder_name === "Aarav Demo",
  "api verify holder",
  verifyJson.pass?.holder_name,
);
assert(
  typeof verifyJson.pass?.department === "string" &&
    verifyJson.pass.department.length > 0,
  "api verify department",
  verifyJson.pass?.department,
);
assert(
  verifyJson.pass?.exit_state === "not_exited",
  "api verify exit_state",
  verifyJson.pass?.exit_state,
);
assert(
  typeof verifyJson.pass?.departure_window?.valid_from === "string" &&
    typeof verifyJson.pass?.departure_window?.expires_at === "string",
  "api verify departure_window",
  JSON.stringify(verifyJson.pass?.departure_window),
);
const verifyText = JSON.stringify(verifyJson);
assert(!verifyText.includes(REASON_MARKER), "api verify reason marker leak");
assert(!verifyText.toLowerCase().includes("medical"), "api verify medical text leak");
assert(
  !Object.hasOwn(verifyJson.pass ?? {}, "reason") &&
    !Object.hasOwn(verifyJson.pass ?? {}, "explanation") &&
    !Object.hasOwn(verifyJson.pass ?? {}, "documents"),
  "api verify leaked a reason/explanation/documents key",
  Object.keys(verifyJson.pass ?? {}).join(", "),
);
console.log(
  "api verify: valid, holder/department/departure_window/exit_state; no reason/explanation/documents keys",
);

// --- 2. unknown + code-entry refusal -----------------------------------------
const unknownRaw = randomBytes(32).toString("hex");
const unknownRes = await postJson("/api/gate/verify", { token: unknownRaw });
const unknownJson = await unknownRes.json();
assert(
  unknownRes.status === 200 &&
    unknownJson.result === "invalid_token" &&
    unknownJson.pass === null,
  "unknown token",
  JSON.stringify(unknownJson),
);

const anonCodeRes = await postJson("/api/gate/verify", {
  token: main.pass.pass_code,
});
const anonCodeJson = await anonCodeRes.json();
assert(
  anonCodeJson.result === "invalid_token",
  "anon pass code must be refused",
  anonCodeJson.result,
);

const extraFieldRes = await postJson("/api/gate/verify", {
  token: main.raw,
  extra: true,
});
assert(extraFieldRes.status === 400, "unknown field rejected", extraFieldRes.status);

const badJsonRes = await fetch(`${SITE}/api/gate/verify`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: "not-json",
});
assert(badJsonRes.status === 400, "invalid json rejected", badJsonRes.status);
console.log(
  "negatives: unknown -> invalid_token; anon code -> invalid_token; unknown field/bad JSON -> 400",
);

const staffCodeRes = await postJson(
  "/api/gate/verify",
  { token: `  ${main.pass.pass_code.toLowerCase()}  ` },
  securityCookie,
);
const staffCodeJson = await staffCodeRes.json();
assert(
  staffCodeJson.result === "valid" &&
    staffCodeJson.pass?.holder_name === "Aarav Demo",
  "security code path",
  JSON.stringify(staffCodeJson),
);
const studentCodeRes = await postJson(
  "/api/gate/verify",
  { token: main.pass.pass_code },
  studentCookie,
);
const studentCodeJson = await studentCodeRes.json();
assert(
  studentCodeJson.result === "invalid_token",
  "student pass code must be refused",
  studentCodeJson.result,
);
console.log(
  "code path: security (lowercase + whitespace) -> valid; student -> invalid_token",
);

const anonCodePage = await getPage(
  `/verify?token=${encodeURIComponent(main.pass.pass_code)}`,
);
const anonCodeHtml = await anonCodePage.text();
assert(
  anonCodeHtml.includes("This pass is not recognised"),
  "anon page by code must not resolve",
);
console.log("anon page by code -> not recognised");

// --- 3. expired + revoked -----------------------------------------------------
const expiredPage = await getPage(`/verify?token=${expired.raw}`);
const expiredHtml = await expiredPage.text();
assertPassSurface(expiredHtml, "expired page", [
  "Aarav Demo",
  expired.pass.pass_code,
  "Pass expired",
]);
const expiredApi = await postJson("/api/gate/verify", { token: expired.raw });
assert(
  (await expiredApi.json()).result === "expired",
  "expired api classification",
);

const revokedPage = await getPage(`/verify?token=${revoked.raw}`);
const revokedHtml = await revokedPage.text();
assertPassSurface(revokedHtml, "revoked page", [
  "Aarav Demo",
  revoked.pass.pass_code,
  "Pass revoked",
]);
const revokedApi = await postJson("/api/gate/verify", { token: revoked.raw });
assert(
  (await revokedApi.json()).result === "revoked",
  "revoked api classification",
);
console.log("expired/revoked: page + api classifications correct");

// --- 4. read-only verification writes no logs --------------------------------
const logsAfterReads = await logCount();
assert(
  logsAfterReads === logsBefore,
  "read-only verification wrote logs",
  `${logsBefore} -> ${logsAfterReads}`,
);
console.log("read-only verification: log rows unchanged at", logsBefore);

// --- 5. recording authorization ----------------------------------------------
const anonRecord = await postJson("/api/gate/record", {
  token: main.raw,
  event: "exit",
});
assert(anonRecord.status === 401, "anon record status", anonRecord.status);
assert(
  (await anonRecord.json()).error?.code === "unauthenticated",
  "anon record envelope",
);
const studentRecord = await postJson(
  "/api/gate/record",
  { token: main.raw, event: "exit" },
  studentCookie,
);
assert(studentRecord.status === 403, "student record status", studentRecord.status);
assert(
  (await studentRecord.json()).error?.code === "forbidden",
  "student record envelope",
);
assert(
  (await logCount()) === logsBefore,
  "rejected recording attempts wrote log rows",
);
console.log("record auth: anon 401, student 403; no log rows written");

// --- 6. return without exit ---------------------------------------------------
const noExitReturn = await postJson(
  "/api/gate/record",
  { token: noExit.raw, event: "return" },
  securityCookie,
);
assert(
  (await noExitReturn.json()).result === "staff_rejected",
  "return without exit must be staff_rejected",
);
console.log("return without exit -> staff_rejected (logged)");

// --- 7. exit -> duplicate exit -> return -> duplicate return ------------------
const exit1 = await postJson(
  "/api/gate/record",
  { token: main.raw, event: "exit" },
  securityCookie,
);
assert((await exit1.json()).result === "valid", "first exit");
const exit2 = await postJson(
  "/api/gate/record",
  { token: main.raw, event: "exit" },
  securityCookie,
);
assert((await exit2.json()).result === "already_exited", "duplicate exit");
console.log("exit -> valid; duplicate exit -> already_exited");

const afterExitPage = await getPage(mainPath, securityCookie);
const afterExitHtml = await afterExitPage.text();
assertPassSurface(afterExitHtml, "after-exit page", [
  "Aarav Demo",
  "Exit already recorded",
  "Exited",
  "Record return",
  "Record rejection",
]);
assert(
  !afterExitHtml.includes("Record exit"),
  "after-exit page still offers Record exit",
);
console.log(
  "security page after exit: already-exited state + return/rejection actions",
);

const return1 = await postJson(
  "/api/gate/record",
  { token: main.raw, event: "return" },
  securityCookie,
);
assert((await return1.json()).result === "valid", "first return");
const return2 = await postJson(
  "/api/gate/record",
  { token: main.raw, event: "return" },
  securityCookie,
);
assert((await return2.json()).result === "already_returned", "duplicate return");

const { data: mainApp, error: mainAppError } = await admin
  .from("gate_pass_applications")
  .select("status")
  .eq("id", main.applicationId)
  .single();
assert(
  !mainAppError && mainApp.status === "completed",
  "valid return did not complete the application",
  mainApp?.status ?? mainAppError?.message,
);
console.log("valid return -> application completed");

const returnedPage = await getPage(mainPath);
const returnedHtml = await returnedPage.text();
assertPassSurface(returnedHtml, "returned page", [
  "Aarav Demo",
  main.pass.pass_code,
  "Trip already completed",
  "Returned",
]);
assert(
  !returnedHtml.includes("Record return") &&
    !returnedHtml.includes("Record rejection"),
  "returned page still offers a recording action",
);
console.log("returned page: completed state, no further actions");

// --- 8. rejection event -------------------------------------------------------
const expiredReject = await postJson(
  "/api/gate/record",
  { token: expired.raw, event: "rejection" },
  securityCookie,
);
assert(
  (await expiredReject.json()).result === "staff_rejected",
  "rejection event result",
);
const expiredStaffPage = await getPage(
  `/verify?token=${expired.raw}`,
  securityCookie,
);
const expiredStaffHtml = await expiredStaffPage.text();
assert(
  expiredStaffHtml.includes("Record rejection"),
  "expired staff page must offer rejection",
);
assert(
  !expiredStaffHtml.includes("Record exit"),
  "expired staff page must not offer exit",
);
console.log("expired pass: rejection recorded; no exit action offered");

// --- 9. log evidence ----------------------------------------------------------
const logsAfter = await logCount();
assert(
  logsAfter === logsBefore + 6,
  "log row delta",
  `${logsBefore} -> ${logsAfter} (expected +6)`,
);

const { data: mainLogs, error: mainLogsError } = await admin
  .from("gate_verification_logs")
  .select("event, result, gate_user_id")
  .eq("pass_id", main.pass.id)
  .order("occurred_at", { ascending: true });
assert(!mainLogsError, "main logs read", mainLogsError?.message);
const mainSequence = (mainLogs ?? []).map((row) => `${row.event}:${row.result}`);
assert(
  JSON.stringify(mainSequence) ===
    JSON.stringify([
      "exit:valid",
      "exit:already_exited",
      "return:valid",
      "return:already_returned",
    ]),
  "main log sequence",
  mainSequence.join(", "),
);
assert(
  (mainLogs ?? []).every((row) => row.gate_user_id === securityAuth.user.id),
  "main log gate_user_id must be the security user",
);

const { data: noExitLogs } = await admin
  .from("gate_verification_logs")
  .select("event, result")
  .eq("pass_id", noExit.pass.id);
assert(
  noExitLogs?.length === 1 &&
    noExitLogs[0].event === "return" &&
    noExitLogs[0].result === "staff_rejected",
  "return-without-exit log row",
  JSON.stringify(noExitLogs),
);

const { data: expiredLogs } = await admin
  .from("gate_verification_logs")
  .select("event, result")
  .eq("pass_id", expired.pass.id);
assert(
  expiredLogs?.length === 1 &&
    expiredLogs[0].event === "rejection" &&
    expiredLogs[0].result === "staff_rejected",
  "rejection log row",
  JSON.stringify(expiredLogs),
);
console.log(
  "logs: +6 rows; main = exit:valid, exit:already_exited, return:valid, return:already_returned; all bound to the security uid",
);

// --- 10. banners + staff-only code form --------------------------------------
const bannerHtml = await (await getPage(`${mainPath}&recorded=return:valid`)).text();
assert(
  bannerHtml.includes("Return recorded — the application is now complete."),
  "recorded banner copy",
);
const errorHtml = await (await getPage(`${mainPath}&error=forbidden`)).text();
assert(
  errorHtml.includes(
    "Only gate security or an administrator can record gate events.",
  ),
  "error banner copy",
);
console.log("banners: recorded + error copy render");

const staffHomeHtml = await (await getPage("/verify", securityCookie)).text();
assert(
  staffHomeHtml.includes("Pass code or token") &&
    staffHomeHtml.includes("MPGI-XXXXXX"),
  "security no-token page must offer the code form",
);
const anonHomeHtml = await (await getPage("/verify")).text();
assert(
  !anonHomeHtml.includes("Pass code or token"),
  "anon page must not offer the code form",
);
assert(anonHomeHtml.includes("sign in"), "anon page must offer sign-in copy");
const studentHomeHtml = await (await getPage("/verify", studentCookie)).text();
assert(
  !studentHomeHtml.includes("Pass code or token"),
  "student page must not offer the code form",
);
assert(
  studentHomeHtml.includes(
    "Only gate security or administrators can verify by pass code.",
  ),
  "student no-token copy",
);
console.log("code form: security only; anon/student get sign-in/permission copy");

const staffCodePageHtml = await (
  await getPage(
    `/verify?token=${encodeURIComponent(main.pass.pass_code)}`,
    securityCookie,
  )
).text();
assertPassSurface(staffCodePageHtml, "staff code page", [
  "Aarav Demo",
  "Trip already completed",
]);
console.log("security page by code -> resolves to the returned pass");

console.log("gate smoke complete (fixtures left as evidence; main app is completed)");
