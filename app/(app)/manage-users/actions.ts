"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUserRole, type AppRole } from "@/lib/auth";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
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

function isAuthEmailAlreadyRegisteredError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.toLowerCase().includes("already been registered")
  );
}

type AuthUserSummary = {
  id: string;
  email?: string | null;
  user_metadata?: {
    name?: string;
  } | null;
};

async function findAuthUserByEmail(
  adminClient: Awaited<ReturnType<typeof createSupabaseAdminClient>>,
  email: string,
) {
  let page = 1;
  const perPage = 200;

  while (page <= 10) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });

    if (error) {
      throw new Error(`Failed to look up existing auth users: ${error.message}`);
    }

    const users = (data.users ?? []) as AuthUserSummary[];
    const matchedUser = users.find((user) => user.email?.toLowerCase() === email);

    if (matchedUser) {
      return matchedUser;
    }

    if (!data.nextPage) {
      break;
    }

    page = data.nextPage;
  }

  return null;
}

export async function createInvitationAction(formData: FormData) {
  await createUser(formData);
}

async function createUser(formData: FormData) {
  const requesterRole = await getCurrentUserRole();

  if (requesterRole !== "admin") {
    throw new Error("Unauthorized");
  }

  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "").trim();
  const role = String(formData.get("role") || "").trim() as AppRole;

  if (!email || !password || !allowedRoles.includes(role)) {
    throw new Error("Invalid user creation request");
  }

  if (password.length < 6) {
    throw new Error("Password must be at least 6 characters");
  }

  const adminClient = await createSupabaseAdminClient();
  const serverClient = await createSupabaseServerClient();

  // Check if user already exists
  const { data: existingUser, error: existingUserError } = await serverClient
    .from("users")
    .select("id")
    .ilike("email", email)
    .maybeSingle();

  if (existingUserError && !isMissingRelationError(existingUserError, "public.users")) {
    throw existingUserError;
  }

  if (existingUser) {
    throw new Error("User with this email already exists");
  }

  let authUserId: string | null = null;
  let authUserName: string | undefined;
  let newlyCreatedAuthUserId: string | null = null;

  // Create user in Supabase auth using admin API.
  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError) {
    if (!isAuthEmailAlreadyRegisteredError(authError)) {
      throw new Error(`Failed to create user: ${authError.message}`);
    }

    const existingAuthUser = await findAuthUserByEmail(adminClient, email);

    if (!existingAuthUser) {
      throw new Error(
        "This email already exists in authentication, but no matching auth user could be resolved.",
      );
    }

    authUserId = existingAuthUser.id;
    authUserName = existingAuthUser.user_metadata?.name;
  } else if (authData.user) {
    authUserId = authData.user.id;
    authUserName = (authData.user.user_metadata?.name as string | undefined) ?? undefined;
    newlyCreatedAuthUserId = authData.user.id;
  }

  if (!authUserId) {
    throw new Error("Failed to create or resolve user account");
  }

  // Upsert user record because auth trigger might already have inserted one.
  const { error: userTableError } = await serverClient.from("users").upsert(
    {
      id: authUserId,
      email,
      role,
      is_active: true,
      name: authUserName?.trim() || email.split("@")[0],
    },
    {
      onConflict: "id",
    },
  );

  if (userTableError) {
    // Try to clean up the auth user if table insert fails
    if (newlyCreatedAuthUserId) {
      await adminClient.auth.admin.deleteUser(newlyCreatedAuthUserId).catch(() => {
        // Ignore cleanup errors
      });
    }

    if (isMissingRelationError(userTableError, "public.users")) {
      throw new Error("Users table is missing.");
    }

    throw new Error(`Failed to create or update user profile: ${userTableError.message}`);
  }

  revalidatePath("/manage-users");

  return {
    email,
    role,
  };
}

export async function createInvitationActionWithState(
  _previousState: InvitationActionState,
  formData: FormData,
): Promise<InvitationActionState> {
  try {
    const result = await createUser(formData);

    return {
      message: `User ${result.email} created successfully with ${result.role} role.`,
      tone: "success",
    };
  } catch (error) {
    return {
      message:
        error instanceof Error ? error.message : "Unable to create user. Please try again.",
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