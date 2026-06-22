import "server-only";

import { cache } from "react";

import { createSupabaseServerClient } from "@/lib/supabase/server";

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

export type AppRole = "admin" | "collaborator" | "viewer";

export type UserAccessRecord = {
  isActive: boolean;
  role: AppRole;
};

export type InvitationRecord = {
  accepted_at: string | null;
  created_at: string;
  email: string;
  id: string;
  role: AppRole;
};

export function canManageData(role: AppRole | null): role is "admin" | "collaborator" {
  return role === "admin" || role === "collaborator";
}

export async function requireAuthenticatedUser() {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  return user;
}

export async function requireActiveUser() {
  const [access, user] = await Promise.all([getCurrentUserAccess(), requireAuthenticatedUser()]);

  if (!access?.isActive) {
    throw new Error("Account pending activation");
  }

  return user;
}

export async function requireTeamMember() {
  const [role, user] = await Promise.all([getCurrentUserRole(), requireActiveUser()]);

  if (!canManageData(role)) {
    throw new Error("Unauthorized");
  }

  return user;
}

type UserRecord = {
  created_at: string;
  email: string;
  id: string;
  is_active: boolean;
  name: string;
  role: AppRole;
};

export const getCurrentUser = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  return user;
});

export const getCurrentUserRole = cache(async (): Promise<AppRole | null> => {
  const access = await getCurrentUserAccess();

  if (!access?.isActive) {
    return null;
  }

  return access.role;
});

export const getCurrentUserAccess = cache(async (): Promise<UserAccessRecord | null> => {
  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("users")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data?.role) {
    return null;
  }

  return {
    isActive: data.is_active ?? false,
    role: data.role as AppRole,
  };
});

export async function listUsers(): Promise<UserRecord[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, name, email, role, is_active, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as UserRecord[];
}

export async function listInvitations(): Promise<InvitationRecord[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("user_invitations")
    .select("id, email, role, created_at, accepted_at")
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingRelationError(error, "public.user_invitations")) {
      return [];
    }

    throw error;
  }

  return (data ?? []) as InvitationRecord[];
}