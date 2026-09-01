import "server-only";

import { billDaysOverdue, billOutstandingTotalAmount, billTotalAmount } from "@/lib/bills";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type OutstandingBillRow = {
  amount_paid_diamond: number;
  amount_paid_gold: number;
  bill_date: string;
  bill_number: string;
  created_at: string;
  customer: { name: string } | null;
  customer_id: string;
  diamond_amount: number;
  diamond_due_date: string | null;
  due_date: string;
  id: string;
  gold_amount: number;
  gold_due_date: string | null;
  status: "open" | "partial" | "closed";
};

type RecentPaymentRow = {
  amount: number;
  customer: { name: string } | null;
  created_at: string;
  customer_id: string;
  id: string;
  notes: string | null;
  payment_allocations:
    | Array<{
        amount_allocated: number;
      }>
    | null;
  payment_date: string;
};

type DashboardSnapshotOptions = {
  activityPage?: number;
  activityPageSize?: number;
  overduePage?: number;
  overduePageSize?: number;
};

export async function getDashboardSnapshot(options: DashboardSnapshotOptions = {}) {
  const activityPageSize = Math.max(1, Math.floor(options.activityPageSize ?? 10));
  const overduePageSize = Math.max(1, Math.floor(options.overduePageSize ?? 5));
  const supabase = await createSupabaseServerClient();
  const [{ data: bills, error: billsError }, { data: payments, error: paymentsError }] =
    await Promise.all([
      supabase
        .from("bills")
        .select(
          "id, customer_id, customer:customer_id(name), bill_number, bill_date, gold_amount, diamond_amount, gold_due_date, diamond_due_date, due_date, amount_paid_gold, amount_paid_diamond, status, created_at",
        )
        .in("status", ["open", "partial"])
        .order("created_at", { ascending: false })
        .overrideTypes<OutstandingBillRow[]>(),
      supabase
        .from("payments")
        .select(
          "id, customer_id, customer:customer_id(name), payment_date, amount, notes, created_at, payment_allocations(amount_allocated)",
        )
        .order("created_at", { ascending: false })
        .overrideTypes<RecentPaymentRow[]>(),
    ]);

  if (billsError) {
    throw billsError;
  }

  if (paymentsError) {
    throw paymentsError;
  }

  const outstandingBills = (bills ?? []) as OutstandingBillRow[];
  const recentPayments = (payments ?? []) as RecentPaymentRow[];
  let grossOutstanding = 0;
  let totalAdvanceBalance = 0;
  let overdueBillCount = 0;

  const topOverdueMap = new Map<
    string,
    {
      customerId: string;
      customerName: string;
      maxDaysOverdue: number;
      overdueBillCount: number;
      totalOutstanding: number;
    }
  >();

  const recentBills = outstandingBills.map((bill) => ({
    amount: billTotalAmount(bill),
    createdAt: bill.created_at,
    customerId: bill.customer_id,
    customerName: bill.customer?.name ?? "Unknown customer",
    date: bill.bill_date,
    description: `${bill.bill_number}`,
    id: bill.id,
    type: "bill" as const,
  }));

  outstandingBills.forEach((bill) => {
    const outstanding = billOutstandingTotalAmount(bill);
    grossOutstanding += outstanding;

    if (outstanding <= 0) {
      return;
    }

    const daysOverdue = billDaysOverdue(bill);

    if (daysOverdue <= 0) {
      return;
    }

    overdueBillCount += 1;
    const current = topOverdueMap.get(bill.customer_id) ?? {
      customerId: bill.customer_id,
      customerName: bill.customer?.name ?? "Unknown customer",
      maxDaysOverdue: 0,
      overdueBillCount: 0,
      totalOutstanding: 0,
    };

    current.maxDaysOverdue = Math.max(current.maxDaysOverdue, daysOverdue);
    current.overdueBillCount += 1;
    current.totalOutstanding += outstanding;
    topOverdueMap.set(bill.customer_id, current);
  });

  recentPayments.forEach((payment) => {
    const allocatedAmount = (payment.payment_allocations ?? []).reduce((sum, allocation) => {
      return sum + Number(allocation.amount_allocated);
    }, 0);

    totalAdvanceBalance += Math.max(Number(payment.amount) - allocatedAmount, 0);
  });

  const totalOutstanding = Math.max(grossOutstanding - totalAdvanceBalance, 0);

  const activity = [...recentBills, ...recentPayments.map((payment) => ({
    amount: Number(payment.amount),
    createdAt: payment.created_at,
    customerId: payment.customer_id,
    customerName: payment.customer?.name ?? "Unknown customer",
    date: payment.payment_date,
    description: payment.notes || "Customer payment",
    id: payment.id,
    type: "payment" as const,
  }))]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  const topOverdueCustomers = Array.from(topOverdueMap.values()).sort(
    (left, right) =>
      right.maxDaysOverdue - left.maxDaysOverdue || right.totalOutstanding - left.totalOutstanding,
  );

  const overdueTotalCount = topOverdueCustomers.length;
  const overdueTotalPages = Math.max(1, Math.ceil(overdueTotalCount / overduePageSize));
  const overduePage = Math.min(Math.max(1, Math.floor(options.overduePage ?? 1)), overdueTotalPages);
  const overdueOffset = (overduePage - 1) * overduePageSize;

  const recentActivityTotalCount = activity.length;
  const recentActivityTotalPages = Math.max(1, Math.ceil(recentActivityTotalCount / activityPageSize));
  const recentActivityPage = Math.min(
    Math.max(1, Math.floor(options.activityPage ?? 1)),
    recentActivityTotalPages,
  );
  const recentActivityOffset = (recentActivityPage - 1) * activityPageSize;

  return {
    overdueBillCount,
    recentActivity: activity.slice(recentActivityOffset, recentActivityOffset + activityPageSize),
    recentActivityPage,
    recentActivityPageSize: activityPageSize,
    recentActivityTotalCount,
    recentActivityTotalPages,
    topOverdueCustomers: topOverdueCustomers.slice(overdueOffset, overdueOffset + overduePageSize),
    topOverduePage: overduePage,
    topOverduePageSize: overduePageSize,
    topOverdueTotalCount: overdueTotalCount,
    topOverdueTotalPages: overdueTotalPages,
    totalOutstanding,
  };
}