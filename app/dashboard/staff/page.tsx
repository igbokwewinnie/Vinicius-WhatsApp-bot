"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

type StaffMember = {
  id: string;
  full_name: string;
  phone_number: string;
  email: string;
  division: string;
  role: string;
  is_active: boolean;
};

const divisionOptions = [
  "defence",
  "infrastructure",
  "aviation",
  "technology",
  "automobile",
  "agro",
];

const emptyForm = {
  full_name: "",
  phone_number: "",
  email: "",
  division: "defence",
  role: "",
};

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const loadStaff = useCallback(async () => {
    const supabase = getSupabaseBrowser();
    const { data } = await supabase
      .from("staff_members")
      .select("*")
      .order("created_at", { ascending: false });
    setStaff((data as StaffMember[]) ?? []);
  }, []);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  async function toggleActive(id: string, isActive: boolean) {
    const supabase = getSupabaseBrowser();
    await supabase
      .from("staff_members")
      .update({ is_active: isActive })
      .eq("id", id);
    await loadStaff();
  }

  async function deleteStaff(id: string) {
    if (!confirm("Delete this staff member?")) return;
    const supabase = getSupabaseBrowser();
    await supabase.from("staff_members").delete().eq("id", id);
    await loadStaff();
  }

  async function saveStaff() {
    const supabase = getSupabaseBrowser();
    await supabase.from("staff_members").insert(form);
    setForm(emptyForm);
    setShowModal(false);
    await loadStaff();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl text-white">Staff Members</h1>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="rounded-md bg-brand-red px-4 py-2 text-sm text-white hover:bg-brand-red-hover"
        >
          Add Staff Member
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-brand-border bg-brand-surface">
        <table className="w-full text-left text-sm">
          <thead className="bg-brand-elevated text-xs uppercase text-white">
            <tr>
              <th className="px-4 py-3">Full Name</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Division</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Active</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((row, index) => (
              <tr
                key={row.id}
                className={`border-b border-brand-border text-white ${
                  index % 2 === 1 ? "bg-brand-stripe" : ""
                }`}
              >
                <td className="px-4 py-3">{row.full_name}</td>
                <td className="px-4 py-3">{row.phone_number}</td>
                <td className="px-4 py-3">{row.email}</td>
                <td className="px-4 py-3">{row.division}</td>
                <td className="px-4 py-3">{row.role}</td>
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={row.is_active}
                    onChange={(e) => toggleActive(row.id, e.target.checked)}
                    className="h-4 w-4 accent-brand-red"
                  />
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => deleteStaff(row.id)}
                    className="text-sm text-red-500 hover:underline"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-xl border border-brand-border bg-brand-surface p-6">
            <h2 className="mb-4 text-lg text-white">Add Staff Member</h2>
            <div className="space-y-3">
              <input
                placeholder="Full name"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                className="w-full rounded-md border border-brand-border bg-brand-black px-3 py-2 text-white"
              />
              <input
                placeholder="Phone number"
                value={form.phone_number}
                onChange={(e) =>
                  setForm({ ...form, phone_number: e.target.value })
                }
                className="w-full rounded-md border border-brand-border bg-brand-black px-3 py-2 text-white"
              />
              <input
                placeholder="Email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full rounded-md border border-brand-border bg-brand-black px-3 py-2 text-white"
              />
              <select
                value={form.division}
                onChange={(e) => setForm({ ...form, division: e.target.value })}
                className="w-full rounded-md border border-brand-border bg-brand-black px-3 py-2 text-white"
              >
                {divisionOptions.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <input
                placeholder="Role"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full rounded-md border border-brand-border bg-brand-black px-3 py-2 text-white"
              />
            </div>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={saveStaff}
                className="flex-1 rounded-md bg-brand-red py-2 text-white"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="flex-1 rounded-md border border-brand-border py-2 text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
