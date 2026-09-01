"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";

import { DEFAULT_AGING_THRESHOLDS } from "@/lib/aging-buckets";

type AgingBucketFiltersProps = {
  thresholds: number[];
};

export function AgingBucketFilters({ thresholds }: AgingBucketFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [values, setValues] = useState<number[]>(thresholds);
  const formRef = useRef<HTMLFormElement>(null);

  function apply(next: number[]) {
    const sorted = [...next].filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
    const params = new URLSearchParams(searchParams.toString());

    if (sorted.join(",") === DEFAULT_AGING_THRESHOLDS.join(",")) {
      params.delete("thresholds");
    } else {
      params.set("thresholds", sorted.join(","));
    }

    router.push(`?${params.toString()}`);
  }

  function handleChange(index: number, raw: string) {
    const n = parseInt(raw, 10);
    const next = values.map((v, i) => (i === index ? (Number.isNaN(n) ? v : n) : v));
    setValues(next);
  }

  function addBracket() {
    const last = values[values.length - 1] ?? 0;
    setValues([...values, last + 15]);
  }

  function removeBracket(index: number) {
    if (values.length <= 1) return;
    const next = values.filter((_, i) => i !== index);
    setValues(next);
    apply(next);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    apply(values);
  }

  function reset() {
    setValues(DEFAULT_AGING_THRESHOLDS);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("thresholds");
    router.push(`?${params.toString()}`);
  }

  const isDefault = values.join(",") === DEFAULT_AGING_THRESHOLDS.join(",");

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">Day brackets</span>
        <div className="flex items-center gap-2">
          {values.map((value, index) => (
            <div key={index} className="flex items-center gap-1">
              <input
                type="number"
                min={1}
                max={9999}
                value={value}
                onChange={(e) => handleChange(index, e.target.value)}
                className="w-16 rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              {values.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeBracket(index)}
                  className="flex h-6 w-6 items-center justify-center rounded-full text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
                  aria-label="Remove bracket"
                >
                  ×
                </button>
              )}
            </div>
          ))}
          {values.length < 6 && (
            <button
              type="button"
              onClick={addBracket}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-dashed border-stone-300 text-stone-400 transition hover:border-stone-400 hover:text-stone-600"
              aria-label="Add bracket"
            >
              +
            </button>
          )}
        </div>
      </div>
      <button
        type="submit"
        className="rounded-2xl bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-700"
      >
        Apply
      </button>
      {!isDefault && (
        <button
          type="button"
          onClick={reset}
          className="rounded-2xl border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
        >
          Reset
        </button>
      )}
    </form>
  );
}
