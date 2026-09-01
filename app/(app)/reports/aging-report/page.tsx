import { Suspense } from "react";
import Link from "next/link";

import { AgingChart } from "@/components/reports/aging-chart";
import { AgingBucketFilters } from "@/components/reports/aging-bucket-filters";
import { agingBucketLabels, DEFAULT_AGING_THRESHOLDS } from "@/lib/aging-buckets";
import { getAgingReport } from "@/lib/reports";

type AgingReportPageProps = {
  searchParams: Promise<{
    thresholds?: string;
  }>;
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(amount);
}

function parseThresholds(raw: string | undefined): number[] {
  if (!raw) return DEFAULT_AGING_THRESHOLDS;
  const parsed = raw
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  return parsed.length > 0 ? parsed : DEFAULT_AGING_THRESHOLDS;
}

export default async function AgingReportPage({ searchParams }: AgingReportPageProps) {
  const { thresholds: rawThresholds } = await searchParams;
  const thresholds = parseThresholds(rawThresholds);
  const report = await getAgingReport(undefined, thresholds);
  const buckets = report.bucketLabels;
  const exportParams = new URLSearchParams();
  if (rawThresholds) exportParams.set("thresholds", rawThresholds);
  const exportHref = `/reports/aging-report/export${exportParams.size > 0 ? `?${exportParams.toString()}` : ""}`;

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
          href={exportHref}
          className="inline-flex rounded-2xl border border-stone-300 px-5 py-3 text-sm font-medium text-stone-950 transition hover:bg-stone-50"
        >
          Export CSV
        </Link>
      </div>

      <Suspense>
        <AgingBucketFilters thresholds={thresholds} />
      </Suspense>

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
                <td className="px-5 py-8 text-stone-500" colSpan={buckets.length * 2 + 2}>
                  No outstanding balances found.
                </td>
              </tr>
            ) : (
              report.rows.map((row) => (
                <tr key={row.customerId} className="text-stone-700">
                  <td className="px-5 py-4 font-medium text-stone-950">{row.customerName}</td>
                  {buckets.map((bucket) => (
                    <td key={`${row.customerId}-${bucket}-gold`} className="px-5 py-4">
                      {formatCurrency((row.buckets[bucket] ?? { gold: 0 }).gold)}
                    </td>
                  ))}
                  {buckets.map((bucket) => (
                    <td key={`${row.customerId}-${bucket}-diamond`} className="px-5 py-4">
                      {formatCurrency((row.buckets[bucket] ?? { diamond: 0 }).diamond)}
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