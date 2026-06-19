import "server-only";

import { cache } from "react";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AppRole = "admin" | "collaborator" | "viewer";

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

export async function requireTeamMember() {
  const [role, user] = await Promise.all([getCurrentUserRole(), requireAuthenticatedUser()]);

  if (!canManageData(role)) {
    throw new Error("Unauthorized");
  }

  return user;
}

type UserRecord = {
  created_at: string;
  email: string;
  id: string;
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
  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data?.role as AppRole | undefined) ?? null;
});

export async function listUsers(): Promise<UserRecord[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, name, email, role, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as UserRecord[];
}