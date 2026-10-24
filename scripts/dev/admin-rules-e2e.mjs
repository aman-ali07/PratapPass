// T-12c RPC round-trip — the exact calls the server actions make, through
// PostgREST with a real admin session:
//
//   fn_admin_list_rules -> fn_admin_update_rule(["faculty"]) -> list -> restore
//
// This closes the one gap the psql matrix cannot: supabase-js serializes the
// chain as a JS array into the jsonb parameter. The rule is restored in a
// finally block, so the seed state is unchanged after a run.
//
// Run: node --env-file=.env.local scripts/dev/admin-rules-e2e.mjs
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ADMIN_EMAIL = "admin.demo@pratappass.test";
const ADMIN_PASSWORD = "DemoPassw0rd!";
const CSE_ID = "00000000-0000-0000-0000-000000000101";
const STUDENT_EMAIL = "aarav.demo@pratappass.test";

const fail = (label, detail) => {
  console.error(`FAIL ${label}:`, detail ?? "");
  process.exitCode = 1;
  throw new Error(label);
};

function assert(condition, label, detail) {
  if (!condition) fail(label, detail);
}

function anonClient() {
  return createClient(URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function sessionClient(email, password) {
  const client = anonClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data?.session) fail("sign-in", `${email}: ${error?.message}`);
  const { error: setError } = await client.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
  if (setError) fail("setSession", setError.message);
  return client;
}

const admin = await sessionClient(ADMIN_EMAIL, ADMIN_PASSWORD);
const student = await sessionClient(STUDENT_EMAIL, ADMIN_PASSWORD);

/** Set once the fixture override exists, so cleanup never touches another rule. */
let fixtureRuleId = null;

const { data: rules, error: listError } = await admin.rpc("fn_admin_list_rules");
if (listError) fail("fn_admin_list_rules", listError.message);
assert(rules.length === 5, "five seeded rules", String(rules.length));
assert(
  rules.every((rule) => Array.isArray(rule.chain)),
  "chain arrives as a JSON array",
  JSON.stringify(rules.map((rule) => rule.chain)),
);

const target = rules.find(
  (rule) => rule.department_id === CSE_ID && rule.reason === "personal",
);
assert(target, "CSE personal override missing");
const original = {
  chain: target.chain,
  requiresMedicalDocument: target.requires_medical_document,
  passValidityHours: target.pass_validity_hours,
};
console.log("original CSE personal rule:", JSON.stringify(original.chain), original.passValidityHours);

async function update(chain, hours) {
  const { data, error } = await admin.rpc("fn_admin_update_rule", {
    p_id: target.id,
    p_chain: chain,
    p_requires_medical_document: original.requiresMedicalDocument,
    p_pass_validity_hours: hours,
  });
  if (error) fail("fn_admin_update_rule", error.message);
  return data;
}

try {
  // 1) A JS array parameter round-trips into jsonb.
  const updated = await update(["faculty"], 24);
  assert(JSON.stringify(updated.chain) === '["faculty"]', "updated chain", JSON.stringify(updated.chain));
  assert(updated.pass_validity_hours === 24, "updated validity", String(updated.pass_validity_hours));

  const { data: reread, error: readError } = await admin.rpc("fn_admin_list_rules", {
    p_rule_id: target.id,
  });
  if (readError) fail("re-read rule", readError.message);
  assert(JSON.stringify(reread[0].chain) === '["faculty"]', "re-read chain",
    JSON.stringify(reread[0].chain));

  // 2) The audit row records both chains and the admin actor.
  const { data: audit, error: auditError } = await admin
    .from("audit_logs")
    .select("actor_id, action, metadata")
    .eq("action", "admin.rule_updated")
    .eq("entity_id", target.id)
    .order("created_at", { ascending: false })
    .limit(1);
  if (auditError) fail("audit read", auditError.message);
  assert(audit.length === 1, "rule update audited");
  assert(
    audit[0].actor_id === "00000000-0000-0000-0000-000000000006",
    "audit actor is the admin",
    audit[0].actor_id,
  );
  assert(
    JSON.stringify(audit[0].metadata.previous_chain) === '["faculty","hod"]' &&
      JSON.stringify(audit[0].metadata.chain) === '["faculty"]',
    "audit records previous and new chain",
    JSON.stringify(audit[0].metadata),
  );

  // 3) Restore the seed value.
  const restored = await update(original.chain, original.passValidityHours);
  assert(
    JSON.stringify(restored.chain) === JSON.stringify(original.chain),
    "restored chain",
    JSON.stringify(restored.chain),
  );
  console.log("RPC round-trip ok: ['faculty'] -> re-read -> restored");

  // 4) create + delete round-trip: the other two actions' exact payloads.
  const ECE_ID = "00000000-0000-0000-0000-000000000102";
  const { data: created, error: createError } = await admin.rpc("fn_admin_create_rule", {
    p_department_id: ECE_ID,
    p_reason: "other",
    p_chain: ["faculty"],
    p_requires_medical_document: false,
    p_pass_validity_hours: 6,
  });
  if (createError) fail("fn_admin_create_rule", createError.message);
  fixtureRuleId = created.id;
  assert(created.department_id === ECE_ID, "created rule scope", created.department_id);
  assert(JSON.stringify(created.chain) === '["faculty"]', "created chain",
    JSON.stringify(created.chain));

  const { data: createdRead, error: createdReadError } = await admin.rpc(
    "fn_admin_list_rules",
    { p_rule_id: created.id },
  );
  if (createdReadError) fail("read created rule", createdReadError.message);
  assert(createdRead.length === 1, "created rule is listed");
  assert(createdRead[0].department_code === "ECE", "created rule joins ECE",
    createdRead[0].department_code);
  assert(createdRead[0].pass_validity_hours === 6, "created validity",
    String(createdRead[0].pass_validity_hours));

  const { data: createAudit, error: createAuditError } = await admin
    .from("audit_logs")
    .select("actor_id, metadata")
    .eq("action", "admin.rule_created")
    .eq("entity_id", created.id);
  if (createAuditError) fail("create audit read", createAuditError.message);
  assert(createAudit.length === 1, "rule creation audited");
  assert(createAudit[0].actor_id === "00000000-0000-0000-0000-000000000006",
    "create audit actor", createAudit[0].actor_id);

  const { error: deleteError } = await admin.rpc("fn_admin_delete_rule", {
    p_id: created.id,
  });
  if (deleteError) fail("fn_admin_delete_rule", deleteError.message);

  const { data: afterDelete, error: afterDeleteError } = await admin.rpc(
    "fn_admin_list_rules",
    { p_rule_id: created.id },
  );
  if (afterDeleteError) fail("read deleted rule", afterDeleteError.message);
  assert(afterDelete.length === 0, "deleted rule is gone", String(afterDelete.length));

  const { data: deleteAudit, error: deleteAuditError } = await admin
    .from("audit_logs")
    .select("metadata")
    .eq("action", "admin.rule_deleted")
    .eq("entity_id", created.id);
  if (deleteAuditError) fail("delete audit read", deleteAuditError.message);
  assert(deleteAudit.length === 1, "rule deletion audited");
  assert(deleteAudit[0].metadata.department_id === ECE_ID, "delete audit scope",
    String(deleteAudit[0].metadata.department_id));
  console.log("create/delete round-trip ok: ECE other ['faculty'] 6h -> listed -> deleted");

  // 5) A global default cannot be deleted (the fallback must always exist).
  const { data: globals } = await admin.rpc("fn_admin_list_rules");
  const globalMedical = globals.find(
    (rule) => rule.department_id === null && rule.reason === "medical",
  );
  assert(globalMedical, "global medical default missing");
  const { error: globalDeleteError } = await admin.rpc("fn_admin_delete_rule", {
    p_id: globalMedical.id,
  });
  assert(globalDeleteError !== null, "global default was deletable");
  assert(
    globalDeleteError.message.includes("Global default rules cannot be deleted"),
    "global delete refusal message",
    globalDeleteError.message,
  );
  console.log("global delete refused: 'Global default rules cannot be deleted - edit it instead'");

  // 6) A student session cannot call the mutation.
  const { error: studentError } = await student.rpc("fn_admin_update_rule", {
    p_id: target.id,
    p_chain: ["hod"],
    p_requires_medical_document: false,
    p_pass_validity_hours: 12,
  });
  assert(studentError !== null, "student could update a rule");
  assert(
    studentError.message.includes("Only administrators may manage approval rules"),
    "student denial message",
    studentError.message,
  );
  console.log("non-admin denial ok: student -> 'Only administrators may manage approval rules'");

  // 7) Anonymous EXECUTE is revoked.
  const { error: anonError } = await anonClient().rpc("fn_admin_list_rules");
  assert(anonError !== null, "anonymous could list rules");
  assert(
    anonError.message.toLowerCase().includes("permission denied"),
    "anonymous denial message",
    anonError.message,
  );
  console.log("anonymous denial ok: permission denied");
} finally {
  // Remove the fixture override if a mid-run failure skipped the delete step.
  if (fixtureRuleId) {
    const { data: leftover } = await admin.rpc("fn_admin_list_rules", {
      p_rule_id: fixtureRuleId,
    });
    if (leftover?.length) {
      const { error: cleanupError } = await admin.rpc("fn_admin_delete_rule", {
        p_id: fixtureRuleId,
      });
      if (cleanupError) {
        console.error("CLEANUP FAILED:", cleanupError.message);
        process.exitCode = 1;
      } else {
        console.log("cleanup: removed leftover ECE fixture override");
      }
    }
  }
  // Restore unconditionally, even if an assertion failed mid-run.
  const { data: current } = await admin.rpc("fn_admin_list_rules", { p_rule_id: target.id });
  if (current?.[0]) {
    const same =
      JSON.stringify(current[0].chain) === JSON.stringify(original.chain) &&
      current[0].pass_validity_hours === original.passValidityHours;
    if (!same) {
      await update(original.chain, original.passValidityHours);
      console.log("restored after failure");
    }
  }
}

console.log("\nT-12c RPC E2E: PASS");
console.log("- list returns 5 rules with JSON-array chains");
console.log("- update(['faculty']) serializes to jsonb and re-reads correctly");
console.log("- audit row records previous/new chain and the admin actor");
console.log("- create/delete round-trip: ECE 'other' override created, listed, deleted, audited");
console.log("- global default delete refused; original seed rule restored");
console.log("- student and anonymous calls denied");
