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

  return ((data ?? []) as PaymentRow[]).map((payment) => ({
    ...payment,
    allocatedAmount: (payment.payment_allocations ?? []).reduce(
      (sum, allocation) => sum + Number(allocation.amount_allocated),
      0,
    ),
    allocations: (payment.payment_allocations ?? []).map((allocation) => ({
      amountAllocated: Number(allocation.amount_allocated),
      billId: allocation.bill_id,
      billNumber: allocation.bills?.bill_number ?? "Unknown bill",
      itemType: allocation.allocated_to,
    })),
    customerName: payment.customers?.name ?? "Unknown customer",
    unallocatedAmount: Math.max(
      Number(payment.amount) -
        (payment.payment_allocations ?? []).reduce(
          (sum, allocation) => sum + Number(allocation.amount_allocated),
          0,
        ),
      0,
    ),
    allocationStatus:
      (payment.payment_allocations ?? []).length === 0
        ? "unallocated"
        : Math.max(
              Number(payment.amount) -
                (payment.payment_allocations ?? []).reduce(
                  (sum, allocation) => sum + Number(allocation.amount_allocated),
                  0,
                ),
              0,
            ) > 0
          ? "advance balance"
          : "fully allocated",
  }));
}

export async function listPaymentOptions(): Promise<
  Array<{
    amount: number;
    customerName: string;
    id: string;
    paymentDate: string;
  }>
> {
  const payments = await listPayments();

  return payments.map((payment) => ({
    amount: Number(payment.amount),
    customerName: payment.customerName,
    id: payment.id,
    paymentDate: payment.payment_date,
  }));
}