/* Decorative sci-fi HUD frame: corner brackets, edge ticks, crosshair. */
export function HudFrame() {
  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {/* corner brackets */}
      {[
        "left-4 top-4 border-l-2 border-t-2",
        "right-4 top-4 border-r-2 border-t-2",
        "left-4 bottom-4 border-l-2 border-b-2",
        "right-4 bottom-4 border-r-2 border-b-2",
      ].map((c) => (
        <div
          key={c}
          className={`absolute h-10 w-10 border-cyan-400/60 ${c}`}
          style={{ boxShadow: "0 0 10px rgba(77,225,255,0.4)" }}
        />
      ))}

      {/* center crosshair */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="relative h-40 w-40 opacity-40">
          <div className="absolute left-1/2 top-0 h-4 w-px -translate-x-1/2 bg-cyan-400/70" />
          <div className="absolute left-1/2 bottom-0 h-4 w-px -translate-x-1/2 bg-cyan-400/70" />
          <div className="absolute top-1/2 left-0 h-px w-4 -translate-y-1/2 bg-cyan-400/70" />
          <div className="absolute top-1/2 right-0 h-px w-4 -translate-y-1/2 bg-cyan-400/70" />
          <div
            className="absolute inset-0 rounded-full border border-cyan-400/20"
            style={{ animation: "spin 24s linear infinite" }}
          />
        </div>
      </div>

      {/* edge ticks */}
      <div className="absolute left-1/2 top-14 flex -translate-x-1/2 gap-1">
        {Array.from({ length: 21 }).map((_, i) => (
          <div
            key={i}
            className="w-px bg-cyan-400/40"
            style={{ height: i % 5 === 0 ? 10 : 5 }}
          />
        ))}
      </div>
    </div>
  );
}
