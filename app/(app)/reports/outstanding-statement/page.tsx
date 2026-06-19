import { listCustomerOptions } from "@/lib/customers";
import { getOutstandingStatement } from "@/lib/reports";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(amount);
}

type OutstandingStatementPageProps = {
  searchParams: Promise<{
    customer?: string;
  }>;
};

export default async function OutstandingStatementPage({ searchParams }: OutstandingStatementPageProps) {
  const [{ customer }, customers] = await Promise.all([searchParams, listCustomerOptions()]);
  const selectedCustomer = customer ? customers.find((entry) => entry.id === customer) : null;
  const rows = customer ? await getOutstandingStatement(customer) : [];

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-amber-700">Reports</p>
        <h2 className="text-3xl font-semibold tracking-tight text-stone-950">Outstanding statement</h2>
        <p className="max-w-3xl text-sm leading-7 text-stone-600">
          Pick a customer to review all open and partial bills, sorted from most overdue to least urgent.
        </p>
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
            Load statement
          </button>
        </div>
      </form>

      {selectedCustomer ? (
        <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
          <div className="border-b border-stone-200 px-5 py-4">
            <h3 className="text-lg font-semibold text-stone-950">{selectedCustomer.name}</h3>
          </div>
          <table className="min-w-full divide-y divide-stone-200 text-sm">
            <thead className="bg-stone-50 text-left text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
              <tr>
                <th className="px-5 py-4">Bill number</th>
                <th className="px-5 py-4">Type</th>
                <th className="px-5 py-4">Due date</th>
                <th className="px-5 py-4">Days overdue</th>
                <th className="px-5 py-4">Outstanding</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {rows.length === 0 ? (
                <tr>
                  <td className="px-5 py-8 text-stone-500" colSpan={5}>
                    No open or partial bills for this customer.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.billId} className="text-stone-700">
                    <td className="px-5 py-4 font-medium text-stone-950">{row.billNumber}</td>
                    <td className="px-5 py-4 capitalize">{row.itemType}</td>
                    <td className="px-5 py-4">{row.dueDate}</td>
                    <td className="px-5 py-4">{row.daysOverdue}</td>
                    <td className="px-5 py-4 font-medium text-stone-950">
                      {formatCurrency(row.amountOutstanding)}
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