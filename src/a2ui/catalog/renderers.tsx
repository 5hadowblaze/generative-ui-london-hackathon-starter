"use client";

import { clsx } from "clsx";
import { Fragment, useEffect, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import {
  Bar,
  BarChart as RBarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart as RLineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart as RScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { RendererProps } from "@copilotkit/a2ui-renderer";

/* The runtime walks `{path}` bindings against the data model before
 * handing props to renderers, so every prop value below is post-resolution. */

const GAP = {
  xs: "gap-1",
  sm: "gap-2",
  md: "gap-4",
  lg: "gap-6",
  xl: "gap-10",
};
const JUSTIFY = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
  spaceBetween: "justify-between",
};
const ALIGN = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
};

/* CopilotKit brand-accent palette in fixed legend order. */
const CHART_PALETTE = ["#7c70f5", "#3aa37f", "#e89232", "#d5b62c", "#d54b53"];

const fmtNumber = (n: number) =>
  Math.abs(n) >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : Math.abs(n) >= 1_000
      ? `${(n / 1_000).toFixed(1)}k`
      : n.toLocaleString();

/* A delta value is "meaningful" if it has a digit. Bare "+" / "-" or empty
 * strings shouldn't render a badge; that just produces an empty pill. */
const hasMeaningfulDelta = (v?: string) =>
  typeof v === "string" && /\d/.test(v);

/* Reduce verbose delta strings to the badge's job: just the magnitude.
 * Agents sometimes dump comparison prose like "vs. $89,498M in Q4 FY23"
 * into delta when asked about quarterly comparisons. The badge can't hold
 * that without breaking the card layout, so we extract the first signed
 * number/percent token and let the surrounding context (StatCard caption,
 * table cell) carry the comparison text instead. */
const condenseDelta = (raw: string): string => {
  const trimmed = raw.trim();
  if (trimmed.length <= 8) return trimmed;
  const patterns = [
    /[+-]\s*\d+(?:[.,]\d+)?\s*%/,
    /\d+(?:[.,]\d+)?\s*%/,
    /[+-]\s*\$?\d+(?:[.,]\d+)?\s*[KMB]?/i,
    /\$?\d+(?:[.,]\d+)?\s*[KMB]?/i,
  ];
  for (const p of patterns) {
    const m = trimmed.match(p);
    if (m) return m[0].replace(/\s+/g, "");
  }
  return trimmed;
};

/* Pull the first number from a free-form string. Handles $X, X.XM, etc.
 * Returns the number's magnitude (sign + numeric value), preserving the
 * order-of-magnitude suffix (k/M/B) when present. */
const parseMoneyish = (s: string): number | null => {
  if (typeof s !== "string") return null;
  const m = s.replace(/[,_]/g, "").match(/(-?\d+(?:\.\d+)?)\s*([kKmMbB]?)/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!isFinite(n)) return null;
  const suffix = (m[2] || "").toLowerCase();
  const mult =
    suffix === "k"
      ? 1_000
      : suffix === "m"
        ? 1_000_000
        : suffix === "b"
          ? 1_000_000_000
          : 1;
  return n * mult;
};

/* When the agent leaves `delta` empty but caption carries a prior-period
 * value like "vs. $89,498M in Q4 FY23", compute the percentage from
 * value vs. that prior number so the user still sees the badge they
 * asked for. Returns a string like "+6.1%" / "-3.0%" or null when we
 * can't extract two comparable numbers. Loose by design: this is a
 * fallback for noisy prompts; the agent should provide its own delta. */
const autoDelta = (value?: string, caption?: string): string | null => {
  if (!value || !caption) return null;
  // Caption needs to look like a comparison. Anchor on "vs.", "from",
  // "compared", "prior", or a leading "$" right after the verb.
  if (!/vs\.|from|compared|prior|previous|last|relative to/i.test(caption)) {
    return null;
  }
  const current = parseMoneyish(value);
  const prior = parseMoneyish(caption);
  if (current == null || prior == null || prior === 0) return null;
  const pct = ((current - prior) / Math.abs(prior)) * 100;
  if (!isFinite(pct)) return null;
  const sign = pct >= 0 ? "+" : "";
  // 1 decimal for sub-10% movements, integer otherwise: easier to scan.
  return `${sign}${Math.abs(pct) < 10 ? pct.toFixed(1) : pct.toFixed(0)}%`;
};

const activationKeys = new Set(["Enter", " "]);

function onKeyboardActivate(
  event: KeyboardEvent<HTMLElement>,
  activate: () => void,
) {
  if (!activationKeys.has(event.key)) return;
  event.preventDefault();
  activate();
}

function firstMeaningfulRecordValue(row: Record<string, string | number>) {
  const first = Object.entries(row).find(([, value]) => value != null);
  return first ? String(first[1]) : "Row detail";
}

const Stack = ({
  props,
  children,
}: RendererProps<{
  children: string[] | { componentId: string; path: string };
  gap?: keyof typeof GAP;
  align?: keyof typeof ALIGN;
}>) => (
  <div
    className={clsx(
      "flex flex-col",
      GAP[props.gap ?? "md"],
      props.align && ALIGN[props.align],
    )}
  >
    {Array.isArray(props.children)
      ? props.children.map((id) => <Slot key={id} render={children(id)} />)
      : null}
  </div>
);

const Row = ({
  props,
  children,
}: RendererProps<{
  children: string[];
  gap?: keyof typeof GAP;
  justify?: keyof typeof JUSTIFY;
  align?: keyof typeof ALIGN;
}>) => (
  <div
    className={clsx(
      "flex flex-wrap",
      GAP[props.gap ?? "sm"],
      props.justify && JUSTIFY[props.justify],
      ALIGN[props.align ?? "center"],
    )}
  >
    {Array.isArray(props.children)
      ? props.children.map((id) => <Slot key={id} render={children(id)} />)
      : null}
  </div>
);

const Grid = ({
  props,
  children,
}: RendererProps<{
  children: string[];
  columns?: number;
  gap?: keyof typeof GAP;
}>) => {
  const cols = props.columns ?? 3;
  const colMap: Record<number, string> = {
    1: "grid-cols-1",
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-2 lg:grid-cols-4",
    5: "grid-cols-2 lg:grid-cols-5",
    6: "grid-cols-2 lg:grid-cols-6",
  };
  return (
    <div className={clsx("grid", colMap[cols], GAP[props.gap ?? "md"])}>
      {Array.isArray(props.children)
        ? props.children.map((id) => <Slot key={id} render={children(id)} />)
        : null}
    </div>
  );
};

const Section = ({
  props,
  children,
}: RendererProps<{ title: string; eyebrow?: string; child: string }>) => (
  <section className="flex flex-col gap-3">
    <div className="flex flex-col gap-1">
      {props.eyebrow && (
        <span className="mono text-[11px] uppercase tracking-[0.14em] text-[var(--ink)] font-medium">
          {props.eyebrow}
        </span>
      )}
      <h2 className="text-[18px] font-semibold tracking-tight text-[var(--ink)]">
        {props.title}
      </h2>
    </div>
    {children(props.child)}
  </section>
);

const Card = ({
  props,
  children,
}: RendererProps<{
  child: string;
  tone?: "default" | "lilac" | "mint" | "warning";
}>) => {
  const tones: Record<string, string> = {
    default: "bg-[var(--surface)] border-[var(--line)]",
    lilac:
      "bg-[color-mix(in_oklab,var(--lilac)_8%,white)] border-[var(--lilac)]",
    mint: "bg-[color-mix(in_oklab,var(--mint)_10%,white)] border-[color-mix(in_oklab,var(--mint)_60%,white)]",
    warning:
      "bg-[color-mix(in_oklab,var(--orange)_8%,white)] border-[color-mix(in_oklab,var(--orange)_50%,white)]",
  };
  return (
    <div
      className={clsx(
        "rounded-[var(--radius)] border p-5",
        tones[props.tone ?? "default"],
      )}
    >
      {children(props.child)}
    </div>
  );
};

const Divider = () => <hr className="border-0 border-t border-[var(--line)]" />;

const Heading = ({
  props,
}: RendererProps<{ text: string; level?: "1" | "2" | "3" }>) => {
  const level = props.level ?? "2";
  const Tag = level === "1" ? "h1" : level === "3" ? "h3" : "h2";
  const sizes = {
    "1": "text-[30px] font-semibold tracking-tight leading-[1.1]",
    "2": "text-[20px] font-semibold tracking-tight leading-[1.2]",
    "3": "text-[15px] font-semibold leading-tight",
  } as const;
  return (
    <Tag className={clsx(sizes[level], "text-[var(--ink)]")}>{props.text}</Tag>
  );
};

const Text = ({
  props,
}: RendererProps<{
  text: string;
  tone?: "default" | "muted";
  size?: "sm" | "md" | "lg";
  weight?: "regular" | "medium" | "semibold";
}>) => (
  <p
    className={clsx(
      props.size === "sm"
        ? "text-[13px]"
        : props.size === "lg"
          ? "text-[16px]"
          : "text-[14px]",
      props.tone === "muted" ? "text-[var(--ink)]" : "text-[var(--ink-2)]",
      props.weight === "medium"
        ? "font-medium"
        : props.weight === "semibold"
          ? "font-semibold"
          : "font-normal",
      "leading-relaxed",
    )}
  >
    {props.text}
  </p>
);

const Overline = ({ props }: RendererProps<{ text: string }>) => (
  <span className="mono text-[11px] uppercase tracking-[0.14em] text-[var(--ink)] font-medium">
    {props.text}
  </span>
);

const Badge = ({
  props,
}: RendererProps<{
  label: string;
  tone?: "neutral" | "positive" | "warning" | "danger" | "info";
}>) => {
  const tones = {
    neutral:
      "bg-[var(--surface-soft)] text-[var(--ink-2)] border-[var(--line)]",
    info: "bg-[color-mix(in_oklab,var(--lilac)_18%,white)] text-[#2e2c75] border-[color-mix(in_oklab,var(--lilac)_60%,white)]",
    positive:
      "bg-[color-mix(in_oklab,var(--mint)_18%,white)] text-[#0a5d44] border-[color-mix(in_oklab,var(--mint)_70%,white)]",
    warning:
      "bg-[color-mix(in_oklab,var(--orange)_18%,white)] text-[#7a3f0f] border-[color-mix(in_oklab,var(--orange)_60%,white)]",
    danger:
      "bg-[color-mix(in_oklab,var(--red)_12%,white)] text-[#7a1b22] border-[color-mix(in_oklab,var(--red)_55%,white)]",
  } as const;
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] mono uppercase tracking-wider font-medium",
        tones[props.tone ?? "neutral"],
      )}
    >
      {props.label}
    </span>
  );
};

const Callout = ({
  props,
}: RendererProps<{
  body: string;
  title?: string;
  tone?: "info" | "positive" | "warning" | "neutral";
}>) => {
  const [expanded, setExpanded] = useState(false);
  const tone = props.tone ?? "info";
  const accents: Record<
    typeof tone,
    { bar: string; bg: string; chip: string }
  > = {
    info: {
      bar: "bg-[var(--lilac)]",
      bg: "bg-[color-mix(in_oklab,var(--lilac)_7%,var(--surface))]",
      chip: "text-[#2e2c75]",
    },
    positive: {
      bar: "bg-[var(--mint)]",
      bg: "bg-[color-mix(in_oklab,var(--mint)_8%,var(--surface))]",
      chip: "text-[#0a5d44]",
    },
    warning: {
      bar: "bg-[var(--orange)]",
      bg: "bg-[color-mix(in_oklab,var(--orange)_8%,var(--surface))]",
      chip: "text-[#7a3f0f]",
    },
    neutral: {
      bar: "bg-[var(--ink-2)]",
      bg: "bg-[var(--surface-soft)]",
      chip: "text-[var(--ink)]",
    },
  };
  const a = accents[tone];
  return (
    <div
      className={clsx(
        "rho-interactive-callout relative rounded-[var(--radius)] border border-[var(--line)] pl-4 pr-5 py-4 flex flex-col gap-1.5 overflow-hidden",
        a.bg,
      )}
      data-expanded={expanded ? "true" : "false"}
    >
      <span
        aria-hidden
        className={clsx("absolute left-0 top-0 bottom-0 w-1", a.bar)}
      />
      <button
        type="button"
        className="rho-disclosure-trigger text-left"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      >
        {props.title && (
          <span
            className={clsx(
              "mono text-[10.5px] uppercase tracking-[0.14em] font-medium",
              a.chip,
            )}
          >
            {props.title}
          </span>
        )}
        <span className="rho-disclosure-caret" aria-hidden>
          {expanded ? "Hide detail" : "Reveal detail"}
        </span>
      </button>
      <span className="text-[13.5px] leading-relaxed text-[var(--ink-2)]">
        {props.body}
      </span>
      {expanded && (
        <div className="rho-reveal-panel">
          <span className="mono text-[10.5px] uppercase tracking-[0.08em] text-[var(--ink)]">
            Contextual next step
          </span>
          <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--ink-2)]">
            Tone: {tone}. {props.title ? `Title: ${props.title}. ` : ""}
            Body: {props.body}
          </p>
        </div>
      )}
    </div>
  );
};

const BulletList = ({
  props,
}: RendererProps<{
  items: string[];
  ordered?: boolean;
}>) => {
  const items = Array.isArray(props.items) ? props.items : [];
  if (!items.length) return null;
  const Tag = props.ordered ? "ol" : "ul";
  // We render markers manually inside each <li>. `display: flex` on the
  // li (which we want for clean alignment) kills the browser's native
  // `list-decimal` / `list-disc` rendering, so for ordered lists we
  // synthesize the "1." / "2." prefix ourselves.
  return (
    <Tag className="flex flex-col gap-2 text-[14px] text-[var(--ink-2)] leading-relaxed list-none pl-0 m-0">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-2.5">
          {props.ordered ? (
            <span
              aria-hidden
              className="mono tabular-nums text-[12px] text-[var(--ink)] font-medium leading-relaxed min-w-[1.25rem] flex-none"
            >
              {i + 1}.
            </span>
          ) : (
            <span
              aria-hidden
              className="mt-2 w-1.5 h-1.5 rounded-full bg-[var(--lilac)] flex-none"
            />
          )}
          <span className="flex-1 min-w-0">{it}</span>
        </li>
      ))}
    </Tag>
  );
};

const StatCard = ({
  props,
}: RendererProps<{
  label: string;
  value: string;
  delta?: string;
  deltaTone?: "positive" | "negative" | "neutral";
  caption?: string;
}>) => {
  const [expanded, setExpanded] = useState(false);
  // Prefer the agent's delta. Fall back to auto-computing from value vs.
  // the prior number in caption when the agent left delta blank.
  const explicitDelta = hasMeaningfulDelta(props.delta)
    ? condenseDelta(props.delta!)
    : null;
  const computedDelta = explicitDelta
    ? null
    : autoDelta(props.value, props.caption);
  const finalDelta = explicitDelta ?? computedDelta;

  // Derive tone from the sign of the computed delta when the agent
  // didn't set deltaTone (or set it incorrectly relative to the actual
  // movement). For explicit deltas, trust the agent's tone choice.
  const inferredTone: "positive" | "negative" | "neutral" =
    computedDelta?.startsWith("-")
      ? "negative"
      : computedDelta?.startsWith("+")
        ? "positive"
        : (props.deltaTone ?? "neutral");
  const effectiveTone = explicitDelta
    ? (props.deltaTone ?? "neutral")
    : inferredTone;

  const deltaClass =
    effectiveTone === "positive"
      ? "text-[#0a5d44] bg-[color-mix(in_oklab,var(--mint)_22%,white)] border-[color-mix(in_oklab,var(--mint)_60%,white)]"
      : effectiveTone === "negative"
        ? "text-[#7a1b22] bg-[color-mix(in_oklab,var(--red)_15%,white)] border-[color-mix(in_oklab,var(--red)_45%,white)]"
        : "text-[var(--ink-2)] bg-[var(--surface-soft)] border-[var(--line)]";

  const arrow =
    effectiveTone === "positive"
      ? "↑"
      : effectiveTone === "negative"
        ? "↓"
        : "→";

  return (
    <div
      className="rho-interactive-card rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-5 flex flex-col gap-2.5"
      data-expanded={expanded ? "true" : "false"}
    >
      <button
        type="button"
        className="rho-disclosure-trigger text-left"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      >
        <span className="mono text-[10.5px] uppercase tracking-[0.14em] text-[var(--ink)] font-medium">
          {props.label}
        </span>
        <span className="rho-disclosure-caret" aria-hidden>
          {expanded ? "Hide detail" : "Reveal detail"}
        </span>
      </button>
      <button
        type="button"
        className="flex items-baseline justify-between gap-3 flex-wrap text-left"
        aria-label={`Toggle details for ${props.label}`}
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      >
        <span className="text-[28px] font-semibold tracking-tight text-[var(--ink)] leading-none tabular-nums">
          {props.value}
        </span>
        {finalDelta && (
          <span
            className={clsx(
              "mono text-[11px] px-1.5 py-0.5 rounded-md border font-medium tabular-nums inline-flex items-center gap-1",
              deltaClass,
            )}
          >
            <span aria-hidden>{arrow}</span>
            {finalDelta}
          </span>
        )}
      </button>
      {props.caption && (
        <span className="text-[12px] text-[var(--ink)] leading-snug">
          {props.caption}
        </span>
      )}
      {expanded && (
        <div className="rho-reveal-panel">
          <span className="mono text-[10.5px] uppercase tracking-[0.08em] text-[var(--ink)]">
            Why this metric matters
          </span>
          <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--ink-2)]">
            Label: {props.label}. Value: {props.value}
            {finalDelta ? `. Delta: ${finalDelta}` : ""}
            {props.caption ? `. Caption: ${props.caption}` : ""}
          </p>
        </div>
      )}
    </div>
  );
};

type Series = { label: string; value: number }[];

const tooltipStyle = {
  background: "var(--surface)",
  border: "1px solid var(--line)",
  borderRadius: 8,
  fontSize: 12,
  padding: "6px 10px",
  color: "var(--ink)",
  boxShadow: "0 4px 12px -2px rgba(10, 10, 15, 0.08)",
};

/* Per-item text inside the tooltip. Recharts otherwise inherits the
 * series fill color (light lilac for our charts), which renders as
 * washed-out text. Force a saturated dark purple so the numbers stay
 * readable and on-brand. */
const tooltipItemStyle = {
  color: "#3b3a8a",
  fontSize: 12,
  fontWeight: 500,
};
const tooltipLabelStyle = {
  color: "var(--ink)",
  fontSize: 11,
  fontWeight: 600,
  marginBottom: 2,
};

const axisTickStyle = {
  fontSize: 11,
  fill: "var(--ink)",
  fontWeight: 500,
};

/* If long or many x-axis labels would collide, rotate them and let
 * recharts auto-skip overlapping ones. The threshold is conservative:
 * any label over 6 chars OR more than 6 data points → angle. */
function xAxisProps(data: Series) {
  const maxLen = data.reduce((m, d) => Math.max(m, (d.label ?? "").length), 0);
  const tilt = maxLen > 6 || data.length > 6;
  return {
    angle: tilt ? -28 : 0,
    height: tilt ? 56 : 24,
    textAnchor: tilt ? ("end" as const) : ("middle" as const),
    interval: "preserveStartEnd" as const,
    minTickGap: 8,
    dy: tilt ? 4 : 0,
  };
}

const BarChart = ({
  props,
}: RendererProps<{ data: Series; height?: number }>) => {
  const data = props.data ?? [];
  const xa = xAxisProps(data);
  return (
    <div style={{ width: "100%", height: props.height ?? 240 }}>
      <ResponsiveContainer>
        <RBarChart
          data={data}
          margin={{ top: 24, right: 12, left: 4, bottom: xa.angle ? 16 : 4 }}
        >
          <CartesianGrid
            stroke="var(--line-2)"
            vertical={false}
            strokeDasharray="3 3"
          />
          <XAxis
            dataKey="label"
            tick={axisTickStyle}
            axisLine={false}
            tickLine={false}
            angle={xa.angle}
            height={xa.height}
            textAnchor={xa.textAnchor}
            interval={xa.interval}
            minTickGap={xa.minTickGap}
            dy={xa.dy}
          />
          <YAxis
            tick={axisTickStyle}
            axisLine={false}
            tickLine={false}
            width={44}
            tickFormatter={fmtNumber}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            itemStyle={tooltipItemStyle}
            labelStyle={tooltipLabelStyle}
            cursor={{ fill: "var(--lilac-softer)" }}
          />
          <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="var(--lilac)">
            <LabelList
              dataKey="value"
              position="top"
              style={{ fontSize: 11, fontWeight: 600, fill: "var(--ink)" }}
              formatter={(v: unknown) => fmtNumber(Number(v))}
            />
          </Bar>
        </RBarChart>
      </ResponsiveContainer>
    </div>
  );
};

const LineChart = ({
  props,
}: RendererProps<{ data: Series; height?: number }>) => {
  const data = props.data ?? [];
  const xa = xAxisProps(data);
  return (
    <div style={{ width: "100%", height: props.height ?? 240 }}>
      <ResponsiveContainer>
        <RLineChart
          data={data}
          margin={{ top: 24, right: 16, left: 4, bottom: xa.angle ? 16 : 4 }}
        >
          <CartesianGrid
            stroke="var(--line-2)"
            vertical={false}
            strokeDasharray="3 3"
          />
          <XAxis
            dataKey="label"
            tick={axisTickStyle}
            axisLine={false}
            tickLine={false}
            angle={xa.angle}
            height={xa.height}
            textAnchor={xa.textAnchor}
            interval={xa.interval}
            minTickGap={xa.minTickGap}
            dy={xa.dy}
          />
          <YAxis
            tick={axisTickStyle}
            axisLine={false}
            tickLine={false}
            width={44}
            tickFormatter={fmtNumber}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            itemStyle={tooltipItemStyle}
            labelStyle={tooltipLabelStyle}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#3b3a8a"
            strokeWidth={2.5}
            dot={{
              r: 3.5,
              fill: "var(--lilac)",
              stroke: "#3b3a8a",
              strokeWidth: 1.5,
            }}
            activeDot={{ r: 5 }}
          >
            <LabelList
              dataKey="value"
              position="top"
              style={{ fontSize: 11, fontWeight: 600, fill: "var(--ink)" }}
              formatter={(v: unknown) => fmtNumber(Number(v))}
            />
          </Line>
        </RLineChart>
      </ResponsiveContainer>
    </div>
  );
};

const HorizontalBarChart = ({
  props,
}: RendererProps<{ data: Series; height?: number }>) => {
  const data = props.data ?? [];
  // Auto-size: ~32px per row + padding. Caller can override via height.
  const height = props.height ?? Math.max(180, data.length * 32 + 48);
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <RBarChart
          data={data}
          layout="vertical"
          margin={{ top: 8, right: 56, left: 4, bottom: 8 }}
        >
          <CartesianGrid
            stroke="var(--line-2)"
            horizontal={false}
            strokeDasharray="3 3"
          />
          <XAxis
            type="number"
            tick={axisTickStyle}
            axisLine={false}
            tickLine={false}
            tickFormatter={fmtNumber}
          />
          <YAxis
            type="category"
            dataKey="label"
            tick={axisTickStyle}
            axisLine={false}
            tickLine={false}
            width={120}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            itemStyle={tooltipItemStyle}
            labelStyle={tooltipLabelStyle}
            cursor={{ fill: "var(--lilac-softer)" }}
          />
          <Bar dataKey="value" radius={[0, 6, 6, 0]} fill="var(--lilac)">
            <LabelList
              dataKey="value"
              position="right"
              style={{ fontSize: 11, fontWeight: 600, fill: "var(--ink)" }}
              formatter={(v: unknown) => fmtNumber(Number(v))}
            />
          </Bar>
        </RBarChart>
      </ResponsiveContainer>
    </div>
  );
};

type ScatterPoint = { x: number; y: number; label?: string };

const ScatterChart = ({
  props,
}: RendererProps<{
  data: ScatterPoint[];
  xLabel?: string;
  yLabel?: string;
  height?: number;
}>) => {
  const data = props.data ?? [];
  return (
    <div style={{ width: "100%", height: props.height ?? 280 }}>
      <ResponsiveContainer>
        <RScatterChart margin={{ top: 16, right: 24, left: 8, bottom: 28 }}>
          <CartesianGrid stroke="var(--line-2)" strokeDasharray="3 3" />
          <XAxis
            type="number"
            dataKey="x"
            name={props.xLabel ?? "x"}
            tick={axisTickStyle}
            axisLine={false}
            tickLine={false}
            tickFormatter={fmtNumber}
            label={
              props.xLabel
                ? {
                    value: props.xLabel,
                    position: "insideBottom",
                    offset: -8,
                    style: { fontSize: 11, fill: "var(--ink)" },
                  }
                : undefined
            }
          />
          <YAxis
            type="number"
            dataKey="y"
            name={props.yLabel ?? "y"}
            tick={axisTickStyle}
            axisLine={false}
            tickLine={false}
            width={44}
            tickFormatter={fmtNumber}
            label={
              props.yLabel
                ? {
                    value: props.yLabel,
                    angle: -90,
                    position: "insideLeft",
                    style: { fontSize: 11, fill: "var(--ink)" },
                  }
                : undefined
            }
          />
          <Tooltip
            contentStyle={tooltipStyle}
            itemStyle={tooltipItemStyle}
            labelStyle={tooltipLabelStyle}
            cursor={{ strokeDasharray: "3 3" }}
            formatter={(v: unknown, name: unknown) => [
              fmtNumber(Number(v)),
              name == null ? "" : String(name),
            ]}
          />
          <Scatter
            data={data}
            fill="var(--lilac)"
            stroke="#3b3a8a"
            strokeWidth={1.5}
          />
        </RScatterChart>
      </ResponsiveContainer>
    </div>
  );
};

const DonutChart = ({
  props,
}: RendererProps<{ data: Series; height?: number }>) => {
  const data = props.data ?? [];
  const total = data.reduce((s, d) => s + d.value, 0);
  const height = props.height ?? 240;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-5">
      <div className="relative shrink-0" style={{ width: height, height }}>
        <ResponsiveContainer>
          <PieChart>
            <Tooltip
              contentStyle={tooltipStyle}
              itemStyle={tooltipItemStyle}
              labelStyle={tooltipLabelStyle}
              formatter={(value: unknown, name: unknown) => [
                fmtNumber(Number(value)),
                String(name),
              ]}
            />
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius="60%"
              outerRadius="92%"
              paddingAngle={1.5}
              stroke="var(--surface)"
              strokeWidth={2}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        {/* Total in the middle of the donut */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink)]">
            Total
          </span>
          <span className="text-[20px] font-semibold tracking-tight text-[var(--ink)] tabular-nums leading-tight">
            {fmtNumber(total)}
          </span>
        </div>
      </div>

      {/* External legend with values */}
      <ul className="flex-1 min-w-0 flex flex-col gap-1.5">
        {data.map((d, i) => {
          const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
          return (
            <li
              key={`${d.label}-${i}`}
              className="flex items-center gap-3 text-[13px]"
            >
              <span
                className="w-3 h-3 rounded-sm shrink-0"
                style={{ background: CHART_PALETTE[i % CHART_PALETTE.length] }}
              />
              <span className="text-[var(--ink-2)] truncate flex-1 min-w-0">
                {d.label}
              </span>
              <span className="mono tabular-nums text-[12.5px] text-[var(--ink)] font-medium shrink-0">
                {fmtNumber(d.value)}
              </span>
              <span className="mono text-[11px] text-[var(--ink)] shrink-0 w-9 text-right">
                {pct}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

const DataTable = ({
  props,
}: RendererProps<{
  columns: { key: string; label: string; align?: "left" | "right" }[];
  rows: Record<string, string | number>[];
}>) => {
  const columns = props.columns ?? [];
  const rows = props.rows ?? [];
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const toggleRow = (index: number) => {
    setExpandedRow((current) => (current === index ? null : index));
  };
  return (
    <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]">
      <table className="w-full text-[13.5px] border-collapse">
        <thead className="bg-[var(--surface-soft)]">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={clsx(
                  "px-4 py-2.5 font-medium mono uppercase tracking-[0.1em] text-[10.5px] text-[var(--ink)] border-b border-[var(--line)]",
                  c.align === "right" ? "text-right" : "text-left",
                )}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const rowText = columns
              .map((column) => String(row[column.key] ?? ""))
              .filter(Boolean)
              .join(" · ");
            const expanded = expandedRow === i;
            return (
              <Fragment key={`row-group-${i}`}>
                <tr
                  role="button"
                  tabIndex={0}
                  aria-expanded={expanded}
                  className={clsx(
                    "rho-table-row border-b border-[var(--line-2)] last:border-b-0 transition-colors hover:bg-[var(--surface-soft)]",
                    expanded && "rho-table-row--expanded bg-[var(--surface-soft)]",
                  )}
                  onClick={() => toggleRow(i)}
                  onKeyDown={(event) => onKeyboardActivate(event, () => toggleRow(i))}
                >
                  {columns.map((c, columnIndex) => {
                    const raw = row[c.key];
                    const text = raw == null ? "" : String(raw);
                    const looksLikeDelta = c.key === "delta" || c.key === "Δ";
                    const meaningful = !looksLikeDelta || hasMeaningfulDelta(text);
                    if (looksLikeDelta && meaningful) {
                      const tone = text.trim().startsWith("-")
                        ? "text-[#7a1b22]"
                        : text.trim().startsWith("+")
                          ? "text-[#0a5d44]"
                          : "text-[var(--ink-2)]";
                      return (
                        <td
                          key={c.key}
                          className={clsx(
                            "px-4 py-3 tabular-nums mono text-[12px] font-medium",
                            c.align === "right" ? "text-right" : "text-left",
                            tone,
                          )}
                        >
                          {text}
                        </td>
                      );
                    }
                    return (
                      <td
                        key={c.key}
                        className={clsx(
                          "px-4 py-3 text-[var(--ink-2)]",
                          c.align === "right"
                            ? "text-right tabular-nums mono text-[13px]"
                            : "text-left",
                        )}
                      >
                        {meaningful && columnIndex === 0 ? (
                          <button
                            type="button"
                            className="rho-table-row-toggle text-left"
                            aria-expanded={expanded}
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleRow(i);
                            }}
                          >
                            {text}
                          </button>
                        ) : meaningful ? (
                          (text as ReactNode)
                        ) : (
                          <span className="text-[var(--ink)]">. </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
                {expanded && (
                  <tr className="rho-table-row-detail">
                    <td colSpan={Math.max(columns.length, 1)} className="px-4 py-3">
                      <div className="rho-reveal-panel">
                        <span className="mono text-[10.5px] uppercase tracking-[0.08em] text-[var(--ink)]">
                          Policy and tool implication
                        </span>
                        <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--ink-2)]">
                          {rowText || firstMeaningfulRecordValue(row)}. Use this row to
                          decide whether the case can move forward, needs more customer
                          evidence, or must stay outside tool execution.
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const Button = ({
  props,
  dispatch,
}: RendererProps<{
  label: string;
  variant?: "primary" | "secondary" | "ghost";
  action: { event: { name: string; context?: Record<string, unknown> } };
}>) => {
  const variants = {
    primary: "bg-[var(--ink)] text-white hover:bg-[#1d1d23]",
    secondary:
      "border border-[var(--line)] text-[var(--ink)] hover:bg-[var(--surface-soft)]",
    ghost: "text-[var(--ink)] hover:text-[var(--ink)]",
  };
  return (
    <button
      type="button"
      onClick={() =>
        dispatch?.({ ...props.action, sourceComponentId: undefined } as never)
      }
      className={clsx(
        "inline-flex items-center gap-2 px-4 py-2 rounded-[10px] mono text-[12.5px] font-medium transition",
        variants[props.variant ?? "secondary"],
      )}
    >
      {props.label}
    </button>
  );
};

const ChoiceChips = ({
  props,
  dispatch,
}: RendererProps<{
  label: string;
  options: { label: string; value: string }[];
  value: string | string[];
  multi?: boolean;
}>) => {
  const selected = Array.isArray(props.value)
    ? props.value
    : props.value
      ? [props.value]
      : [];
  return (
    <div className="flex flex-col gap-2">
      <span className="mono text-[11px] uppercase tracking-[0.14em] text-[var(--ink)] font-medium">
        {props.label}
      </span>
      <div className="flex flex-wrap gap-2">
        {(props.options ?? []).map((o) => {
          const isOn = selected.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              onClick={() =>
                dispatch?.({
                  event: {
                    name: "select_chip",
                    context: { value: o.value, label: props.label },
                  },
                } as never)
              }
              className={clsx(
                "px-3 py-1.5 rounded-full text-[12px] border transition mono",
                isOn
                  ? "bg-[var(--ink)] text-white border-[var(--ink)]"
                  : "bg-[var(--surface)] text-[var(--ink-2)] border-[var(--line)] hover:border-[var(--ink-2)]",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

type RelayNode = {
  id: string;
  label: string;
  role: string;
  status: "idle" | "active" | "complete" | "blocked";
};

type RelayEdge = {
  from: string;
  to: string;
  label: string;
  status: "pending" | "active" | "complete" | "blocked";
};

type PolicySource = {
  id: string;
  title: string;
  source: string;
  excerpt: string;
  url?: string;
  fetchedAt?: number;
};

/* Relative-freshness label for live LinkUp evidence. `fetchedAt` is a unix
 * timestamp (seconds). Returns "live" within the first minute, then a coarse
 * "fetched Xs/m/h ago" string. */
function formatFreshness(fetchedAt: number, nowMs: number): string {
  const ageSeconds = Math.max(0, Math.round(nowMs / 1000 - fetchedAt));
  if (ageSeconds < 60) return "live";
  if (ageSeconds < 3600) return `fetched ${Math.floor(ageSeconds / 60)}m ago`;
  return `fetched ${Math.floor(ageSeconds / 3600)}h ago`;
}

const STATUS_TONE = {
  idle: "border-[var(--line)] bg-[var(--surface)] text-[var(--ink-2)]",
  pending: "border-[var(--line)] bg-[var(--surface)] text-[var(--ink-2)]",
  active:
    "border-[color-mix(in_oklab,var(--lilac)_65%,white)] bg-[color-mix(in_oklab,var(--lilac)_12%,white)] text-[#2e2c75]",
  complete:
    "border-[color-mix(in_oklab,var(--mint)_65%,white)] bg-[color-mix(in_oklab,var(--mint)_12%,white)] text-[#0a5d44]",
  blocked:
    "border-[color-mix(in_oklab,var(--orange)_65%,white)] bg-[color-mix(in_oklab,var(--orange)_12%,white)] text-[#7a3f0f]",
  failed:
    "border-[color-mix(in_oklab,var(--red)_55%,white)] bg-[color-mix(in_oklab,var(--red)_10%,white)] text-[#7a1b22]",
  proposed:
    "border-[var(--line)] bg-[var(--surface-soft)] text-[var(--ink-2)]",
  running:
    "border-[color-mix(in_oklab,var(--lilac)_65%,white)] bg-[color-mix(in_oklab,var(--lilac)_12%,white)] text-[#2e2c75]",
  low: "border-[color-mix(in_oklab,var(--mint)_65%,white)] bg-[color-mix(in_oklab,var(--mint)_12%,white)] text-[#0a5d44]",
  medium:
    "border-[color-mix(in_oklab,var(--orange)_65%,white)] bg-[color-mix(in_oklab,var(--orange)_12%,white)] text-[#7a3f0f]",
  high: "border-[color-mix(in_oklab,var(--red)_55%,white)] bg-[color-mix(in_oklab,var(--red)_10%,white)] text-[#7a1b22]",
} as const;

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: keyof typeof STATUS_TONE;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-md border px-1.5 py-0.5 mono text-[10.5px] font-medium uppercase tracking-[0.08em]",
        STATUS_TONE[tone],
      )}
    >
      {label}
    </span>
  );
}

const SOURCE_LANES = [
  "Bank policy",
  "Public evidence",
  "Memory",
  "Agent response",
] as const;

type SourceLane = (typeof SOURCE_LANES)[number];

function sourceLane(source: PolicySource): SourceLane {
  const haystack = `${source.id} ${source.title} ${source.source}`.toLowerCase();
  if (haystack.includes("redis") || haystack.includes("memory")) {
    return "Memory";
  }
  if (haystack.includes("a2a") || haystack.includes("agent")) {
    return "Agent response";
  }
  if (
    haystack.includes("linkup") ||
    haystack.includes("public") ||
    haystack.includes("web")
  ) {
    return "Public evidence";
  }
  return "Bank policy";
}

function laneRole(lane: SourceLane) {
  return {
    "Bank policy":
      "Bank policy anchors the permitted support path and tool boundary.",
    "Public evidence":
      "Public evidence provides external context returned by the configured evidence integration.",
    Memory:
      "Memory shows whether case state was persisted or rehydrated for this context.",
    "Agent response":
      "Agent response contains returned protocol artifacts, not hidden chain-of-thought.",
  }[lane];
}

function receiptNextAction(status: ToolActionCardProps["status"]) {
  return {
    proposed: "Collect approval before execution.",
    running: "Wait for the tool result, then generate the receipt.",
    complete: "Export the audit receipt.",
    blocked: "Resolve the listed blocker before retrying.",
    failed: "Review the failure, then retry only with valid context.",
  }[status];
}

function receiptNotPerformed(
  status: ToolActionCardProps["status"],
  toolName: string,
) {
  if (status === "complete") return "None.";
  if (status === "running") return "Final mutation has not completed.";
  return `${toolName} was not performed.`;
}

function receiptReason(
  label: string,
  status: ToolActionCardProps["status"],
) {
  if (label === "Required tech used") {
    return "This row summarizes the visible tool context for review.";
  }
  if (label === "Tool status") {
    return `The tool status is ${status}.`;
  }
  if (label === "Next safe action") {
    return `This follows from the ${status} status and is displayed for review only.`;
  }
  return `This row records what was not performed while status is ${status}.`;
}

type ToolActionCardProps = {
  actor: "personal" | "customer_service" | "system";
  toolName: string;
  arguments: { key: string; value: string }[];
  status: "proposed" | "running" | "complete" | "blocked" | "failed";
  resultSummary: string;
  riskLevel: "low" | "medium" | "high";
};

const AgentRelayMap = ({
  props,
}: RendererProps<{
  nodes: RelayNode[];
  edges: RelayEdge[];
  activeNodeId?: string;
  contextId: string;
}>) => {
  const nodes = props.nodes ?? [];
  const edges = props.edges ?? [];
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    props.activeNodeId ?? nodes[0]?.id ?? null,
  );
  const [selectedEdgeIndex, setSelectedEdgeIndex] = useState<number | null>(null);
  const liveA2aAttached =
    nodes.some((node) => node.id === "live-a2a") ||
    edges.some((edge) => /a2a/i.test(`${edge.from} ${edge.to} ${edge.label}`));
  return (
    <div
      className={clsx(
        "rho-proc-block rho-relay-map rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-4",
        liveA2aAttached && "rho-relay-map--live-a2a-attached",
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] pb-3">
        <div>
          <h3 className="text-[15px] font-semibold text-[var(--ink)]">
            Agent relay
          </h3>
          <p className="mt-0.5 mono text-[11px] text-[var(--ink)]">
            context {props.contextId}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <StatusPill label="A2A" tone="active" />
          {liveA2aAttached && (
            <StatusPill label="Live A2A attached" tone="complete" />
          )}
        </div>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {nodes.map((node) => {
            const isActive =
              node.id === props.activeNodeId || node.status === "active";
            const isLiveA2a = node.id === "live-a2a";
            const selected = node.id === selectedNodeId;
            return (
              <button
                key={node.id}
                type="button"
                aria-expanded={selected}
                onClick={() => {
                  setSelectedNodeId((current) =>
                    current === node.id ? null : node.id,
                  );
                  setSelectedEdgeIndex(null);
                }}
                className={clsx(
                  "rho-proc-item rho-relay-node rounded-[8px] border p-3 text-left",
                  `rho-relay-node--${node.status}`,
                  isLiveA2a && "rho-relay-node--live-a2a",
                  selected && "rho-relay-node--selected",
                  isActive
                    ? "rho-relay-node--active-pulse border-[var(--ink)] bg-[var(--surface-soft)]"
                    : "border-[var(--line)] bg-[var(--surface)]",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-semibold text-[var(--ink)]">
                      {node.label}
                    </div>
                    <div className="mt-1 text-[12px] text-[var(--ink)]">
                      {node.role}
                    </div>
                  </div>
                  <StatusPill label={node.status} tone={node.status} />
                </div>
                {isActive && (
                  <span
                    aria-hidden
                    className="rho-relay-node__pulse"
                  />
                )}
                {selected && (
                  <div className="rho-reveal-panel mt-3">
                    <span className="mono text-[10.5px] uppercase tracking-[0.08em] text-[var(--ink)]">
                      Relay detail
                    </span>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--ink-2)]">
                      {node.label} is the {node.role.toLowerCase()} for context{" "}
                      <span className="mono text-[11px]">{props.contextId}</span>.
                      Status is {node.status}.{" "}
                      {isLiveA2a
                        ? "This node represents the attached protocol artifact, not hidden reasoning."
                        : "Use this node to understand which actor owns the next safe handoff."}
                    </p>
                  </div>
                )}
              </button>
            );
          })}
        </div>
        <ol className="flex flex-col gap-2">
          {edges.map((edge, index) => {
            const selected = selectedEdgeIndex === index;
            const isLiveEdge = /a2a/i.test(`${edge.from} ${edge.to} ${edge.label}`);
            return (
              <li
                key={`${edge.from}-${edge.to}-${index}`}
                className={clsx(
                  "rho-proc-item rho-relay-edge rounded-[8px] border border-[var(--line)] bg-[var(--surface-soft)] p-2.5",
                  `rho-relay-edge--${edge.status}`,
                  edge.status === "complete" && "rho-relay-edge--draw-in",
                  isLiveEdge && "rho-relay-edge--live-a2a",
                  selected && "rho-relay-edge--selected",
                )}
              >
                <button
                  type="button"
                  className="w-full text-left"
                  aria-expanded={selected}
                  onClick={() => {
                    setSelectedEdgeIndex((current) =>
                      current === index ? null : index,
                    );
                    setSelectedNodeId(null);
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="mono text-[11px] text-[var(--ink)]">
                      {edge.from} → {edge.to}
                    </span>
                    <StatusPill label={edge.status} tone={edge.status} />
                  </div>
                  <p className="mt-1 text-[12px] leading-snug text-[var(--ink-2)]">
                    {edge.label}
                  </p>
                </button>
                {selected && (
                  <div className="rho-reveal-panel mt-2">
                    <span className="mono text-[10.5px] uppercase tracking-[0.08em] text-[var(--ink)]">
                      Handoff detail
                    </span>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--ink-2)]">
                      This {edge.status} handoff links {edge.from} to {edge.to}
                      for context{" "}
                      <span className="mono text-[11px]">{props.contextId}</span>.
                      {isLiveEdge
                        ? " It attaches the returned A2A protocol artifact only."
                        : " Review this edge before trusting the next tool gate."}
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
};

const ToolActionCard = ({ props }: RendererProps<ToolActionCardProps>) => {
  const args = props.arguments ?? [];
  const [selectedArg, setSelectedArg] = useState<string | null>(
    args[0]?.key ?? null,
  );
  const [selectedReceipt, setSelectedReceipt] = useState<string | null>(
    "Next safe action",
  );
  const actorLabel = {
    personal: "Personal agent",
    customer_service: "CS agent",
    system: "System",
  }[props.actor];
  const requiredTechUsed =
    props.toolName === "configure_required_hackathon_integrations"
      ? args.length
        ? args.map((arg) => arg.key).join(", ")
        : "A2A, Redis, LinkUp"
      : `${props.toolName}; ${actorLabel}; ${props.riskLevel} risk`;
  const receiptRows = [
    ["Required tech used", requiredTechUsed],
    ["Tool status", props.status],
    ["Next safe action", receiptNextAction(props.status)],
    ["Not performed", receiptNotPerformed(props.status, props.toolName)],
  ];
  return (
    <div
      className={clsx(
        "rho-proc-block rho-tool-card rho-receipt-card rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-4",
        `rho-receipt-card--${props.status}`,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--line)] pb-3">
        <div>
          <div className="mono text-[10.5px] uppercase tracking-[0.08em] text-[var(--ink)]">
            Tool action
          </div>
          <h3 className="text-[15px] font-semibold text-[var(--ink)]">
            {props.toolName}
          </h3>
          <p className="mt-0.5 text-[12px] text-[var(--ink)]">{actorLabel}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <StatusPill label={props.status} tone={props.status} />
          <StatusPill label={`${props.riskLevel} risk`} tone={props.riskLevel} />
        </div>
      </div>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        {args.map((arg) => (
          <button
            key={arg.key}
            type="button"
            aria-expanded={selectedArg === arg.key}
            onClick={() =>
              setSelectedArg((current) => (current === arg.key ? null : arg.key))
            }
            className="rho-proc-item rho-tool-arg rounded-[8px] border border-[var(--line)] bg-[var(--surface-soft)] px-3 py-2 text-left"
          >
            <dt className="mono text-[10.5px] uppercase tracking-[0.08em] text-[var(--ink)]">
              {arg.key}
            </dt>
            <dd className="mt-0.5 truncate text-[13px] text-[var(--ink-2)]">
              {arg.value}
            </dd>
            {selectedArg === arg.key && (
              <dd className="rho-reveal-panel mt-2">
                <span className="mono text-[10.5px] uppercase tracking-[0.08em] text-[var(--ink)]">
                  Tool implication
                </span>
                <span className="mt-1 block text-[12.5px] leading-relaxed text-[var(--ink-2)]">
                  {arg.key}: {arg.value}. Tool status: {props.status}. Risk:{" "}
                  {props.riskLevel}.
                </span>
              </dd>
            )}
          </button>
        ))}
      </dl>
      <p className="mt-3 text-[13px] leading-relaxed text-[var(--ink-2)]">
        {props.resultSummary}
      </p>
      <dl className="rho-receipt-grid mt-3 grid gap-2 sm:grid-cols-2">
        {receiptRows.map(([label, value]) => (
          <button
            key={label}
            type="button"
            aria-expanded={selectedReceipt === label}
            onClick={() =>
              setSelectedReceipt((current) =>
                current === label ? null : label,
              )
            }
            className={clsx(
              "rho-receipt-item rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-left",
              label === "Not performed" && "rho-receipt-item--not-performed",
              selectedReceipt === label && "rho-receipt-item--expanded",
            )}
          >
            <dt className="mono text-[10.5px] uppercase tracking-[0.08em] text-[var(--ink)]">
              {label}
            </dt>
            <dd className="mt-0.5 text-[12.5px] leading-snug text-[var(--ink-2)]">
              {value}
            </dd>
            {selectedReceipt === label && (
              <dd className="rho-reveal-panel mt-2">
                <span className="mono text-[10.5px] uppercase tracking-[0.08em] text-[var(--ink)]">
                  Safety reason
                </span>
                <span className="mt-1 block text-[12.5px] leading-relaxed text-[var(--ink-2)]">
                  {receiptReason(label, props.status)}
                </span>
              </dd>
            )}
          </button>
        ))}
      </dl>
    </div>
  );
};

const PolicyRadar = ({
  props,
}: RendererProps<{
  queries: string[];
  sources: PolicySource[];
  selectedSourceId?: string;
  confidence: "low" | "medium" | "high";
  rationale?: string;
}>) => {
  const sources = props.sources ?? [];
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(
    props.selectedSourceId ?? sources[0]?.id ?? null,
  );
  const selectedSource = sources.find((source) => source.id === selectedSourceId);
  const [selectedLane, setSelectedLane] = useState<SourceLane>(
    selectedSource ? sourceLane(selectedSource) : SOURCE_LANES[0],
  );
  // Tick a clock only while at least one source carries a fetchedAt stamp, so
  // the "fetched Xs ago / live" freshness label stays honest as time passes.
  const hasFreshness = sources.some(
    (source) => typeof source.fetchedAt === "number",
  );
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!hasFreshness) return;
    const timer = setInterval(() => setNowMs(Date.now()), 15000);
    return () => clearInterval(timer);
  }, [hasFreshness]);
  const sourcesByLane = SOURCE_LANES.map((lane) => ({
    lane,
    sources: sources.filter((source) => sourceLane(source) === lane),
  }));
  return (
    <div className="rho-proc-block rho-policy-radar rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-[var(--ink)]">
            Policy radar
          </h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(props.queries ?? []).map((query) => (
              <span
                key={query}
                className="rho-proc-chip rounded-md border border-[var(--line)] bg-[var(--surface-soft)] px-2 py-1 mono text-[10.5px] text-[var(--ink)]"
              >
                {query}
              </span>
            ))}
          </div>
        </div>
        <StatusPill label={`${props.confidence} confidence`} tone={props.confidence} />
      </div>
      {props.rationale && (
        <div className="rho-policy-rationale mt-3 rounded-[8px] border border-[var(--line)] bg-[var(--surface-soft)] p-3">
          <span className="mono text-[10.5px] uppercase tracking-[0.08em] text-[var(--ink)]">
            Reasoned rationale
          </span>
          <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--ink-2)]">
            {props.rationale}
          </p>
        </div>
      )}
      <div className="rho-policy-lanes mt-4 grid gap-2">
        {sourcesByLane.map(({ lane, sources: laneSources }) => (
          <section
            key={lane}
            className={clsx(
              "rho-policy-lane rounded-[8px] border border-[var(--line)] bg-[var(--surface-soft)] p-2.5",
              `rho-policy-lane--${lane.toLowerCase().replace(/\s+/g, "-")}`,
              selectedLane === lane && "rho-policy-lane--selected",
            )}
          >
            <button
              type="button"
              aria-expanded={selectedLane === lane}
              onClick={() => setSelectedLane(lane)}
              className="mb-2 flex w-full items-center justify-between gap-2 text-left"
            >
              <h4 className="mono text-[10.5px] uppercase tracking-[0.08em] text-[var(--ink)]">
                {lane}
              </h4>
              <span className="mono text-[10.5px] text-[var(--ink)]">
                {laneSources.length}
              </span>
            </button>
            {selectedLane === lane && (
              <div className="rho-reveal-panel mb-2">
                <span className="mono text-[10.5px] uppercase tracking-[0.08em] text-[var(--ink)]">
                  Lane role
                </span>
                <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--ink-2)]">
                  {laneRole(lane)}
                </p>
              </div>
            )}
            <div className="grid gap-2">
              {laneSources.length ? (
                laneSources.map((source) => {
                  const selected = source.id === selectedSourceId;
                  const isLinkUp = /linkup/i.test(source.source);
                  const freshness =
                    typeof source.fetchedAt === "number"
                      ? formatFreshness(source.fetchedAt, nowMs)
                      : null;
                  return (
                    <article key={source.id} className="grid gap-2">
                      <button
                        type="button"
                        aria-expanded={selected}
                        onClick={() => {
                          setSelectedSourceId((current) =>
                            current === source.id ? null : source.id,
                          );
                          setSelectedLane(lane);
                        }}
                      className={clsx(
                        "rho-proc-item rho-policy-source rounded-[8px] border p-3 text-left",
                        selected
                          ? "rho-policy-source--selected border-[var(--ink)] bg-[var(--surface)]"
                          : "border-[var(--line)] bg-[var(--surface)]",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h5 className="truncate text-[13px] font-semibold text-[var(--ink)]">
                            {source.title}
                          </h5>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                            <span className="mono text-[10.5px] text-[var(--ink)]">
                              {source.source}
                            </span>
                            {isLinkUp && (
                              <span className="rho-policy-provenance rounded-full border border-[var(--line)] bg-[var(--surface-soft)] px-1.5 py-0.5 mono text-[9.5px] uppercase tracking-[0.06em] text-[var(--ink)]">
                                LinkUp
                              </span>
                            )}
                            {freshness && (
                              <span
                                className={clsx(
                                  "rho-policy-freshness rounded-full px-1.5 py-0.5 mono text-[9.5px] uppercase tracking-[0.06em]",
                                  freshness === "live"
                                    ? "border border-[color-mix(in_oklab,var(--mint)_60%,white)] bg-[color-mix(in_oklab,var(--mint)_14%,white)] text-[#0a5d44]"
                                    : "border border-[var(--line)] bg-[var(--surface-soft)] text-[var(--ink)]",
                                )}
                              >
                                {freshness}
                              </span>
                            )}
                          </div>
                        </div>
                        {selected && <StatusPill label="selected" tone="active" />}
                      </div>
                      <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--ink-2)]">
                        {source.excerpt}
                      </p>
                      </button>
                      {source.url && (
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex w-fit items-center gap-1 rounded-md border border-[var(--line)] bg-[var(--surface-soft)] px-2 py-1 mono text-[10.5px] text-[var(--ink)] hover:border-[var(--ink-2)]"
                        >
                          {source.title}
                          <span aria-hidden>↗</span>
                        </a>
                      )}
                      {selected && (
                        <div className="rho-reveal-panel">
                          <span className="mono text-[10.5px] uppercase tracking-[0.08em] text-[var(--ink)]">
                            Why this source matters
                          </span>
                          <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--ink-2)]">
                            {source.source} is categorized as {lane}. Use the
                            excerpt as returned evidence only; it does not
                            expose hidden reasoning or credentials. Confidence:
                            {" "}
                            {props.confidence}.
                          </p>
                          {source.url && (
                            <a
                              href={source.url}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-2 inline-flex rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1 mono text-[10.5px] uppercase tracking-[0.08em] text-[var(--ink)]"
                            >
                              Open source
                            </a>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })
              ) : (
                <div className="rho-policy-source rho-policy-source--empty rounded-[8px] border border-[var(--line)] bg-[var(--surface)] p-3 text-[12.5px] text-[var(--ink)]">
                  No source in this lane.
                </div>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};

function Slot({ render }: { render: ReactNode }) {
  return <>{render}</>;
}

export const renderers = {
  Stack,
  Row,
  Grid,
  Section,
  Card,
  Divider,
  Heading,
  Text,
  Overline,
  Badge,
  Callout,
  BulletList,
  StatCard,
  BarChart,
  HorizontalBarChart,
  LineChart,
  DonutChart,
  ScatterChart,
  DataTable,
  Button,
  ChoiceChips,
  AgentRelayMap,
  ToolActionCard,
  PolicyRadar,
};
