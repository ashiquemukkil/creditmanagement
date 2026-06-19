"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUserRole, type AppRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const allowedRoles: AppRole[] = ["admin", "collaborator", "viewer"];

export async function updateUserRoleAction(formData: FormData) {
  const requesterRole = await getCurrentUserRole();

  if (requesterRole !== "admin") {
    throw new Error("Unauthorized");
  }

  const userId = String(formData.get("userId") || "").trim();
  const role = String(formData.get("role") || "").trim() as AppRole;

  if (!userId || !allowedRoles.includes(role)) {
    throw new Error("Invalid role update request");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("users").update({ role }).eq("id", userId);

  if (error) {
    throw error;
  }

  revalidatePath("/manage-users");
}