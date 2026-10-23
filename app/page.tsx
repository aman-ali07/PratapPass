import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// T-01 placeholder landing: proves the MPGI theme tokens end-to-end.
// Auth and portal routes arrive with T-02+ (TASKS.md); deliberately no CTA
// buttons yet — no operable-looking controls before their routes exist.
const roles = [
  {
    title: "Students",
    description:
      "Submit gate-pass applications, upload medical documents, and track approvals in real time.",
  },
  {
    title: "Faculty & HOD",
    description:
      "Review department requests, preview documents, and decide with remarks.",
  },
  {
    title: "Security",
    description:
      "Verify QR gate passes and record actual exit and return times.",
  },
  {
    title: "Administration",
    description:
      "Manage departments, users, approval rules, analytics, and audit trails.",
  },
];

export default function Home() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="bg-primary text-primary-foreground">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
          <Button
            variant="secondary"
            render={<Link href="/" />}
            className="items-center gap-2 text-sm font-semibold"
          >
            <span
              className="bg-brand-gold-gradient inline-block h-2 w-6 rounded-sm"
              aria-hidden="true"
            />
            PratapPass
          </Button>
          <Badge variant="outline" className="border-white/30 text-white/80">
            In development — T-01 scaffold
          </Badge>
        </div>
      </header>

      <main className="flex-1">
        <section className="bg-primary bg-hero-scrim text-primary-foreground">
          <div className="mx-auto w-full max-w-5xl px-4 py-16 sm:py-20">
            <p className="text-sm font-medium text-white/70">
              Maharana Pratap Group of Institutions, Kanpur
            </p>
            <h1 className="mt-2 max-w-2xl text-3xl font-semibold leading-tight sm:text-4xl">
              Digital Gate Pass &amp; Medical Approval System
            </h1>
            <p className="mt-3 max-w-2xl text-white/80">
              Replacing paper gate-pass forms with online applications, secure medical document
              uploads, staff approvals, and QR-verified gate exit and return.
            </p>
          </div>
        </section>

        <section className="mx-auto w-full max-w-5xl px-4 py-12">
          <h2 className="text-xl font-semibold">Who uses PratapPass</h2>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {roles.map((role) => (
              <Card key={role.title}>
                <CardHeader>
                  <CardTitle className="text-base">{role.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>{role.description}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </main>

      <footer className="bg-primary text-primary-foreground">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4 text-xs text-white/70">
          <span>PratapPass © 2026 — Maharana Pratap Group of Institutions</span>
          <span>Digital Gate Pass &amp; Medical Approval System</span>
        </div>
      </footer>
    </div>
  );
}
