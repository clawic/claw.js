import type { TranscriptLine } from "../lib/transcript";

export function Transcript({ lines }: { lines: TranscriptLine[] }) {
  return (
    <>
      {lines.map((m, i) => (
        <div
          key={i}
          className={[
            "max-w-[80%] px-3 py-2 rounded text-[13px] leading-relaxed whitespace-pre-wrap break-words",
            m.role === "user"
              ? "self-end bg-text text-bg"
              : "self-start bg-bg-hover text-text border border-border",
          ].join(" ")}
        >
          {m.text}
          {m.streaming ? <span className="opacity-50">&nbsp;▍</span> : null}
        </div>
      ))}
    </>
  );
}
