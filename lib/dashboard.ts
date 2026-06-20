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
  payment_date: string;
};

export async function getDashboardSnapshot() {
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
        .select("id, customer_id, customer:customer_id(name), payment_date, amount, notes, created_at")
        .order("created_at", { ascending: false })
        .limit(10)
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
  let totalOutstanding = 0;
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

  const recentBills = outstandingBills.slice(0, 10).map((bill) => ({
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
    totalOutstanding += outstanding;

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
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 10);

  return {
    overdueBillCount,
    recentActivity: activity,
    topOverdueCustomers: Array.from(topOverdueMap.values())
      .sort(
        (left, right) =>
          right.maxDaysOverdue - left.maxDaysOverdue || right.totalOutstanding - left.totalOutstanding,
      )
      .slice(0, 5),
    totalOutstanding,
  };
}