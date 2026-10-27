"use client";

// How one Ask Copper answer is drawn: a rail of stations (the tools Copper can
// use, its thinking, each tool call) and then the reply. The steps come from
// lib/copper/assistant/progress.ts; the layout is in specs/module-2/spec.md,
// section 5.
import {
  BrainIcon,
  ListChecksIcon,
  TriangleAlertIcon,
  WrenchIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Spinner } from "@/components/ui/spinner";
import {
  type Progress,
  TOOL_LABELS,
  type ToolStep,
} from "@/lib/copper/assistant/progress";
import { formatUsd } from "@/lib/copper/catalog";
import { cn } from "@/lib/utils";

const PRODUCT_NAMES: Record<string, string> = {
  "copper-home": "Copper Home",
  "copper-notes": "Copper Notes",
};
const PLAN_NAMES: Record<string, string> = {
  free: "Free",
  "copper-plus": "Copper Plus",
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

/** "**bold**" and "`code`" in a thought summary, drawn without the marks. */
function renderInline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4)
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2)
      return (
        <code key={i} className="font-mono not-italic">
          {part.slice(1, -1)}
        </code>
      );
    return part;
  });
}

/** "2026-11-14" -> "Nov 14, 2026". */
function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function Station({
  icon,
  nodeClass,
  label,
  children,
}: {
  icon: ReactNode;
  nodeClass: string;
  label?: string;
  children?: ReactNode;
}) {
  return (
    <div className="relative pb-5">
      <span
        className={cn(
          "ring-secondary absolute top-0 -left-9 grid size-6 place-items-center rounded-full ring-4",
          nodeClass,
        )}
      >
        {icon}
      </span>
      {label && (
        <p className="text-muted-foreground text-[0.7rem] font-semibold tracking-widest uppercase">
          {label}
        </p>
      )}
      {children}
    </div>
  );
}

function ToolsStation({
  used,
  useTools,
}: {
  used: Set<string>;
  useTools: boolean;
}) {
  const names = Object.keys(TOOL_LABELS);
  return (
    <Station
      icon={<ListChecksIcon className="size-3.5" />}
      nodeClass={
        useTools
          ? "bg-accent text-accent-foreground"
          : "bg-chart-3 text-primary-foreground"
      }
      label={
        useTools ? "Tools Copper can use" : "Tools given to Copper: none"
      }
    >
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {names.map((name) => (
          <span
            key={name}
            className={cn(
              "rounded-full px-2 py-0.5 font-mono text-xs",
              !useTools && "line-through opacity-60",
              used.has(name)
                ? "bg-accent text-accent-foreground font-bold"
                : "bg-muted text-muted-foreground",
            )}
          >
            {name}
          </span>
        ))}
      </div>
      {!useTools && (
        <p className="text-muted-foreground mt-1.5 text-xs">
          Copper has to answer from memory alone.
        </p>
      )}
    </Station>
  );
}

function ThinkingStation({ text, useTools }: { text: string; useTools: boolean }) {
  return (
    <Station
      icon={<BrainIcon className="size-3.5" />}
      nodeClass={
        useTools
          ? "bg-primary text-primary-foreground"
          : "bg-chart-3 text-primary-foreground"
      }
      label="Copper is thinking"
    >
      <div
        data-testid="thinking"
        className="text-muted-foreground mt-1.5 border-l-2 pl-3 text-sm whitespace-pre-wrap italic"
      >
        {renderInline(text)}
      </div>
    </Station>
  );
}

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** What Copper sent: the input as a labelled list, never raw JSON. */
function Sent({ step }: { step: ToolStep }) {
  if (step.name === "get_prices")
    return <p className="mt-1 text-sm">Nothing, it just asked for the price list.</p>;
  if (step.name === "get_products")
    return <p className="mt-1 text-sm">Nothing, it just asked what Copper sells.</p>;
  const input = asRecord(step.input);
  if (!input)
    return (
      <p className="text-muted-foreground mt-1 text-sm">filling in the details…</p>
    );

  if (step.name === "calculate_cost") {
    const products = asArray(input.products).map(
      (id) => PRODUCT_NAMES[String(id)] ?? String(id),
    );
    return (
      <Rows
        rows={[
          ["Products", products.length ? products.join(", ") : "None"],
          ["Plan", PLAN_NAMES[String(input.plan)] ?? String(input.plan)],
          ["Billing", String(input.billing)],
          ["Years", String(input.years)],
        ]}
      />
    );
  }
  if (step.name === "check_availability") {
    return (
      <Rows
        rows={[
          ["Product", PRODUCT_NAMES[String(input.product)] ?? String(input.product)],
          ["Color", input.color ? String(input.color) : "All colors"],
        ]}
      />
    );
  }
  return (
    <Rows
      rows={Object.entries(input).map(([key, value]) => [key, String(value)])}
    />
  );
}

function Pill({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", className)}>
      {children}
    </span>
  );
}

function StockPill({ stock, restockDate }: { stock: string; restockDate: unknown }) {
  if (stock === "in_stock")
    return <Pill className="bg-accent text-accent-foreground">In stock</Pill>;
  if (stock === "low_stock")
    return <Pill className="bg-chart-4 text-primary-foreground">Low stock</Pill>;
  return (
    <Pill className="bg-chart-3 text-primary-foreground">
      Back-ordered
      {typeof restockDate === "string" ? ` until ${formatDate(restockDate)}` : ""}
    </Pill>
  );
}

/** What came back, drawn differently for each tool. */
function Result({ step }: { step: ToolStep }) {
  const output = asRecord(step.output);
  if (step.state === "error" || !output) {
    return (
      <p className="mt-1 text-sm">
        {typeof step.output === "string" ? step.output : "Something went wrong."}
      </p>
    );
  }

  if (step.name === "calculate_cost") {
    return (
      <div className="mt-1 text-sm">
        {asArray(output.lines).map((line, i) => {
          const row = asRecord(line);
          return (
            <div key={i} className="flex justify-between gap-4">
              <span>{String(row?.item)}</span>
              <span>{formatUsd(Number(row?.usd))}</span>
            </div>
          );
        })}
        <div className="mt-1.5 flex items-baseline justify-between border-t pt-1.5">
          <span className="font-medium">Total</span>
          <span className="text-primary font-heading text-xl font-bold">
            {formatUsd(Number(output.totalUsd))}
          </span>
        </div>
      </div>
    );
  }

  if (step.name === "get_products") {
    return (
      <div className="mt-1 space-y-2 text-sm">
        {asArray(output.products).map((item, i) => {
          const product = asRecord(item);
          return (
            <div key={i}>
              <div className="flex justify-between gap-4">
                <span className="font-medium">{String(product?.name)}</span>
                <span>{formatUsd(Number(product?.priceUsd))}</span>
              </div>
              <p className="text-muted-foreground text-xs">{String(product?.type)}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {asArray(product?.colors).map((color) => (
                  <Pill key={String(color)} className="bg-accent text-accent-foreground">
                    {String(color)}
                  </Pill>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (step.name === "get_prices") {
    return (
      <div className="mt-1 space-y-0.5 text-sm">
        {asArray(output.products).map((item, i) => {
          const product = asRecord(item);
          return (
            <div key={i} className="flex justify-between gap-4">
              <span>{String(product?.name)}</span>
              <span>{formatUsd(Number(product?.priceUsd))}</span>
            </div>
          );
        })}
        {asArray(output.plans)
          .map(asRecord)
          .filter((plan) => plan && Number(plan.annualUsd) > 0)
          .map((plan, i) => (
            <div key={i} className="flex justify-between gap-4">
              <span>{String(plan?.name)}</span>
              <span>
                {formatUsd(Number(plan?.monthlyUsd))}/mo ·{" "}
                {formatUsd(Number(plan?.annualUsd))}/yr
              </span>
            </div>
          ))}
      </div>
    );
  }

  if (step.name === "check_availability") {
    if (output.status === "not_a_color") {
      return (
        <p className="mt-1 text-sm">
          {String(output.product)} doesn&apos;t come in {String(output.color)}. It
          comes in {asArray(output.colors).map(String).join(", ")}.
        </p>
      );
    }
    if (output.status === "unavailable")
      return <p className="mt-1 text-sm">{String(output.message)}</p>;
    return (
      <div className="mt-1 space-y-1 text-sm">
        {asArray(output.colors).map((item, i) => {
          const row = asRecord(item);
          return (
            <div key={i} className="flex items-center justify-between gap-4">
              <span>{String(row?.color)}</span>
              <StockPill stock={String(row?.stock)} restockDate={row?.restockDate} />
            </div>
          );
        })}
      </div>
    );
  }

  return <p className="mt-1 text-sm">{JSON.stringify(step.output)}</p>;
}

function ToolCard({ step, number }: { step: ToolStep; number: number }) {
  const running = step.state === "calling";
  return (
    <div
      data-testid="tool-call"
      data-tool={step.name}
      className="bg-card mt-1.5 overflow-hidden rounded-lg border text-left"
    >
      <div className="bg-accent text-accent-foreground flex items-center gap-2 px-3 py-1.5">
        <span className="font-mono text-sm font-bold">{step.name}()</span>
        <span className="rounded-full bg-black/10 px-1.5 text-xs">tool {number}</span>
        <span className="ml-auto text-xs">
          {TOOL_LABELS[step.name] ?? "Using a tool"}
        </span>
      </div>
      <div className="px-3 py-2">
        <p className="text-muted-foreground text-[0.7rem] font-semibold tracking-widest uppercase">
          <span aria-hidden>→</span> What Copper sent
        </p>
        <Sent step={step} />
      </div>
      <div className="bg-accent/10 border-t px-3 py-2">
        <p className="text-muted-foreground text-[0.7rem] font-semibold tracking-widest uppercase">
          <span aria-hidden>←</span> What came back
        </p>
        {running ? (
          <p className="text-muted-foreground mt-1 flex items-center gap-2 text-sm">
            <Spinner className="size-3.5" /> the app is running the code…
          </p>
        ) : (
          <Result step={step} />
        )}
      </div>
    </div>
  );
}

function NowStation({
  progress,
  useTools,
}: {
  progress: Progress | null;
  useTools: boolean;
}) {
  let text = "Reading your question…";
  if (progress?.reply) text = "Writing the answer…";
  else if (!useTools) text = "Answering from memory…";
  else if (progress?.steps.length) text = "Deciding what to do next…";
  return (
    <div className="relative pb-2">
      <span className="bg-card ring-secondary absolute top-0 -left-9 flex size-6 items-center justify-center gap-0.5 rounded-full ring-4">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{ animationDelay: `${i * 150}ms` }}
            className={cn(
              "size-1 animate-bounce rounded-full",
              useTools ? "bg-primary" : "bg-chart-3",
            )}
          />
        ))}
      </span>
      <p className="text-muted-foreground text-sm">{text}</p>
    </div>
  );
}

/** One answer: the stations in the order they happened, then the reply. */
export function AnswerView({
  progress,
  useTools,
}: {
  progress: Progress | null;
  useTools: boolean;
}) {
  const steps = progress?.steps ?? [];
  const used = new Set(
    steps.flatMap((step) => (step.type === "tool" ? [step.name] : [])),
  );
  const working = !progress || progress.status === "working";

  return (
    <div>
      <div className="relative pl-9">
        <div
          className={cn(
            "absolute top-3 bottom-3 left-[11px] w-0.5 rounded-full",
            useTools
              ? "from-primary via-accent to-accent bg-linear-to-b"
              : "bg-chart-3",
          )}
        />
        <ToolsStation used={used} useTools={useTools} />
        {steps.map((step, i) => {
          if (step.type === "thinking")
            return <ThinkingStation key={i} text={step.text} useTools={useTools} />;
          const number = steps
            .slice(0, i + 1)
            .filter((s) => s.type === "tool").length;
          return (
            <Station
              key={step.id}
              icon={<WrenchIcon className="size-3.5" />}
              nodeClass="bg-accent text-accent-foreground"
              label={
                step.state === "calling"
                  ? "Copper is calling a tool"
                  : "Copper called a tool"
              }
            >
              <ToolCard step={step} number={number} />
            </Station>
          );
        })}
        {working && <NowStation progress={progress} useTools={useTools} />}
      </div>

      {progress?.reply && (
        <div className="bg-card mt-2 rounded-2xl rounded-tl-sm border p-3 text-sm shadow-xs">
          <p className="text-primary mb-1 text-xs font-semibold">Copper</p>
          {!useTools && (
            <div className="border-chart-3 bg-chart-3/10 mb-2 flex gap-2 rounded-lg border p-2 text-xs">
              <TriangleAlertIcon className="text-chart-3 mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-bold">Answered without tools: may be made up</p>
                <p className="text-muted-foreground">
                  With tools off, Copper can&apos;t see today&apos;s prices or
                  stock. The AI only has what it learned in training, so it fills
                  the gaps with guesses that sound right. That&apos;s a
                  hallucination.
                </p>
              </div>
            </div>
          )}
          <p className="whitespace-pre-wrap">
            {progress.reply}
            {progress.status === "working" && (
              <span className="bg-primary ml-0.5 inline-block h-4 w-0.5 animate-pulse align-text-bottom" />
            )}
          </p>
        </div>
      )}
    </div>
  );
}
