import twilio from "twilio";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

export async function sendWhatsAppMessage(to: string, body: string) {
  const accountSid = requireEnv("TWILIO_ACCOUNT_SID");
  const authToken = requireEnv("TWILIO_AUTH_TOKEN");
  const from = requireEnv("TWILIO_WHATSAPP_NUMBER");

  const client = twilio(accountSid, authToken);

  try {
    const message = await client.messages.create({
      from,
      to,
      body,
    });

    console.log("Twilio message sent", {
      sid: message.sid,
      status: message.status,
      to,
    });

    return message.sid;
  } catch (error) {
    console.error("Twilio send failed", { to, error });
    throw error;
  }
}
