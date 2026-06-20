import Link from "next/link";

import { listCustomerOptions } from "@/lib/customers";
import { getCustomerLedger } from "@/lib/reports";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(amount);
}

type CustomerLedgerPageProps = {
  searchParams: Promise<{
    customer?: string;
  }>;
};

export default async function CustomerLedgerPage({ searchParams }: CustomerLedgerPageProps) {
  const [{ customer }, customers] = await Promise.all([searchParams, listCustomerOptions()]);
  const ledger = customer ? await getCustomerLedger(customer) : null;

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-amber-700">Reports</p>
          <h2 className="text-2xl font-semibold tracking-tight text-stone-950 sm:text-3xl">Customer ledger</h2>
          <p className="max-w-3xl text-sm leading-7 text-stone-600">
            Pick a customer to see a chronological debit and credit timeline with a running balance.
          </p>
        </div>
        {customer ? (
          <Link
            href={`/reports/customer-ledger/export?customer=${customer}`}
            className="inline-flex rounded-2xl border border-stone-300 px-5 py-3 text-sm font-medium text-stone-950 transition hover:bg-stone-50"
          >
            Export CSV
          </Link>
        ) : null}
      </div>

      <form className="grid gap-4 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm md:grid-cols-[1fr_auto]">
        <label className="space-y-2 text-sm font-medium text-stone-700">
          <span>Customer</span>
          <select
            name="customer"
            defaultValue={customer ?? ""}
            className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-950"
          >
            <option value="">Select a customer</option>
            {customers.map((option) => (
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
            Load ledger
          </button>
        </div>
      </form>

      {ledger ? (
        <div className="overflow-x-auto rounded-3xl border border-stone-200 bg-white shadow-sm">
          <div className="border-b border-stone-200 px-5 py-4">
            <h3 className="text-lg font-semibold text-stone-950">{ledger.customerName}</h3>
          </div>
          <table className="min-w-[980px] divide-y divide-stone-200 text-sm">
            <thead className="bg-stone-50 text-left text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
              <tr>
                <th className="px-5 py-4">Date</th>
                <th className="px-5 py-4">Reference</th>
                <th className="px-5 py-4">Type</th>
                <th className="px-5 py-4">Description</th>
                <th className="px-5 py-4">Debit</th>
                <th className="px-5 py-4">Credit</th>
                <th className="px-5 py-4">Running balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {ledger.entries.length === 0 ? (
                <tr>
                  <td className="px-5 py-8 text-stone-500" colSpan={7}>
                    No bills or payments recorded for this customer.
                  </td>
                </tr>
              ) : (
                ledger.entries.map((entry) => (
                  <tr key={`${entry.entryType}-${entry.reference}-${entry.date}`} className="text-stone-700">
                    <td className="px-5 py-4">{entry.date}</td>
                    <td className="px-5 py-4 font-medium text-stone-950">{entry.reference}</td>
                    <td className="px-5 py-4 capitalize">{entry.entryType}</td>
                    <td className="px-5 py-4">{entry.description}</td>
                    <td className="px-5 py-4">{entry.debit ? formatCurrency(entry.debit) : "-"}</td>
                    <td className="px-5 py-4">{entry.credit ? formatCurrency(entry.credit) : "-"}</td>
                    <td className="px-5 py-4 font-medium text-stone-950">
                      {formatCurrency(entry.balance)}
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