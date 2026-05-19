"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

type MetricCard = {
  label: string;
  value: number;
};

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function startOfMonth() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function startOfWeek() {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function last30Days() {
  const d = new Date();
  d.setDate(d.getDate() - 29);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function AnalyticsPage() {
  const [cards, setCards] = useState<MetricCard[]>([]);
  const [conversationSeries, setConversationSeries] = useState<
    { date: string; count: number }[]
  >([]);
  const [divisionSeries, setDivisionSeries] = useState<
    { division: string; count: number }[]
  >([]);

  useEffect(() => {
    async function load() {
      const supabase = getSupabaseBrowser();
      const today = startOfToday();
      const month = startOfMonth();
      const week = startOfWeek();
      const from30 = last30Days().toISOString();

      const [
        totalConversations,
        activeToday,
        appointmentsMonth,
        leadsMonth,
        escalationsWeek,
        vinciMessages,
        conversations30,
        appointmentsAll,
      ] = await Promise.all([
        supabase.from("conversations").select("*", { count: "exact", head: true }),
        supabase
          .from("conversations")
          .select("*", { count: "exact", head: true })
          .gte("last_message_at", today),
        supabase
          .from("appointments")
          .select("*", { count: "exact", head: true })
          .gte("created_at", month),
        supabase
          .from("leads")
          .select("*", { count: "exact", head: true })
          .gte("created_at", month),
        supabase
          .from("conversations")
          .select("*", { count: "exact", head: true })
          .eq("status", "escalated")
          .gte("last_message_at", week),
        supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .eq("role", "assistant"),
        supabase
          .from("conversations")
          .select("last_message_at")
          .gte("last_message_at", from30),
        supabase.from("appointments").select("division"),
      ]);

      setCards([
        { label: "Total Conversations", value: totalConversations.count ?? 0 },
        { label: "Active Today", value: activeToday.count ?? 0 },
        {
          label: "Appointments This Month",
          value: appointmentsMonth.count ?? 0,
        },
        { label: "Leads This Month", value: leadsMonth.count ?? 0 },
        { label: "Escalations This Week", value: escalationsWeek.count ?? 0 },
        { label: "VINCI Messages Sent", value: vinciMessages.count ?? 0 },
      ]);

      const dayMap = new Map<string, number>();
      for (let i = 0; i < 30; i++) {
        const d = new Date();
        d.setDate(d.getDate() - (29 - i));
        const key = d.toISOString().slice(0, 10);
        dayMap.set(key, 0);
      }

      (conversations30.data ?? []).forEach((row) => {
        if (!row.last_message_at) return;
        const key = row.last_message_at.slice(0, 10);
        if (dayMap.has(key)) {
          dayMap.set(key, (dayMap.get(key) ?? 0) + 1);
        }
      });

      setConversationSeries(
        Array.from(dayMap.entries()).map(([date, count]) => ({ date, count })),
      );

      const divisionMap = new Map<string, number>();
      (appointmentsAll.data ?? []).forEach((row) => {
        const key = row.division || "unknown";
        divisionMap.set(key, (divisionMap.get(key) ?? 0) + 1);
      });

      setDivisionSeries(
        Array.from(divisionMap.entries()).map(([division, count]) => ({
          division,
          count,
        })),
      );
    }

    load();
  }, []);

  const chartTooltipStyle = useMemo(
    () => ({
      backgroundColor: "#111111",
      border: "1px solid #2a2a2a",
      color: "#ffffff",
    }),
    [],
  );

  return (
    <div>
      <h1 className="mb-6 text-2xl text-white">Analytics</h1>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-lg border border-brand-border bg-brand-surface p-5"
          >
            <p className="text-xs text-brand-muted">{card.label}</p>
            <p className="mt-2 text-3xl font-bold text-white">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-lg border border-brand-border bg-brand-surface p-4">
        <h2 className="mb-4 text-white">Conversations — Last 30 Days</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={conversationSeries}>
            <CartesianGrid stroke="#2a2a2a" />
            <XAxis dataKey="date" stroke="#a3a3a3" tick={{ fontSize: 11 }} />
            <YAxis stroke="#a3a3a3" allowDecimals={false} />
            <Tooltip contentStyle={chartTooltipStyle} />
            <Line
              type="monotone"
              dataKey="count"
              stroke="#C8102E"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-8 rounded-lg border border-brand-border bg-brand-surface p-4">
        <h2 className="mb-4 text-white">Appointments by Division</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={divisionSeries}>
            <CartesianGrid stroke="#2a2a2a" />
            <XAxis dataKey="division" stroke="#a3a3a3" tick={{ fontSize: 11 }} />
            <YAxis stroke="#a3a3a3" allowDecimals={false} />
            <Tooltip contentStyle={chartTooltipStyle} />
            <Bar dataKey="count" fill="#C8102E" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
