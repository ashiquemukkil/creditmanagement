export const DEFAULT_AGING_THRESHOLDS = [15, 30, 60];

export function agingBucketLabels(thresholds: number[]): string[] {
  const sorted = [...thresholds].map(Number).filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  const labels: string[] = ["current"];
  let prev = 0;

  for (const t of sorted) {
    labels.push(`${prev + 1}-${t}`);
    prev = t;
  }

  labels.push(`${prev}+`);

  return labels;
}
