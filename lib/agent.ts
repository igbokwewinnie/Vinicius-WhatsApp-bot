import { BaseMessage, HumanMessage } from "@langchain/core/messages";
import { Annotation, END, StateGraph } from "@langchain/langgraph";
import { ChatGroq } from "@langchain/groq";
import { supabaseServer } from "./supabase-server";
import fs from "fs";
import path from "path";

// ── State ────────────────────────────────────────────────────
interface VinciState {
  messages: BaseMessage[];
  phone_number: string;
  intent: "faq" | "booking" | "support" | "escalate" | "unknown";
  booking_step:
    | "idle"
    | "name"
    | "division"
    | "purpose"
    | "date"
    | "time";
  booking_data: {
    full_name?: string;
    division?: string;
    purpose?: string;
    preferred_date?: string;
    preferred_time?: string;
  };
  is_spam: boolean;
  is_rate_limited: boolean;
  escalated: boolean;
  final_response: string;
}

// ── LLM ─────────────────────────────────────────────────────
const llm = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: "llama-3.3-70b-versatile",
  temperature: 0.4,
});

// ── Agent prompt ─────────────────────────────────────────────
const agentPrompt = fs.readFileSync(
  path.join(process.cwd(), "AGENT_PROMPT.md"),
  "utf-8",
);

// ── Helpers ──────────────────────────────────────────────────

// Parse flexible date input into YYYY-MM-DD
async function parseDate(input: string): Promise<string | null> {
  const res = await llm.invoke([
    {
      role: "system",
      content: `Convert the user's date input to YYYY-MM-DD format.
Accept any reasonable date format: "12 June 2026", "12/06/2026",
"June 12 2026", "12-06-2026", etc.
If it is a valid date reply with ONLY the date in YYYY-MM-DD format.
If it is not a recognizable date reply with the word: invalid`,
    },
    { role: "user", content: input },
  ]);
  const result = (res.content as string).trim();
  return result === "invalid" ? null : result;
}

// Parse flexible time input into HH:MM
async function parseTime(input: string): Promise<string | null> {
  const res = await llm.invoke([
    {
      role: "system",
      content: `Convert the user's time input to HH:MM 24-hour format.
Accept any reasonable time: "9am", "09:00am", "9:00", "14:00", "2pm", etc.
Only accept times between 08:00 and 17:00.
If valid reply with ONLY the time in HH:MM format.
If invalid or outside business hours reply with the word: invalid`,
    },
    { role: "user", content: input },
  ]);
  const result = (res.content as string).trim();
  return result === "invalid" ? null : result;
}

// Search knowledge base
async function searchKnowledgeBase(query: string): Promise<string> {
  const keywords = query
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .split(" ")
    .filter((w) => w.length > 3)
    .slice(0, 5);

  const orConditions = keywords
    .map((k) => `question.ilike.%${k}%,answer.ilike.%${k}%`)
    .join(",");

  const { data } = await supabaseServer
    .from("knowledge_base")
    .select("question, answer, category")
    .or(orConditions)
    .limit(4);

  if (!data || data.length === 0) return "";
  return data.map((r) => `Q: ${r.question}\nA: ${r.answer}`).join("\n\n");
}

// Check if user wants to exit booking flow
async function checkBookingExit(
  message: string,
  currentStep: string,
): Promise<"continue" | "question" | "escalate" | "cancel"> {
  const res = await llm.invoke([
    {
      role: "system",
      content: `The user is booking an appointment. Current step: "${currentStep}".
Expected input: ${
        currentStep === "name"
          ? "their full name"
          : currentStep === "division"
            ? "a division name or number 1-6"
            : currentStep === "purpose"
              ? "meeting purpose"
              : currentStep === "date"
                ? "a date"
                : "a time"
      }.

Classify as:
- "continue" if the message is answering the current booking question
- "question" if the message is asking about something unrelated to booking
- "escalate" if the message mentions contracts, legal issues, pricing negotiations, or explicitly wants a human
- "cancel" if the user wants to stop booking entirely

Reply with only one word.`,
    },
    { role: "user", content: message },
  ]);
  const r = (res.content as string).toLowerCase().trim();
  if (["continue", "question", "escalate", "cancel"].includes(r))
    return r as "continue" | "question" | "escalate" | "cancel";
  return "continue";
}

// ── Nodes ────────────────────────────────────────────────────

async function guardNode(
  state: VinciState,
): Promise<Partial<VinciState>> {
  if (state.is_spam) {
    return {
      final_response:
        "This conversation has been flagged. A team member will review it shortly.",
    };
  }
  if (state.is_rate_limited) {
    return {
      final_response:
        "You are sending messages too quickly. Please wait a moment and try again.",
    };
  }
  return {};
}

async function classifyNode(
  state: VinciState,
): Promise<Partial<VinciState>> {
  const lastMessage =
    state.messages[state.messages.length - 1].content as string;

  // If already in booking flow, stay in booking
  if (state.booking_step !== "idle") {
    return { intent: "booking" };
  }

  const res = await llm.invoke([
    {
      role: "system",
      content: `Classify this message into exactly one intent:
- faq: questions about Vinicius Group, its services, divisions, location, contacts
- booking: user wants to book or schedule a meeting or appointment,
  or says "continue my booking" or "resume booking"
- support: complaints or follow-ups about something specific
- escalate: contracts, legal disputes, procurement tenders, or explicitly wants a human

Reply with only one word.`,
    },
    { role: "user", content: lastMessage },
  ]);

  const intent = (res.content as string).toLowerCase().trim();
  const valid = ["faq", "booking", "support", "escalate"];
  return {
    intent: valid.includes(intent)
      ? (intent as VinciState["intent"])
      : "faq",
  };
}

async function faqNode(state: VinciState): Promise<Partial<VinciState>> {
  const lastMessage =
    state.messages[state.messages.length - 1].content as string;

  const context = await searchKnowledgeBase(lastMessage);

  const systemContent =
    agentPrompt +
    (context
      ? `\n\nKNOWLEDGE BASE CONTEXT (use this to answer):\n${context}`
      : "\n\nNo specific context found. Answer helpfully from general knowledge about the company.");

  const res = await llm.invoke([
    { role: "system", content: systemContent },
    { role: "user", content: lastMessage },
  ]);

  return { final_response: res.content as string };
}

async function bookingNode(
  state: VinciState,
): Promise<Partial<VinciState>> {
  const lastMessage = (
    state.messages[state.messages.length - 1].content as string
  ).trim();

  // Check if user wants to exit the flow mid-booking
  if (state.booking_step !== "idle") {
    const exitIntent = await checkBookingExit(
      lastMessage,
      state.booking_step,
    );

    if (exitIntent === "question") {
      const context = await searchKnowledgeBase(lastMessage);
      const stepReminders: Record<string, string> = {
        name: "Would you like to continue with your booking? If so, could I get your full name?",
        division:
          "Would you like to continue with your booking? If so, which division would you like to meet with?",
        purpose:
          "Would you like to continue with the booking? If so, what is the purpose of your meeting?",
        date: "Would you like to continue with the booking? If so, what date works for you?",
        time: "Would you like to continue with the booking? If so, what time works for you?",
      };
      const res = await llm.invoke([
        {
          role: "system",
          content:
            agentPrompt +
            (context ? `\n\nCONTEXT:\n${context}` : "") +
            `\n\nAnswer the user's question naturally. At the end, gently remind them: "${
              stepReminders[state.booking_step] ?? ""
            }"`,
        },
        { role: "user", content: lastMessage },
      ]);
      return {
        booking_step: state.booking_step,
        booking_data: state.booking_data,
        final_response: res.content as string,
      };
    }

    if (exitIntent === "escalate") {
      await supabaseServer
        .from("conversations")
        .update({ status: "escalated" })
        .eq("phone_number", state.phone_number);

      await supabaseServer.from("audit_logs").insert({
        event_type: "conversation_escalated",
        metadata: {
          phone_number: state.phone_number,
          reason: "switched_from_booking",
          saved_progress: state.booking_data,
        },
      });

      const saved = [
        state.booking_data.full_name
          ? `Name: ${state.booking_data.full_name}`
          : "",
        state.booking_data.division
          ? `Division: ${state.booking_data.division}`
          : "",
        state.booking_data.purpose
          ? `Purpose: ${state.booking_data.purpose}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");

      return {
        intent: "escalate",
        booking_step: "idle",
        booking_data: {},
        escalated: true,
        final_response:
          `Understood. I am connecting you with a member of the Vinicius Group team who will follow up with you directly.\n\n` +
          (saved ? `I have saved your booking progress:\n${saved}\n\n` : "") +
          `Whenever you are ready to continue booking your appointment, just say "continue my booking".`,
      };
    }

    if (exitIntent === "cancel") {
      return {
        booking_step: "idle",
        booking_data: {},
        final_response:
          "No problem, I have cancelled the booking. Is there anything else I can help you with?",
      };
    }
    // exitIntent === "continue" — proceed with normal step logic
  }

  // Step: idle — start booking
  if (state.booking_step === "idle") {
    return {
      booking_step: "name",
      final_response:
        "I would be happy to help you book an appointment with Vinicius Group. Could I start with your full name please?",
    };
  }

  // Step: name
  if (state.booking_step === "name") {
    return {
      booking_step: "division",
      booking_data: { ...state.booking_data, full_name: lastMessage },
      final_response: `Thank you, ${lastMessage}. Which division would you like to meet with?\n\n1. Defence & Security\n2. Infrastructure\n3. Aviation\n4. Technology\n5. Automobile\n6. Agro-Industrial\n\nYou can type the number or the name.`,
    };
  }

  // Step: division
  if (state.booking_step === "division") {
    const divisionMap: Record<string, string> = {
      "1": "Defence & Security",
      "2": "Infrastructure",
      "3": "Aviation",
      "4": "Technology",
      "5": "Automobile",
      "6": "Agro-Industrial",
    };
    const division = divisionMap[lastMessage.trim()] || lastMessage;
    return {
      booking_step: "purpose",
      booking_data: { ...state.booking_data, division },
      final_response: `Got it — ${division}. What is the purpose of this meeting? A brief description is fine.`,
    };
  }

  // Step: purpose
  if (state.booking_step === "purpose") {
    return {
      booking_step: "date",
      booking_data: { ...state.booking_data, purpose: lastMessage },
      final_response:
        "What is your preferred date?",
    };
  }

  // Step: date — flexible parsing
  if (state.booking_step === "date") {
    const parsed = await parseDate(lastMessage);
    if (!parsed) {
      return {
        booking_step: "date",
        booking_data: state.booking_data,
        final_response:
          "I could not quite read that date. Could you try again? For example: 25 June 2026 or 25/06/2026. We are available Monday to Friday.",
      };
    }
    return {
      booking_step: "time",
      booking_data: { ...state.booking_data, preferred_date: parsed },
      final_response:
        "What time would you prefer? We are available between 8am and 5pm WAT.",
    };
  }

  // Step: time — flexible parsing
  if (state.booking_step === "time") {
    const parsed = await parseTime(lastMessage);
    if (!parsed) {
      return {
        booking_step: "time",
        booking_data: state.booking_data,
        final_response:
          "I could not read that time. Please provide a time between 8am and 5pm, for example: 9am, 10:30, or 14:00.",
      };
    }

    const { data: conversation } = await supabaseServer
      .from("conversations")
      .select("id")
      .eq("phone_number", state.phone_number)
      .single();

    const bookingPayload = {
      conversation_id: conversation?.id ?? null,
      full_name: state.booking_data.full_name ?? "",
      phone_number: state.phone_number,
      division: state.booking_data.division ?? "general",
      purpose: state.booking_data.purpose ?? "",
      preferred_date: state.booking_data.preferred_date ?? "",
      preferred_time: parsed,
      status: "pending",
    };

    await supabaseServer.from("appointments").insert(bookingPayload);
    await supabaseServer.from("audit_logs").insert({
      event_type: "appointment_booked",
      metadata: bookingPayload,
    });

    return {
      booking_step: "idle",
      booking_data: {},
      final_response:
        `Your appointment has been booked.\n\n` +
        `Here is your summary:\n` +
        `Name: ${state.booking_data.full_name}\n` +
        `Division: ${state.booking_data.division}\n` +
        `Date: ${state.booking_data.preferred_date}\n` +
        `Time: ${parsed}\n` +
        `Purpose: ${state.booking_data.purpose}\n\n` +
        `Our team will be in touch to confirm. Is there anything else I can help you with?`,
    };
  }

  return {
    final_response:
      "Something went wrong with the booking. Please say 'book appointment' to start again.",
  };
}

async function supportNode(
  state: VinciState,
): Promise<Partial<VinciState>> {
  const lastMessage =
    state.messages[state.messages.length - 1].content as string;
  const context = await searchKnowledgeBase(lastMessage);

  const res = await llm.invoke([
    {
      role: "system",
      content:
        agentPrompt +
        (context ? `\n\nCONTEXT:\n${context}` : "") +
        "\n\nYou are handling a support request. Be empathetic and solution-focused. If you cannot resolve it, offer to connect them with the team naturally — do not ask permission to escalate, just offer it once as an option.",
    },
    { role: "user", content: lastMessage },
  ]);

  return { final_response: res.content as string };
}

async function escalateNode(
  state: VinciState,
): Promise<Partial<VinciState>> {
  await supabaseServer
    .from("conversations")
    .update({ status: "escalated" })
    .eq("phone_number", state.phone_number);

  await supabaseServer.from("audit_logs").insert({
    event_type: "conversation_escalated",
    metadata: {
      phone_number: state.phone_number,
      reason: "direct_escalation",
    },
  });

  return {
    escalated: true,
    final_response:
      "Thank you for reaching out. I am connecting you with a member of the Vinicius Group team who will follow up with you directly. Please expect a response within one business hour.",
  };
}

async function respondNode(
  state: VinciState,
): Promise<Partial<VinciState>> {
  console.log("VINCI responding:", {
    phone: state.phone_number,
    intent: state.intent,
    response: state.final_response,
  });
  return {};
}

// ── Routing ──────────────────────────────────────────────────

function routeAfterGuard(state: VinciState): string {
  if (state.is_spam || state.is_rate_limited) return "blocked";
  return "classify";
}

function routeIntent(state: VinciState): string {
  const valid = ["faq", "booking", "support", "escalate"];
  return valid.includes(state.intent) ? state.intent : "faq";
}

// ── Graph ────────────────────────────────────────────────────

const VinciStateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => y ?? x,
    default: () => [],
  }),
  phone_number: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => "",
  }),
  intent: Annotation<VinciState["intent"]>({
    reducer: (x, y) => y ?? x,
    default: () => "unknown",
  }),
  booking_step: Annotation<VinciState["booking_step"]>({
    reducer: (x, y) => y ?? x,
    default: () => "idle",
  }),
  booking_data: Annotation<VinciState["booking_data"]>({
    reducer: (x, y) => y ?? x,
    default: () => ({}),
  }),
  is_spam: Annotation<boolean>({
    reducer: (x, y) => y ?? x,
    default: () => false,
  }),
  is_rate_limited: Annotation<boolean>({
    reducer: (x, y) => y ?? x,
    default: () => false,
  }),
  escalated: Annotation<boolean>({
    reducer: (x, y) => y ?? x,
    default: () => false,
  }),
  final_response: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => "",
  }),
});

const workflow = new StateGraph(VinciStateAnnotation)
  .addNode("guard", guardNode)
  .addNode("classify", classifyNode)
  .addNode("faq", faqNode)
  .addNode("booking", bookingNode)
  .addNode("support", supportNode)
  .addNode("escalate", escalateNode)
  .addNode("respond", respondNode)
  .addEdge("__start__", "guard")
  .addConditionalEdges("guard", routeAfterGuard, {
    blocked: "respond",
    classify: "classify",
  })
  .addConditionalEdges("classify", routeIntent, {
    faq: "faq",
    booking: "booking",
    support: "support",
    escalate: "escalate",
  })
  .addEdge("faq", "respond")
  .addEdge("booking", "respond")
  .addEdge("support", "respond")
  .addEdge("escalate", "respond")
  .addEdge("respond", END);

export const vinciAgent = workflow.compile();

// ── Public API ───────────────────────────────────────────────

export async function runAgent(
  userMessage: string,
  phoneNumber: string,
  conversationHistory: BaseMessage[],
  bookingStep: VinciState["booking_step"],
  bookingData: VinciState["booking_data"],
  isSpam: boolean,
  isRateLimited: boolean,
): Promise<{
  reply: string;
  bookingStep: VinciState["booking_step"];
  bookingData: VinciState["booking_data"];
  intent: string;
}> {
  const result = await vinciAgent.invoke({
    messages: [...conversationHistory, new HumanMessage(userMessage)],
    phone_number: phoneNumber,
    intent: "unknown",
    booking_step: bookingStep,
    booking_data: bookingData,
    is_spam: isSpam,
    is_rate_limited: isRateLimited,
    escalated: false,
    final_response: "",
  });

  return {
    reply:
      result.final_response ||
      "I am sorry, I could not process that. Please try again.",
    bookingStep: result.booking_step,
    bookingData: result.booking_data,
    intent: result.intent,
  };
}
