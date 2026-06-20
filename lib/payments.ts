import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PaymentRecord = {
  amount: number;
  created_at: string;
  created_by: string | null;
  customer_id: string;
  id: string;
  notes: string | null;
  payment_date: string;
};

export type PaymentAllocationRecord = {
  amount_allocated: number;
  allocated_to: "gold" | "diamond";
  bill_id: string;
  bills: Array<{
    bill_number: string;
  }> | null;
  created_at: string;
  id: string;
};

export type PaymentListItem = PaymentRecord & {
  allocatedAmount: number;
  allocationStatus: "advance balance" | "fully allocated" | "partially allocated" | "unallocated";
  allocations: Array<{
    amountAllocated: number;
    billId: string;
    billNumber: string;
    itemType: "gold" | "diamond";
  }>;
  customerName: string;
  unallocatedAmount: number;
};

type PaymentRow = PaymentRecord & {
  payment_allocations: PaymentAllocationRecord[] | null;
  customers: Array<{
    name: string;
  }> | null;
};

type ListPaymentsFilters = {
  customerId?: string;
  paymentId?: string;
};

export async function listPayments(filters: ListPaymentsFilters = {}): Promise<PaymentListItem[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("payments")
    .select(
      "id, customer_id, payment_date, amount, notes, created_at, created_by, customers(name), payment_allocations(id, bill_id, allocated_to, amount_allocated, created_at, bills(bill_number))",
    )
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (filters.customerId) {
    query = query.eq("customer_id", filters.customerId);
  }

  if (filters.paymentId) {
    query = query.eq("id", filters.paymentId);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return ((data ?? []) as PaymentRow[]).map((payment) => {
    const paymentAmount = Number(payment.amount);
    const allocations = (payment.payment_allocations ?? []).map((allocation) => ({
      amountAllocated: Number(allocation.amount_allocated),
      billId: allocation.bill_id,
      billNumber: allocation.bills?.[0]?.bill_number ?? "Unknown bill",
      itemType: allocation.allocated_to,
    }));
    const allocatedAmount = allocations.reduce(
      (sum, allocation) => sum + allocation.amountAllocated,
      0,
    );
    const unallocatedAmount = Math.max(paymentAmount - allocatedAmount, 0);

    return {
      ...payment,
      allocatedAmount,
      allocationStatus:
        allocations.length === 0
          ? "unallocated"
          : unallocatedAmount > 0
            ? "advance balance"
            : "fully allocated",
      allocations,
      customerName: payment.customers?.[0]?.name ?? "Unknown customer",
      unallocatedAmount,
    };
  });
}

export async function listPaymentOptions(): Promise<
  Array<{
    amount: number;
    customerName: string;
    id: string;
    paymentDate: string;
  }>
> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("payments")
    .select("id, amount, payment_date, customers(name)")
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return ((data ?? []) as Array<{
    amount: number;
    customers: Array<{ name: string }> | null;
    id: string;
    payment_date: string;
  }>).map((payment) => ({
    amount: Number(payment.amount),
    customerName: payment.customers?.[0]?.name ?? "Unknown customer",
    id: payment.id,
    paymentDate: payment.payment_date,
  }));
}