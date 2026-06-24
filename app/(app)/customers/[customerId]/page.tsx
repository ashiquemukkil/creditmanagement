import Link from "next/link";
import { notFound } from "next/navigation";

import { DeleteCustomerButton } from "@/components/delete-customer-button";
import { canManageData, getCurrentUserRole } from "@/lib/auth";
import { billDueDateEntries, listBills } from "@/lib/bills";
import { getCustomerById } from "@/lib/customers";
import { getGroupById } from "@/lib/groups";
import { listPayments } from "@/lib/payments";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(amount);
}

function formatDueDateSummary(bill: Parameters<typeof billDueDateEntries>[0]) {
  const entries = billDueDateEntries(bill);

  if (entries.length === 0) {
    return bill.gold_due_date ?? bill.diamond_due_date ?? "-";
  }

  return entries.map((entry) => `${entry.metal}: ${entry.dueDate}`).join(" / ");
}

type CustomerDetailPageProps = {
  params: Promise<{
    customerId: string;
  }>;
};

export default async function CustomerDetailPage({ params }: CustomerDetailPageProps) {
  const [{ customerId }, role] = await Promise.all([params, getCurrentUserRole()]);
  const [customer, bills, payments] = await Promise.all([
    getCustomerById(customerId),
    listBills({ customerId }),
    listPayments({ customerId }),
  ]);

  if (!customer) {
    notFound();
  }

  let group = null;
  if (customer.group_id) {
    group = await getGroupById(customer.group_id);
  }

  const canEdit = canManageData(role);

  return (
    <section className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-amber-700">
            Customer Profile
          </p>
          <h2 className="text-2xl font-semibold tracking-tight text-stone-950 sm:text-3xl">
            {customer.name}
          </h2>
          <p className="max-w-2xl text-sm leading-7 text-stone-600">
            Review the customer profile, credit terms, and outstanding balance summary.
          </p>
        </div>

        {canEdit ? (
          <div className="flex flex-wrap gap-3">
            <Link
              href={`/bills/new?customerId=${customer.id}`}
              className="inline-flex rounded-2xl bg-stone-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-800"
            >
              Add bill
            </Link>
            <Link
              href={`/payments/new?customerId=${customer.id}`}
              className="inline-flex rounded-2xl border border-stone-300 px-5 py-3 text-sm font-medium text-stone-950 transition hover:bg-stone-50"
            >
              Add payment
            </Link>
            <Link
              href={`/customers/${customer.id}/edit`}
              className="inline-flex rounded-2xl border border-stone-300 px-5 py-3 text-sm font-medium text-stone-950 transition hover:bg-stone-50"
            >
              Edit customer
            </Link>
            <DeleteCustomerButton customerId={customer.id} customerName={customer.name} />
          </div>
        ) : null}
      </div>

      <div className="space-y-6">
        <div className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
          <h3 className="text-lg font-semibold text-stone-950">Profile</h3>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Phone</dt>
              <dd className="mt-2 break-all text-sm text-stone-800">{customer.phone || "-"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Group</dt>
              <dd className="mt-2 text-sm text-stone-800">
                {group ? `${group.category} - ${group.sub_category}` : "-"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Outstanding</dt>
              <dd className="mt-2 text-sm font-medium text-stone-950">
                {formatCurrency(customer.totalOutstanding)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Advance</dt>
              <dd className="mt-2 text-sm font-medium text-stone-950">
                {formatCurrency(Number(customer.advance_amount ?? 0))}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Gold credit days</dt>
              <dd className="mt-2 text-sm text-stone-800">{customer.gold_credit_days}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Diamond credit days</dt>
              <dd className="mt-2 text-sm text-stone-800">{customer.diamond_credit_days}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Address</dt>
              <dd className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-stone-800">
                {customer.address || "-"}
              </dd>
            </div>
          </dl>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-stone-950">Bills</h3>
            {bills.length === 0 ? (
              <p className="mt-3 text-sm leading-7 text-stone-600">No bills recorded yet.</p>
            ) : (
              <div className="mt-4 overflow-x-auto rounded-2xl border border-stone-200">
                <table className="min-w-[760px] divide-y divide-stone-200 text-sm">
                  <thead className="bg-stone-50 text-left text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                    <tr>
                      <th className="px-4 py-3">Bill #</th>
                      <th className="px-4 py-3">Gold</th>
                      <th className="px-4 py-3">Diamond</th>
                      <th className="px-4 py-3">Total</th>
                      <th className="px-4 py-3">Due dates</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200 bg-white text-stone-700">
                    {bills.map((bill) => (
                      <tr key={bill.id}>
                        <td className="px-4 py-3 font-medium text-stone-950">{bill.bill_number}</td>
                        <td className="px-4 py-3">{formatCurrency(Number(bill.gold_amount))}</td>
                        <td className="px-4 py-3">{formatCurrency(Number(bill.diamond_amount))}</td>
                        <td className="px-4 py-3">{formatCurrency(bill.totalAmount)}</td>
                        <td className="px-4 py-3">{formatDueDateSummary(bill)}</td>
                        <td className="px-4 py-3 capitalize">{bill.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-stone-950">Payments</h3>
            {payments.length === 0 ? (
              <p className="mt-3 text-sm leading-7 text-stone-600">No payments recorded yet.</p>
            ) : (
              <div className="mt-4 overflow-x-auto rounded-2xl border border-stone-200">
                <table className="min-w-[820px] divide-y divide-stone-200 text-sm">
                  <thead className="bg-stone-50 text-left text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Amount</th>
                      <th className="px-4 py-3">Notes</th>
                      <th className="px-4 py-3">Allocation</th>
                      <th className="px-4 py-3">Breakdown</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200 bg-white text-stone-700">
                    {payments.map((payment) => (
                      <tr key={payment.id}>
                        <td className="px-4 py-3">{payment.payment_date}</td>
                        <td className="px-4 py-3 font-medium text-stone-950">
                          {formatCurrency(Number(payment.amount))}
                        </td>
                        <td className="px-4 py-3">{payment.notes || "-"}</td>
                        <td className="px-4 py-3 uppercase tracking-[0.14em] text-stone-600">
                          {payment.unallocatedAmount > 0
                            ? `${payment.allocatedAmount > 0 ? "advance" : "unallocated"} ${formatCurrency(payment.unallocatedAmount)}`
                            : "fully allocated"}
                        </td>
                        <td className="px-4 py-3">
                          {payment.allocations.length === 0 ? (
                            <span className="text-stone-500">No bill allocations</span>
                          ) : (
                            <div className="space-y-2">
                              {payment.allocations.map((allocation) => (
                                <div key={`${allocation.billId}-${allocation.itemType}`} className="rounded-2xl bg-stone-50 px-3 py-2">
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
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}