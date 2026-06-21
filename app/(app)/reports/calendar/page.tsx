import Link from "next/link";

import { listCustomerOptions } from "@/lib/customers";
import { getCalendarReport } from "@/lib/reports";

type CalendarReportPageProps = {
  searchParams: Promise<{
    customer?: string;
    month?: string;
  }>;
};

type CalendarCell = {
  date: string;
  dayLabel: number;
  inCurrentMonth: boolean;
  isToday: boolean;
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(amount);
}

function formatMonthLabel(month: string) {
  const [yearPart, monthPart] = month.split("-");
  const date = new Date(Number(yearPart), Number(monthPart) - 1, 1);

  return new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function buildCalendarCells(month: string): CalendarCell[] {
  const [yearPart, monthPart] = month.split("-");
  const firstOfMonth = new Date(Number(yearPart), Number(monthPart) - 1, 1);
  const gridStart = new Date(firstOfMonth);
  const offset = firstOfMonth.getDay();
  gridStart.setDate(firstOfMonth.getDate() - offset);

  const today = new Date();
  const todayKey = toDateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  const cells: CalendarCell[] = [];

  for (let index = 0; index < 42; index += 1) {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);

    const key = toDateKey(date);
    cells.push({
      date: key,
      dayLabel: date.getDate(),
      inCurrentMonth: date.getMonth() === firstOfMonth.getMonth(),
      isToday: key === todayKey,
    });
  }

  return cells;
}

function shiftMonth(month: string, delta: number) {
  const [yearPart, monthPart] = month.split("-");
  const date = new Date(Number(yearPart), Number(monthPart) - 1 + delta, 1);

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function reportHref(month: string, customer?: string) {
  const params = new URLSearchParams();
  params.set("month", month);

  if (customer) {
    params.set("customer", customer);
  }

  return `/reports/calendar?${params.toString()}`;
}

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function CalendarReportPage({ searchParams }: CalendarReportPageProps) {
  const [{ customer, month }, customers] = await Promise.all([searchParams, listCustomerOptions()]);
  const currentMonth = new Date();
  const fallbackMonth = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, "0")}`;
  const selectedMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(month ?? "") ? (month as string) : fallbackMonth;
  const selectedCustomer = customer ? customers.find((entry) => entry.id === customer) : null;
  const report = await getCalendarReport(selectedMonth, customer || undefined);
  const eventsByDate = new Map(report.days.map((entry) => [entry.date, entry]));
  const cells = buildCalendarCells(selectedMonth);
  const previousMonth = shiftMonth(selectedMonth, -1);
  const nextMonth = shiftMonth(selectedMonth, 1);

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-amber-700">Reports</p>
        <h2 className="text-2xl font-semibold tracking-tight text-stone-950 sm:text-3xl">Calendar report</h2>
        <p className="max-w-3xl text-sm leading-7 text-stone-600">
          View every bill and payment on a monthly calendar. Bill bars show paid progress, and hover reveals gold/diamond amount details with payment-to-bill allocation breakdown.
        </p>
      </div>

      <form className="grid gap-4 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm md:grid-cols-[1fr_1fr_auto]">
        <label className="space-y-2 text-sm font-medium text-stone-700">
          <span>Month</span>
          <input
            type="month"
            name="month"
            defaultValue={selectedMonth}
            className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-950"
          />
        </label>
        <label className="space-y-2 text-sm font-medium text-stone-700">
          <span>Customer</span>
          <select
            name="customer"
            defaultValue={customer ?? ""}
            className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-950"
          >
            <option value="">All customers</option>
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
            Load calendar
          </button>
        </div>
      </form>

      <div className="flex flex-col gap-3 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">Showing</p>
          <h3 className="mt-1 text-xl font-semibold text-stone-950">{formatMonthLabel(selectedMonth)}</h3>
          <p className="mt-1 text-sm text-stone-600">{selectedCustomer?.name ?? "All customers"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={reportHref(previousMonth, customer)}
            className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-medium text-stone-950 transition hover:bg-stone-50"
          >
            Previous
          </Link>
          <Link
            href={reportHref(nextMonth, customer)}
            className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-medium text-stone-950 transition hover:bg-stone-50"
          >
            Next
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto rounded-3xl border border-stone-200 bg-white shadow-sm">
        <div className="grid min-w-[980px] grid-cols-7 border-b border-stone-200 bg-stone-50">
          {weekdayLabels.map((label) => (
            <div key={label} className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
              {label}
            </div>
          ))}
        </div>

        <div className="grid min-w-[980px] grid-cols-7">
          {cells.map((cell) => {
            const events = eventsByDate.get(cell.date);

            return (
              <div
                key={cell.date}
                className={`min-h-52 border-b border-r border-stone-200 p-3 ${
                  cell.inCurrentMonth ? "bg-white" : "bg-stone-50/70"
                }`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <span
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                      cell.isToday
                        ? "bg-amber-500 text-white"
                        : cell.inCurrentMonth
                          ? "text-stone-900"
                          : "text-stone-400"
                    }`}
                  >
                    {cell.dayLabel}
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.16em] text-stone-400">{cell.date.slice(5)}</span>
                </div>

                <div className="space-y-2">
                  {(events?.bills ?? []).map((bill) => {
                    const paidPercent = bill.totalAmount > 0 ? Math.min((bill.paidTotal / bill.totalAmount) * 100, 100) : 0;

                    return (
                      <div key={bill.billId} className="group relative rounded-xl border border-amber-200 bg-amber-50 p-2">
                        <p className="truncate text-[11px] font-semibold text-amber-950">Bill {bill.billNumber}</p>
                        <p className="truncate text-[10px] text-amber-900/90">{bill.customerName}</p>
                        <div className="mt-1 h-1.5 rounded-full bg-amber-200">
                          <div
                            className="h-1.5 rounded-full bg-amber-600"
                            style={{ width: `${paidPercent}%` }}
                          />
                        </div>
                        <p className="mt-1 text-[10px] font-medium text-amber-900">
                          Paid {formatCurrency(bill.paidTotal)} / {formatCurrency(bill.totalAmount)}
                        </p>

                        <div className="pointer-events-none invisible absolute left-0 top-full z-30 mt-2 w-72 rounded-2xl border border-stone-200 bg-white p-3 text-xs text-stone-700 shadow-xl group-hover:visible">
                          <p className="font-semibold text-stone-950">Bill {bill.billNumber}</p>
                          <p className="mt-1 text-stone-600">{bill.customerName}</p>
                          <div className="mt-2 space-y-1">
                            <p>Gold amount: <span className="font-medium text-stone-950">{formatCurrency(bill.goldAmount)}</span></p>
                            <p>Diamond amount: <span className="font-medium text-stone-950">{formatCurrency(bill.diamondAmount)}</span></p>
                            <p>Gold paid: <span className="font-medium text-stone-950">{formatCurrency(bill.goldPaid)}</span></p>
                            <p>Diamond paid: <span className="font-medium text-stone-950">{formatCurrency(bill.diamondPaid)}</span></p>
                            <p>Total paid: <span className="font-medium text-stone-950">{formatCurrency(bill.paidTotal)}</span></p>
                            <p>Status: <span className="font-medium capitalize text-stone-950">{bill.status}</span></p>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {(events?.payments ?? []).map((payment) => (
                    <div key={payment.paymentId} className="group relative rounded-xl border border-sky-200 bg-sky-50 p-2">
                      <p className="truncate text-[11px] font-semibold text-sky-950">Payment {formatCurrency(payment.amount)}</p>
                      <p className="truncate text-[10px] text-sky-900/90">{payment.customerName}</p>

                      <div className="pointer-events-none invisible absolute left-0 top-full z-30 mt-2 w-80 rounded-2xl border border-stone-200 bg-white p-3 text-xs text-stone-700 shadow-xl group-hover:visible">
                        <p className="font-semibold text-stone-950">Payment details</p>
                        <p className="mt-1 text-stone-600">{payment.customerName}</p>
                        <p className="mt-2">Amount: <span className="font-medium text-stone-950">{formatCurrency(payment.amount)}</span></p>
                        {payment.notes ? <p className="mt-1">Notes: {payment.notes}</p> : null}

                        <div className="mt-2">
                          <p className="font-medium text-stone-900">Bill allocations</p>
                          {payment.allocations.length === 0 ? (
                            <p className="mt-1 text-stone-500">No bill allocations for this payment.</p>
                          ) : (
                            <ul className="mt-1 max-h-28 space-y-1 overflow-y-auto pr-1">
                              {payment.allocations.map((allocation) => (
                                <li key={`${payment.paymentId}-${allocation.billId}-${allocation.allocatedTo}`}>
                                  Bill {allocation.billNumber} · {allocation.allocatedTo} · {formatCurrency(allocation.amountAllocated)}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  {!events || (events.bills.length === 0 && events.payments.length === 0) ? (
                    <p className="text-[10px] text-stone-400">No activity</p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
