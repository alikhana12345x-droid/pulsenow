"use client";

// Thin wrapper that makes Recharts components importable in Server Component trees.
// All recharts components must live in client components — this file is the boundary.

export {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
