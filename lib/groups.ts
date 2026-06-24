"use server";

import { revalidatePath } from "next/cache";

import { requireTeamMember } from "@/lib/auth";
import { type ActionResult, getActionErrorMessage } from "@/lib/action-result";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function readGroupInput(formData: FormData) {
  const category = String(formData.get("category") || "").trim();
  const subCategory = String(formData.get("sub_category") || "").trim();

  if (!category) {
    throw new Error("Category is required.");
  }

  if (!subCategory) {
    throw new Error("Sub-category is required.");
  }

  return {
    category,
    sub_category: subCategory,
  };
}

export async function createGroupAction(formData: FormData): Promise<ActionResult> {
  try {
    await requireTeamMember();

    const payload = readGroupInput(formData);

    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("groups")
      .insert(payload)
      .select("id")
      .single();

    if (error) {
      console.error("Supabase insert error:", error);
      // Check if it's a unique constraint violation
      if (error.code === "23505") {
        throw new Error(`Group "${payload.category} - ${payload.sub_category}" already exists.`);
      }
      throw error;
    }

    revalidatePath("/customers");
    revalidatePath("/customers/new");

    return {
      message: "Group created successfully.",
      ok: true,
      data: { id: data?.id ?? "" },
    };
  } catch (error) {
    console.error("createGroupAction error:", error);
    return {
      message: getActionErrorMessage(error),
      ok: false,
    };
  }
}

export async function listGroups(): Promise<
  Array<{ id: string; category: string; sub_category: string }>
> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("groups")
    .select("id, category, sub_category")
    .eq("is_active", true)
    .order("category", { ascending: true })
    .order("sub_category", { ascending: true });

  if (error) {
    console.error("Error fetching groups:", error);
    throw error;
  }

  return (data ?? []) as Array<{ id: string; category: string; sub_category: string }>;
}

export async function getGroupById(groupId: string): Promise<{
  id: string;
  category: string;
  sub_category: string;
} | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("groups")
    .select("id, category, sub_category")
    .eq("id", groupId)
    .maybeSingle();

  if (error) {
    console.error("Error fetching group:", error);
    throw error;
  }

  return data as { id: string; category: string; sub_category: string } | null;
}
