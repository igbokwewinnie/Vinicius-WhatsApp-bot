"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

type Appointment = {
  id: string;
  full_name: string;
  phone_number: string;
  division: string;
  preferred_date: string;
  preferred_time: string;
  purpose: string;
  status: string;
  created_at: string;
};

const divisions = [
  "all",
  "defence",
  "infrastructure",
  "aviation",
  "technology",
  "automobile",
  "agro",
  "general",
];

const statuses = ["all", "pending", "confirmed", "cancelled", "completed"];

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [divisionFilter, setDivisionFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const loadAppointments = useCallback(async () => {
    const supabase = getSupabaseBrowser();
    const { data } = await supabase
      .from("appointments")
      .select("*")
      .order("created_at", { ascending: false });
    setAppointments((data as Appointment[]) ?? []);
  }, []);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  const filtered = useMemo(() => {
    return appointments.filter((row) => {
      const divisionOk =
        divisionFilter === "all" || row.division === divisionFilter;
      const statusOk = statusFilter === "all" || row.status === statusFilter;
      return divisionOk && statusOk;
    });
  }, [appointments, divisionFilter, statusFilter]);

  async function updateStatus(id: string, status: string) {
    const supabase = getSupabaseBrowser();
    await supabase.from("appointments").update({ status }).eq("id", id);
    await loadAppointments();
  }

  function exportCsv() {
    const headers = [
      "Name",
      "Phone",
      "Division",
      "Date",
      "Time",
      "Purpose",
      "Status",
      "Created",
    ];
    const rows = filtered.map((row) => [
      row.full_name,
      row.phone_number,
      row.division,
      row.preferred_date,
      row.preferred_time,
      row.purpose,
      row.status,
      row.created_at,
    ]);
    const csv = [headers, ...rows]
      .map((line) =>
        line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "appointments.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl text-white">Appointments</h1>
        <button
          type="button"
          onClick={exportCsv}
          className="rounded-md bg-brand-red px-4 py-2 text-sm text-white transition-colors hover:bg-brand-red-hover"
        >
          Export CSV
        </button>
      </div>

      <div className="mb-4 flex gap-3">
        <select
          value={divisionFilter}
          onChange={(e) => setDivisionFilter(e.target.value)}
          className="rounded-md border border-brand-border bg-brand-surface px-3 py-2 text-sm text-white"
        >
          {divisions.map((d) => (
            <option key={d} value={d}>
              {d === "all" ? "All divisions" : d}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-brand-border bg-brand-surface px-3 py-2 text-sm text-white"
        >
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "All statuses" : s}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-lg border border-brand-border bg-brand-surface">
        <table className="w-full text-left text-sm">
          <thead className="bg-brand-elevated text-xs uppercase text-white">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Division</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Purpose</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-brand-muted">
                  No appointments yet
                </td>
              </tr>
            ) : (
              filtered.map((row, index) => (
                <tr
                  key={row.id}
                  className={`border-b border-brand-border text-white ${
                    index % 2 === 1 ? "bg-brand-stripe" : ""
                  }`}
                >
                  <td className="px-4 py-3">{row.full_name}</td>
                  <td className="px-4 py-3">{row.phone_number}</td>
                  <td className="px-4 py-3">{row.division}</td>
                  <td className="px-4 py-3">{row.preferred_date}</td>
                  <td className="px-4 py-3">{row.preferred_time}</td>
                  <td className="px-4 py-3">{row.purpose}</td>
                  <td className="px-4 py-3">
                    <select
                      value={row.status}
                      onChange={(e) => updateStatus(row.id, e.target.value)}
                      className="rounded border border-brand-border bg-brand-black px-2 py-1 text-sm text-white"
                    >
                      <option value="pending">pending</option>
                      <option value="confirmed">confirmed</option>
                      <option value="cancelled">cancelled</option>
                      <option value="completed">completed</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    {new Date(row.created_at).toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
