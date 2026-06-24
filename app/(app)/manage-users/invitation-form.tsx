"use client";

import { useActionState } from "react";

import { createInvitationActionWithState } from "@/app/(app)/manage-users/actions";
import { invitationInitialState, type InvitationActionState } from "./invitation-state";

const roles = ["admin", "collaborator", "viewer"] as const;

function feedbackClasses(tone: InvitationActionState["tone"]) {
  if (tone === "success") {
    return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }

  if (tone === "warning") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }

  if (tone === "error") {
    return "border-rose-200 bg-rose-50 text-rose-900";
  }

  return "hidden";
}

export function InvitationForm() {
  const [state, formAction, pending] = useActionState(
    createInvitationActionWithState,
    invitationInitialState,
  );

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
      <label className="block flex-1 space-y-2 text-sm font-medium text-stone-700">
        <span>Email</span>
        <input
          required
          name="email"
          type="email"
          className="w-full rounded-2xl border border-stone-300 px-4 py-3 text-sm text-stone-950 outline-none transition focus:border-amber-600"
          placeholder="staff@business.com"
        />
      </label>
      <label className="block space-y-2 text-sm font-medium text-stone-700">
        <span>Role</span>
        <select
          name="role"
          defaultValue="collaborator"
          className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-950"
        >
          {roles.map((availableRole) => (
            <option key={availableRole} value={availableRole}>
              {availableRole}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-2xl bg-stone-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Sending..." : "Send invitation"}
      </button>

      <p
        aria-live="polite"
        className={`w-full rounded-2xl border px-4 py-3 text-sm font-medium ${feedbackClasses(state.tone)}`}
      >
        {state.message}
      </p>
    </form>
  );
}
