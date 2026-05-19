import { getSupabaseServer } from "@/lib/supabase-server";
import { isLikelySupabaseProjectUrl } from "@/lib/supabase-env";

export async function getLatestWebhookErrorMessage(): Promise<string | null> {
  try {
    if (
      !isLikelySupabaseProjectUrl(process.env.NEXT_PUBLIC_SUPABASE_URL) ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY
    ) {
      return null;
    }

    const supabaseServer = getSupabaseServer();

    const { data, error } = await supabaseServer
      .from("audit_logs")
      .select("metadata, created_at")
      .eq("event_type", "webhook_error")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Failed to load latest webhook error", { error });
      return null;
    }

    const message =
      typeof data?.metadata === "object" &&
      data.metadata !== null &&
      "message" in data.metadata &&
      typeof (data.metadata as { message?: unknown }).message === "string"
        ? (data.metadata as { message: string }).message
        : null;

    return message;
  } catch (error) {
    console.error("Unexpected error loading latest webhook error", { error });
    return null;
  }
}
