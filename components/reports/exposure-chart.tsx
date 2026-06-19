"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

type ExposureChartProps = {
  data: Array<{
    color: string;
    label: string;
    value: number;
  }>;
};

export function ExposureChart({ data }: ExposureChartProps) {
  return (
    <div className="h-80 w-full rounded-3xl border border-stone-200 bg-white p-4 shadow-sm">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            innerRadius={70}
            outerRadius={110}
            paddingAngle={4}
          >
            {data.map((entry) => (
              <Cell key={entry.label} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}