import Link from "next/link";

import { AgingChart } from "@/components/reports/aging-chart";
import { getAgingReport } from "@/lib/reports";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(amount);
}

const buckets = ["current", "1-15", "16-30", "31-60", "60+"] as const;

export default async function AgingReportPage() {
  const report = await getAgingReport();

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-amber-700">Reports</p>
          <h2 className="text-2xl font-semibold tracking-tight text-stone-950 sm:text-3xl">Aging report</h2>
          <p className="max-w-3xl text-sm leading-7 text-stone-600">
            Outstanding balances bucketed by overdue age, split between gold and diamond exposure for every customer.
          </p>
        </div>
        <Link
          href="/reports/aging-report/export"
          className="inline-flex rounded-2xl border border-stone-300 px-5 py-3 text-sm font-medium text-stone-950 transition hover:bg-stone-50"
        >
          Export CSV
        </Link>
      </div>

      <AgingChart data={report.chartData} />

      <div className="overflow-x-auto rounded-3xl border border-stone-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-stone-200 text-sm">
          <thead className="bg-stone-50 text-left text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
            <tr>
              <th className="px-5 py-4">Customer</th>
              {buckets.map((bucket) => (
                <th key={bucket} className="px-5 py-4">{bucket} Gold</th>
              ))}
              {buckets.map((bucket) => (
                <th key={`${bucket}-diamond`} className="px-5 py-4">{bucket} Diamond</th>
              ))}
              <th className="px-5 py-4">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200">
            {report.rows.length === 0 ? (
              <tr>
                <td className="px-5 py-8 text-stone-500" colSpan={12}>
                  No outstanding balances found.
                </td>
              </tr>
            ) : (
              report.rows.map((row) => (
                <tr key={row.customerId} className="text-stone-700">
                  <td className="px-5 py-4 font-medium text-stone-950">{row.customerName}</td>
                  {buckets.map((bucket) => (
                    <td key={`${row.customerId}-${bucket}-gold`} className="px-5 py-4">
                      {formatCurrency(row.buckets[bucket].gold)}
                    </td>
                  ))}
                  {buckets.map((bucket) => (
                    <td key={`${row.customerId}-${bucket}-diamond`} className="px-5 py-4">
                      {formatCurrency(row.buckets[bucket].diamond)}
                    </td>
                  ))}
                  <td className="px-5 py-4 font-medium text-stone-950">
                    {formatCurrency(row.totalOutstanding)}
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