import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { ChatGroq } from "@langchain/groq";
import { Annotation, END, StateGraph } from "@langchain/langgraph";
import fs from "fs";
import path from "path";
import { supabaseServer } from "./supabase-server";

export interface VinciState {
  messages: BaseMessage[];
  phone_number: string;
  intent: "faq" | "booking" | "support" | "escalate" | "unknown";
  booking_step:
    | "idle"
    | "name"
    | "division"
    | "purpose"
    | "date"
    | "time"
    | "confirm";
  booking_data: {
    full_name?: string;
    division?: string;
    preferred_date?: string;
    preferred_time?: string;
    purpose?: string;
  };
  is_spam: boolean;
  is_rate_limited: boolean;
  escalated: boolean;
  final_response: string;
}

export type AgentRunResult = {
  reply: string;
  bookingStep: VinciState["booking_step"];
  bookingData: VinciState["booking_data"];
  intent: VinciState["intent"];
};

const agentPromptPath = path.join(process.cwd(), "AGENT_PROMPT.md");
const agentPrompt = fs.existsSync(agentPromptPath)
  ? fs.readFileSync(agentPromptPath, "utf8")
  : "You are VINCI, the Vinicius Group assistant.";

const llm = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
  temperature: 0.3,
});

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
    default: () => "unknown" as const,
  }),
  booking_step: Annotation<VinciState["booking_step"]>({
    reducer: (x, y) => y ?? x,
    default: () => "idle" as const,
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

function messageContent(message: BaseMessage): string {
  const content = message.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text?: string }).text ?? "");
        }
        return "";
      })
      .join(" ")
      .trim();
  }
  return String(content ?? "");
}

function getLastUserMessage(state: VinciState): string {
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const msg = state.messages[i];
    if (msg instanceof HumanMessage || msg.getType() === "human") {
      return messageContent(msg);
    }
  }
  return "";
}

function llmText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  return String(content ?? "").trim();
}

function normalizeDivision(input: string): string {
  const value = input.trim().toLowerCase();
  if (value === "1" || value.includes("defence") || value.includes("defense")) {
    return "defence";
  }
  if (value === "2" || value.includes("infrastructure")) return "infrastructure";
  if (value === "3" || value.includes("aviation")) return "aviation";
  if (value === "4" || value.includes("technology")) return "technology";
  if (value === "5" || value.includes("automobile")) return "automobile";
  if (value === "6" || value.includes("agro")) return "agro";
  return "general";
}

function parsePreferredDate(input: string): string | null {
  const match = input.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

function parsePreferredTime(input: string): string | null {
  const match = input.trim().match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, hour, minute] = match;
  const h = Number(hour);
  const m = Number(minute);
  if (h < 8 || h > 17 || m < 0 || m > 59) return null;
  return `${hour}:${minute}:00`;
}

async function guardNode(state: VinciState): Promise<Partial<VinciState>> {
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

async function classifyNode(state: VinciState): Promise<Partial<VinciState>> {
  const lastMessage = getLastUserMessage(state);
  if (!lastMessage) {
    return { intent: "faq" };
  }

  try {
    const response = await llm.invoke([
      new SystemMessage(
        `Classify the user message into exactly one of these intents:
faq, booking, support, escalate.
Rules:
- faq: questions about Vinicius Group, its divisions, services, or general info
- booking: user wants to schedule a meeting or appointment
- support: complaints, follow-ups, or help with something specific
- escalate: contracts, pricing, legal matters, or user asks for a human
Respond with only the single word. Nothing else.`,
      ),
      new HumanMessage(lastMessage),
    ]);

    const raw = llmText(response.content).toLowerCase();
    const valid = ["faq", "booking", "support", "escalate"] as const;
    const intent = valid.find((item) => raw.includes(item)) ?? "faq";
    return { intent };
  } catch (error) {
    console.error("classifyNode failed", error);
    return { intent: "faq" };
  }
}

async function searchKnowledgeBase(userMessage: string) {
  const keywords = userMessage.split(/\s+/).filter(Boolean).slice(0, 3).join(" ");
  if (!keywords) {
    return "No specific information found in knowledge base.";
  }

  const { data, error } = await supabaseServer
    .from("knowledge_base")
    .select("question, answer, category")
    .or(`question.ilike.%${keywords}%,answer.ilike.%${keywords}%`)
    .limit(3);

  if (error) {
    console.error("knowledge_base search failed", error);
    return "No specific information found in knowledge base.";
  }

  if (!data?.length) {
    return "No specific information found in knowledge base.";
  }

  return data
    .map((row) => `Q: ${row.question}\nA: ${row.answer}`)
    .join("\n\n");
}

async function faqNode(state: VinciState): Promise<Partial<VinciState>> {
  const lastMessage = getLastUserMessage(state);
  if (!lastMessage) {
    return {
      final_response:
        "I am unable to retrieve that information right now. Please try again or type 'human' to speak with our team.",
    };
  }

  try {
    const context = await searchKnowledgeBase(lastMessage);
    const response = await llm.invoke([
      new SystemMessage(
        `${agentPrompt}\n\nCONTEXT FROM KNOWLEDGE BASE:\n${context}`,
      ),
      new HumanMessage(lastMessage),
    ]);

    return { final_response: llmText(response.content) };
  } catch (error) {
    console.error("faqNode failed", error);
    return {
      final_response:
        "I am unable to retrieve that information right now. Please try again or type 'human' to speak with our team.",
    };
  }
}

async function supportNode(state: VinciState): Promise<Partial<VinciState>> {
  const lastMessage = getLastUserMessage(state);
  if (!lastMessage) {
    return {
      final_response:
        "I am unable to retrieve that information right now. Please try again or type 'human' to speak with our team.",
    };
  }

  try {
    const context = await searchKnowledgeBase(lastMessage);
    const response = await llm.invoke([
      new SystemMessage(
        `${agentPrompt}\n\nCONTEXT FROM KNOWLEDGE BASE:\n${context}\n\nYou are handling a customer support request. Be empathetic and solution-focused.
If you cannot resolve the issue directly, offer to escalate to a human team member.`,
      ),
      new HumanMessage(lastMessage),
    ]);

    return { final_response: llmText(response.content) };
  } catch (error) {
    console.error("supportNode failed", error);
    return {
      final_response:
        "I am unable to retrieve that information right now. Please try again or type 'human' to speak with our team.",
    };
  }
}

async function bookingNode(state: VinciState): Promise<Partial<VinciState>> {
  const lastMessage = getLastUserMessage(state);
  const step = state.booking_step;

  if (step === "idle") {
    return {
      booking_step: "name",
      final_response:
        "I would be happy to help you book an appointment. May I have your full name please?",
    };
  }

  if (step === "name") {
    return {
      booking_step: "division",
      booking_data: { ...state.booking_data, full_name: lastMessage },
      final_response:
        "Thank you. Which division would you like to meet with?\n\n1. Defence & Security\n2. Infrastructure\n3. Aviation\n4. Technology\n5. Automobile\n6. Agro-Industrial",
    };
  }

  if (step === "division") {
    return {
      booking_step: "purpose",
      booking_data: {
        ...state.booking_data,
        division: normalizeDivision(lastMessage),
      },
      final_response: "Noted. Briefly, what is the purpose of this meeting?",
    };
  }

  if (step === "purpose") {
    return {
      booking_step: "date",
      booking_data: { ...state.booking_data, purpose: lastMessage },
      final_response:
        "What is your preferred date? (format: DD/MM/YYYY, Monday to Friday only)",
    };
  }

  if (step === "date") {
    const parsedDate = parsePreferredDate(lastMessage);
    if (!parsedDate) {
      return {
        final_response:
          "Please provide a valid date in DD/MM/YYYY format (Monday to Friday only).",
      };
    }

    return {
      booking_step: "time",
      booking_data: {
        ...state.booking_data,
        preferred_date: parsedDate,
      },
      final_response:
        "And your preferred time? (format: HH:MM, between 08:00 and 17:00 WAT)",
    };
  }

  if (step === "time") {
    const parsedTime = parsePreferredTime(lastMessage);
    if (!parsedTime) {
      return {
        final_response:
          "Please provide a valid time in HH:MM format between 08:00 and 17:00 WAT.",
      };
    }

    const bookingData = {
      ...state.booking_data,
      preferred_time: parsedTime,
    };

    const { data: conversation, error: conversationError } = await supabaseServer
      .from("conversations")
      .select("id")
      .eq("phone_number", state.phone_number)
      .maybeSingle();

    if (conversationError || !conversation?.id) {
      console.error("bookingNode conversation lookup failed", conversationError);
      return {
        final_response:
          "I could not save your appointment right now. Please try again or type 'human' for assistance.",
      };
    }

    const { error: appointmentError } = await supabaseServer
      .from("appointments")
      .insert({
        conversation_id: conversation.id,
        full_name: bookingData.full_name,
        phone_number: state.phone_number,
        division: bookingData.division ?? "general",
        purpose: bookingData.purpose ?? "Meeting",
        preferred_date: bookingData.preferred_date,
        preferred_time: bookingData.preferred_time,
        status: "pending",
      });

    if (appointmentError) {
      console.error("bookingNode appointment insert failed", appointmentError);
      return {
        final_response:
          "I could not save your appointment right now. Please try again or type 'human' for assistance.",
      };
    }

    await supabaseServer.from("audit_logs").insert({
      event_type: "appointment_booked",
      conversation_id: conversation.id,
      metadata: bookingData,
    });

    return {
      booking_step: "idle",
      booking_data: {},
      final_response: `Your appointment has been booked successfully.\n\nSummary:\nName: ${bookingData.full_name}\nDivision: ${bookingData.division}\nDate: ${bookingData.preferred_date}\nTime: ${bookingData.preferred_time}\nPurpose: ${bookingData.purpose}\n\nOur team will confirm shortly. Is there anything else I can help you with?\n\n— VINCI`,
    };
  }

  return {
    booking_step: "idle",
    booking_data: {},
    final_response:
      "Let's start your booking again. May I have your full name please?",
  };
}

async function escalateNode(state: VinciState): Promise<Partial<VinciState>> {
  const { data: conversation } = await supabaseServer
    .from("conversations")
    .select("id")
    .eq("phone_number", state.phone_number)
    .maybeSingle();

  await supabaseServer
    .from("conversations")
    .update({ status: "escalated" })
    .eq("phone_number", state.phone_number);

  await supabaseServer.from("audit_logs").insert({
    event_type: "conversation_escalated",
    conversation_id: conversation?.id ?? null,
    metadata: {
      phone_number: state.phone_number,
      reason: "user_or_agent_triggered",
    },
  });

  return {
    escalated: true,
    final_response:
      "Thank you for reaching out. I am connecting you with a member of the Vinicius Group team who will follow up with you directly. Please expect a response within one business hour.\n\n— VINCI",
  };
}

async function respondNode(state: VinciState): Promise<Partial<VinciState>> {
  console.log("VINCI responding:", {
    phone: state.phone_number,
    intent: state.intent,
    response: state.final_response,
  });
  return {};
}

function routeAfterGuard(state: VinciState): string {
  if (state.is_spam || state.is_rate_limited) return "blocked";
  return "classify";
}

function routeIntent(state: VinciState): string {
  if (state.booking_step !== "idle") return "booking";
  const valid = ["faq", "booking", "support", "escalate"];
  return valid.includes(state.intent) ? state.intent : "faq";
}

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

function buildAgentMessages(
  userMessage: string,
  conversationHistory: BaseMessage[],
): BaseMessage[] {
  const last = conversationHistory[conversationHistory.length - 1];
  const lastIsSameUserMessage =
    last instanceof HumanMessage && messageContent(last) === userMessage;

  if (lastIsSameUserMessage) {
    return conversationHistory;
  }

  return [...conversationHistory, new HumanMessage(userMessage)];
}

export async function runAgent(
  userMessage: string,
  phoneNumber: string,
  conversationHistory: BaseMessage[],
  bookingStep: VinciState["booking_step"],
  bookingData: VinciState["booking_data"],
  isSpam: boolean,
  isRateLimited: boolean,
): Promise<AgentRunResult> {
  const messages = buildAgentMessages(userMessage, conversationHistory);

  const result = await vinciAgent.invoke({
    messages,
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
      "I am sorry, I could not process your request. Please try again.",
    bookingStep: result.booking_step ?? bookingStep,
    bookingData: result.booking_data ?? bookingData,
    intent: result.intent ?? "unknown",
  };
}
