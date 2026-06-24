import Link from "next/link";

import { DeleteCustomerButton } from "@/components/delete-customer-button";
import { canManageData, getCurrentUserRole } from "@/lib/auth";
import { listCustomersPaginated } from "@/lib/customers";
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

type CustomersPageProps = {
  searchParams: Promise<{
    group?: string;
    page?: string;
  }>;
};

export default async function CustomersPage({ searchParams }: CustomersPageProps) {
  const { group, page: pageParam } = await searchParams;
  const requestedPage = parsePage(pageParam);
  const [customerResult, groups, role] = await Promise.all([
    listCustomersPaginated({ groupId: group, page: requestedPage, pageSize: PAGE_SIZE }),
    listGroups(),
    getCurrentUserRole(),
  ]);
  const { items: customers, page, totalCount, totalPages } = customerResult;
  const from = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = totalCount === 0 ? 0 : from + customers.length - 1;
  const canEdit = canManageData(role);

  const pageHref = (nextPage: number) => {
    const params = new URLSearchParams();

    if (group) {
      params.set("group", group);
    }

    params.set("page", String(nextPage));

    return `/customers?${params.toString()}`;
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-amber-700">
            Customers
          </p>
          <h2 className="text-2xl font-semibold tracking-tight text-stone-950 sm:text-3xl">
            Customer ledger
          </h2>
          <p className="max-w-2xl text-sm leading-7 text-stone-600">
            All signed-in users can review customer credit terms and current outstanding balances.
          </p>
        </div>

        {canEdit ? (
          <Link
            href="/customers/new"
            className="inline-flex rounded-2xl bg-stone-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-800"
          >
            Add customer
          </Link>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-3xl border border-stone-200 bg-white shadow-sm">
        <form className="border-b border-stone-200 bg-stone-50 p-5">
          <div className="grid gap-4 md:grid-cols-[1fr_auto]">
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
            <div className="flex items-end gap-3">
              <button
                type="submit"
                className="rounded-2xl bg-stone-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-800"
              >
                Apply filters
              </button>
              <Link
                href="/customers"
                className="rounded-2xl border border-stone-300 px-5 py-3 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
              >
                Reset
              </Link>
            </div>
          </div>
        </form>

        <table className="min-w-[1020px] divide-y divide-stone-200 text-sm">
          <thead className="bg-stone-50 text-left text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
            <tr>
              <th className="px-5 py-4">Name</th>
              <th className="px-5 py-4">Phone</th>
              <th className="px-5 py-4">Group</th>
              <th className="px-5 py-4">Gold credit</th>
              <th className="px-5 py-4">Diamond credit</th>
              <th className="px-5 py-4">Outstanding</th>
              <th className="px-5 py-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200">
            {customers.length === 0 ? (
              <tr>
                <td className="px-5 py-8 text-stone-500" colSpan={7}>
                  No customers yet.
                </td>
              </tr>
            ) : (
              customers.map((customer) => (
                <tr key={customer.id} className="text-stone-700">
                  <td className="px-5 py-4 font-medium text-stone-950">
                    <Link href={`/customers/${customer.id}`} className="hover:text-amber-700">
                      {customer.name}
                    </Link>
                  </td>
                  <td className="px-5 py-4">{customer.phone || "-"}</td>
                  <td className="px-5 py-4 text-xs">
                    {customer.groups
                      ? `${customer.groups.category} - ${customer.groups.sub_category}`
                      : "-"}
                  </td>
                  <td className="px-5 py-4">{customer.gold_credit_days} days</td>
                  <td className="px-5 py-4">{customer.diamond_credit_days} days</td>
                  <td className="px-5 py-4 font-medium text-stone-950">
                    {formatCurrency(customer.totalOutstanding)}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex gap-3">
                      <Link href={`/customers/${customer.id}`} className="text-sm font-medium text-amber-700 hover:text-amber-800">
                        View
                      </Link>
                      {canEdit ? (
                        <Link
                          href={`/customers/${customer.id}/edit`}
                          className="text-sm font-medium text-stone-700 hover:text-stone-950"
                        >
                          Edit
                        </Link>
                      ) : null}
                      {canEdit ? <DeleteCustomerButton customerId={customer.id} customerName={customer.name} /> : null}
                    </div>
                  </td>
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