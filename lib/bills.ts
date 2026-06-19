import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type BillItemType = "gold" | "diamond";
export type BillStatus = "open" | "partial" | "closed";

export type BillRecord = {
  amount: number;
  amount_paid: number;
  bill_date: string;
  bill_number: string;
  created_at: string;
  created_by: string | null;
  customer_id: string;
  due_date: string;
  id: string;
  item_type: BillItemType;
  status: BillStatus;
};

export type BillListItem = BillRecord & {
  customerName: string;
  daysOverdue: number;
};

type BillRow = BillRecord & {
  customers: Array<{
    name: string;
  }> | null;
};

type ListBillsFilters = {
  customerId?: string;
  itemType?: BillItemType;
  status?: BillStatus;
};

function calculateDaysOverdue(dueDate: string) {
  const today = new Date();
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const due = new Date(`${dueDate}T00:00:00`).getTime();
  const difference = Math.floor((now - due) / (1000 * 60 * 60 * 24));

  return Math.max(difference, 0);
}

export async function listBills(filters: ListBillsFilters = {}): Promise<BillListItem[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("bills")
    .select(
      "id, bill_number, customer_id, item_type, bill_date, amount, due_date, amount_paid, status, created_at, created_by, customers(name)",
    )
    .order("bill_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (filters.customerId) {
    query = query.eq("customer_id", filters.customerId);
  }

  if (filters.itemType) {
    query = query.eq("item_type", filters.itemType);
  }

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return ((data ?? []) as BillRow[]).map((bill) => ({
    ...bill,
    customerName: bill.customers?.[0]?.name ?? "Unknown customer",
    daysOverdue: calculateDaysOverdue(bill.due_date),
  }));
}