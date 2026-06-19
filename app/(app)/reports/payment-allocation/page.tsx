import { listPaymentOptions } from "@/lib/payments";
import { getPaymentAllocationReport } from "@/lib/reports";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(amount);
}

type PaymentAllocationPageProps = {
  searchParams: Promise<{
    payment?: string;
  }>;
};

export default async function PaymentAllocationPage({ searchParams }: PaymentAllocationPageProps) {
  const [{ payment }, paymentOptions] = await Promise.all([searchParams, listPaymentOptions()]);
  const report = payment ? await getPaymentAllocationReport(payment) : null;

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-amber-700">Reports</p>
        <h2 className="text-3xl font-semibold tracking-tight text-stone-950">Payment allocation report</h2>
        <p className="max-w-3xl text-sm leading-7 text-stone-600">
          Pick a payment to inspect exactly which bills it was split across and how much was left unapplied.
        </p>
      </div>

      <form className="grid gap-4 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm md:grid-cols-[1fr_auto]">
        <label className="space-y-2 text-sm font-medium text-stone-700">
          <span>Payment</span>
          <select
            name="payment"
            defaultValue={payment ?? ""}
            className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-950"
          >
            <option value="">Select a payment</option>
            {paymentOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.customerName} · {option.paymentDate} · {formatCurrency(option.amount)}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-3">
          <button
            type="submit"
            className="rounded-2xl bg-stone-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-800"
          >
            Load breakdown
          </button>
        </div>
      </form>

      {report ? (
        <div className="space-y-4 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Customer</p>
              <p className="mt-2 text-sm font-medium text-stone-950">{report.customerName}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Payment date</p>
              <p className="mt-2 text-sm font-medium text-stone-950">{report.paymentDate}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Payment amount</p>
              <p className="mt-2 text-sm font-medium text-stone-950">{formatCurrency(report.paymentAmount)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Unallocated</p>
              <p className="mt-2 text-sm font-medium text-stone-950">{formatCurrency(report.unallocatedAmount)}</p>
            </div>
          </div>

          <table className="min-w-full divide-y divide-stone-200 text-sm">
            <thead className="bg-stone-50 text-left text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
              <tr>
                <th className="px-5 py-4">Bill number</th>
                <th className="px-5 py-4">Type</th>
                <th className="px-5 py-4">Amount allocated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {report.allocations.length === 0 ? (
                <tr>
                  <td className="px-5 py-8 text-stone-500" colSpan={3}>
                    No bill allocations for this payment.
                  </td>
                </tr>
              ) : (
                report.allocations.map((allocation) => (
                  <tr key={allocation.billId} className="text-stone-700">
                    <td className="px-5 py-4 font-medium text-stone-950">{allocation.billNumber}</td>
                    <td className="px-5 py-4 capitalize">{allocation.itemType}</td>
                    <td className="px-5 py-4 font-medium text-stone-950">
                      {formatCurrency(allocation.amountAllocated)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}