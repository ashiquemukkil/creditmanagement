import { redirect } from "next/navigation";

import { CustomerForm } from "@/components/customer-form";
import { canManageData, getCurrentUserRole } from "@/lib/auth";

export default async function NewCustomerPage() {
  const role = await getCurrentUserRole();

  if (!canManageData(role)) {
    redirect("/customers");
  }

  return <CustomerForm submitLabel="Create customer" title="Add customer" />;
}