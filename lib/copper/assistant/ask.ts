"use server";

// Module 2: the server action the Ask Copper chat calls. It streams the
// conversation to the model through callStream (lib/ai/call.ts), with or
// without the tools, and sends back each step as it happens, so the panel can
// show Copper thinking and using its tools. The contract is in
// specs/module-2/spec.md.
import { stepCountIs } from "ai";
import { callStream, THOUGHT_SUMMARIES } from "@/lib/ai/call";
import { createLive, type Live } from "@/lib/ai/live";
import { COPPER_INSTRUCTIONS } from "@/lib/copper/assistant/instructions";
import type { Progress, ToolStep } from "@/lib/copper/assistant/progress";
import { copperTools } from "@/lib/copper/assistant/tools";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type AskCopperRequest = {
  messages: ChatMessage[];
  useTools: boolean;
};

export type AskCopperResult = { progress: Live<Progress> };

/** At most this many model steps (tool calls plus the reply) per question. */
const MAX_STEPS = 5;

export async function askCopper(
  request: AskCopperRequest,
): Promise<AskCopperResult> {
  const { live, update, done } = createLive<Progress>();
  const progress: Progress = { steps: [], reply: "", status: "working" };

  // A fresh copy every time: the steps array and each step inside it, so an
  // update the panel already holds never changes underneath it.
  const snapshot = (): Progress => ({
    ...progress,
    steps: progress.steps.map((step) => ({ ...step })),
  });

  const toolStep = (id: string): ToolStep | undefined =>
    progress.steps.find(
      (step): step is ToolStep => step.type === "tool" && step.id === id,
    );

  async function run() {
    try {
      const messages = request.messages.map(({ role, content }) => ({
        role,
        content,
      }));
      // With tools off the model gets only the conversation: no instructions
      // and no tools, so nothing tells it to check anything.
      const result = callStream(
        { module: 2, feature: "ask-copper" },
        request.useTools
          ? {
              instructions: COPPER_INSTRUCTIONS,
              messages,
              tools: copperTools,
              stopWhen: stepCountIs(MAX_STEPS),
              providerOptions: THOUGHT_SUMMARIES,
            }
          : { messages, providerOptions: THOUGHT_SUMMARIES },
      );

      for await (const part of result.fullStream) {
        if (part.type === "reasoning-delta") {
          const last = progress.steps.at(-1);
          if (last?.type === "thinking") last.text += part.text;
          else progress.steps.push({ type: "thinking", text: part.text });
        } else if (part.type === "tool-input-start") {
          progress.steps.push({
            type: "tool",
            id: part.id,
            name: part.toolName,
            state: "calling",
          });
        } else if (part.type === "tool-call") {
          const step = toolStep(part.toolCallId);
          if (step) step.input = part.input;
          else
            progress.steps.push({
              type: "tool",
              id: part.toolCallId,
              name: part.toolName,
              state: "calling",
              input: part.input,
            });
        } else if (part.type === "tool-result") {
          const step = toolStep(part.toolCallId);
          if (step) {
            step.output = part.output;
            step.state = "done";
          }
        } else if (part.type === "tool-error") {
          const step = toolStep(part.toolCallId);
          if (step) {
            step.output =
              part.error instanceof Error
                ? part.error.message
                : String(part.error);
            step.state = "error";
          }
        } else if (part.type === "text-delta") {
          progress.reply += part.text;
        } else if (part.type === "error") {
          throw part.error;
        } else {
          continue;
        }
        update(snapshot());
      }

      // An empty reply gets a short apology; a real one is left alone.
      if (!progress.reply.trim()) {
        progress.reply = "Sorry, I couldn't come up with an answer. Please try again.";
      }
      progress.status = "done";
    } catch {
      progress.status = "error";
      if (!progress.reply.trim()) {
        progress.reply = "Sorry, something went wrong. Please try again.";
      }
    }
    done(snapshot());
  }

  // Hand the live value back straight away and read the stream in the
  // background, so the panel can draw each step as it happens.
  void run();
  return { progress: live };
}
