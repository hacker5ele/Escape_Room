export function TitleScreen({ onEnter }: { onEnter: () => void }) {
  return (
    <section className="screen title-screen">
      <div className="title-card">
        <h1 className="glitch-title">GENESIS PROTOCOL</h1>
        <p className="subtitle">Kepler Biogenetics — Site 9, Restricted Facility</p>
        <p className="title-flavor">
          The power failed while you were still inside. Something else got out when it did.
        </p>
        <button type="button" className="btn btn-primary" onClick={onEnter}>
          ENTER FACILITY
        </button>
      </div>
    </section>
  )
}
