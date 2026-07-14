import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// ─────────────── DonutChart (center label) ───────────────
export function DonutChart({
  data,
  centerValue,
  centerLabel,
  size = 180,
}: {
  data: { name: string; value: number; color: string }[];
  centerValue: React.ReactNode;
  centerLabel?: string;
  size?: number;
}) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            innerRadius={size * 0.32}
            outerRadius={size * 0.46}
            paddingAngle={1}
            stroke="none"
          >
            {data.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-2xl font-bold text-text1">{centerValue}</div>
        {centerLabel && <div className="text-xs text-text3">{centerLabel}</div>}
      </div>
    </div>
  );
}

// ─────────────── TrendLine (blue line + dots + area) ───────────────
export function TrendLine({
  data,
  height = 160,
}: {
  data: { label: string; value: number }[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563EB" stopOpacity={0.18} />
            <stop offset="100%" stopColor="#2563EB" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
        <YAxis
          tick={{ fontSize: 11, fill: "#94A3B8" }}
          axisLine={false}
          tickLine={false}
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip />
        <Area type="monotone" dataKey="value" stroke="#2563EB" strokeWidth={2} fill="url(#trendFill)" dot={{ r: 3, fill: "#2563EB" }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─────────────── Sparkline (90x24) ───────────────
export function Sparkline({
  data,
  width = 90,
  height = 24,
  color = "#2563EB",
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  const points = data.map((v, i) => ({ i, v }));
  return (
    <LineChart width={width} height={height} data={points} margin={{ top: 3, right: 2, left: 2, bottom: 3 }}>
      <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
    </LineChart>
  );
}

// ─────────────── HBarChart (green gradient bars, highlight support) ───────────────
export function HBarChart({
  data,
  height = 220,
  max = 100,
}: {
  data: { name: string; value: number; highlight?: boolean }[];
  height?: number;
  max?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 28, left: 8, bottom: 4 }}>
        <XAxis type="number" domain={[0, max]} hide />
        <YAxis
          type="category"
          dataKey="name"
          width={140}
          tick={{ fontSize: 12, fill: "#475569" }}
          axisLine={false}
          tickLine={false}
        />
        <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={14} label={{ position: "right", fontSize: 12, fill: "#475569" }}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.highlight ? "#2563EB" : "#16A34A"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─────────────── GroupedBarChart (3-series, legend) ───────────────
export function GroupedBarChart({
  data,
  series,
  height = 240,
}: {
  data: Record<string, number | string>[];
  series: { key: string; name: string; color: string }[];
  height?: number;
}) {
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <XAxis dataKey="group" tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
          <Tooltip />
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[3, 3, 0, 0]} barSize={16} />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-2 flex items-center justify-center gap-4">
        {series.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5 text-xs text-text2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
            {s.name}
          </div>
        ))}
      </div>
    </div>
  );
}
