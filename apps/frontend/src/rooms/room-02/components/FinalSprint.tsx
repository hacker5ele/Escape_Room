/**
 * The final dash to the exit: no HUD, no hotspots, just the corridor
 * background zooming and juddering in on itself while the red lockdown wash
 * (already active by this point) keeps pulsing over it.
 */
export function FinalSprint({
  background,
  lines,
}: {
  background: string | null
  lines: readonly string[]
}) {
  return (
    <div className="final-sprint" style={background ? { backgroundImage: `url('${background}')` } : undefined}>
      <div className="final-sprint-caption">
        {lines.map((line, i) => (
          <p key={i} style={{ animationDelay: `${i * 0.6}s` }}>
            {line}
          </p>
        ))}
      </div>
    </div>
  )
}
