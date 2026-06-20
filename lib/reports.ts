import "server-only";

import {
  billDaysOverdue,
  billDueDateEntries,
  billDueDateSortValue,
  billMetals,
  billOutstandingDiamondAmount,
  billOutstandingGoldAmount,
  billOutstandingTotalAmount,
  billTotalAmount,
} from "@/lib/bills";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AgingBucket = "current" | "1-15" | "16-30" | "31-60" | "60+";

export type OutstandingStatementRow = {
  amountOutstanding: number;
  diamondOutstanding: number;
  billId: string;
  billNumber: string;
  daysOverdue: number;
  dueDate: string;
  goldOutstanding: number;
  metalsLabel: string;
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
  customers: Array<{ name: string }> | null;
};

function formatDueDateLabel(bill: BillReportRow, outstandingOnly = false) {
  const entries = billDueDateEntries(bill, { outstandingOnly });

  if (entries.length === 0 && outstandingOnly) {
    return formatDueDateLabel(bill, false);
  }

  if (entries.length === 0) {
    return bill.due_date;
  }

  return entries
    .map((entry) => `${entry.metal}: ${entry.dueDate}`)
    .join(" / ");
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

async function listOutstandingBillsBase(customerId?: string) {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("bills")
    .select(
      "id, customer_id, bill_number, bill_date, gold_amount, diamond_amount, gold_due_date, diamond_due_date, due_date, amount_paid_gold, amount_paid_diamond, status, created_at, customers(name)",
    )
    .in("status", ["open", "partial"]);

  if (customerId) {
    query = query.eq("customer_id", customerId);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []) as BillReportRow[];
}

export async function getOutstandingStatement(customerId: string) {
  const rows = await listOutstandingBillsBase(customerId);
  const dueDateSortByBillId = new Map(rows.map((bill) => [bill.id, billDueDateSortValue(bill) ?? ""]));

  return rows
    .map((bill) => ({
      amountOutstanding: billOutstandingTotalAmount(bill),
      diamondOutstanding: billOutstandingDiamondAmount(bill),
      billId: bill.id,
      billNumber: bill.bill_number,
      daysOverdue: billDaysOverdue(bill),
      dueDate: formatDueDateLabel(bill, true),
      goldOutstanding: billOutstandingGoldAmount(bill),
      metalsLabel: billMetals(bill).join(" / "),
    }))
    .filter((bill) => bill.amountOutstanding > 0)
    .sort((left, right) => {
      if (right.daysOverdue !== left.daysOverdue) {
        return right.daysOverdue - left.daysOverdue;
      }

      const leftSortDate = dueDateSortByBillId.get(left.billId) ?? "";
      const rightSortDate = dueDateSortByBillId.get(right.billId) ?? "";

      return leftSortDate.localeCompare(rightSortDate);
    });
}

export async function getAgingReport() {
  const rows = await listOutstandingBillsBase();
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
        customerName: bill.customers?.[0]?.name ?? "Unknown customer",
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

export async function getCustomerLedger(customerId: string) {
  const supabase = await createSupabaseServerClient();
  const [{ data: customer, error: customerError }, { data: bills, error: billsError }, { data: payments, error: paymentsError }] =
    await Promise.all([
      supabase.from("customers").select("id, name").eq("id", customerId).maybeSingle(),
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

  if (!customer) {
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
    bills: Array<{ bill_number: string }> | null;
    id: string;
  }>).map((allocation) => ({
    amountAllocated: Number(allocation.amount_allocated),
    billId: allocation.bill_id,
    billNumber: allocation.bills?.[0]?.bill_number ?? "Unknown bill",
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

export function toCsv(rows: string[][]) {
  return rows
    .map((row) =>
      row
        .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
        .join(","),
    )
    .join("\n");
}