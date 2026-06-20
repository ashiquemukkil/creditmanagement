import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser, getCurrentUserRole, type AppRole } from "@/lib/auth";

import { signOutAction } from "./actions";

const baseNavigation = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/customers", label: "Customers" },
  { href: "/bills", label: "Bills" },
  { href: "/payments", label: "Payments" },
  { href: "/reports", label: "Reports" },
];

function roleLabel(role: AppRole | null) {
  if (!role) {
    return "No role synced";
  }

  return role.charAt(0).toUpperCase() + role.slice(1);
}

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [user, role] = await Promise.all([getCurrentUser(), getCurrentUserRole()]);

  if (!user) {
    redirect("/login");
  }

  const navigation =
    role === "admin"
      ? [
          ...baseNavigation,
          { href: "/bulk-upload", label: "Bulk Upload" },
          { href: "/manage-users", label: "Manage Users" },
        ]
      : role === "collaborator"
        ? [...baseNavigation, { href: "/bulk-upload", label: "Bulk Upload" }]
        : baseNavigation;

  return (
    <div className="min-h-screen w-full text-stone-950">
      <div className="mx-auto flex min-h-screen w-full max-w-[1680px] flex-col gap-4 px-2 py-2 sm:gap-5 sm:px-3 sm:py-3 xl:flex-row xl:px-4">
        <section className="rounded-3xl bg-stone-950 p-4 text-stone-100 shadow-xl sm:p-5 2xl:hidden">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-amber-300">
                Credit Management
              </p>
              <h1 className="mt-2 text-xl font-semibold tracking-tight">Jewellery Credit Desk</h1>
            </div>
            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded-xl border border-white/20 px-3 py-2 text-xs font-medium text-white transition hover:bg-white/10"
              >
                Log out
              </button>
            </form>
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
            <p className="truncate text-sm font-medium text-white">{user.email}</p>
            <p className="mt-1 text-sm text-stone-300">{roleLabel(role)}</p>
          </div>

          <nav className="-mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-1">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="whitespace-nowrap rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-stone-100 transition hover:bg-white/10"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </section>

        <aside className="hidden w-full max-w-xs flex-col rounded-3xl bg-stone-950 p-6 text-stone-100 shadow-xl xl:flex">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300">
              Credit Management
            </p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight">
              Jewellery Credit Desk
            </h1>
          </div>

          <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-sm font-medium text-white">{user.email}</p>
            <p className="mt-1 text-sm text-stone-300">{roleLabel(role)}</p>
          </div>

          <nav className="mt-8 flex flex-1 flex-col gap-2">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-2xl px-4 py-3 text-sm font-medium text-stone-200 transition hover:bg-white/10 hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <form action={signOutAction}>
            <button
              type="submit"
              className="w-full rounded-2xl border border-white/10 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/10"
            >
              Log out
            </button>
          </form>
        </aside>

        <main className="min-w-0 flex-1 rounded-[1.5rem] bg-white p-4 shadow-sm sm:rounded-[1.75rem] sm:p-5 xl:p-7">
          {children}
        </main>
      </div>
    </div>
  );
}