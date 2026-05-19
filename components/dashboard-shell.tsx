"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

const navItems = [
  { href: "/dashboard", label: "Conversations" },
  { href: "/dashboard/appointments", label: "Appointments" },
  { href: "/dashboard/leads", label: "Leads" },
  { href: "/dashboard/staff", label: "Staff" },
  { href: "/dashboard/knowledge-base", label: "Knowledge Base" },
  { href: "/dashboard/announcements", label: "Announcements" },
  { href: "/dashboard/analytics", label: "Analytics" },
];

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === "/dashboard";
  }
  return pathname.startsWith(href);
}

export default function DashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    const supabase = getSupabaseBrowser();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex h-screen overflow-hidden bg-brand-black font-[system-ui] text-white">
      <aside className="flex w-[240px] shrink-0 flex-col overflow-hidden border-r border-brand-border bg-brand-surface">
        <div className="border-b border-brand-border px-4 py-5">
          <p className="text-lg font-bold tracking-wide text-white">VINCI</p>
          <p className="text-xs text-brand-muted">Vinicius Group</p>
        </div>
        <nav className="flex flex-1 flex-col py-2">
          {navItems.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`mx-2 my-0.5 rounded-md px-4 py-3 text-white transition-colors hover:bg-brand-elevated ${
                  active ? "bg-brand-red hover:bg-brand-red" : ""
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-brand-border bg-brand-surface px-6">
          <span className="font-medium text-white">VINCI Dashboard</span>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-md border border-brand-border px-4 py-2 text-sm text-white transition-colors hover:border-brand-red hover:text-brand-red"
          >
            Logout
          </button>
        </header>
        <main className="flex-1 overflow-y-auto bg-brand-black p-6">{children}</main>
      </div>
    </div>
  );
}
