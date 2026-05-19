import { getSupabaseServer } from "@/lib/supabase-server";
import { isLikelySupabaseProjectUrl } from "@/lib/supabase-env";

export async function insertAuditLog(params: {
  eventType: string;
  conversationId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    if (
      !isLikelySupabaseProjectUrl(process.env.NEXT_PUBLIC_SUPABASE_URL) ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY
    ) {
      return;
    }

    const supabaseServer = getSupabaseServer();

    const { error } = await supabaseServer.from("audit_logs").insert({
      event_type: params.eventType,
      conversation_id: params.conversationId ?? null,
      metadata: params.metadata ?? null,
    });

    if (error) {
      console.error("Failed to insert audit log", { params, error });
    }
  } catch (error) {
    console.error("Unexpected audit log failure", { params, error });
  }
}
