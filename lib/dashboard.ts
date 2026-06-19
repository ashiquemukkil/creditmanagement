import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

type OutstandingBillRow = {
  amount: number;
  amount_paid: number;
  bill_date: string;
  bill_number: string;
  created_at: string;
  customer_id: string;
  customers: Array<{ name: string }> | null;
  due_date: string;
  id: string;
  item_type: "gold" | "diamond";
  status: "open" | "partial" | "closed";
};

type RecentPaymentRow = {
  amount: number;
  created_at: string;
  customer_id: string;
  customers: Array<{ name: string }> | null;
  id: string;
  notes: string | null;
  payment_date: string;
};

function startOfToday() {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
}

function calculateDaysOverdue(dueDate: string) {
  const due = new Date(`${dueDate}T00:00:00`).getTime();
  return Math.max(Math.floor((startOfToday() - due) / (1000 * 60 * 60 * 24)), 0);
}

function remainingAmount(amount: number, amountPaid: number) {
  return Math.max(Number(amount) - Number(amountPaid), 0);
}

export async function getDashboardSnapshot() {
  const supabase = await createSupabaseServerClient();
  const [{ data: bills, error: billsError }, { data: payments, error: paymentsError }] =
    await Promise.all([
      supabase
        .from("bills")
        .select(
          "id, customer_id, bill_number, bill_date, due_date, item_type, amount, amount_paid, status, created_at, customers(name)",
        )
        .in("status", ["open", "partial"]),
      supabase
        .from("payments")
        .select("id, customer_id, payment_date, amount, notes, created_at, customers(name)")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

  if (billsError) {
    throw billsError;
  }

  if (paymentsError) {
    throw paymentsError;
  }

  const outstandingBills = (bills ?? []) as OutstandingBillRow[];
  const recentPayments = (payments ?? []) as RecentPaymentRow[];

  const totalOutstanding = outstandingBills.reduce(
    (sum, bill) => sum + remainingAmount(Number(bill.amount), Number(bill.amount_paid)),
    0,
  );

  const overdueBills = outstandingBills.filter(
    (bill) => remainingAmount(Number(bill.amount), Number(bill.amount_paid)) > 0 && calculateDaysOverdue(bill.due_date) > 0,
  );

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

  overdueBills.forEach((bill) => {
    const current = topOverdueMap.get(bill.customer_id) ?? {
      customerId: bill.customer_id,
      customerName: bill.customers?.[0]?.name ?? "Unknown customer",
      maxDaysOverdue: 0,
      overdueBillCount: 0,
      totalOutstanding: 0,
    };
    const outstanding = remainingAmount(Number(bill.amount), Number(bill.amount_paid));
    const daysOverdue = calculateDaysOverdue(bill.due_date);

    current.maxDaysOverdue = Math.max(current.maxDaysOverdue, daysOverdue);
    current.overdueBillCount += 1;
    current.totalOutstanding += outstanding;
    topOverdueMap.set(bill.customer_id, current);
  });

  const recentBills = outstandingBills
    .slice()
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
    .slice(0, 10)
    .map((bill) => ({
      amount: Number(bill.amount),
      createdAt: bill.created_at,
      customerId: bill.customer_id,
      customerName: bill.customers?.[0]?.name ?? "Unknown customer",
      date: bill.bill_date,
      description: `${bill.item_type} bill ${bill.bill_number}`,
      id: bill.id,
      type: "bill" as const,
    }));

  const activity = [...recentBills, ...recentPayments.map((payment) => ({
    amount: Number(payment.amount),
    createdAt: payment.created_at,
    customerId: payment.customer_id,
    customerName: payment.customers?.[0]?.name ?? "Unknown customer",
    date: payment.payment_date,
    description: payment.notes || "Customer payment",
    id: payment.id,
    type: "payment" as const,
  }))]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 10);

  return {
    overdueBillCount: overdueBills.length,
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