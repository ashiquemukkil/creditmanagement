import Link from "next/link";

import { listCustomerOptions } from "@/lib/customers";
import { listGroups } from "@/lib/groups";
import { getOutstandingStatement } from "@/lib/reports";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(amount);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

type OutstandingStatementPageProps = {
  searchParams: Promise<{
    customer?: string;
    group?: string;
  }>;
};

export default async function OutstandingStatementPage({ searchParams }: OutstandingStatementPageProps) {
  const [{ customer, group }, customers, groups] = await Promise.all([
    searchParams,
    listCustomerOptions(),
    listGroups(),
  ]);
  const selectedCustomer = customer ? customers.find((entry) => entry.id === customer) : null;
  const rows = await getOutstandingStatement(customer, group);
  const summary = rows.reduce(
    (acc, row) => ({
      diamondDue: acc.diamondDue + row.diamondDue,
      diamondOutstanding: acc.diamondOutstanding + row.diamondOutstanding,
      diamondOverdue: acc.diamondOverdue + row.diamondOverdue,
      goldDue: acc.goldDue + row.goldDue,
      goldOutstanding: acc.goldOutstanding + row.goldOutstanding,
      goldOverdue: acc.goldOverdue + row.goldOverdue,
      totalOutstanding: acc.totalOutstanding + row.amountOutstanding,
    }),
    {
      diamondDue: 0,
      diamondOutstanding: 0,
      diamondOverdue: 0,
      goldDue: 0,
      goldOutstanding: 0,
      goldOverdue: 0,
      totalOutstanding: 0,
    },
  );

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-amber-700">Reports</p>
          <h2 className="text-2xl font-semibold tracking-tight text-stone-950 sm:text-3xl">Outstanding statement</h2>
          <p className="max-w-3xl text-sm leading-7 text-stone-600">
            Use group and customer filters to review open and partial bills, sorted from most overdue to least urgent.
          </p>
        </div>
        {rows.length > 0 ? (
          <div className="flex flex-wrap gap-3">
            <Link
              href={`/reports/outstanding-statement/export?${new URLSearchParams({
                ...(customer ? { customer } : {}),
                ...(group ? { group } : {}),
                mode: "detailed",
              }).toString()}`}
              className="inline-flex rounded-2xl border border-stone-300 px-5 py-3 text-sm font-medium text-stone-950 transition hover:bg-stone-50"
            >
              Download detailed CSV
            </Link>
            <Link
              href={`/reports/outstanding-statement/export?${new URLSearchParams({
                ...(customer ? { customer } : {}),
                ...(group ? { group } : {}),
                mode: "pdf",
              }).toString()}`}
              className="inline-flex rounded-2xl border border-stone-300 px-5 py-3 text-sm font-medium text-stone-950 transition hover:bg-stone-50"
            >
              Download PDF
            </Link>
          </div>
        ) : null}
      </div>

      <form className="grid gap-4 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm md:grid-cols-[1fr_1fr_auto]">
        <label className="space-y-2 text-sm font-medium text-stone-700">
          <span>Group</span>
          <select
            name="group"
            defaultValue={group ?? ""}
            className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-950"
          >
            <option value="">All groups</option>
            {groups.map((option) => (
              <option key={option.id} value={option.id}>
                {option.category} - {option.sub_category}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2 text-sm font-medium text-stone-700">
          <span>Customer</span>
          <select
            name="customer"
            defaultValue={customer ?? ""}
            className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-950"
          >
            <option value="">All customers</option>
            {customers.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-3">
          <button
            type="submit"
            className="rounded-2xl bg-stone-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-800"
          >
            Load statement
          </button>
        </div>
      </form>

      {rows.length > 0 ? (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-3xl border border-stone-200 bg-white shadow-sm">
            <div className="border-b border-stone-200 px-5 py-4">
              <h3 className="text-lg font-semibold text-stone-950">{selectedCustomer?.name ?? "All customers"}</h3>
            </div>
            <table className="min-w-[1480px] divide-y divide-stone-200 text-sm">
              <thead className="bg-stone-50 text-left text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
                <tr>
                  <th className="px-5 py-4" rowSpan={2}>
                    Customer
                  </th>
                  <th className="px-5 py-4" rowSpan={2}>
                    Invoice number
                  </th>
                  <th className="px-5 py-4" rowSpan={2}>
                    Date
                  </th>
                  <th className="px-5 py-4 text-center" colSpan={4}>
                    Gold
                  </th>
                  <th className="px-5 py-4 text-center" colSpan={4}>
                    Diamond
                  </th>
                  <th className="px-5 py-4" rowSpan={2}>
                    Total outstanding
                  </th>
                </tr>
                <tr>
                  <th className="px-5 py-3">Outstanding</th>
                  <th className="px-5 py-3">Due soon</th>
                  <th className="px-5 py-3">Due days</th>
                  <th className="px-5 py-3">Overdue</th>
                  <th className="px-5 py-3">Outstanding</th>
                  <th className="px-5 py-3">Due soon</th>
                  <th className="px-5 py-3">Due days</th>
                  <th className="px-5 py-3">Overdue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {rows.map((row) => (
                  <tr key={row.billId} className="text-stone-700">
                    <td className="px-5 py-4 font-medium text-stone-950">{row.customerName}</td>
                    <td className="px-5 py-4 font-medium text-stone-950">{row.billNumber}</td>
                    <td className="px-5 py-4">{formatDate(row.billDate)}</td>
                    <td className="px-5 py-4 font-medium text-stone-950">{formatCurrency(row.goldOutstanding)}</td>
                    <td className="px-5 py-4">{formatCurrency(row.goldDue)}</td>
                    <td className="px-5 py-4">{row.goldDueDays === null ? "—" : row.goldDueDays > 0 ? `${row.goldDueDays}d overdue` : row.goldDueDays === 0 ? "Today" : `${Math.abs(row.goldDueDays)}d left`}</td>
                    <td className="px-5 py-4">{formatCurrency(row.goldOverdue)}</td>
                    <td className="px-5 py-4 font-medium text-stone-950">{formatCurrency(row.diamondOutstanding)}</td>
                    <td className="px-5 py-4">{formatCurrency(row.diamondDue)}</td>
                    <td className="px-5 py-4">{row.diamondDueDays === null ? "—" : row.diamondDueDays > 0 ? `${row.diamondDueDays}d overdue` : row.diamondDueDays === 0 ? "Today" : `${Math.abs(row.diamondDueDays)}d left`}</td>
                    <td className="px-5 py-4">{formatCurrency(row.diamondOverdue)}</td>
                    <td className="px-5 py-4 font-medium text-stone-950">{formatCurrency(row.amountOutstanding)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
            <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-stone-500">Summary</h4>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <article className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Bills</p>
                <p className="mt-2 text-2xl font-semibold text-stone-950">{rows.length}</p>
              </article>
              <article className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Gold totals</p>
                <p className="mt-2 text-sm text-stone-700">Outstanding: {formatCurrency(summary.goldOutstanding)}</p>
                <p className="text-sm text-stone-700">Due: {formatCurrency(summary.goldDue)}</p>
                <p className="text-sm text-stone-700">Overdue: {formatCurrency(summary.goldOverdue)}</p>
              </article>
              <article className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">Diamond totals</p>
                <p className="mt-2 text-sm text-stone-700">Outstanding: {formatCurrency(summary.diamondOutstanding)}</p>
                <p className="text-sm text-stone-700">Due: {formatCurrency(summary.diamondDue)}</p>
                <p className="text-sm text-stone-700">Overdue: {formatCurrency(summary.diamondOverdue)}</p>
              </article>
              <article className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Grand total</p>
                <p className="mt-2 text-2xl font-semibold text-stone-950">{formatCurrency(summary.totalOutstanding)}</p>
              </article>
            </div>
          </div>
        </div>
      ) : customer || group ? (
        <div className="rounded-3xl border border-stone-200 bg-white p-8 text-sm text-stone-500 shadow-sm">
          No open or partial bills found for the selected filters.
        </div>
      ) : null}
    </section>
  );
}