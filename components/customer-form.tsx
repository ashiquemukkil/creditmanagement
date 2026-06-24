"use client";

import { useRouter } from "next/navigation";
import { useRef, useTransition, useState } from "react";

import { createCustomerAction, updateCustomerAction } from "@/app/(app)/customers/actions";
import { createGroupAction } from "@/lib/groups";
import { useToast } from "@/components/toast-provider";

type Group = {
  id: string;
  category: string;
  sub_category: string;
};

type CustomerFormValues = {
  address?: string | null;
  diamond_credit_days?: number;
  gold_credit_days?: number;
  name?: string;
  phone?: string | null;
  group_id?: string | null;
};

type CustomerFormProps = {
  customerId?: string;
  initialValues?: CustomerFormValues;
  submitLabel: string;
  title: string;
  groups?: Group[];
};

export function CustomerForm({
  customerId,
  initialValues,
  submitLabel,
  title,
  groups = [],
}: CustomerFormProps) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const [isPending, startTransition] = useTransition();
  const [isGroupPending, setIsGroupPending] = useState(false);
  const isSubmittingRef = useRef(false);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [groupList, setGroupList] = useState<Group[]>(groups);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(
    initialValues?.group_id ?? null
  );
  const [groupCategory, setGroupCategory] = useState("");
  const [groupSubCategory, setGroupSubCategory] = useState("");

  const handleGroupSubmit = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();

    if (!groupCategory.trim() || !groupSubCategory.trim()) {
      showError("Please fill in both category and sub-category.");
      return;
    }

    setIsGroupPending(true);

    try {
      const formData = new FormData();
      formData.set("category", groupCategory.trim());
      formData.set("sub_category", groupSubCategory.trim());

      const result = await createGroupAction(formData);

      if (!result.ok) {
        showError(result.message);
        setIsGroupPending(false);
        return;
      }

      showSuccess(result.message);

      const newGroup: Group = {
        id: (result.data as { id: string })?.id,
        category: groupCategory.trim(),
        sub_category: groupSubCategory.trim(),
      };

      setGroupList([...groupList, newGroup]);
      setSelectedGroupId(newGroup.id);
      setShowGroupForm(false);
      setGroupCategory("");
      setGroupSubCategory("");
      setIsGroupPending(false);
    } catch (error) {
      console.error("Group creation error:", error);
      showError("Failed to create group. Please try again.");
      setIsGroupPending(false);
    }
  };

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmittingRef.current) {
      return;
    }

    isSubmittingRef.current = true;
    const formData = new FormData(event.currentTarget);

    if (customerId) {
      formData.set("customerId", customerId);
    }

    if (selectedGroupId) {
      formData.set("group_id", selectedGroupId);
    }

    startTransition(async () => {
      try {
        const result = customerId
          ? await updateCustomerAction(formData)
          : await createCustomerAction(formData);

        if (!result.ok) {
          showError(result.message);
          return;
        }

        showSuccess(result.message);

        if (result.redirectTo) {
          router.push(result.redirectTo);
          router.refresh();
        }
      } finally {
        isSubmittingRef.current = false;
      }
    });
  }

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-amber-700">
          Customers
        </p>
        <h2 className="text-3xl font-semibold tracking-tight text-stone-950">{title}</h2>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-5 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
        <label className="block space-y-2 text-sm font-medium text-stone-700">
          <span>Name</span>
          <input
            required
            name="name"
            type="text"
            defaultValue={initialValues?.name ?? ""}
            className="w-full rounded-2xl border border-stone-300 px-4 py-3 text-sm text-stone-950 outline-none transition focus:border-amber-600"
          />
        </label>

        <label className="block space-y-2 text-sm font-medium text-stone-700">
          <span>Phone</span>
          <input
            name="phone"
            type="text"
            defaultValue={initialValues?.phone ?? ""}
            className="w-full rounded-2xl border border-stone-300 px-4 py-3 text-sm text-stone-950 outline-none transition focus:border-amber-600"
          />
        </label>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-stone-700">
            <span>Group</span>
          </label>
          <div className="flex gap-2">
            <select
              value={selectedGroupId ?? ""}
              onChange={(e) => setSelectedGroupId(e.target.value || null)}
              className="flex-1 rounded-2xl border border-stone-300 px-4 py-3 text-sm text-stone-950 outline-none transition focus:border-amber-600"
            >
              <option value="">Select a group...</option>
              {groupList.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.category} - {group.sub_category}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShowGroupForm(!showGroupForm)}
              className="rounded-2xl bg-amber-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-amber-700"
            >
              + New Group
            </button>
          </div>
        </div>

        {showGroupForm && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-stone-900">Create New Group</h3>

            <label className="block space-y-1 text-sm font-medium text-stone-700">
              <span>Category</span>
              <input
                type="text"
                placeholder="e.g., Gold, Diamond, Silver"
                value={groupCategory}
                onChange={(e) => setGroupCategory(e.target.value)}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-950 outline-none transition focus:border-amber-600"
              />
            </label>

            <label className="block space-y-1 text-sm font-medium text-stone-700">
              <span>Sub-category</span>
              <input
                type="text"
                placeholder="e.g., Premium, Standard, Basic"
                value={groupSubCategory}
                onChange={(e) => setGroupSubCategory(e.target.value)}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-950 outline-none transition focus:border-amber-600"
              />
            </label>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleGroupSubmit}
                disabled={isGroupPending}
                className="flex-1 rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-amber-700 disabled:bg-amber-400"
              >
                {isGroupPending ? "Creating..." : "Create Group"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowGroupForm(false);
                  setGroupCategory("");
                  setGroupSubCategory("");
                }}
                className="flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <label className="block space-y-2 text-sm font-medium text-stone-700">
          <span>Address</span>
          <textarea
            name="address"
            rows={4}
            defaultValue={initialValues?.address ?? ""}
            className="w-full rounded-2xl border border-stone-300 px-4 py-3 text-sm text-stone-950 outline-none transition focus:border-amber-600"
          />
        </label>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block space-y-2 text-sm font-medium text-stone-700">
            <span>Gold credit days</span>
            <input
              required
              min={0}
              name="gold_credit_days"
              type="number"
              defaultValue={initialValues?.gold_credit_days ?? 0}
              className="w-full rounded-2xl border border-stone-300 px-4 py-3 text-sm text-stone-950 outline-none transition focus:border-amber-600"
            />
          </label>

          <label className="block space-y-2 text-sm font-medium text-stone-700">
            <span>Diamond credit days</span>
            <input
              required
              min={0}
              name="diamond_credit_days"
              type="number"
              defaultValue={initialValues?.diamond_credit_days ?? 0}
              className="w-full rounded-2xl border border-stone-300 px-4 py-3 text-sm text-stone-950 outline-none transition focus:border-amber-600"
            />
          </label>
        </div>

        <div>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-2xl bg-stone-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-800 disabled:bg-stone-700"
          >
            {isPending ? "Saving..." : submitLabel}
          </button>
        </div>
      </form>
    </section>
  );
}