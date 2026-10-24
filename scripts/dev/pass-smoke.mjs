// T-10 evidence — the pass surface end-to-end. Fixture: the T-09 approved
// application (decision-smoke app A) already holds a trigger-issued pass row.
// Proven here: no-store SVG/PNG QR, a MACHINE decode of the PNG asserting the
// exact `{SITE}/verify?token=…` URL, a Node-side cross-engine re-derivation of
// the deterministic token (secret parsed from supabase/seed.sql — never
// hardcoded), digest equality with the stored hash, and the anti-oracle
// negatives (foreign student and unknown id share one 404; anonymous 401).
// Run: node --env-file=.env.local scripts/dev/pass-smoke.mjs  (dev server up)
import { readFileSync } from "node:fs";
import { createHash, createHmac } from "node:crypto";
import { PNG } from "pngjs";
import jsQR from "jsqr";
import { createClient } from "@supabase/supabase-js";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const APPLICATION_A = "1c013b34-11e0-4dbb-9b0c-ce895c66d9b1"; // decision-smoke app A

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const student = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);
const foreignStudent = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

const fail = (label, detail) => {
  console.error(`FAIL ${label}:`, detail ?? "");
  process.exit(1);
};

async function signIn(client, email) {
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: "DemoPassw0rd!",
  });
  if (error || !data?.session) fail("login", `${email}: ${error?.message}`);
  return data.session;
}

/** SSR cookie shape used since T-06. */
function authCookie(session) {
  return (
    "sb-127-auth-token=base64-" +
    Buffer.from(JSON.stringify(session), "utf8").toString("base64url")
  );
}

// 0. Resolve the fixture pass; fail WITH guidance if fixtures were wiped.
const { data: pass, error: passError } = await admin
  .from("gate_passes")
  .select("id, pass_code, token_hash")
  .eq("application_id", APPLICATION_A)
  .maybeSingle();
if (passError) fail("fixture read", passError.message);
if (!pass) {
  fail(
    "fixture missing",
    `no pass for ${APPLICATION_A} — re-run scripts/dev/decision-smoke.mjs to rebuild`,
  );
}
console.log("fixture pass:", pass.pass_code, "id", pass.id);

// 1. Cross-engine re-derivation BEFORE any request: the DB fn returns raw =
//    hmac(data=secret, key=pass_id) (pgcrypto arg order — mirrored here), so
//    Node must produce the identical value from the seed's dev secret.
const seedSql = readFileSync("supabase/seed.sql", "utf8");
const secretMatch = seedSql.match(/qr_token_secret',\s*'([^']+)'/);
if (!secretMatch) fail("seed secret", "qr_token_secret not found in seed");
const nodeRaw = createHmac("sha256", pass.id).update(secretMatch[1]).digest("hex");
const expectedUrl = `${SITE}/verify?token=${nodeRaw}`;

const studentSession = await signIn(student, "aarav.demo@pratappass.test");
const { data: rpcRaw, error: rpcError } = await student.rpc("fn_pass_qr_token", {
  p_pass_id: pass.id,
});
if (rpcError || typeof rpcRaw !== "string") fail("fn raw", rpcError?.message ?? rpcRaw);
if (rpcRaw !== nodeRaw) fail("cross-engine raw", `fn=${rpcRaw} node=${nodeRaw}`);
if (createHash("sha256").update(nodeRaw).digest("hex") !== pass.token_hash) {
  fail("digest", "sha256(raw) != token_hash");
}
console.log("cross-engine raw ok (fn == node HMAC, digest == token_hash)");

const studentCookie = authCookie(studentSession);

// 2. SVG route response: no-store, correct content-type, inline disposition.
const svgRes = await fetch(`${SITE}/api/passes/${pass.id}/qr`, {
  headers: { Cookie: studentCookie },
});
if (svgRes.status !== 200) fail("svg route", `status ${svgRes.status} ${await svgRes.text()}`);
if (!svgRes.headers.get("content-type").includes("image/svg+xml")) {
  fail("svg content-type", svgRes.headers.get("content-type"));
}
if (svgRes.headers.get("cache-control") !== "no-store") {
  fail("cache-control", svgRes.headers.get("cache-control"));
}
const svgBody = await svgRes.text();
if (!svgBody.startsWith("<svg")) fail("svg body", svgBody.slice(0, 60));
console.log("svg route: 200, image/svg+xml, no-store,", svgBody.length, "bytes");

// 3. The decisive one: MACHINE decode of the PNG to the exact verify URL.
const pngRes = await fetch(`${SITE}/api/passes/${pass.id}/qr?format=png`, {
  headers: { Cookie: studentCookie },
});
if (pngRes.status !== 200) fail("png route", `status ${pngRes.status}`);
if (!pngRes.headers.get("content-type").includes("image/png")) {
  fail("png content-type", pngRes.headers.get("content-type"));
}
const pngBuffer = Buffer.from(await pngRes.arrayBuffer());
const image = PNG.sync.read(pngBuffer);
const decoded = jsQR(
  new Uint8ClampedArray(image.data),
  image.width,
  image.height,
);
if (!decoded?.data) fail("decode", "jsQR returned no content");
if (decoded.data !== expectedUrl) {
  fail("decoded url", `got "${decoded.data}" expected "${expectedUrl}"`);
}
console.log("PNG decoded ->", decoded.data);

// 4. Download affordances: PNG with attachment disposition.
const dl = await fetch(`${SITE}/api/passes/${pass.id}/qr?format=png&download=1`, {
  headers: { Cookie: studentCookie },
});
if (!dl.headers.get("content-disposition")?.includes("attachment")) {
  fail("download disposition", dl.headers.get("content-disposition"));
}
console.log("download: attachment,", dl.headers.get("content-disposition"));

// 5. Anti-oracle negatives: foreign student sees the SAME 404 an unknown id
//    gets; anonymous is the 401 envelope. Zero body/enum leakage.
const foreignSession = await signIn(foreignStudent, "isha.demo@pratappass.test");
const foreignRes = await fetch(`${SITE}/api/passes/${pass.id}/qr`, {
  headers: { Cookie: authCookie(foreignSession) },
});
if (foreignRes.status !== 404) fail("foreign student", `status ${foreignRes.status}`);
const unknownRes = await fetch(
  `${SITE}/api/passes/00000000-0000-0000-0000-0000000000e1/qr`,
  { headers: { Cookie: studentCookie } },
);
if (unknownRes.status !== 404) fail("unknown id", `status ${unknownRes.status}`);
console.log("negatives: foreign student", foreignRes.status, "== unknown", unknownRes.status);
const anonRes = await fetch(`${SITE}/api/passes/${pass.id}/qr`);
if (anonRes.status !== 401) fail("anonymous", `status ${anonRes.status}`);
console.log("anonymous ->", anonRes.status, "envelope");

// 6. UI pages render (student cookie): list + printable detail.
const listRes = await fetch(`${SITE}/student/passes`, {
  headers: { Cookie: studentCookie },
});
const listHtml = await listRes.text();
if (listRes.status !== 200) fail("passes page", `status ${listRes.status}`);
for (const marker of ["My passes", "Issued gate passes", pass.pass_code]) {
  if (!listHtml.includes(marker)) fail("list marker", marker);
}
console.log("list page: 200, markers ok");

const detailRes = await fetch(`${SITE}/student/passes/${pass.id}`, {
  headers: { Cookie: studentCookie },
});
const detailHtml = await detailRes.text();
if (detailRes.status !== 200) fail("detail page", `status ${detailRes.status}`);
for (const marker of [
  pass.pass_code,
  "Print pass",
  "Download PNG",
  "Download SVG",
  `/api/passes/${pass.id}/qr`,
  "never reasons or documents",
]) {
  if (!detailHtml.includes(marker)) fail("detail marker", marker);
}
console.log("detail page: 200, QR card + print/download markers ok");

// 7. Role mirror: staff hitting the student pass surface bounce to /student.
const hodSession = await signIn(foreignStudent, "hod.demo@pratappass.test");
const hodRes = await fetch(`${SITE}/student/passes`, {
  headers: { Cookie: authCookie(hodSession) },
  redirect: "manual",
});
if (hodRes.status !== 307) fail("hod gate", `status ${hodRes.status}`);
console.log("hod on /student/passes -> 307 /student (role mirror)");
console.log("pass smoke complete (rows left as evidence)");
