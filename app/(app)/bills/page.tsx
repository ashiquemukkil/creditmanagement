import Link from "next/link";

import { DeleteBillButton } from "@/components/delete-bill-button";
import { canManageData, getCurrentUserRole } from "@/lib/auth";
import { billDueDateEntries, type BillMetal, type BillStatus, listBillsPaginated } from "@/lib/bills";
import { listCustomerOptions } from "@/lib/customers";
import { listGroups } from "@/lib/groups";

const PAGE_SIZE = 12;

function parsePage(value: string | undefined) {
  if (!value) {
    return 1;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

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
    const fallbackDueDate = bill.gold_due_date ?? bill.diamond_due_date;

    return fallbackDueDate ? formatDate(fallbackDueDate) : "-";
  }

  return entries.map((entry) => `${entry.metal}: ${formatDate(entry.dueDate)}`).join(" / ");
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
    group?: string;
    metal?: BillMetal;
    page?: string;
    status?: BillStatus;
  }>;
};

export default async function BillsPage({ searchParams }: BillsPageProps) {
  const [{ customer, group, metal, page: pageParam, status }, role, customerOptions, groups] = await Promise.all([
    searchParams,
    getCurrentUserRole(),
    listCustomerOptions(),
    listGroups(),
  ]);
  const requestedPage = parsePage(pageParam);

  const billResult = await listBillsPaginated({
    customerId: customer,
    groupId: group,
    metal,
    page: requestedPage,
    pageSize: PAGE_SIZE,
    status,
  });
  const { items: bills, page, totalCount, totalPages } = billResult;
  const from = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = totalCount === 0 ? 0 : from + bills.length - 1;
  const canCreate = canManageData(role);

  const pageHref = (nextPage: number) => {
    const params = new URLSearchParams();

    if (customer) {
      params.set("customer", customer);
    }

    if (group) {
      params.set("group", group);
    }

    if (metal) {
      params.set("metal", metal);
    }

    if (status) {
      params.set("status", status);
    }

    params.set("page", String(nextPage));

    return `/bills?${params.toString()}`;
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-amber-700">
            Bills
          </p>
          <h2 className="text-2xl font-semibold tracking-tight text-stone-950 sm:text-3xl">
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
          <span>Group</span>
          <select
            name="group"
            defaultValue={group ?? ""}
            className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-950"
          >
            <option value="">All groups</option>
            {groups.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.category} - {entry.sub_category}
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

      <div className="overflow-x-auto rounded-3xl border border-stone-200 bg-white shadow-sm">
        <table className="min-w-[1180px] divide-y divide-stone-200 text-sm">
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
              {canCreate ? <th className="px-5 py-4">Actions</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200">
            {bills.length === 0 ? (
              <tr>
                <td className="px-5 py-8 text-stone-500" colSpan={canCreate ? 10 : 9}>
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
                  {canCreate ? (
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <Link
                          href={`/bills/${bill.id}/edit`}
                          className="text-sm font-medium text-stone-700 transition hover:text-amber-700"
                        >
                          Edit
                        </Link>
                        <DeleteBillButton billId={bill.id} billNumber={bill.bill_number} />
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="flex flex-col gap-3 border-t border-stone-200 px-5 py-4 text-sm text-stone-600 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Showing {from}-{to} of {totalCount}
          </p>
          <div className="flex items-center gap-3">
            {page > 1 ? (
              <Link
                href={pageHref(page - 1)}
                className="rounded-xl border border-stone-300 px-4 py-2 font-medium text-stone-700 transition hover:bg-stone-50"
              >
                Previous
              </Link>
            ) : (
              <span className="rounded-xl border border-stone-200 px-4 py-2 text-stone-400">Previous</span>
            )}
            <span>
              Page {page} of {totalPages}
            </span>
            {page < totalPages ? (
              <Link
                href={pageHref(page + 1)}
                className="rounded-xl border border-stone-300 px-4 py-2 font-medium text-stone-700 transition hover:bg-stone-50"
              >
                Next
              </Link>
            ) : (
              <span className="rounded-xl border border-stone-200 px-4 py-2 text-stone-400">Next</span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}