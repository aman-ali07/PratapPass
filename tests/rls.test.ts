import { beforeAll, describe, expect, it } from "vitest";

import {
  IDS,
  assertSeedData,
  psql,
  psqlFailure,
  psqlJson,
  roleSql,
} from "./helpers";

const ROLES = {
  student: { uid: IDS.studentCse, label: "student (CSE owner)" },
  faculty: { uid: IDS.facultyCse, label: "faculty (CSE)" },
  hod: { uid: IDS.hodCse, label: "HOD (CSE)" },
  security: { uid: IDS.security, label: "security" },
  admin: { uid: IDS.admin, label: "admin" },
} as const;

type Role = keyof typeof ROLES;

const ALL_ROLES = Object.keys(ROLES) as Role[];

interface TableCheck {
  table: string;
  visible: string | ((role: Role) => string);
  visibleFor: Role[];
  hidden: string;
  hiddenFor: Role[];
}

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

/**
 * One row this role must see, and one row it must not. Predicates target the
 * fixed seed fixtures, so the matrix does not depend on smoke-script leftovers.
 * `hiddenFor: ["admin"]` means the row is visible only to the admin (RLS admin
 * policy); `hiddenFor: []` means nobody sees it (e.g. another user's notification).
 */
const CHECKS: TableCheck[] = [
  {
    table: "profiles",
    visible: (role) =>
      `id = '${role === "admin" ? IDS.studentCse : ROLES[role].uid}'`,
    visibleFor: ALL_ROLES,
    hidden: `id = '${IDS.studentEce}'`,
    hiddenFor: ["admin"],
  },
  {
    table: "departments",
    visible: `code = 'CSE'`,
    visibleFor: ALL_ROLES,
    hidden: `code = 'ECE'`,
    hiddenFor: ALL_ROLES,
  },
  {
    table: "gate_pass_applications",
    visible: `id = '${IDS.appCseMedical}'`,
    visibleFor: ["student", "faculty", "hod", "admin"],
    hidden: `id = '${IDS.appEcePersonal}'`,
    hiddenFor: ["admin"],
  },
  {
    table: "approval_steps",
    visible: `application_id = '${IDS.appCseMedical}' and step_order = 1`,
    visibleFor: ["student", "faculty", "hod", "admin"],
    hidden: `application_id = '${IDS.appEcePersonal}' and step_order = 1`,
    hiddenFor: ["admin"],
  },
  {
    table: "approval_actions",
    visible: `application_id = '${IDS.appCseEmergency}'`,
    visibleFor: ["student", "faculty", "hod", "admin"],
    hidden: `application_id = '${IDS.appEcePersonal}'`,
    hiddenFor: ["admin"],
  },
  {
    table: "medical_documents",
    visible: `application_id = '${IDS.appCseMedical}'`,
    visibleFor: ["student", "faculty", "hod", "admin"],
    hidden: `application_id = '${IDS.appEcePersonal}'`,
    hiddenFor: ["admin"],
  },
  {
    table: "gate_passes",
    visible: `id = '${IDS.passCseEmergency}'`,
    visibleFor: ["student", "hod", "admin"],
    hidden: `application_id = '${IDS.appEcePersonal}'`,
    hiddenFor: ["admin"],
  },
  {
    table: "notifications",
    visible: (role) => `user_id = '${ROLES[role].uid}'`,
    visibleFor: ALL_ROLES,
    hidden: `user_id = '${IDS.studentEce}'`,
    hiddenFor: [],
  },
  {
    table: "audit_logs",
    visible: `action = 'seed.applied'`,
    visibleFor: ["admin"],
    hidden: `action = 'test.rls_hidden'`,
    hiddenFor: ["admin"],
  },
  {
    table: "approval_rules",
    visible: `department_id is null and reason = 'medical'`,
    visibleFor: ["admin"],
    hidden: `department_id = '${IDS.deptCse}' and reason = 'personal'`,
    hiddenFor: ["admin"],
  },
  {
    table: "gate_verification_logs",
    visible: `event = 'exit'`,
    visibleFor: ["admin"],
    hidden: `event = 'return'`,
    hiddenFor: ["admin"],
  },
];

const FIXTURES = `
insert into public.approval_actions (application_id, actor_id, action, remarks)
values ('${IDS.appEcePersonal}', '${IDS.admin}', 'approve', 'RLS matrix fixture');

insert into public.medical_documents
  (application_id, storage_path, content_type, byte_size, label, uploaded_by)
values
  ('${IDS.appEcePersonal}', 'tests/rls-fixture.pdf', 'application/pdf', 100,
   'RLS matrix fixture', '${IDS.studentEce}');

insert into public.gate_passes
  (application_id, token_hash, pass_code, valid_from, expires_at)
values
  ('${IDS.appEcePersonal}', encode(digest('rls-fixture', 'sha256'), 'hex'), 'MPGI-RLSTST',
   now() - interval '1 hour', now() + interval '1 hour');

insert into public.notifications (user_id, type, title, body)
values ('${IDS.studentEce}', 'decision_made', 'RLS hidden fixture', 'hidden');

${Object.entries(ROLES)
  .map(
    ([role, r]) =>
      `insert into public.notifications (user_id, type, title, body) values ('${r.uid}', 'decision_made', 'RLS visible ${role}', 'visible');`,
  )
  .join("\n")}

insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
values ('${IDS.admin}', 'test.rls_hidden', 'database', '${ZERO_UUID}', '{}'::jsonb);
`;

function countSelect(role: Role | null): string {
  const entries = CHECKS.flatMap((check) => {
    const visiblePredicate =
      role === null
        ? "true"
        : typeof check.visible === "function"
          ? check.visible(role)
          : check.visible;
    return [
      `'${check.table}_visible', (select count(*)::int from public.${check.table} where ${visiblePredicate})`,
      `'${check.table}_hidden', (select count(*)::int from public.${check.table} where ${check.hidden})`,
    ];
  });
  return `select jsonb_build_object(${entries.join(", ")});`;
}

function matrixSql(role: Role): string {
  return roleSql("authenticated", ROLES[role].uid, countSelect(role), FIXTURES);
}

function tableCounts(): Record<string, number> {
  return psqlJson<Record<string, number>>(
    `select jsonb_build_object(
       'applications', (select count(*) from public.gate_pass_applications),
       'actions', (select count(*) from public.approval_actions),
       'documents', (select count(*) from public.medical_documents),
       'passes', (select count(*) from public.gate_passes),
       'notifications', (select count(*) from public.notifications),
       'audit', (select count(*) from public.audit_logs)
     );`,
  );
}

let baseline: Record<string, number>;

beforeAll(() => {
  assertSeedData();
  baseline = tableCounts();
});

describe("RLS authorization matrix", () => {
  for (const role of ALL_ROLES) {
    it(`${ROLES[role].label} sees exactly its scope`, () => {
      const counts = psqlJson<Record<string, number>>(matrixSql(role));

      for (const check of CHECKS) {
        const visible = counts[`${check.table}_visible`];
        const hidden = counts[`${check.table}_hidden`];
        const visibleExpected = check.visibleFor.includes(role);
        const hiddenExpected = check.hiddenFor.includes(role);

        if (visibleExpected) {
          expect(
            visible,
            `${role} / ${check.table}: must see at least one scoped row`,
          ).toBeGreaterThan(0);
        } else {
          expect(visible, `${role} / ${check.table}: must see no scoped rows`).toBe(0);
        }
        if (hiddenExpected) {
          expect(
            hidden,
            `${role} / ${check.table}: must see at least one foreign row`,
          ).toBeGreaterThan(0);
        } else {
          expect(hidden, `${role} / ${check.table}: must see no foreign rows`).toBe(0);
        }
      }
    });
  }

  it("anonymous callers read no table rows", () => {
    const counts = psqlJson<Record<string, number>>(
      roleSql("anon", null, countSelect(null)),
    );
    for (const [key, value] of Object.entries(counts)) {
      expect(value, `anon / ${key}`).toBe(0);
    }
  });
});

describe("write boundaries", () => {
  const deny = (sql: string, pattern: RegExp) => {
    expect(psqlFailure(sql)).toMatch(pattern);
  };

  it("students cannot insert applications or notifications", () => {
    deny(
      roleSql(
        "authenticated",
        IDS.studentCse,
        `insert into public.gate_pass_applications
           (student_id, department_id, reason, departure_at, expected_return_at, explanation)
         values ('${IDS.studentCse}', '${IDS.deptCse}', 'personal',
                 now() + interval '1 hour', now() + interval '2 hours', 'write probe');`,
      ),
      /permission denied for table gate_pass_applications/,
    );
    deny(
      roleSql(
        "authenticated",
        IDS.studentCse,
        `insert into public.notifications (user_id, type, title, body)
         values ('${IDS.studentCse}', 'decision_made', 'write probe', 'write probe');`,
      ),
      /permission denied for table notifications/,
    );
  });

  it("students cannot rewrite history or escalate their role", () => {
    deny(
      roleSql(
        "authenticated",
        IDS.studentCse,
        `update public.approval_actions set remarks = 'tampered'
         where application_id = '${IDS.appCseEmergency}';`,
      ),
      /permission denied for table approval_actions/,
    );
    deny(
      roleSql(
        "authenticated",
        IDS.studentCse,
        `update public.audit_logs set action = 'tampered' where action = 'seed.applied';`,
      ),
      /permission denied for table audit_logs/,
    );
    deny(
      roleSql(
        "authenticated",
        IDS.studentCse,
        `delete from public.audit_logs where action = 'seed.applied';`,
      ),
      /permission denied for table audit_logs/,
    );
    deny(
      roleSql(
        "authenticated",
        IDS.studentCse,
        `insert into public.gate_verification_logs (pass_id, gate_user_id, event, result)
         values ('${IDS.passCseEmergency}', '${IDS.security}', 'exit', 'valid');`,
      ),
      /permission denied for table gate_verification_logs/,
    );
    deny(
      roleSql(
        "authenticated",
        IDS.studentCse,
        `update public.profiles set role = 'admin' where id = '${IDS.studentCse}';`,
      ),
      /permission denied/,
    );
  });

  it("students may mark their own notification read (the one write surface)", () => {
    const sql = `
      begin;
      insert into public.notifications (user_id, type, title, body)
      values ('${IDS.studentCse}', 'decision_made', 'RLS write fixture', 'write probe');
      set local role authenticated;
      do $$ begin perform set_config('request.jwt.claims',
        '${JSON.stringify({ sub: IDS.studentCse, role: "authenticated" })}', true); end $$;
      update public.notifications set read_at = now()
       where user_id = '${IDS.studentCse}' and title = 'RLS write fixture';
      select count(*) from public.notifications
       where user_id = '${IDS.studentCse}' and title = 'RLS write fixture'
         and read_at is not null;
      rollback;
    `;
    expect(psql(sql)).toBe("1");
  });

  it("anonymous callers cannot execute workflow functions", () => {
    deny(
      roleSql(
        "anon",
        null,
        `select public.fn_decide_application('${IDS.appCseMedical}', 'approve');`,
      ),
      /permission denied for function fn_decide_application/,
    );
    deny(
      roleSql(
        "anon",
        null,
        `select public.fn_gate_record('MPGI-100F0A', 'exit');`,
      ),
      /permission denied for function fn_gate_record/,
    );
  });

  it("students cannot mint passes directly", () => {
    deny(
      roleSql(
        "authenticated",
        IDS.studentCse,
        `select public.fn_issue_pass('${IDS.appCseMedical}');`,
      ),
      /permission denied for function fn_issue_pass/,
    );
  });

  it("leaves the database unchanged (every fixture transaction rolled back)", () => {
    expect(tableCounts()).toEqual(baseline);
  });
});
