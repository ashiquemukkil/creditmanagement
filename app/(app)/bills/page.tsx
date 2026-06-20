import Link from "next/link";

import { DeleteBillButton } from "@/components/delete-bill-button";
import { canManageData, getCurrentUserRole } from "@/lib/auth";
import { billDueDateEntries, billMetals, type BillMetal, type BillStatus, listBills } from "@/lib/bills";
import { listCustomerOptions } from "@/lib/customers";

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

function formatDueDateSummary(bill: Parameters<typeof billDueDateEntries>[0]) {
  const entries = billDueDateEntries(bill);

  if (entries.length === 0) {
    return formatDate(bill.due_date);
  }

  return entries.map((entry) => `${entry.metal}: ${formatDate(entry.dueDate)}`).join(" / ");
}

function itemTypeBadgeClass(itemType: BillMetal) {
  return itemType === "gold"
    ? "bg-amber-100 text-amber-800"
    : "bg-sky-100 text-sky-800";
}

function statusBadgeClass(status: BillStatus) {
  if (status === "closed") {
    return "bg-emerald-100 text-emerald-800";
  }

  if (status === "partial") {
    return "bg-orange-100 text-orange-800";
  }

  return "bg-stone-200 text-stone-800";
}

type BillsPageProps = {
  searchParams: Promise<{
    customer?: string;
    metal?: BillMetal;
    status?: BillStatus;
  }>;
};

export default async function BillsPage({ searchParams }: BillsPageProps) {
  const [{ customer, metal, status }, role, customerOptions] = await Promise.all([
    searchParams,
    getCurrentUserRole(),
    listCustomerOptions(),
  ]);

  const [bills] = await Promise.all([
    listBills({ customerId: customer, metal, status }),
  ]);
  const canCreate = canManageData(role);

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-amber-700">
            Bills
          </p>
          <h2 className="text-3xl font-semibold tracking-tight text-stone-950">
            Bill ledger
          </h2>
          <p className="max-w-2xl text-sm leading-7 text-stone-600">
            Review due dates, overdue days, and current bill status across all customers.
          </p>
        </div>

        {canCreate ? (
          <Link
            href="/bills/new"
            className="inline-flex rounded-2xl bg-stone-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-800"
          >
            Add bill
          </Link>
        ) : null}
      </div>

      <form className="grid gap-4 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm md:grid-cols-4">
        <label className="space-y-2 text-sm font-medium text-stone-700">
          <span>Customer</span>
          <select
            name="customer"
            defaultValue={customer ?? ""}
            className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-950"
          >
            <option value="">All customers</option>
            {customerOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2 text-sm font-medium text-stone-700">
          <span>Status</span>
          <select
            name="status"
            defaultValue={status ?? ""}
            className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-950"
          >
            <option value="">All statuses</option>
            <option value="open">Open</option>
            <option value="partial">Partial</option>
            <option value="closed">Closed</option>
          </select>
        </label>

        <div className="flex items-end gap-3">
          <button
            type="submit"
            className="rounded-2xl bg-stone-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-800"
          >
            Apply filters
          </button>
          <Link href="/bills" className="rounded-2xl border border-stone-300 px-5 py-3 text-sm font-medium text-stone-700 transition hover:bg-stone-50">
            Reset
          </Link>
        </div>
      </form>

      <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-stone-200 text-sm">
          <thead className="bg-stone-50 text-left text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
            <tr>
              <th className="px-5 py-4">Bill number</th>
              <th className="px-5 py-4">Customer</th>
              <th className="px-5 py-4">Bill date</th>
              <th className="px-5 py-4">Gold</th>
              <th className="px-5 py-4">Diamond</th>
              <th className="px-5 py-4">Total</th>
              <th className="px-5 py-4">Due dates</th>
              <th className="px-5 py-4">Days overdue</th>
              <th className="px-5 py-4">Status</th>
              <th className="px-5 py-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200">
            {bills.length === 0 ? (
              <tr>
                <td className="px-5 py-8 text-stone-500" colSpan={11}>
                  No bills found for the current filters.
                </td>
              </tr>
            ) : (
              bills.map((bill) => (
                <tr key={bill.id} className="text-stone-700">
                  <td className="px-5 py-4 font-medium text-stone-950">{bill.bill_number}</td>
                  <td className="px-5 py-4">
                    <Link href={`/customers/${bill.customer_id}`} className="hover:text-amber-700">
                      {bill.customerName}
                    </Link>
                  </td>
                  <td className="px-5 py-4">{formatDate(bill.bill_date)}</td>
                  <td className="px-5 py-4 font-medium text-stone-950">{formatCurrency(Number(bill.gold_amount))}</td>
                  <td className="px-5 py-4 font-medium text-stone-950">{formatCurrency(Number(bill.diamond_amount))}</td>
                  <td className="px-5 py-4 font-medium text-stone-950">{formatCurrency(bill.totalAmount)}</td>
                  <td className="px-5 py-4">{formatDueDateSummary(bill)}</td>
                  <td className="px-5 py-4">{bill.daysOverdue > 0 ? bill.daysOverdue : ""}</td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold capitalize ${statusBadgeClass(bill.status)}`}>
                      {bill.status}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    {canCreate ? <DeleteBillButton billId={bill.id} billNumber={bill.bill_number} /> : <span className="text-stone-400">-</span>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}