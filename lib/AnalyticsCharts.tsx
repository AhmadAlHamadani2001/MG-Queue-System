"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { DailyStat, HourStat, DayOfWeekStat } from "./analyticsUtils";

const RED = "#E4022D";
const GOLD = "#C9A15A";
const INK = "#0B0C10";

export function LeadTimeLineChart({ data, t }: { data: DailyStat[]; t: (en: string, ar: string) => string }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#00000010" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d: string) => d.slice(5)} />
        <YAxis tick={{ fontSize: 11 }} label={{ value: t("min", "د"), angle: -90, position: "insideLeft", fontSize: 11 }} />
        <Tooltip formatter={(v: number) => (v != null ? `${v.toFixed(1)} ${t("min", "د")}` : "—")} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="avgWaitMin" name={t("Avg wait", "متوسط الانتظار")} stroke={RED} strokeWidth={2} dot={false} connectNulls />
        <Line type="monotone" dataKey="avgServiceMin" name={t("Avg service", "متوسط الخدمة")} stroke={GOLD} strokeWidth={2} dot={false} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ThroughputChart({ data, t }: { data: DailyStat[]; t: (en: string, ar: string) => string }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#00000010" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d: string) => d.slice(5)} />
        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
        <Tooltip formatter={(v: number) => `${v} ${t("tickets", "تذكرة")}`} />
        <Bar dataKey="throughput" name={t("Completed", "مكتمل")} fill={INK} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function HourlyChart({ data, t }: { data: HourStat[]; t: (en: string, ar: string) => string }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#00000010" />
        <XAxis dataKey="hour" tick={{ fontSize: 10 }} tickFormatter={(h: number) => `${h}:00`} interval={1} />
        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
        <Tooltip formatter={(v: number) => `${v} ${t("tickets", "تذكرة")}`} labelFormatter={(h: number) => `${h}:00`} />
        <Bar dataKey="count" name={t("Tickets", "التذاكر")} fill={RED} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DayOfWeekChart({ data, t }: { data: DayOfWeekStat[]; t: (en: string, ar: string) => string }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#00000010" />
        <XAxis dataKey="day" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
        <Tooltip formatter={(v: number) => `${v} ${t("tickets", "تذكرة")}`} />
        <Bar dataKey="count" name={t("Tickets", "التذاكر")} fill={GOLD} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
