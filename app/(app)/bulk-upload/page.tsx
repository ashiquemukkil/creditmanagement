import { redirect } from "next/navigation";

import { BulkUploadConsole } from "@/components/bulk-upload-console";
import { canManageData, getCurrentUserRole } from "@/lib/auth";
import { listCustomerOptions } from "@/lib/customers";
import { listExistingBillNumbers } from "@/lib/entry-operations";

export default async function BulkUploadPage() {
  const role = await getCurrentUserRole();

  if (!canManageData(role)) {
    redirect("/dashboard");
  }

  const [customers, existingBillNumbers] = await Promise.all([
    listCustomerOptions(),
    listExistingBillNumbers(),
  ]);

  return <BulkUploadConsole customers={customers} existingBillNumbers={existingBillNumbers} />;
}