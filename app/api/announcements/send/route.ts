import { supabaseServer } from "@/lib/supabase-server";
import { sendWhatsAppMessage } from "@/lib/twilio";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message, targetGroup } = body;

    if (!message || !targetGroup) {
      return Response.json(
        { error: "message and targetGroup are required" },
        { status: 400 },
      );
    }

    // Fetch target staff members
    let query = supabaseServer
      .from("staff_members")
      .select("id, full_name, phone_number")
      .eq("is_active", true);

    if (targetGroup !== "all") {
      query = query.eq("division", targetGroup);
    }

    const { data: staff, error: staffError } = await query;

    if (staffError) {
      console.error("Staff fetch error:", staffError);
      return Response.json({ error: "Failed to fetch staff" }, { status: 200 });
    }

    if (!staff || staff.length === 0) {
      return Response.json(
        { error: "No active staff found for this group" },
        { status: 200 },
      );
    }

    // Send WhatsApp message to each staff member
    const results = await Promise.allSettled(
      staff.map((member) =>
        sendWhatsAppMessage(member.phone_number, message),
      ),
    );

    const successCount = results.filter((r) => r.status === "fulfilled").length;

    const failCount = results.filter((r) => r.status === "rejected").length;

    if (failCount > 0) {
      console.error(`Announcement: ${failCount} messages failed to send`);
    }

    // Log announcement to Supabase
    const { error: logError } = await supabaseServer.from("announcements").insert({
      message,
      target_group: targetGroup,
      recipient_count: successCount,
    });

    if (logError) {
      console.error("Announcement log error:", logError);
    }

    console.log("Announcement sent:", {
      targetGroup,
      total: staff.length,
      successCount,
      failCount,
    });

    return Response.json({
      success: true,
      sent_to: successCount,
      failed: failCount,
      total: staff.length,
    });
  } catch (error) {
    console.error("Announcement route error:", error);
    return Response.json({ error: "Internal server error" }, { status: 200 });
  }
}
