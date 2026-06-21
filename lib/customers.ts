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
};

export type CustomerListItem = CustomerRecord & {
  totalOutstanding: number;
};

type BillOutstandingRow = {
  amount_paid_diamond: number;
  amount_paid_gold: number;
  customer_id: string;
  diamond_amount: number;
  gold_amount: number;
};

export async function listCustomers(): Promise<CustomerListItem[]> {
  const supabase = await createSupabaseServerClient();
  const [{ data: customers, error: customersError }, { data: bills, error: billsError }] =
    await Promise.all([
      supabase
        .from("customers")
        .select(
          "id, name, phone, address, gold_credit_days, diamond_credit_days, advance_amount, created_at, created_by",
        )
        .order("created_at", { ascending: false }),
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

  return ((customers ?? []) as CustomerRecord[]).map((customer) => ({
    ...customer,
    totalOutstanding: totalsByCustomer.get(customer.id) ?? 0,
  }));
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
      "id, name, phone, address, gold_credit_days, diamond_credit_days, advance_amount, created_at, created_by",
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
    ...(customer as CustomerRecord),
    totalOutstanding,
  };
}