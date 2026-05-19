"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

type KnowledgeEntry = {
  id: string;
  category: string;
  question: string;
  answer: string;
  division: string | null;
};

const emptyForm = {
  category: "",
  question: "",
  answer: "",
  division: "",
};

export default function KnowledgeBasePage() {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const loadEntries = useCallback(async () => {
    const supabase = getSupabaseBrowser();
    const { data } = await supabase
      .from("knowledge_base")
      .select("*")
      .order("created_at", { ascending: false });
    setEntries((data as KnowledgeEntry[]) ?? []);
  }, []);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (row) =>
        row.category.toLowerCase().includes(q) ||
        row.question.toLowerCase().includes(q) ||
        row.answer.toLowerCase().includes(q) ||
        (row.division ?? "").toLowerCase().includes(q),
    );
  }, [entries, search]);

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm);
    setShowModal(true);
  }

  function openEdit(row: KnowledgeEntry) {
    setEditingId(row.id);
    setForm({
      category: row.category,
      question: row.question,
      answer: row.answer,
      division: row.division ?? "",
    });
    setShowModal(true);
  }

  async function saveEntry() {
    const supabase = getSupabaseBrowser();
    const payload = {
      category: form.category,
      question: form.question,
      answer: form.answer,
      division: form.division || null,
    };

    if (editingId) {
      await supabase.from("knowledge_base").update(payload).eq("id", editingId);
    } else {
      await supabase.from("knowledge_base").insert(payload);
    }

    setShowModal(false);
    setForm(emptyForm);
    setEditingId(null);
    await loadEntries();
  }

  async function deleteEntry(id: string) {
    if (!confirm("Delete this entry?")) return;
    const supabase = getSupabaseBrowser();
    await supabase.from("knowledge_base").delete().eq("id", id);
    await loadEntries();
  }

  function truncate(text: string, max = 80) {
    if (text.length <= max) return text;
    return `${text.slice(0, max)}...`;
  }

  return (
    <div>
      <h1 className="text-2xl text-white">Knowledge Base</h1>
      <p className="mt-2 text-sm text-brand-muted">
        This is what VINCI uses to answer questions. Add real Vinicius Group
        information here.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search entries..."
          className="w-full max-w-md rounded-md border border-brand-border bg-brand-surface px-3 py-2 text-white"
        />
        <button
          type="button"
          onClick={openAdd}
          className="rounded-md bg-brand-red px-4 py-2 text-sm text-white"
        >
          Add Entry
        </button>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-brand-border bg-brand-surface">
        <table className="w-full text-left text-sm">
          <thead className="bg-brand-elevated text-xs uppercase text-white">
            <tr>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Question</th>
              <th className="px-4 py-3">Answer</th>
              <th className="px-4 py-3">Division</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, index) => (
              <tr
                key={row.id}
                className={`border-b border-brand-border text-white ${
                  index % 2 === 1 ? "bg-brand-stripe" : ""
                }`}
              >
                <td className="px-4 py-3">{row.category}</td>
                <td className="px-4 py-3">{row.question}</td>
                <td className="px-4 py-3">{truncate(row.answer)}</td>
                <td className="px-4 py-3">{row.division ?? "-"}</td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => openEdit(row)}
                    className="mr-3 text-brand-red hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteEntry(row.id)}
                    className="text-red-500 hover:underline"
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
          <div className="w-full max-w-lg rounded-xl border border-brand-border bg-brand-surface p-6">
            <h2 className="mb-4 text-lg text-white">
              {editingId ? "Edit Entry" : "Add Entry"}
            </h2>
            <div className="space-y-3">
              <input
                placeholder="Category"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full rounded-md border border-brand-border bg-brand-black px-3 py-2 text-white"
              />
              <input
                placeholder="Question"
                value={form.question}
                onChange={(e) => setForm({ ...form, question: e.target.value })}
                className="w-full rounded-md border border-brand-border bg-brand-black px-3 py-2 text-white"
              />
              <textarea
                placeholder="Answer"
                rows={4}
                value={form.answer}
                onChange={(e) => setForm({ ...form, answer: e.target.value })}
                className="w-full rounded-md border border-brand-border bg-brand-black px-3 py-2 text-white"
              />
              <input
                placeholder="Division (optional)"
                value={form.division}
                onChange={(e) => setForm({ ...form, division: e.target.value })}
                className="w-full rounded-md border border-brand-border bg-brand-black px-3 py-2 text-white"
              />
            </div>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={saveEntry}
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
