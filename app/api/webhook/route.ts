import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { insertAuditLog } from "@/lib/audit";
import { runAgent } from "@/lib/agent";
import { supabaseServer } from "@/lib/supabase-server";
import { sendWhatsAppMessage } from "@/lib/twilio";

export const runtime = "nodejs";

function ok() {
  return new Response(null, { status: 200 });
}

function serializeError(error: unknown) {
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

type ConversationRow = {
  id: string;
  strike_count?: number | null;
  booking_step?: string | null;
  booking_data?: Record<string, unknown> | null;
};

export async function GET() {
  return new Response("Webhook active", { status: 200 });
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const from = String(formData.get("From") ?? "");
    const body = String(formData.get("Body") ?? "");
    const sid = String(formData.get("MessageSid") ?? "");
    const profileNameRaw = formData.get("ProfileName");
    const profileName =
      profileNameRaw === null ? "" : String(profileNameRaw).trim();

    console.log("Webhook POST hit", { from, body, sid });

    // Ignore Twilio system messages
    const twilioSystemPhrases = ["join ", "stop", "start", "unstop", "help"];
    const isSystemMessage = twilioSystemPhrases.some((phrase) =>
      body.toLowerCase().trim().startsWith(phrase),
    );

    if (isSystemMessage) {
      return new Response(null, { status: 200 });
    }

    if (!from || !sid) {
      await insertAuditLog({
        eventType: "webhook_error",
        metadata: {
          stage: "validate_inbound_fields",
          message: "Missing required Twilio fields (From and/or MessageSid).",
          fromPresent: Boolean(from),
          sidPresent: Boolean(sid),
        },
      });
      return ok();
    }

    const { data: existingMessage, error: existingMessageError } =
      await supabaseServer
        .from("messages")
        .select("id")
        .eq("twilio_sid", sid)
        .maybeSingle();

    if (existingMessageError) {
      console.error(existingMessageError);
      await insertAuditLog({
        eventType: "webhook_error",
        metadata: {
          stage: "dedupe_lookup",
          message: serializeError(existingMessageError),
        },
      });
      return ok();
    }

    if (existingMessage?.id) {
      return ok();
    }

    const nowIso = new Date().toISOString();

    const { data: existingConversation, error: existingConversationError } =
      await supabaseServer
        .from("conversations")
        .select("id, strike_count, booking_step, booking_data")
        .eq("phone_number", from)
        .maybeSingle();

    if (existingConversationError) {
      console.error(existingConversationError);
      await insertAuditLog({
        eventType: "webhook_error",
        metadata: {
          stage: "lookup_conversation",
          message: serializeError(existingConversationError),
          phone_number: from,
        },
      });
      return ok();
    }

    let conversation = existingConversation as ConversationRow | null;

    if (!conversation?.id) {
      const insertPayload: Record<string, unknown> = {
        phone_number: from,
        last_message_at: nowIso,
        booking_step: "idle",
        booking_data: {},
      };

      if (profileName) {
        insertPayload.whatsapp_name = profileName;
      }

      const { data: insertedConversation, error: insertConversationError } =
        await supabaseServer
          .from("conversations")
          .insert(insertPayload)
          .select("id, strike_count, booking_step, booking_data")
          .single();

      if (insertConversationError || !insertedConversation?.id) {
        console.error(insertConversationError);
        await insertAuditLog({
          eventType: "webhook_error",
          metadata: {
            stage: "insert_conversation",
            message: serializeError(
              insertConversationError ?? "Missing conversation id",
            ),
            phone_number: from,
          },
        });
        return ok();
      }

      conversation = insertedConversation as ConversationRow;
    } else {
      const updatePayload: Record<string, unknown> = {
        last_message_at: nowIso,
      };

      if (profileName) {
        updatePayload.whatsapp_name = profileName;
      }

      const { data: updatedConversation, error: updateConversationError } =
        await supabaseServer
          .from("conversations")
          .update(updatePayload)
          .eq("id", conversation.id)
          .select("id, strike_count, booking_step, booking_data")
          .single();

      if (updateConversationError || !updatedConversation?.id) {
        console.error(updateConversationError);
        await insertAuditLog({
          eventType: "webhook_error",
          conversationId: conversation.id,
          metadata: {
            stage: "update_conversation",
            message: serializeError(updateConversationError),
            phone_number: from,
          },
        });
        return ok();
      }

      conversation = updatedConversation as ConversationRow;
    }

    if (!conversation?.id) {
      await insertAuditLog({
        eventType: "webhook_error",
        metadata: {
          stage: "conversation_id_missing",
          message: "Conversation id missing after upsert logic.",
          phone_number: from,
        },
      });
      return ok();
    }

    const { error: insertUserMessageError } = await supabaseServer
      .from("messages")
      .insert({
        conversation_id: conversation.id,
        twilio_sid: sid,
        role: "user",
        content: body,
      });

    if (insertUserMessageError) {
      console.error(insertUserMessageError);
      await insertAuditLog({
        eventType: "webhook_error",
        conversationId: conversation.id,
        metadata: {
          stage: "insert_user_message",
          message: serializeError(insertUserMessageError),
          twilio_sid: sid,
        },
      });
      return ok();
    }

    const { data: historyRows, error: historyError } = await supabaseServer
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: true })
      .limit(10);

    if (historyError) {
      console.error(historyError);
      await insertAuditLog({
        eventType: "webhook_error",
        conversationId: conversation.id,
        metadata: {
          stage: "load_history",
          message: serializeError(historyError),
        },
      });
      return ok();
    }

    const conversationHistory = (historyRows || []).map((row) =>
      row.role === "user"
        ? new HumanMessage(row.content)
        : new AIMessage(row.content),
    );

    const bookingStep =
      (conversation.booking_step as
        | "idle"
        | "name"
        | "division"
        | "purpose"
        | "date"
        | "time"
        | "confirm") || "idle";
    const bookingData =
      (conversation.booking_data as Record<string, string | undefined>) || {};

    const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
    const { count: recentCount, error: rateLimitError } = await supabaseServer
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("conversation_id", conversation.id)
      .gte("created_at", oneMinuteAgo);

    if (rateLimitError) {
      console.error(rateLimitError);
    }

    const isRateLimited = (recentCount || 0) > 10;
    const isSpam = (conversation.strike_count || 0) >= 3;

    let agentReply = "I am sorry, I could not process your request. Please try again.";
    let updatedBookingStep = bookingStep;
    let updatedBookingData = bookingData;

    try {
      console.log("Calling runAgent with:", {
        body,
        from,
        bookingStep,
        isSpam,
        isRateLimited,
      });
      const agentResult = await runAgent(
        body,
        from,
        conversationHistory,
        bookingStep,
        bookingData,
        isSpam,
        isRateLimited,
      );
      console.log("Agent returned:", agentResult);

      agentReply = agentResult.reply;
      updatedBookingStep = agentResult.bookingStep;
      updatedBookingData = agentResult.bookingData;
    } catch (error) {
      console.error("Agent failed with error:", error);
      await insertAuditLog({
        eventType: "webhook_error",
        conversationId: conversation.id,
        metadata: {
          stage: "run_agent",
          message: serializeError(error),
        },
      });
      agentReply =
        "I am having trouble responding right now. Please try again shortly.";
    }

    const persistPayload: Record<string, unknown> = {
      last_message_at: nowIso,
      booking_step: updatedBookingStep,
      booking_data: updatedBookingData,
    };
    if (profileName) {
      persistPayload.whatsapp_name = profileName;
    }

    const { error: persistBookingError } = await supabaseServer
      .from("conversations")
      .update(persistPayload)
      .eq("id", conversation.id);

    if (persistBookingError) {
      console.error(persistBookingError);
      await insertAuditLog({
        eventType: "webhook_error",
        conversationId: conversation.id,
        metadata: {
          stage: "persist_booking_state",
          message: serializeError(persistBookingError),
        },
      });
    }

    let outboundSid: string | undefined;
    try {
      outboundSid = await sendWhatsAppMessage(from, agentReply);
    } catch (error) {
      console.error(error);
      await insertAuditLog({
        eventType: "webhook_error",
        conversationId: conversation.id,
        metadata: {
          stage: "twilio_outbound",
          message: serializeError(error),
          to: from,
        },
      });
      return ok();
    }

    const { error: insertAssistantMessageError } = await supabaseServer
      .from("messages")
      .insert({
        conversation_id: conversation.id,
        twilio_sid: outboundSid ?? null,
        role: "assistant",
        content: agentReply,
        node_used: "langgraph",
      });

    if (insertAssistantMessageError) {
      console.error(insertAssistantMessageError);
      await insertAuditLog({
        eventType: "webhook_error",
        conversationId: conversation.id,
        metadata: {
          stage: "insert_assistant_message",
          message: serializeError(insertAssistantMessageError),
          outbound_sid: outboundSid ?? null,
        },
      });
      return ok();
    }

    return ok();
  } catch (error) {
    console.error(error);
    await insertAuditLog({
      eventType: "webhook_error",
      metadata: {
        stage: "unhandled",
        message: serializeError(error),
      },
    });
    return ok();
  }
}
