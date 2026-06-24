import { redirect } from "next/navigation";

import { CustomerForm } from "@/components/customer-form";
import { canManageData, getCurrentUserRole } from "@/lib/auth";
import { listGroups } from "@/lib/groups";

export default async function NewCustomerPage() {
  const role = await getCurrentUserRole();

  if (!canManageData(role)) {
    redirect("/customers");
  }

  const groups = await listGroups();

  return <CustomerForm groups={groups} submitLabel="Create customer" title="Add customer" />;
}