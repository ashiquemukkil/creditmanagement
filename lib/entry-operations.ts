import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type BillEntryInput = {
  billDate: string;
  billNumber: string;
  customerId: string;
  diamondAmount: number;
  goldAmount: number;
};

export type PaymentEntryInput = {
  amount: number;
  customerId: string;
  notes: string | null;
  paymentDate: string;
};

export function parseBillEntryInput(input: {
  billDate: string;
  billNumber: string;
  customerId: string;
  diamondAmount: number | string;
  goldAmount: number | string;
}): BillEntryInput {
  const customerId = String(input.customerId || "").trim();
  const billNumber = String(input.billNumber || "").trim();
  const billDate = String(input.billDate || "").trim();
  const goldAmount = Number(input.goldAmount || 0);
  const diamondAmount = Number(input.diamondAmount || 0);

  if (!customerId) {
    throw new Error("Please choose a customer from the list.");
  }

  if (!billNumber) {
    throw new Error("Bill number is required.");
  }

  if (!billDate || Number.isNaN(new Date(`${billDate}T00:00:00`).getTime())) {
    throw new Error("Bill date is required.");
  }

  if (!Number.isFinite(goldAmount) || goldAmount < 0) {
    throw new Error("Gold amount must be zero or greater.");
  }

  if (!Number.isFinite(diamondAmount) || diamondAmount < 0) {
    throw new Error("Diamond amount must be zero or greater.");
  }

  if (goldAmount <= 0 && diamondAmount <= 0) {
    throw new Error("Enter a gold amount, diamond amount, or both.");
  }

  return {
    billDate,
    billNumber,
    customerId,
    diamondAmount: Number(diamondAmount.toFixed(2)),
    goldAmount: Number(goldAmount.toFixed(2)),
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

  const billDateValue = new Date(`${input.billDate}T00:00:00`);
  const buildDueDate = (creditDays: number) => {
    const dueDateValue = new Date(billDateValue);
    dueDateValue.setDate(dueDateValue.getDate() + creditDays);

    return dueDateValue.toISOString().slice(0, 10);
  };
  const goldDueDate = input.goldAmount > 0 ? buildDueDate(customer.gold_credit_days) : null;
  const diamondDueDate =
    input.diamondAmount > 0 ? buildDueDate(customer.diamond_credit_days) : null;
  const dueDate =
    goldDueDate && diamondDueDate
      ? (goldDueDate > diamondDueDate ? goldDueDate : diamondDueDate)
      : (goldDueDate ?? diamondDueDate);

  if (!dueDate) {
    throw new Error("Unable to compute bill due date.");
  }

  const { data, error } = await db
    .from("bills")
    .insert({
      amount_paid_diamond: 0,
      amount_paid_gold: 0,
      bill_date: input.billDate,
      bill_number: input.billNumber,
      created_by: createdById,
      customer_id: input.customerId,
      diamond_amount: input.diamondAmount,
      diamond_due_date: diamondDueDate,
      due_date: dueDate,
      gold_amount: input.goldAmount,
      gold_due_date: goldDueDate,
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
  createdById: string,
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

  if (!data || typeof data !== "string") {
    throw new Error("Payment could not be created.");
  }

  return {
    customerId: input.customerId,
    paymentId: data,
  };
}