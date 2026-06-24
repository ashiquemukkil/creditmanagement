import "server-only";

import { billOutstandingTotalAmount } from "@/lib/bills";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CustomerRecord = {
  address: string | null;
  advance_amount: number;
  created_at: string;
  created_by: string | null;
  diamond_credit_days: number;
  gold_credit_days: number;
  id: string;
  name: string;
  phone: string | null;
  group_id: string | null;
  groups?: { category: string; sub_category: string } | null;
};

export type CustomerListItem = CustomerRecord & {
  totalOutstanding: number;
};

export type PaginatedResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

type GroupRelation = { category: string; sub_category: string };

type SupabaseCustomerRow = Omit<CustomerRecord, "groups"> & {
  groups?: GroupRelation | GroupRelation[] | null;
};

type BillOutstandingRow = {
  amount_paid_diamond: number;
  amount_paid_gold: number;
  customer_id: string;
  diamond_amount: number;
  gold_amount: number;
};

type ListCustomersFilters = {
  groupId?: string;
};

function normalizeCustomerRow(customer: SupabaseCustomerRow): CustomerRecord {
  const groupValue = Array.isArray(customer.groups)
    ? (customer.groups[0] ?? null)
    : (customer.groups ?? null);

  return {
    ...customer,
    groups: groupValue,
  };
}

export async function listCustomers(filters: ListCustomersFilters = {}): Promise<CustomerListItem[]> {
  const supabase = await createSupabaseServerClient();
  let customersQuery = supabase
    .from("customers")
    .select(
      "id, name, phone, address, gold_credit_days, diamond_credit_days, advance_amount, created_at, created_by, group_id, groups(category, sub_category)",
    )
    .order("created_at", { ascending: false });

  if (filters.groupId) {
    customersQuery = customersQuery.eq("group_id", filters.groupId);
  }

  const [{ data: customers, error: customersError }, { data: bills, error: billsError }] =
    await Promise.all([
      customersQuery,
      supabase
        .from("bills")
        .select("customer_id, gold_amount, diamond_amount, amount_paid_gold, amount_paid_diamond")
        .in("status", ["open", "partial"]),
    ]);

  if (customersError) {
    throw customersError;
  }

  if (billsError) {
    throw billsError;
  }

  const totalsByCustomer = new Map<string, number>();

  ((bills ?? []) as BillOutstandingRow[]).forEach((bill) => {
    const remaining = billOutstandingTotalAmount(bill);
    totalsByCustomer.set(
      bill.customer_id,
      (totalsByCustomer.get(bill.customer_id) ?? 0) + remaining,
    );
  });

  return ((customers ?? []) as SupabaseCustomerRow[]).map((customer) => {
    const normalized = normalizeCustomerRow(customer);

    return {
      ...normalized,
      totalOutstanding: totalsByCustomer.get(normalized.id) ?? 0,
    };
  });
}

export async function listCustomersPaginated(
  filters: ListCustomersFilters & { page: number; pageSize: number },
): Promise<PaginatedResult<CustomerListItem>> {
  const pageSize = Math.max(1, Math.floor(filters.pageSize));
  const allCustomers = await listCustomers({ groupId: filters.groupId });
  const totalCount = allCustomers.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const page = Math.min(Math.max(1, Math.floor(filters.page)), totalPages);
  const start = (page - 1) * pageSize;

  return {
    items: allCustomers.slice(start, start + pageSize),
    page,
    pageSize,
    totalCount,
    totalPages,
  };
}

export async function listCustomerOptions(): Promise<Array<{ id: string; name: string; phone: string | null }>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("customers")
    .select("id, name, phone")
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as Array<{ id: string; name: string; phone: string | null }>;
}

export async function getCustomerById(customerId: string): Promise<CustomerListItem | null> {
  const supabase = await createSupabaseServerClient();
  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select(
      "id, name, phone, address, gold_credit_days, diamond_credit_days, advance_amount, created_at, created_by, group_id, groups(category, sub_category)",
    )
    .eq("id", customerId)
    .maybeSingle();

  if (customerError) {
    throw customerError;
  }

  if (!customer) {
    return null;
  }

  const { data: bills, error: billsError } = await supabase
    .from("bills")
    .select("gold_amount, diamond_amount, amount_paid_gold, amount_paid_diamond")
    .eq("customer_id", customerId)
    .in("status", ["open", "partial"]);

  if (billsError) {
    throw billsError;
  }

  const totalOutstanding = ((bills ?? []) as Array<{
    amount_paid_diamond: number;
    amount_paid_gold: number;
    diamond_amount: number;
    gold_amount: number;
  }>).reduce(
    (sum, bill) => sum + billOutstandingTotalAmount(bill),
    0,
  );

  return {
    ...normalizeCustomerRow(customer as SupabaseCustomerRow),
    totalOutstanding,
  };
}