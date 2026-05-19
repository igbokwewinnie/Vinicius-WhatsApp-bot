"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

type Announcement = {
  id: string;
  message: string;
  target_group: string;
  recipient_count: number;
  sent_at: string;
};

const targetOptions = [
  { value: "all", label: "All Staff" },
  { value: "defence", label: "Defence" },
  { value: "infrastructure", label: "Infrastructure" },
  { value: "aviation", label: "Aviation" },
  { value: "technology", label: "Technology" },
  { value: "automobile", label: "Automobile" },
  { value: "agro", label: "Agro" },
];

export default function AnnouncementsPage() {
  const [message, setMessage] = useState("");
  const [targetGroup, setTargetGroup] = useState("all");
  const [recipientCount, setRecipientCount] = useState(0);
  const [history, setHistory] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const loadHistory = useCallback(async () => {
    const supabase = getSupabaseBrowser();
    const { data } = await supabase
      .from("announcements")
      .select("id, message, target_group, recipient_count, sent_at")
      .order("sent_at", { ascending: false });
    setHistory((data as Announcement[]) ?? []);
  }, []);

  const loadRecipientCount = useCallback(async () => {
    const supabase = getSupabaseBrowser();
    let query = supabase
      .from("staff_members")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true);

    if (targetGroup !== "all") {
      query = query.eq("division", targetGroup);
    }

    const { count } = await query;
    setRecipientCount(count ?? 0);
  }, [targetGroup]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    loadRecipientCount();
  }, [loadRecipientCount]);

  async function handleSend() {
    setLoading(true);
    setSuccess("");
    setError("");

    try {
      const response = await fetch("/api/announcements/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, targetGroup }),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        setError(data.error ?? "Failed to send announcement");
        return;
      }

      setSuccess(`Announcement sent to ${data.sent_to} staff members.`);
      setMessage("");
      await loadHistory();
    } catch {
      setError("Failed to send announcement");
    } finally {
      setLoading(false);
    }
  }

  function truncate(text: string, max = 80) {
    if (text.length <= max) return text;
    return `${text.slice(0, max)}...`;
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl text-white">Announcements</h1>

      <div className="rounded-lg border border-brand-border bg-brand-surface p-6">
        <p className="text-white">Send WhatsApp Announcement to Staff</p>
        <textarea
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Write your announcement..."
          className="mt-4 w-full rounded-md border border-brand-border bg-brand-black px-3 py-2 text-white"
        />
        <select
          value={targetGroup}
          onChange={(e) => setTargetGroup(e.target.value)}
          className="mt-4 w-full rounded-md border border-brand-border bg-brand-black px-3 py-2 text-white"
        >
          {targetOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <p className="mt-3 text-sm text-brand-muted">
          This will be sent to {recipientCount} staff members
        </p>
        <button
          type="button"
          disabled={loading || !message.trim()}
          onClick={handleSend}
          className="mt-4 w-full rounded-md bg-brand-red py-2.5 text-white disabled:opacity-60"
        >
          {loading ? "Sending..." : "Send"}
        </button>
        {success ? (
          <p className="mt-3 rounded-md border border-brand-red bg-brand-black px-3 py-2 text-sm text-white">
            {success}
          </p>
        ) : null}
        {error ? <p className="mt-3 text-sm text-red-500">{error}</p> : null}
      </div>

      <div className="mt-8">
        <h2 className="mb-4 text-lg text-white">Past Announcements</h2>
        <div className="overflow-hidden rounded-lg border border-brand-border bg-brand-surface">
          <table className="w-full text-left text-sm">
            <thead className="bg-brand-elevated text-xs uppercase text-white">
              <tr>
                <th className="px-4 py-3">Message</th>
                <th className="px-4 py-3">Target</th>
                <th className="px-4 py-3">Recipients</th>
                <th className="px-4 py-3">Sent At</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row, index) => (
                <tr
                  key={row.id}
                  className={`border-b border-brand-border text-white ${
                    index % 2 === 1 ? "bg-brand-stripe" : ""
                  }`}
                >
                  <td className="px-4 py-3">{truncate(row.message)}</td>
                  <td className="px-4 py-3">{row.target_group}</td>
                  <td className="px-4 py-3">{row.recipient_count}</td>
                  <td className="px-4 py-3">
                    {new Date(row.sent_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
