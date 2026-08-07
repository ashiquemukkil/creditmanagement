import "server-only";

import {
  billDueDateEntries,
  billDueDateSortValue,
  billMetals,
  billOutstandingDiamondAmount,
  billOutstandingGoldAmount,
  billTotalAmount,
} from "@/lib/bills";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AgingBucket = "current" | "1-15" | "16-30" | "31-60" | "60+";

export type OutstandingStatementRow = {
  amountOutstanding: number;
  billId: string;
  billNumber: string;
  billDate: string;
  customerName: string;
  diamondDue: number;
  diamondDueDays: number | null;
  diamondOverdue: number;
  diamondOutstanding: number;
  entryType: "bill" | "advance";
  goldDue: number;
  goldDueDays: number | null;
  goldOverdue: number;
  goldOutstanding: number;
};

export type AgingCustomerRow = {
  buckets: Record<AgingBucket, { diamond: number; gold: number }>;
  customerId: string;
  customerName: string;
  totalOutstanding: number;
};

export type LedgerEntry = {
  balance: number;
  credit: number;
  date: string;
  debit: number;
  description: string;
  entryType: "bill" | "payment";
  itemType: string | null;
  reference: string;
};

export type CalendarBillEntry = {
  billDate: string;
  billId: string;
  billNumber: string;
  customerId: string;
  customerName: string;
  diamondAmount: number;
  diamondPaid: number;
  goldAmount: number;
  goldPaid: number;
  paidTotal: number;
  status: "open" | "partial" | "closed";
  totalAmount: number;
};

export type CalendarPaymentEntry = {
  allocations: Array<{
    allocatedTo: "gold" | "diamond";
    amountAllocated: number;
    billId: string;
    billNumber: string;
  }>;
  amount: number;
  customerId: string;
  customerName: string;
  notes: string | null;
  paymentDate: string;
  paymentId: string;
};

export type CalendarDayEntry = {
  bills: CalendarBillEntry[];
  date: string;
  payments: CalendarPaymentEntry[];
};

export type CalendarReport = {
  days: CalendarDayEntry[];
  month: string;
};

type BillReportRow = {
  amount_paid_diamond: number;
  amount_paid_gold: number;
  bill_date: string;
  bill_number: string;
  created_at: string;
  customer_id: string;
  diamond_amount: number;
  diamond_due_date: string | null;
  due_date: string;
  gold_amount: number;
  gold_due_date: string | null;
  id: string;
  status: "open" | "partial" | "closed";
  customers: { name: string } | Array<{ name: string }> | null;
};

type PaymentAdvanceReportRow = {
  amount: number;
  created_at: string;
  customer_id: string;
  customers: { name: string } | Array<{ name: string }> | null;
  id: string;
  payment_allocations:
    | Array<{
        amount_allocated: number;
      }>
    | null;
  payment_date: string;
};

function getCustomerName(customers: { name: string } | Array<{ name: string }> | null | undefined) {
  if (!customers) {
    return "Unknown customer";
  }

  return Array.isArray(customers) ? (customers[0]?.name ?? "Unknown customer") : customers.name;
}

function emptyBuckets(): Record<AgingBucket, { diamond: number; gold: number }> {
  return {
    "1-15": { diamond: 0, gold: 0 },
    "16-30": { diamond: 0, gold: 0 },
    "31-60": { diamond: 0, gold: 0 },
    "60+": { diamond: 0, gold: 0 },
    current: { diamond: 0, gold: 0 },
  };
}

function bucketForDaysOverdue(daysOverdue: number): AgingBucket {
  if (daysOverdue <= 0) {
    return "current";
  }

  if (daysOverdue <= 15) {
    return "1-15";
  }

  if (daysOverdue <= 30) {
    return "16-30";
  }

  if (daysOverdue <= 60) {
    return "31-60";
  }

  return "60+";
}

async function listOutstandingBillsBase(customerId?: string, groupId?: string) {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("bills")
    .select(
      "id, customer_id, bill_number, bill_date, gold_amount, diamond_amount, gold_due_date, diamond_due_date, due_date, amount_paid_gold, amount_paid_diamond, status, created_at, customers(name, group_id)",
    )
    .in("status", ["open", "partial"]);

  if (customerId) {
    query = query.eq("customer_id", customerId);
  }

  if (groupId) {
    query = query.eq("customers.group_id", groupId);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []) as BillReportRow[];
}

async function listAdvancePaymentEntries(customerId?: string, groupId?: string): Promise<OutstandingStatementRow[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("payments")
    .select(
      "id, customer_id, payment_date, amount, created_at, customers(name, group_id), payment_allocations(amount_allocated)",
    );

  if (customerId) {
    query = query.eq("customer_id", customerId);
  }

  if (groupId) {
    query = query.eq("customers.group_id", groupId);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const advanceByCustomer = new Map<
    string,
    {
      amount: number;
      customerName: string;
      latestDate: string;
    }
  >();

  ((data ?? []) as PaymentAdvanceReportRow[]).forEach((payment) => {
    const allocatedAmount = (payment.payment_allocations ?? []).reduce(
      (sum, allocation) => sum + Number(allocation.amount_allocated),
      0,
    );
    const unallocatedAmount = Math.max(Number(payment.amount) - allocatedAmount, 0);

    if (unallocatedAmount <= 0) {
      return;
    }

    const existing = advanceByCustomer.get(payment.customer_id);

    if (!existing) {
      advanceByCustomer.set(payment.customer_id, {
        amount: unallocatedAmount,
        customerName: getCustomerName(payment.customers),
        latestDate: payment.payment_date,
      });

      return;
    }

    advanceByCustomer.set(payment.customer_id, {
      amount: existing.amount + unallocatedAmount,
      customerName: existing.customerName,
      latestDate: payment.payment_date > existing.latestDate ? payment.payment_date : existing.latestDate,
    });
  });

  return Array.from(advanceByCustomer.entries()).map(([customerIdKey, summary]) => ({
    amountOutstanding: -summary.amount,
    billDate: summary.latestDate,
    billId: `advance-${customerIdKey}`,
    billNumber: "ADVANCE PAYMENT",
    customerName: summary.customerName,
    diamondDue: 0,
    diamondDueDays: null,
    diamondOverdue: 0,
    diamondOutstanding: 0,
    entryType: "advance",
    goldDue: 0,
    goldDueDays: null,
    goldOverdue: 0,
    goldOutstanding: 0,
  }));
}

export async function getOutstandingStatement(customerId?: string, groupId?: string) {
  const [rows, advanceRows] = await Promise.all([
    listOutstandingBillsBase(customerId, groupId),
    listAdvancePaymentEntries(customerId, groupId),
  ]);
  const dueDateSortByBillId = new Map(rows.map((bill) => [bill.id, billDueDateSortValue(bill) ?? ""]));

  const billStatementRows = rows
    .map((bill) => {
      const goldOutstanding = billOutstandingGoldAmount(bill);
      const diamondOutstanding = billOutstandingDiamondAmount(bill);
      const dueDateEntries = billDueDateEntries(bill, { outstandingOnly: true });
      const dueDatesByMetal = new Map(dueDateEntries.map((entry) => [entry.metal, entry.daysOverdue]));
      const goldOverdue = (dueDatesByMetal.get("gold") ?? 0) > 0 ? goldOutstanding : 0;
      const diamondOverdue = (dueDatesByMetal.get("diamond") ?? 0) > 0 ? diamondOutstanding : 0;

      const signedDays = (dueDate: string | null): number | null => {
        if (!dueDate) return null;
        const today = new Date();
        const now = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
        const due = new Date(`${dueDate}T00:00:00`).getTime();
        return Math.floor((now - due) / (1000 * 60 * 60 * 24));
      };

      return {
        row: {
          amountOutstanding: goldOutstanding + diamondOutstanding,
          billDate: bill.bill_date,
          billId: bill.id,
          billNumber: bill.bill_number,
          customerName: getCustomerName(bill.customers),
          diamondDue: diamondOutstanding - diamondOverdue,
          diamondDueDays: bill.diamond_amount && Number(bill.diamond_amount) > 0 ? signedDays(bill.diamond_due_date) : null,
          diamondOverdue,
          diamondOutstanding,
          entryType: "bill" as const,
          goldDue: goldOutstanding - goldOverdue,
          goldDueDays: bill.gold_amount && Number(bill.gold_amount) > 0 ? signedDays(bill.gold_due_date) : null,
          goldOverdue,
          goldOutstanding,
        },
        sortDate: dueDateSortByBillId.get(bill.id) ?? "",
        maxDaysOverdue: Math.max(dueDatesByMetal.get("gold") ?? 0, dueDatesByMetal.get("diamond") ?? 0),
      };
    })
    .filter((bill) => bill.row.amountOutstanding > 0);

  const advanceStatementRows = advanceRows.map((row) => ({
    row,
    sortDate: row.billDate,
    maxDaysOverdue: -1,
  }));

  const statementRows = [...billStatementRows, ...advanceStatementRows];

  return statementRows
    .sort((left, right) => {
      if (right.maxDaysOverdue !== left.maxDaysOverdue) {
        return right.maxDaysOverdue - left.maxDaysOverdue;
      }

      return left.sortDate.localeCompare(right.sortDate);
    })
    .map((bill) => bill.row);
}

export async function getAgingReport(groupId?: string) {
  const rows = await listOutstandingBillsBase(undefined, groupId);
  const customerMap = new Map<string, AgingCustomerRow>();
  const bucketTotals = emptyBuckets();

  rows.forEach((bill) => {
    const goldOutstanding = billOutstandingGoldAmount(bill);
    const diamondOutstanding = billOutstandingDiamondAmount(bill);
    const outstanding = goldOutstanding + diamondOutstanding;

    if (outstanding <= 0) {
      return;
    }

    const row =
      customerMap.get(bill.customer_id) ??
      {
        buckets: emptyBuckets(),
        customerId: bill.customer_id,
        customerName: getCustomerName(bill.customers),
        totalOutstanding: 0,
      };

    row.totalOutstanding += outstanding;
    customerMap.set(bill.customer_id, row);

    const dueDateEntries = billDueDateEntries(bill);
    const dueDateByMetal = new Map(dueDateEntries.map((entry) => [entry.metal, entry.daysOverdue]));

    if (goldOutstanding > 0 && bill.gold_due_date) {
      const goldBucket = bucketForDaysOverdue(dueDateByMetal.get("gold") ?? 0);

      row.buckets[goldBucket].gold += goldOutstanding;
      bucketTotals[goldBucket].gold += goldOutstanding;
    }

    if (diamondOutstanding > 0 && bill.diamond_due_date) {
      const diamondBucket = bucketForDaysOverdue(dueDateByMetal.get("diamond") ?? 0);

      row.buckets[diamondBucket].diamond += diamondOutstanding;
      bucketTotals[diamondBucket].diamond += diamondOutstanding;
    }
  });

  const rowsForTable = Array.from(customerMap.values()).sort(
    (left, right) => right.totalOutstanding - left.totalOutstanding,
  );
  const chartData = (Object.keys(bucketTotals) as AgingBucket[]).map((bucket) => ({
    bucket,
    diamond: bucketTotals[bucket].diamond,
    gold: bucketTotals[bucket].gold,
  }));

  return {
    chartData,
    rows: rowsForTable,
  };
}

export async function getCustomerLedger(customerId: string, groupId?: string) {
  const supabase = await createSupabaseServerClient();

  const [{ data: customer, error: customerError }, { data: bills, error: billsError }, { data: payments, error: paymentsError }] =
    await Promise.all([
      supabase.from("customers").select("id, name, group_id").eq("id", customerId).maybeSingle(),
      supabase
        .from("bills")
        .select("id, bill_number, bill_date, gold_amount, diamond_amount, created_at")
        .eq("customer_id", customerId),
      supabase
        .from("payments")
        .select("id, payment_date, amount, notes, created_at")
        .eq("customer_id", customerId),
    ]);

  if (customerError) {
    throw customerError;
  }

  if (billsError) {
    throw billsError;
  }

  if (paymentsError) {
    throw paymentsError;
  }

  if (!customer || (groupId && customer.group_id !== groupId)) {
    return null;
  }

  const entries: Array<LedgerEntry & { createdAt: string }> = [
    ...((bills ?? []) as Array<{
      bill_date: string;
      bill_number: string;
      created_at: string;
      diamond_amount: number;
      gold_amount: number;
      id: string;
    }>).map((bill) => ({
      balance: 0,
      createdAt: bill.created_at,
      credit: 0,
      date: bill.bill_date,
      debit: billTotalAmount(bill),
      description: `${billMetals(bill).join(" + ") || "mixed"} bill ${bill.bill_number}`,
      entryType: "bill" as const,
      itemType: billMetals(bill).join(" / ") || null,
      reference: bill.bill_number,
    })),
    ...((payments ?? []) as Array<{
      amount: number;
      created_at: string;
      id: string;
      notes: string | null;
      payment_date: string;
    }>).map((payment) => ({
      balance: 0,
      createdAt: payment.created_at,
      credit: Number(payment.amount),
      date: payment.payment_date,
      debit: 0,
      description: payment.notes || "Customer payment",
      entryType: "payment" as const,
      itemType: null,
      reference: payment.id,
    })),
  ];

  entries.sort((left, right) => {
    const dateDiff = left.date.localeCompare(right.date);

    if (dateDiff !== 0) {
      return dateDiff;
    }

    const createdDiff = left.createdAt.localeCompare(right.createdAt);

    if (createdDiff !== 0) {
      return createdDiff;
    }

    if (left.entryType === right.entryType) {
      return left.reference.localeCompare(right.reference);
    }

    return left.entryType === "bill" ? -1 : 1;
  });

  let balance = 0;
  const timeline = entries.map((entry) => {
    balance += entry.debit - entry.credit;

    return {
      balance,
      credit: entry.credit,
      date: entry.date,
      debit: entry.debit,
      description: entry.description,
      entryType: entry.entryType,
      itemType: entry.itemType,
      reference: entry.reference,
    };
  });

  return {
    customerId: customer.id,
    customerName: customer.name,
    entries: timeline,
  };
}

export async function getExposureReport() {
  const rows = await listOutstandingBillsBase();
  const totals = {
    diamond: 0,
    gold: 0,
  };

  rows.forEach((bill) => {
    const goldOutstanding = billOutstandingGoldAmount(bill);
    const diamondOutstanding = billOutstandingDiamondAmount(bill);
    const outstanding = goldOutstanding + diamondOutstanding;

    if (outstanding <= 0) {
      return;
    }

    totals.gold += goldOutstanding;
    totals.diamond += diamondOutstanding;
  });

  return {
    chartData: [
      { color: "#d97706", label: "Gold", value: totals.gold },
      { color: "#0284c7", label: "Diamond", value: totals.diamond },
    ],
    totals,
  };
}

export async function getPaymentAllocationReport(paymentId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("payments")
    .select(
      "id, payment_date, amount, notes, customers(name), payment_allocations(id, bill_id, allocated_to, amount_allocated, bills(bill_number))",
    )
    .eq("id", paymentId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const allocations = ((data.payment_allocations ?? []) as Array<{
    amount_allocated: number;
    allocated_to: "gold" | "diamond";
    bill_id: string;
    bills:
      | {
          bill_number: string;
        }
      | Array<{ bill_number: string }>
      | null;
    id: string;
  }>).map((allocation) => ({
    amountAllocated: Number(allocation.amount_allocated),
    billId: allocation.bill_id,
    billNumber:
      (Array.isArray(allocation.bills)
        ? allocation.bills[0]?.bill_number
        : allocation.bills?.bill_number) ?? "Unknown bill",
    itemType: allocation.allocated_to,
  }));
  const allocatedAmount = allocations.reduce((sum, allocation) => sum + allocation.amountAllocated, 0);
  const totalAmount = Number(data.amount);

  return {
    allocatedAmount,
    allocations,
    customerName: (data.customers as Array<{ name: string }> | null)?.[0]?.name ?? "Unknown customer",
    notes: data.notes as string | null,
    paymentAmount: totalAmount,
    paymentDate: data.payment_date as string,
    paymentId: data.id as string,
    unallocatedAmount: Math.max(totalAmount - allocatedAmount, 0),
  };
}

export async function getCalendarReport(month: string, customerId?: string): Promise<CalendarReport> {
  const monthRegex = /^\d{4}-(0[1-9]|1[0-2])$/;

  if (!monthRegex.test(month)) {
    throw new Error("Invalid month format. Expected YYYY-MM.");
  }

  const monthStart = `${month}-01`;
  const [yearPart, monthPart] = month.split("-");
  const startDate = new Date(Number(yearPart), Number(monthPart) - 1, 1);
  const nextMonthDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 1);
  const nextMonth = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, "0")}-01`;

  const supabase = await createSupabaseServerClient();
  let billsQuery = supabase
    .from("bills")
    .select(
      "id, bill_number, customer_id, bill_date, gold_amount, diamond_amount, amount_paid_gold, amount_paid_diamond, status, customers(name)",
    )
    .gte("bill_date", monthStart)
    .lt("bill_date", nextMonth)
    .order("bill_date", { ascending: true })
    .order("created_at", { ascending: true });

  let paymentsQuery = supabase
    .from("payments")
    .select(
      "id, customer_id, payment_date, amount, notes, customers(name), payment_allocations(id, bill_id, allocated_to, amount_allocated, bills(bill_number))",
    )
    .gte("payment_date", monthStart)
    .lt("payment_date", nextMonth)
    .order("payment_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (customerId) {
    billsQuery = billsQuery.eq("customer_id", customerId);
    paymentsQuery = paymentsQuery.eq("customer_id", customerId);
  }

  const [{ data: bills, error: billsError }, { data: payments, error: paymentsError }] =
    await Promise.all([billsQuery, paymentsQuery]);

  if (billsError) {
    throw billsError;
  }

  if (paymentsError) {
    throw paymentsError;
  }

  const daysByDate = new Map<string, CalendarDayEntry>();
  const ensureDay = (date: string) => {
    if (!daysByDate.has(date)) {
      daysByDate.set(date, {
        bills: [],
        date,
        payments: [],
      });
    }

    return daysByDate.get(date)!;
  };

  ((bills ?? []) as Array<{
    amount_paid_diamond: number;
    amount_paid_gold: number;
    bill_date: string;
    bill_number: string;
    customer_id: string;
    customers: { name: string } | Array<{ name: string }> | null;
    diamond_amount: number;
    gold_amount: number;
    id: string;
    status: "open" | "partial" | "closed";
  }>).forEach((bill) => {
    const day = ensureDay(bill.bill_date);
    const goldAmount = Number(bill.gold_amount);
    const diamondAmount = Number(bill.diamond_amount);
    const goldPaid = Number(bill.amount_paid_gold);
    const diamondPaid = Number(bill.amount_paid_diamond);

    day.bills.push({
      billDate: bill.bill_date,
      billId: bill.id,
      billNumber: bill.bill_number,
      customerId: bill.customer_id,
      customerName: getCustomerName(bill.customers),
      diamondAmount,
      diamondPaid,
      goldAmount,
      goldPaid,
      paidTotal: goldPaid + diamondPaid,
      status: bill.status,
      totalAmount: goldAmount + diamondAmount,
    });
  });

  ((payments ?? []) as Array<{
    amount: number;
    customer_id: string;
    customers: { name: string } | Array<{ name: string }> | null;
    id: string;
    notes: string | null;
    payment_allocations: Array<{
      allocated_to: "gold" | "diamond";
      amount_allocated: number;
      bill_id: string;
      bills:
        | {
            bill_number: string;
          }
        | Array<{ bill_number: string }>
        | null;
      id: string;
    }> | null;
    payment_date: string;
  }>).forEach((payment) => {
    const day = ensureDay(payment.payment_date);

    day.payments.push({
      allocations: (payment.payment_allocations ?? []).map((allocation) => ({
        allocatedTo: allocation.allocated_to,
        amountAllocated: Number(allocation.amount_allocated),
        billId: allocation.bill_id,
        billNumber:
          (Array.isArray(allocation.bills)
            ? allocation.bills[0]?.bill_number
            : allocation.bills?.bill_number) ?? "Unknown bill",
      })),
      amount: Number(payment.amount),
      customerId: payment.customer_id,
      customerName: getCustomerName(payment.customers),
      notes: payment.notes,
      paymentDate: payment.payment_date,
      paymentId: payment.id,
    });
  });

  return {
    days: Array.from(daysByDate.values()).sort((left, right) => left.date.localeCompare(right.date)),
    month,
  };
}

export function toCsv(rows: string[][]) {
  return rows
    .map((row) =>
      row
        .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
        .join(","),
    )
    .join("\n");
}