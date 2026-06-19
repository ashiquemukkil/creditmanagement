import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { BillItemType } from "@/lib/bills";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type BillEntryInput = {
  amount: number;
  billDate: string;
  billNumber: string;
  customerId: string;
  itemType: BillItemType;
};

export type PaymentEntryInput = {
  amount: number;
  customerId: string;
  notes: string | null;
  paymentDate: string;
};

export function parseBillEntryInput(input: {
  amount: number | string;
  billDate: string;
  billNumber: string;
  customerId: string;
  itemType: string;
}): BillEntryInput {
  const customerId = String(input.customerId || "").trim();
  const billNumber = String(input.billNumber || "").trim();
  const itemType = String(input.itemType || "").trim() as BillItemType;
  const billDate = String(input.billDate || "").trim();
  const amount = Number(input.amount || 0);

  if (!customerId) {
    throw new Error("Please choose a customer from the list.");
  }

  if (!billNumber) {
    throw new Error("Bill number is required.");
  }

  if (itemType !== "gold" && itemType !== "diamond") {
    throw new Error("Item type must be gold or diamond.");
  }

  if (!billDate || Number.isNaN(new Date(`${billDate}T00:00:00`).getTime())) {
    throw new Error("Bill date is required.");
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Amount must be greater than zero.");
  }

  return {
    amount: Number(amount.toFixed(2)),
    billDate,
    billNumber,
    customerId,
    itemType,
  };
}

export function parsePaymentEntryInput(input: {
  amount: number | string;
  customerId: string;
  notes?: string | null;
  paymentDate: string;
}): PaymentEntryInput {
  const customerId = String(input.customerId || "").trim();
  const paymentDate = String(input.paymentDate || "").trim();
  const amount = Number(input.amount || 0);
  const notes = String(input.notes || "").trim();

  if (!customerId) {
    throw new Error("Please choose a customer from the list.");
  }

  if (!paymentDate || Number.isNaN(new Date(`${paymentDate}T00:00:00`).getTime())) {
    throw new Error("Payment date is required.");
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Amount must be greater than zero.");
  }

  return {
    amount: Number(amount.toFixed(2)),
    customerId,
    notes: notes || null,
    paymentDate,
  };
}

export async function listExistingBillNumbers() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("bills").select("bill_number");

  if (error) {
    throw error;
  }

  return ((data ?? []) as Array<{ bill_number: string }>).map((row) => row.bill_number);
}

export async function createBillFromEntry(
  input: BillEntryInput,
  createdById: string,
  supabase?: SupabaseClient,
) {
  const db = supabase ?? (await createSupabaseServerClient());
  const { data: customer, error: customerError } = await db
    .from("customers")
    .select("id, gold_credit_days, diamond_credit_days")
    .eq("id", input.customerId)
    .maybeSingle();

  if (customerError) {
    throw customerError;
  }

  if (!customer) {
    throw new Error("Selected customer was not found.");
  }

  const { data: existingBill, error: existingBillError } = await db
    .from("bills")
    .select("id")
    .eq("bill_number", input.billNumber)
    .maybeSingle();

  if (existingBillError) {
    throw existingBillError;
  }

  if (existingBill) {
    throw new Error("Bill number already exists.");
  }

  const creditDays = input.itemType === "gold" ? customer.gold_credit_days : customer.diamond_credit_days;
  const dueDateValue = new Date(`${input.billDate}T00:00:00`);
  dueDateValue.setDate(dueDateValue.getDate() + creditDays);
  const dueDate = dueDateValue.toISOString().slice(0, 10);

  const { data, error } = await db
    .from("bills")
    .insert({
      amount: input.amount,
      amount_paid: 0,
      bill_date: input.billDate,
      bill_number: input.billNumber,
      created_by: createdById,
      customer_id: input.customerId,
      due_date: dueDate,
      item_type: input.itemType,
      status: "open",
    })
    .select("id, customer_id, bill_number")
    .single();

  if (error) {
    throw error;
  }

  return {
    billId: data.id,
    billNumber: data.bill_number,
    customerId: data.customer_id,
  };
}

export async function createPaymentFromEntry(
  input: PaymentEntryInput,
  supabase?: SupabaseClient,
) {
  const db = supabase ?? (await createSupabaseServerClient());
  const { data: customer, error: customerError } = await db
    .from("customers")
    .select("id")
    .eq("id", input.customerId)
    .maybeSingle();

  if (customerError) {
    throw customerError;
  }

  if (!customer) {
    throw new Error("Selected customer was not found.");
  }

  const { data, error } = await db.rpc("create_payment_with_allocations", {
    p_amount: input.amount,
    p_customer_id: input.customerId,
    p_notes: input.notes,
    p_payment_date: input.paymentDate,
  });

  if (error) {
    throw error;
  }

  return {
    customerId: input.customerId,
    paymentId: data as string,
  };
}