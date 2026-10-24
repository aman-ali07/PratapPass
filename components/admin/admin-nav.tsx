"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * Admin section switcher. Only routes that actually exist are listed — an
 * unfinished surface must not look operable (AGENTS.md §4).
 */
const ITEMS = [{ href: "/admin/departments", label: "Departments" }] as const;

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin sections" className="border-b bg-muted/30">
      <div className="mx-auto flex w-full max-w-5xl gap-1 overflow-x-auto px-4 py-2">
        {ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground",
                active && "bg-background text-foreground shadow-sm ring-1 ring-foreground/10",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
