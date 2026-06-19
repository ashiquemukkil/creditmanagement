import Link from "next/link";

import { canManageData, getCurrentUserRole } from "@/lib/auth";
import { listCustomerOptions } from "@/lib/customers";
import { listPayments } from "@/lib/payments";

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

type PaymentsPageProps = {
  searchParams: Promise<{
    customer?: string;
  }>;
};

export default async function PaymentsPage({ searchParams }: PaymentsPageProps) {
  const [{ customer }, role, customerOptions] = await Promise.all([
    searchParams,
    getCurrentUserRole(),
    listCustomerOptions(),
  ]);
  const payments = await listPayments({ customerId: customer });
  const canCreate = canManageData(role);

  function allocationLabel(payment: (typeof payments)[number]) {
    if (payment.unallocatedAmount > 0 && payment.allocatedAmount > 0) {
      return `Advance ${formatCurrency(payment.unallocatedAmount)}`;
    }

    if (payment.unallocatedAmount > 0) {
      return `Unallocated ${formatCurrency(payment.unallocatedAmount)}`;
    }

    return "Fully allocated";
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-amber-700">
            Payments
          </p>
          <h2 className="text-3xl font-semibold tracking-tight text-stone-950">
            Payment ledger
          </h2>
          <p className="max-w-2xl text-sm leading-7 text-stone-600">
            Record incoming payments now. Allocation across bills will be wired separately.
          </p>
        </div>

        {canCreate ? (
          <Link
            href="/payments/new"
            className="inline-flex rounded-2xl bg-stone-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-800"
          >
            Add payment
          </Link>
        ) : null}
      </div>

      <form className="grid gap-4 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm md:grid-cols-[1fr_auto_auto]">
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

        <div className="flex items-end gap-3">
          <button
            type="submit"
            className="rounded-2xl bg-stone-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-800"
          >
            Apply filter
          </button>
          <Link href="/payments" className="rounded-2xl border border-stone-300 px-5 py-3 text-sm font-medium text-stone-700 transition hover:bg-stone-50">
            Reset
          </Link>
        </div>
      </form>

      <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-stone-200 text-sm">
          <thead className="bg-stone-50 text-left text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
            <tr>
              <th className="px-5 py-4">Customer</th>
              <th className="px-5 py-4">Date</th>
              <th className="px-5 py-4">Amount</th>
              <th className="px-5 py-4">Notes</th>
              <th className="px-5 py-4">Allocation</th>
              <th className="px-5 py-4">Breakdown</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200">
            {payments.length === 0 ? (
              <tr>
                <td className="px-5 py-8 text-stone-500" colSpan={6}>
                  No payments recorded yet.
                </td>
              </tr>
            ) : (
              payments.map((payment) => (
                <tr key={payment.id} className="text-stone-700">
                  <td className="px-5 py-4 font-medium text-stone-950">
                    <Link href={`/customers/${payment.customer_id}`} className="hover:text-amber-700">
                      {payment.customerName}
                    </Link>
                  </td>
                  <td className="px-5 py-4">{formatDate(payment.payment_date)}</td>
                  <td className="px-5 py-4 font-medium text-stone-950">
                    {formatCurrency(Number(payment.amount))}
                  </td>
                  <td className="px-5 py-4">{payment.notes || "-"}</td>
                  <td className="px-5 py-4">
                    <span className="inline-flex rounded-full bg-stone-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-stone-800">
                      {allocationLabel(payment)}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    {payment.allocations.length === 0 ? (
                      <span className="text-stone-500">No bill allocations</span>
                    ) : (
                      <div className="space-y-2">
                        {payment.allocations.map((allocation) => (
                          <div key={allocation.billId} className="rounded-2xl bg-stone-50 px-3 py-2">
                            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                              {allocation.billNumber} · {allocation.itemType}
                            </div>
                            <div className="mt-1 text-sm font-medium text-stone-950">
                              {formatCurrency(allocation.amountAllocated)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
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