"use client";

// Ask Copper: the floating chat panel. It calls the askCopper Server Action,
// reads each update of the answer as it streams in, and draws it with
// AnswerView. Tools on and tools off are two separate conversations.
// The layout is in specs/module-2/spec.md, sections 4 and 5.
import { ArrowUpIcon, MessageCircleIcon, XIcon } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { AnswerView } from "@/components/copper/ask-copper-steps";
import { SetupRequired } from "@/components/setup-required";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { readLive } from "@/lib/ai/live";
import { askCopper, type ChatMessage } from "@/lib/copper/assistant/ask";
import type { Progress } from "@/lib/copper/assistant/progress";

const STARTERS = [
  "How much is Copper Home with Copper Plus, paid yearly, for 2 years?",
  "Is Copper Notes in Night Sky in stock?",
  "Is Copper Plus cheaper monthly or yearly?",
];

// progress is null until the Server Action has answered.
type Turn = { id: number; question: string; progress: Progress | null };
type Mode = "on" | "off";

export function AskCopper({ aiConfigured }: { aiConfigured: boolean }) {
  const [open, setOpen] = useState(false);
  const [useTools, setUseTools] = useState(true);
  const [chats, setChats] = useState<Record<Mode, Turn[]>>({ on: [], off: [] });
  const [draft, setDraft] = useState("");
  const nextId = useRef(0);
  const body = useRef<HTMLDivElement>(null);

  const mode: Mode = useTools ? "on" : "off";
  const turns = chats[mode];
  const last = turns.at(-1);
  const busy = !!last && (!last.progress || last.progress.status === "working");

  // The header link and /#ask open the panel. A click is listened for as well
  // as hashchange: once the address already ends in #ask, clicking the link
  // again changes nothing, so it would only ever work once.
  useEffect(() => {
    const openIfAsked = () => {
      if (window.location.hash === "#ask") setOpen(true);
    };
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.("a");
      if (link?.getAttribute("href")?.endsWith("#ask")) setOpen(true);
    };
    const first = window.setTimeout(openIfAsked, 0);
    window.addEventListener("hashchange", openIfAsked);
    document.addEventListener("click", onClick);
    return () => {
      window.clearTimeout(first);
      window.removeEventListener("hashchange", openIfAsked);
      document.removeEventListener("click", onClick);
    };
  }, []);

  // Keep the newest step in view.
  useEffect(() => {
    const element = body.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [chats, mode, open]);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    const chatMode = mode;
    // Each chat sends only its own history: the questions and Copper's
    // finished replies, with no steps or tool data.
    const history: ChatMessage[] = turns.flatMap((turn) => [
      { role: "user" as const, content: turn.question },
      ...(turn.progress?.reply
        ? [{ role: "assistant" as const, content: turn.progress.reply }]
        : []),
    ]);
    const id = nextId.current++;
    setChats((all) => ({
      ...all,
      [chatMode]: [...all[chatMode], { id, question: text, progress: null }],
    }));
    setDraft("");
    const show = (progress: Progress) =>
      setChats((all) => ({
        ...all,
        [chatMode]: all[chatMode].map((turn) =>
          turn.id === id ? { ...turn, progress } : turn,
        ),
      }));

    try {
      const result = await askCopper({
        messages: [...history, { role: "user", content: text }],
        useTools: chatMode === "on",
      });
      for await (const update of readLive(result.progress)) show(update);
    } catch {
      show({
        steps: [],
        reply: "Sorry, something went wrong. Please try again.",
        status: "error",
      });
    }
  }

  return (
    <>
      <button
        type="button"
        data-testid="ask-copper-launcher"
        onClick={() => setOpen(true)}
        className="bg-primary text-primary-foreground fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full px-4 py-3 text-sm font-semibold shadow-lg transition-transform hover:scale-105"
      >
        <MessageCircleIcon className="size-5" aria-hidden />
        Ask Copper
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          data-testid="ask-copper"
          showCloseButton={false}
          className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md"
        >
          <div className="bg-chart-5 dark:bg-card text-white dark:text-card-foreground">
            <div className="flex items-center gap-3 p-4">
              <span className="bg-primary grid size-10 shrink-0 place-items-center overflow-hidden rounded-full">
                <Image
                  src="/assets/brand/copper-mascot.png"
                  alt="Copper mascot"
                  width={40}
                  height={40}
                  className="size-10 object-cover"
                />
              </span>
              <div className="min-w-0 flex-1">
                <SheetTitle className="text-lg font-bold text-inherit">
                  Ask Copper
                </SheetTitle>
                <SheetDescription className="text-sm text-inherit opacity-80">
                  Prices, totals and stock, checked with tools.
                </SheetDescription>
              </div>
              <SheetClose asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="hover:bg-white/10 hover:text-inherit"
                >
                  <XIcon />
                  <span className="sr-only">Close</span>
                </Button>
              </SheetClose>
            </div>
            {aiConfigured && (
              <div className="flex items-center gap-3 bg-white/10 px-4 py-2 text-sm">
                <span className="font-medium">Use tools</span>
                <span className="text-xs opacity-70">
                  {useTools ? "Checks every answer" : "Model guesses alone"}
                </span>
                <Switch
                  aria-label="Use tools"
                  checked={useTools}
                  onCheckedChange={setUseTools}
                  className="ml-auto"
                />
              </div>
            )}
          </div>

          <div ref={body} className="bg-secondary flex-1 overflow-y-auto p-4">
            {!aiConfigured ? (
              <SetupRequired service="ai" />
            ) : (
              <div className="space-y-5">
                {turns.length === 0 && (
                  <p className="text-muted-foreground text-sm">
                    Hi, I&apos;m Copper. Ask me what our products cost, or
                    what&apos;s in stock.
                  </p>
                )}
                {turns.map((turn) => (
                  <div key={turn.id} className="space-y-3">
                    <div className="flex justify-end">
                      <p className="bg-primary text-primary-foreground max-w-[85%] rounded-2xl rounded-br-sm px-3 py-2 text-sm">
                        {turn.question}
                      </p>
                    </div>
                    <AnswerView progress={turn.progress} useTools={useTools} />
                  </div>
                ))}
                {!busy && (
                  <div className="flex flex-col items-start gap-2">
                    {STARTERS.map((starter) => (
                      <button
                        key={starter}
                        type="button"
                        onClick={() => void ask(starter)}
                        className="bg-card hover:border-primary rounded-full border px-3 py-1.5 text-left text-sm transition-colors"
                      >
                        {starter}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {aiConfigured && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void ask(draft);
              }}
              className="bg-background flex items-center gap-2 border-t p-3"
            >
              <Input
                aria-label="Your question"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Ask about prices or stock…"
                className="h-9 flex-1 rounded-full px-4"
              />
              <Button
                type="submit"
                size="icon-lg"
                aria-label="Send"
                disabled={busy || !draft.trim()}
                className="rounded-full"
              >
                <ArrowUpIcon />
              </Button>
            </form>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
