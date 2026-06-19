import { notFound, redirect } from "next/navigation";

import { CustomerForm } from "@/components/customer-form";
import { canManageData, getCurrentUserRole } from "@/lib/auth";
import { getCustomerById } from "@/lib/customers";

type EditCustomerPageProps = {
  params: Promise<{
    customerId: string;
  }>;
};

export default async function EditCustomerPage({ params }: EditCustomerPageProps) {
  const [{ customerId }, role] = await Promise.all([params, getCurrentUserRole()]);

  if (!canManageData(role)) {
    redirect("/customers");
  }

  const customer = await getCustomerById(customerId);

  if (!customer) {
    notFound();
  }

  return (
    <CustomerForm
      customerId={customerId}
      initialValues={customer}
      submitLabel="Save changes"
      title="Edit customer"
    />
  );
}