export function EndScreen({
  open,
  failure,
  title,
  subtitle,
  flavor,
  onPlayAgain,
}: {
  open: boolean
  failure: boolean
  title: string
  subtitle: string
  flavor: string
  onPlayAgain: () => void
}) {
  if (!open) return null
  return (
    <section className="screen end-screen">
      <div className="title-card">
        <h1 className={`mission-complete${failure ? ' failure' : ''}`}>{title}</h1>
        <p className="subtitle">{subtitle}</p>
        <p className="title-flavor">{flavor}</p>
        <button type="button" className="btn btn-primary" onClick={onPlayAgain}>
          PLAY AGAIN
        </button>
      </div>
    </section>
  )
}
