import { useEffect, useState } from "react";
import { Button } from "./ui";

/** Counts down after a set is logged. `startedAt` changes restart it. */
export function RestTimer({
  startedAt,
  seconds,
  onDone,
}: {
  startedAt: number;
  seconds: number;
  onDone: () => void;
}) {
  const [extra, setExtra] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setExtra(0);
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [startedAt]);

  const remaining = Math.max(0, Math.ceil((startedAt + (seconds + extra) * 1000 - now) / 1000));
  const finished = remaining === 0;
  const mm = Math.floor(remaining / 60);
  const ss = String(remaining % 60).padStart(2, "0");

  return (
    <div
      role="timer"
      aria-live={finished ? "assertive" : "off"}
      className="fixed inset-x-0 bottom-[64px] z-30 border-t border-rule bg-panel md:bottom-0 md:left-[232px]"
    >
      <div className="mx-auto flex max-w-[1040px] items-center gap-4 px-4 py-3 md:px-10">
        <span className="text-sm text-ink-2">{finished ? "Rest done. Next set" : "Rest"}</span>
        <span
          className={`font-display text-3xl leading-none font-bold tabular ${finished ? "text-good" : ""}`}
        >
          {mm}:{ss}
        </span>
        <div className="ml-auto flex gap-2">
          {!finished ? (
            <Button size="sm" variant="quiet" onClick={() => setExtra((e) => e + 30)}>
              +30 s
            </Button>
          ) : null}
          <Button size="sm" variant="secondary" onClick={onDone}>
            {finished ? "Close" : "Skip"}
          </Button>
        </div>
      </div>
    </div>
  );
}
