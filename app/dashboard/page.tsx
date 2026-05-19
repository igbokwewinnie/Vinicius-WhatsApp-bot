"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { timeAgo } from "@/lib/time-ago";

type Conversation = {
  id: string;
  phone_number: string;
  whatsapp_name: string | null;
  status: string;
  last_message_at: string | null;
};

type Message = {
  id: string;
  role: string;
  content: string;
  node_used: string | null;
  created_at: string;
};

const statusColors: Record<string, string> = {
  active: "bg-brand-red",
  escalated: "bg-[#dc2626]",
  resolved: "bg-[#6b7280]",
  spam: "bg-[#d97706]",
};

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  const loadConversations = useCallback(async () => {
    const supabase = getSupabaseBrowser();
    const { data } = await supabase
      .from("conversations")
      .select("id, phone_number, whatsapp_name, status, last_message_at")
      .order("last_message_at", { ascending: false });

    setConversations((data as Conversation[]) ?? []);
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    setLoadingMessages(true);
    const supabase = getSupabaseBrowser();
    const { data } = await supabase
      .from("messages")
      .select("id, role, content, node_used, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    setMessages((data as Message[]) ?? []);
    setLoadingMessages(false);
  }, []);

  useEffect(() => {
    loadConversations();

    const supabase = getSupabaseBrowser();
    const channel = supabase
      .channel("conversations-list")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        () => {
          loadConversations();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadConversations]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }

    loadMessages(selectedId);

    const supabase = getSupabaseBrowser();
    const channel = supabase
      .channel(`messages-${selectedId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${selectedId}`,
        },
        () => {
          loadMessages(selectedId);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedId, loadMessages]);

  async function updateStatus(status: string) {
    if (!selectedId) return;
    const supabase = getSupabaseBrowser();
    await supabase
      .from("conversations")
      .update({ status })
      .eq("id", selectedId);
    await loadConversations();
  }

  return (
    <div className="-m-6 flex h-[calc(100vh-56px)] overflow-hidden">
      <div className="w-[320px] shrink-0 overflow-y-auto border-r border-brand-border bg-brand-black">
        <h2 className="p-4 text-lg text-white">Conversations</h2>
        <div>
          {conversations.map((conversation) => {
            const label =
              conversation.whatsapp_name || conversation.phone_number;
            const isSelected = conversation.id === selectedId;
            return (
              <button
                key={conversation.id}
                type="button"
                onClick={() => setSelectedId(conversation.id)}
                className={`w-full border-b border-brand-border px-4 py-3 text-left transition-colors ${
                  isSelected ? "bg-brand-elevated" : "hover:bg-brand-surface"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="truncate text-sm text-white">{label}</span>
                  <span
                    className={`shrink-0 rounded px-2 py-0.5 text-xs text-white ${
                      statusColors[conversation.status] ?? "bg-[#6b7280]"
                    }`}
                  >
                    {conversation.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-brand-muted">
                  {timeAgo(conversation.last_message_at)}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        {!selected ? (
          <div className="flex flex-1 items-center justify-center text-brand-muted">
            Select a conversation
          </div>
        ) : (
          <>
            <div className="flex shrink-0 items-center justify-between border-b border-brand-border bg-brand-surface px-4 py-3">
              <div>
                <p className="text-white">{selected.phone_number}</p>
                {selected.whatsapp_name ? (
                  <p className="text-sm text-brand-muted">
                    {selected.whatsapp_name}
                  </p>
                ) : null}
              </div>
              <select
                value={selected.status}
                onChange={(e) => updateStatus(e.target.value)}
                className="rounded-md border border-brand-border bg-brand-black px-3 py-1.5 text-sm text-white"
              >
                <option value="active">active</option>
                <option value="escalated">escalated</option>
                <option value="resolved">resolved</option>
                <option value="spam">spam</option>
              </select>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {loadingMessages ? (
                <p className="text-center text-brand-muted">Loading messages...</p>
              ) : null}
              {messages.map((message) => {
                const isUser = message.role === "user";
                return (
                  <div
                    key={message.id}
                    className={`flex flex-col ${isUser ? "items-start" : "items-end"}`}
                  >
                    <div
                      className={`max-w-[70%] rounded-xl px-3.5 py-2.5 text-sm text-white ${
                        isUser ? "bg-brand-elevated" : "bg-brand-red"
                      }`}
                    >
                      {message.content}
                    </div>
                    {!isUser && message.node_used ? (
                      <span className="mt-0.5 text-[11px] text-brand-muted">
                        {message.node_used}
                      </span>
                    ) : null}
                    <span className="mt-0.5 text-[11px] text-brand-muted">
                      {new Date(message.created_at).toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
