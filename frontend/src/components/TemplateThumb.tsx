import type { TemplateDef } from "@resume/shared/render/templates";
import { cssFontStack } from "@resume/shared/render/fonts";

/** Miniature page sketch that shows a template's header and heading treatment at a glance. */
export function TemplateThumb({ t, accent }: { t: TemplateDef; accent?: string | null }) {
  const a = (accent ?? t.defaultAccent) || "#111827";
  const color = t.useAccent ? a : "#111827";
  const center = t.header === "center";
  const headColor = t.headingColor === "muted" ? "#9ca3af" : t.headingColor === "accent" ? color : "#1f2937";
  const Heading = () => (
    <div
      className="mt-2 flex items-center gap-1"
      style={{
        justifyContent: t.heading === "centered" ? "center" : "flex-start",
        borderBottom: t.heading === "rule" || t.heading === "centered" ? `1px solid ${t.headingColor === "ink" && t.useAccent ? color : headColor}` : undefined,
        paddingBottom: t.heading === "rule" || t.heading === "centered" ? 2 : 0,
      }}
    >
      {t.heading === "bar" ? <span className="h-2 w-[2px]" style={{ background: color }} /> : null}
      <span className="h-[3px] w-6 rounded-full" style={{ background: headColor }} />
    </div>
  );
  const Lines = ({ n = 3 }: { n?: number }) => (
    <div className="mt-1 space-y-[3px]">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="h-[2px] rounded-full bg-slate-200" style={{ width: `${92 - i * 14}%` }} />
      ))}
    </div>
  );
  return (
    <div className="aspect-[0.72] w-full overflow-hidden rounded-md border border-slate-200 bg-white p-2 shadow-sm" aria-hidden>
      {t.header === "band" ? (
        <div className="-mx-2 -mt-2 mb-1 px-2 pb-2 pt-2.5" style={{ background: color }}>
          <div className="h-[5px] w-14 rounded-full bg-white" />
          <div className="mt-1 h-[2px] w-20 rounded-full bg-white/60" />
        </div>
      ) : (
        <div className={center ? "flex flex-col items-center" : ""}>
          <div className="text-[9px] font-bold leading-none" style={{ color: t.nameColor === "ink" ? "#111827" : color, fontFamily: cssFontStack(t.defaultHeadingFont ?? t.defaultFont), letterSpacing: t.tracking > 1 ? 1 : 0 }}>
            {t.nameCase === "upper" ? "ANANYA RAO" : "Ananya Rao"}
          </div>
          <div className="mt-1 h-[2px] w-20 rounded-full bg-slate-300" />
        </div>
      )}
      <Heading />
      <Lines />
      <Heading />
      <Lines n={4} />
      <Heading />
      <Lines n={2} />
    </div>
  );
}
