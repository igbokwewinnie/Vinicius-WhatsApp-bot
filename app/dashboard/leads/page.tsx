"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

type Lead = {
  id: string;
  full_name: string | null;
  phone_number: string;
  email: string | null;
  division_interest: string | null;
  enquiry_summary: string | null;
  status: string;
  created_at: string;
};

const statuses = ["all", "new", "contacted", "qualified", "closed"];

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");

  const loadLeads = useCallback(async () => {
    const supabase = getSupabaseBrowser();
    const { data } = await supabase
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false });
    setLeads((data as Lead[]) ?? []);
  }, []);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return leads;
    return leads.filter((row) => row.status === statusFilter);
  }, [leads, statusFilter]);

  async function updateStatus(id: string, status: string) {
    const supabase = getSupabaseBrowser();
    await supabase.from("leads").update({ status }).eq("id", id);
    await loadLeads();
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl text-white">Leads</h1>

      <div className="mb-4">
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
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Division Interest</th>
              <th className="px-4 py-3">Summary</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Date</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-brand-muted">
                  No leads captured yet
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
                  <td className="px-4 py-3">{row.full_name ?? "-"}</td>
                  <td className="px-4 py-3">{row.phone_number}</td>
                  <td className="px-4 py-3">{row.email ?? "-"}</td>
                  <td className="px-4 py-3">{row.division_interest ?? "-"}</td>
                  <td className="max-w-xs truncate px-4 py-3">
                    {row.enquiry_summary ?? "-"}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={row.status}
                      onChange={(e) => updateStatus(row.id, e.target.value)}
                      className="rounded border border-brand-border bg-brand-black px-2 py-1 text-sm text-white"
                    >
                      <option value="new">new</option>
                      <option value="contacted">contacted</option>
                      <option value="qualified">qualified</option>
                      <option value="closed">closed</option>
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
