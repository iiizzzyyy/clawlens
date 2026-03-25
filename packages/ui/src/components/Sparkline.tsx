/**
 * Mini sparkline chart component
 */

import { LineChart, Line, ResponsiveContainer } from 'recharts';

interface SparklineProps {
  data: number[];
  color?: string;
  height?: number;
}

export default function Sparkline({ data, color = '#10b981', height = 32 }: SparklineProps) {
  if (data.length === 0 || data.every((v) => v === 0)) {
    return <div style={{ height }} className="flex items-center text-xs text-slate-500">--</div>;
  }

  const chartData = data.map((value) => ({ value }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData}>
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
