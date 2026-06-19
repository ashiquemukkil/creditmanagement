import Link from "next/link";

import { getDashboardSnapshot } from "@/lib/dashboard";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(amount);
}

function formatDate(dateValue: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${dateValue}T00:00:00`));
}

export default async function DashboardPage() {
  const snapshot = await getDashboardSnapshot();

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-amber-700">Dashboard</p>
        <h2 className="text-3xl font-semibold tracking-tight text-stone-950">Credit overview</h2>
        <p className="max-w-3xl text-sm leading-7 text-stone-600">
          Shop-wide visibility into outstanding balances, overdue pressure, and the latest billing and payment activity.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm xl:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Total outstanding</p>
          <p className="mt-4 text-4xl font-semibold text-stone-950">{formatCurrency(snapshot.totalOutstanding)}</p>
          <p className="mt-2 text-sm text-stone-600">Combined gold and diamond open exposure.</p>
        </div>
        <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Overdue bills</p>
          <p className="mt-4 text-4xl font-semibold text-amber-700">{snapshot.overdueBillCount}</p>
          <p className="mt-2 text-sm text-stone-600">Bills past due with remaining balance.</p>
        </div>
        <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Recent activity</p>
          <p className="mt-4 text-4xl font-semibold text-stone-950">{snapshot.recentActivity.length}</p>
          <p className="mt-2 text-sm text-stone-600">Latest bill and payment records.</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-stone-950">Top overdue customers</h3>
            <Link href="/reports/aging-report" className="text-sm font-medium text-amber-700 hover:text-amber-800">
              Open aging report
            </Link>
          </div>

          {snapshot.topOverdueCustomers.length === 0 ? (
            <p className="mt-4 text-sm leading-7 text-stone-600">No overdue customers right now.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {snapshot.topOverdueCustomers.map((customer) => (
                <Link
                  key={customer.customerId}
                  href={`/customers/${customer.customerId}`}
                  className="block rounded-2xl border border-stone-200 px-4 py-4 transition hover:border-amber-300 hover:bg-stone-50"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-stone-950">{customer.customerName}</p>
                      <p className="mt-1 text-sm text-stone-600">
                        {customer.overdueBillCount} overdue bills
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-amber-700">{customer.maxDaysOverdue} days</p>
                      <p className="mt-1 text-sm text-stone-600">{formatCurrency(customer.totalOutstanding)}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-stone-950">Recent activity</h3>

          {snapshot.recentActivity.length === 0 ? (
            <p className="mt-4 text-sm leading-7 text-stone-600">No recent bills or payments yet.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {snapshot.recentActivity.map((item) => (
                <div key={`${item.type}-${item.id}`} className="rounded-2xl border border-stone-200 px-4 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">{item.type}</p>
                      <p className="mt-2 font-medium text-stone-950">{item.description}</p>
                      <Link href={`/customers/${item.customerId}`} className="mt-1 block text-sm text-stone-600 hover:text-amber-700">
                        {item.customerName}
                      </Link>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-stone-950">{formatCurrency(item.amount)}</p>
                      <p className="mt-1 text-sm text-stone-600">{formatDate(item.date)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}