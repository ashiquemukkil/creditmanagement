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
    <div className="min-h-screen bg-stone-100 text-stone-950">
      <div className="mx-auto flex min-h-screen max-w-7xl gap-6 px-4 py-4 sm:px-6 lg:px-8">
        <aside className="flex w-full max-w-xs flex-col rounded-3xl bg-stone-950 p-6 text-stone-100 shadow-xl">
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

        <main className="flex-1 rounded-[2rem] bg-white p-6 shadow-sm sm:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}