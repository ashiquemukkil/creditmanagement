"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type AgingChartProps = {
  data: Array<{
    bucket: string;
    diamond: number;
    gold: number;
  }>;
};

export function AgingChart({ data }: AgingChartProps) {
  return (
    <div className="h-80 w-full rounded-3xl border border-stone-200 bg-white p-4 shadow-sm">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
          <XAxis dataKey="bucket" stroke="#78716c" />
          <YAxis stroke="#78716c" />
          <Tooltip />
          <Legend />
          <Bar dataKey="gold" fill="#d97706" name="Gold" radius={[6, 6, 0, 0]} />
          <Bar dataKey="diamond" fill="#0284c7" name="Diamond" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}