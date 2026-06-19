"use server";

import { revalidatePath } from "next/cache";

import { requireTeamMember } from "@/lib/auth";
import { type ActionResult, getActionErrorMessage } from "@/lib/action-result";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function readCustomerInput(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const address = String(formData.get("address") || "").trim();
  const goldCreditDays = Number(formData.get("gold_credit_days") || 0);
  const diamondCreditDays = Number(formData.get("diamond_credit_days") || 0);

  if (!name) {
    throw new Error("Customer name is required.");
  }

  if (
    !Number.isInteger(goldCreditDays) ||
    !Number.isInteger(diamondCreditDays) ||
    goldCreditDays < 0 ||
    diamondCreditDays < 0
  ) {
    throw new Error("Credit days must be whole numbers greater than or equal to zero.");
  }

  return {
    address: address || null,
    diamond_credit_days: diamondCreditDays,
    gold_credit_days: goldCreditDays,
    name,
    phone: phone || null,
  };
}

export async function createCustomerAction(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireTeamMember();
    const payload = readCustomerInput(formData);
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("customers")
      .insert({
        ...payload,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (error) {
      throw error;
    }

    revalidatePath("/customers");

    return {
      message: "Customer created.",
      ok: true,
      redirectTo: `/customers/${data.id}`,
    };
  } catch (error) {
    return {
      message: getActionErrorMessage(error),
      ok: false,
    };
  }
}

export async function updateCustomerAction(formData: FormData): Promise<ActionResult> {
  try {
    await requireTeamMember();
    const customerId = String(formData.get("customerId") || "").trim();

    if (!customerId) {
      throw new Error("Customer ID is required.");
    }

    const payload = readCustomerInput(formData);
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("customers").update(payload).eq("id", customerId);

    if (error) {
      throw error;
    }

    revalidatePath("/customers");
    revalidatePath(`/customers/${customerId}`);

    return {
      message: "Customer updated.",
      ok: true,
      redirectTo: `/customers/${customerId}`,
    };
  } catch (error) {
    return {
      message: getActionErrorMessage(error),
      ok: false,
    };
  }
}

export async function deleteCustomerAction(formData: FormData): Promise<ActionResult> {
  try {
    await requireTeamMember();
    const customerId = String(formData.get("customerId") || "").trim();

    if (!customerId) {
      throw new Error("Customer ID is required.");
    }

    const supabase = await createSupabaseServerClient();
    const [billsResult, paymentsResult] = await Promise.all([
      supabase.from("bills").select("id", { count: "exact", head: true }).eq("customer_id", customerId),
      supabase.from("payments").select("id", { count: "exact", head: true }).eq("customer_id", customerId),
    ]);

    if (billsResult.error) {
      throw billsResult.error;
    }

    if (paymentsResult.error) {
      throw paymentsResult.error;
    }

    if ((billsResult.count ?? 0) > 0 || (paymentsResult.count ?? 0) > 0) {
      throw new Error("Delete blocked. Remove this customer's bills and payments first.");
    }

    const { error } = await supabase.from("customers").delete().eq("id", customerId);

    if (error) {
      throw error;
    }

    revalidatePath("/customers");

    return {
      message: "Customer deleted.",
      ok: true,
      redirectTo: "/customers",
    };
  } catch (error) {
    return {
      message: getActionErrorMessage(error),
      ok: false,
    };
  }
}