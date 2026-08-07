export function EndScreen({
  open,
  failure,
  title,
  subtitle,
  flavor,
  onContinue,
}: {
  open: boolean
  failure: boolean
  title: string
  subtitle: string
  flavor: string
  /** Back to the lobby — solving this room already unlocked the next door. */
  onContinue: () => void
}) {
  if (!open) return null
  return (
    <section className="screen end-screen">
      <button type="button" className="btn-terminal-sm end-exit" onClick={onContinue}>
        EXIT ROOM
      </button>
      <div className="title-card">
        <h1 className={`mission-complete${failure ? ' failure' : ''}`}>{title}</h1>
        <p className="subtitle">{subtitle}</p>
        <p className="title-flavor">{flavor}</p>
        <button type="button" className="btn btn-primary" onClick={onContinue}>
          CONTINUE
        </button>
      </div>
    </section>
  )
}
