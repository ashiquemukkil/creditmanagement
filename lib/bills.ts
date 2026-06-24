import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type BillStatus = "open" | "partial" | "closed";
export type BillMetal = "gold" | "diamond";

export type BillRecord = {
  amount_paid_diamond: number;
  amount_paid_gold: number;
  bill_date: string;
  bill_number: string;
  created_at: string;
  created_by: string | null;
  customer_id: string;
  diamond_amount: number;
  diamond_due_date: string | null;
  due_date: string;
  gold_amount: number;
  gold_due_date: string | null;
  id: string;
  status: BillStatus;
};

export type BillDueDateEntry = {
  daysOverdue: number;
  dueDate: string;
  metal: BillMetal;
  outstandingAmount: number;
  totalAmount: number;
};

export type BillListItem = BillRecord & {
  customerName: string;
  daysOverdue: number;
  outstandingDiamondAmount: number;
  outstandingGoldAmount: number;
  outstandingTotalAmount: number;
  totalAmount: number;
};

type BillRow = BillRecord & {
  customer: {
    name: string;
  } | null;
};

type ListBillsFilters = {
  customerId?: string;
  groupId?: string;
  metal?: BillMetal;
  status?: BillStatus;
};

export function billTotalAmount(bill: Pick<BillRecord, "diamond_amount" | "gold_amount">) {
  return Number(bill.gold_amount) + Number(bill.diamond_amount);
}

export function billOutstandingGoldAmount(
  bill: Pick<BillRecord, "amount_paid_gold" | "gold_amount">,
) {
  return Math.max(Number(bill.gold_amount) - Number(bill.amount_paid_gold), 0);
}

export function billOutstandingDiamondAmount(
  bill: Pick<BillRecord, "amount_paid_diamond" | "diamond_amount">,
) {
  return Math.max(Number(bill.diamond_amount) - Number(bill.amount_paid_diamond), 0);
}

export function billOutstandingTotalAmount(
  bill: Pick<
    BillRecord,
    "amount_paid_diamond" | "amount_paid_gold" | "diamond_amount" | "gold_amount"
  >,
) {
  return billOutstandingGoldAmount(bill) + billOutstandingDiamondAmount(bill);
}

export function billMetals(
  bill: Pick<BillRecord, "diamond_amount" | "gold_amount">,
): BillMetal[] {
  const metals: BillMetal[] = [];

  if (Number(bill.gold_amount) > 0) {
    metals.push("gold");
  }

  if (Number(bill.diamond_amount) > 0) {
    metals.push("diamond");
  }

  return metals;
}

export function calculateDaysOverdue(dueDate: string | null) {
  if (!dueDate) {
    return 0;
  }

  const today = new Date();
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const due = new Date(`${dueDate}T00:00:00`).getTime();
  const difference = Math.floor((now - due) / (1000 * 60 * 60 * 24));

  return Math.max(difference, 0);
}

export function billDueDateEntries(
  bill: Pick<
    BillRecord,
    | "amount_paid_diamond"
    | "amount_paid_gold"
    | "diamond_amount"
    | "diamond_due_date"
    | "gold_amount"
    | "gold_due_date"
  >,
  options?: { outstandingOnly?: boolean },
): BillDueDateEntry[] {
  const entries: BillDueDateEntry[] = [];
  const goldOutstandingAmount = billOutstandingGoldAmount(bill);
  const diamondOutstandingAmount = billOutstandingDiamondAmount(bill);

  if (Number(bill.gold_amount) > 0 && bill.gold_due_date) {
    entries.push({
      daysOverdue: calculateDaysOverdue(bill.gold_due_date),
      dueDate: bill.gold_due_date,
      metal: "gold",
      outstandingAmount: goldOutstandingAmount,
      totalAmount: Number(bill.gold_amount),
    });
  }

  if (Number(bill.diamond_amount) > 0 && bill.diamond_due_date) {
    entries.push({
      daysOverdue: calculateDaysOverdue(bill.diamond_due_date),
      dueDate: bill.diamond_due_date,
      metal: "diamond",
      outstandingAmount: diamondOutstandingAmount,
      totalAmount: Number(bill.diamond_amount),
    });
  }

  if (options?.outstandingOnly) {
    return entries.filter((entry) => entry.outstandingAmount > 0);
  }

  return entries;
}

export function billDaysOverdue(
  bill: Pick<
    BillRecord,
    | "amount_paid_diamond"
    | "amount_paid_gold"
    | "diamond_amount"
    | "diamond_due_date"
    | "gold_amount"
    | "gold_due_date"
  >,
) {
  return billDueDateEntries(bill, { outstandingOnly: true }).reduce(
    (maxDays, entry) => Math.max(maxDays, entry.daysOverdue),
    0,
  );
}

export function billDueDateSortValue(
  bill: Pick<
    BillRecord,
    | "amount_paid_diamond"
    | "amount_paid_gold"
    | "diamond_amount"
    | "diamond_due_date"
    | "gold_amount"
    | "gold_due_date"
  >,
) {
  const outstandingEntries = billDueDateEntries(bill, { outstandingOnly: true });

  if (outstandingEntries.length > 0) {
    return outstandingEntries
      .map((entry) => entry.dueDate)
      .sort((left, right) => left.localeCompare(right))[0];
  }

  return billDueDateEntries(bill)
    .map((entry) => entry.dueDate)
    .sort((left, right) => left.localeCompare(right))[0] ?? null;
}

export async function getBillById(id: string): Promise<BillListItem | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("bills")
    .select(
      "id, bill_number, customer_id, customer:customer_id(name), bill_date, gold_amount, diamond_amount, gold_due_date, diamond_due_date, due_date, amount_paid_gold, amount_paid_diamond, status, created_at, created_by",
    )
    .eq("id", id)
    .single<BillRow>();

  if (error) {
    if (error.code === "PGRST116") {
      return null;
    }
    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    ...data,
    customerName: data.customer?.name ?? "Unknown customer",
    daysOverdue: billDaysOverdue(data),
    outstandingDiamondAmount: billOutstandingDiamondAmount(data),
    outstandingGoldAmount: billOutstandingGoldAmount(data),
    outstandingTotalAmount: billOutstandingTotalAmount(data),
    totalAmount: billTotalAmount(data),
  };
}

export async function listBills(filters: ListBillsFilters = {}): Promise<BillListItem[]> {
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("bills")
    .select(
      "id, bill_number, customer_id, customer:customer_id(name), bill_date, gold_amount, diamond_amount, gold_due_date, diamond_due_date, due_date, amount_paid_gold, amount_paid_diamond, status, created_at, created_by",
    )
    .order("bill_date", { ascending: false })
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

    query = query.in("customer_id", customerIds);
  }

  if (filters.metal) {
    query = query.gt(filters.metal === "gold" ? "gold_amount" : "diamond_amount", 0);
  }

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  const { data, error } = await query.overrideTypes<BillRow[]>();

  if (error) {
    throw error;
  }

  return ((data ?? []) as BillRow[]).map((bill) => ({
    ...bill,
    customerName: bill.customer?.name ?? "Unknown customer",
    daysOverdue: billDaysOverdue(bill),
    outstandingDiamondAmount: billOutstandingDiamondAmount(bill),
    outstandingGoldAmount: billOutstandingGoldAmount(bill),
    outstandingTotalAmount: billOutstandingTotalAmount(bill),
    totalAmount: billTotalAmount(bill),
  }));
}