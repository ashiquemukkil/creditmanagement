import Link from "next/link";

const reports = [
  {
    description: "Open and partial bills for a chosen customer, sorted by urgency.",
    href: "/reports/outstanding-statement",
    title: "Outstanding statement",
  },
  {
    description: "Chronological customer ledger mixing bill debits and payment credits.",
    href: "/reports/customer-ledger",
    title: "Customer ledger",
  },
  {
    description: "Shop-wide gold vs diamond outstanding exposure with chart view.",
    href: "/reports/gold-vs-diamond-exposure",
    title: "Gold vs diamond exposure",
  },
  {
    description: "Per-payment audit trail showing exactly how a payment was split across bills.",
    href: "/reports/payment-allocation",
    title: "Payment allocation report",
  },
  {
    description: "Month-view calendar of bills and payments with paid-progress bars and allocation hover details.",
    href: "/reports/calendar",
    title: "Calendar report",
  },
  {
    description: "Aging report showing outstanding bills categorized by age.",
    href: "/reports/aging-report",
    title: "Aging report",
  },
];

export default function ReportsPage() {
  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-amber-700">Reports</p>
        <h2 className="text-2xl font-semibold tracking-tight text-stone-950 sm:text-3xl">Reports center</h2>
        <p className="max-w-3xl text-sm leading-7 text-stone-600">
          Read-only reporting is available to every signed-in role. Open any report below to review outstanding balances, exposure, and allocation trails.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {reports.map((report) => (
          <Link
            key={report.href}
            href={report.href}
            className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm transition hover:border-amber-300 hover:shadow-md"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">Report</p>
            <h3 className="mt-3 text-xl font-semibold text-stone-950">{report.title}</h3>
            <p className="mt-3 text-sm leading-7 text-stone-600">{report.description}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}