import { redirect } from "next/navigation";

import { BillForm } from "@/components/bill-form";
import { canManageData, getCurrentUserRole } from "@/lib/auth";
import { listCustomerOptions } from "@/lib/customers";

type NewBillPageProps = {
  searchParams: Promise<{
    customerId?: string;
  }>;
};

export default async function NewBillPage({ searchParams }: NewBillPageProps) {
  const [role, customers, { customerId }] = await Promise.all([
    getCurrentUserRole(),
    listCustomerOptions(),
    searchParams,
  ]);

  if (!canManageData(role)) {
    redirect("/bills");
  }

  const defaultBillDate = new Date().toISOString().slice(0, 10);

  return (
    <BillForm
      customers={customers}
      defaultBillDate={defaultBillDate}
      defaultCustomerId={customerId}
    />
  );
}