"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUserRole, type AppRole } from "@/lib/auth";
import { sendInvitationEmail } from "@/lib/invitation-email";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { InvitationActionState } from "./invitation-state";

const allowedRoles: AppRole[] = ["admin", "collaborator", "viewer"];

function isMissingRelationError(error: unknown, relationName: string) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "PGRST205" &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.includes(relationName)
  );
}

export async function createInvitationAction(formData: FormData) {
  await createInvitation(formData);
}

async function createInvitation(formData: FormData) {
  const requesterRole = await getCurrentUserRole();

  if (requesterRole !== "admin") {
    throw new Error("Unauthorized");
  }

  const email = String(formData.get("email") || "").trim().toLowerCase();
  const role = String(formData.get("role") || "").trim() as AppRole;

  if (!email || !allowedRoles.includes(role)) {
    throw new Error("Invalid invitation request");
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const { data: existingInvitation, error: existingInvitationError } = await supabase
    .from("user_invitations")
    .select("id")
    .eq("email", email)
    .is("accepted_at", null)
    .maybeSingle();

  if (existingInvitationError) {
    if (isMissingRelationError(existingInvitationError, "public.user_invitations")) {
      throw new Error("Invitation table is missing. Apply sql/009_pending_user_activation.sql first.");
    }

    throw existingInvitationError;
  }

  if (existingInvitation) {
    const { error } = await supabase
      .from("user_invitations")
      .update({ invited_by: user.id, role })
      .eq("id", existingInvitation.id);

    if (error) {
      if (isMissingRelationError(error, "public.user_invitations")) {
        throw new Error("Invitation table is missing. Apply sql/009_pending_user_activation.sql first.");
      }

      throw error;
    }
  } else {
    const { error } = await supabase.from("user_invitations").insert({
      email,
      invited_by: user.id,
      role,
    });

    if (error) {
      if (isMissingRelationError(error, "public.user_invitations")) {
        throw new Error("Invitation table is missing. Apply sql/009_pending_user_activation.sql first.");
      }

      throw error;
    }
  }

  let deliveryErrorMessage: string | null = null;

  try {
    await sendInvitationEmail(email, role);
  } catch (error) {
    deliveryErrorMessage =
      error instanceof Error
        ? error.message
        : "Unknown email delivery error. Check server logs.";

    if (error instanceof Error) {
      console.error(`Invitation saved but email delivery failed for ${email}: ${error.message}`);
    } else {
      console.error(`Invitation saved but email delivery failed for ${email}.`);
    }
  }

  revalidatePath("/manage-users");

  return {
    deliveryErrorMessage,
    email,
    role,
  };
}

export async function createInvitationActionWithState(
  _previousState: InvitationActionState,
  formData: FormData,
): Promise<InvitationActionState> {
  try {
    const result = await createInvitation(formData);

    if (result.deliveryErrorMessage) {
      return {
        message: `Invitation for ${result.email} was saved, but delivery failed: ${result.deliveryErrorMessage}`,
        tone: "warning",
      };
    }

    return {
      message: `Invitation email sent to ${result.email}.`,
      tone: "success",
    };
  } catch (error) {
    return {
      message:
        error instanceof Error ? error.message : "Unable to create invitation. Please try again.",
      tone: "error",
    };
  }
}

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