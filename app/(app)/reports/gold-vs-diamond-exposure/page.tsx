import { ExposureChart } from "@/components/reports/exposure-chart";
import { getExposureReport } from "@/lib/reports";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(amount);
}

export default async function GoldVsDiamondExposurePage() {
  const report = await getExposureReport();

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-amber-700">Reports</p>
        <h2 className="text-3xl font-semibold tracking-tight text-stone-950">
          Gold vs diamond exposure
        </h2>
        <p className="max-w-3xl text-sm leading-7 text-stone-600">
          Shop-wide outstanding split by item type so you can see where credit exposure is concentrated.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="grid gap-4">
          <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Gold outstanding</p>
            <p className="mt-4 text-3xl font-semibold text-amber-700">{formatCurrency(report.totals.gold)}</p>
          </div>
          <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Diamond outstanding</p>
            <p className="mt-4 text-3xl font-semibold text-sky-700">{formatCurrency(report.totals.diamond)}</p>
          </div>
        </div>

        <ExposureChart data={report.chartData} />
      </div>
    </section>
  );
}