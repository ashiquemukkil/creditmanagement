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
  bills:
    | {
        bill_number: string;
      }
    | Array<{
        bill_number: string;
      }>
    | null;
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

export type PaginatedPaymentsResult = {
  items: PaymentListItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

type CustomerRelation = { name: string } | Array<{ name: string }> | null;

type PaymentRow = PaymentRecord & {
  payment_allocations: PaymentAllocationRecord[] | null;
  customer: CustomerRelation;
};

type ListPaymentsFilters = {
  customerId?: string;
  groupId?: string;
  paymentId?: string;
};

function readCustomerName(customer: CustomerRelation) {
  if (Array.isArray(customer)) {
    return customer[0]?.name ?? "Unknown customer";
  }

  return customer?.name ?? "Unknown customer";
}

export async function listPayments(filters: ListPaymentsFilters = {}): Promise<PaymentListItem[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("payments")
    .select(
      "id, customer_id, payment_date, amount, notes, created_at, created_by, customer:customer_id(name), payment_allocations(id, bill_id, allocated_to, amount_allocated, created_at, bills(bill_number))",
    )
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (filters.customerId) {
    query = query.eq("customer_id", filters.customerId);
  }

  if (filters.groupId) {
    const { data: customers, error: customersError } = await supabase
      .from("customers")
      .select("id")
      .eq("group_id", filters.groupId);

    if (customersError) {
      throw customersError;
    }

    const customerIds = (customers ?? []).map((customer) => customer.id);

    if (customerIds.length === 0) {
      return [];
    }

    if (filters.customerId && !customerIds.includes(filters.customerId)) {
      return [];
    }

    query = query.in("customer_id", customerIds);
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
      // Supabase may return nested foreign rows as either an object or an array.
      // Handle both shapes so bill numbers render correctly in breakdowns.
      amountAllocated: Number(allocation.amount_allocated),
      billId: allocation.bill_id,
      billNumber:
        (Array.isArray(allocation.bills)
          ? allocation.bills[0]?.bill_number
          : allocation.bills?.bill_number) ?? "Unknown bill",
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
      customerName: readCustomerName(payment.customer),
      unallocatedAmount,
    };
  });
}

export async function listPaymentsPaginated(
  filters: ListPaymentsFilters & { page: number; pageSize: number },
): Promise<PaginatedPaymentsResult> {
  const pageSize = Math.max(1, Math.floor(filters.pageSize));
  const allPayments = await listPayments(filters);
  const totalCount = allPayments.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const page = Math.min(Math.max(1, Math.floor(filters.page)), totalPages);
  const start = (page - 1) * pageSize;

  return {
    items: allPayments.slice(start, start + pageSize),
    page,
    pageSize,
    totalCount,
    totalPages,
  };
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
    .select("id, amount, payment_date, customer:customer_id(name)")
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return ((data ?? []) as Array<{
    amount: number;
    customer: CustomerRelation;
    id: string;
    payment_date: string;
  }>).map((payment) => ({
    amount: Number(payment.amount),
    customerName: readCustomerName(payment.customer),
    id: payment.id,
    paymentDate: payment.payment_date,
  }));
}