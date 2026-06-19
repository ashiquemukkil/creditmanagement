import { redirect } from "next/navigation";

import { getCurrentUserRole, listUsers } from "@/lib/auth";

import { updateUserRoleAction } from "./actions";

const roles = ["admin", "collaborator", "viewer"] as const;

export default async function ManageUsersPage() {
  const role = await getCurrentUserRole();

  if (role !== "admin") {
    redirect("/dashboard");
  }

  const users = await listUsers();

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-amber-700">
          Manage Users
        </p>
        <h2 className="text-3xl font-semibold tracking-tight text-stone-950">
          User roles
        </h2>
        <p className="max-w-2xl text-sm leading-7 text-stone-600">
          Only admins can change roles. New sign-ups are created as viewers and can be
          promoted here after your first admin account exists.
        </p>
      </div>

      <div className="overflow-hidden rounded-3xl border border-stone-200">
        <table className="min-w-full divide-y divide-stone-200">
          <thead className="bg-stone-50 text-left text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
            <tr>
              <th className="px-5 py-4">Name</th>
              <th className="px-5 py-4">Email</th>
              <th className="px-5 py-4">Role</th>
              <th className="px-5 py-4">Created</th>
              <th className="px-5 py-4">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200 bg-white text-sm text-stone-700">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="px-5 py-4 font-medium text-stone-950">{user.name}</td>
                <td className="px-5 py-4">{user.email}</td>
                <td className="px-5 py-4">
                  <form action={updateUserRoleAction} className="flex items-center gap-3">
                    <input type="hidden" name="userId" value={user.id} />
                    <select
                      name="role"
                      defaultValue={user.role}
                      className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-950"
                    >
                      {roles.map((availableRole) => (
                        <option key={availableRole} value={availableRole}>
                          {availableRole}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className="rounded-xl bg-stone-950 px-3 py-2 text-sm font-medium text-white transition hover:bg-stone-800"
                    >
                      Save
                    </button>
                  </form>
                </td>
                <td className="px-5 py-4 text-stone-500">
                  {new Date(user.created_at).toLocaleDateString()}
                </td>
                <td className="px-5 py-4 text-xs text-stone-500">{user.id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}