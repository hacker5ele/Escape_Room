import type { RoomLocation } from '../locations'

export function Scene({
  location,
  onHotspotClick,
}: {
  location: RoomLocation
  onHotspotClick: (hotspotId: string) => void
}) {
  return (
    <main
      className="scene"
      style={{
        backgroundImage: `linear-gradient(rgba(6,8,11,0.55), rgba(6,8,11,0.75)), url('${location.background}')`,
      }}
    >
      <div className="hotspot-layer">
        {location.hotspots.map((h) => (
          <button
            key={h.id}
            type="button"
            className="hotspot"
            style={{ left: `${h.x}%`, top: `${h.y}%` }}
            onClick={() => onHotspotClick(h.id)}
          >
            <span className="hotspot-ring" />
            <span className="hotspot-label">{h.label}</span>
          </button>
        ))}
      </div>
    </main>
  )
}
