import { LOCATION_ORDER, LOCATIONS, type LocationId } from '../locations'

export interface TimerDisplay {
  text: string
  critical: boolean
}

export function Hud({
  locationTitle,
  objective,
  timer,
  currentLocation,
  unlockedLocations,
  onNavigate,
  muted,
  onToggleMute,
  onRestart,
  onHint,
}: {
  locationTitle: string
  objective: string
  timer: TimerDisplay | null
  currentLocation: LocationId
  unlockedLocations: ReadonlySet<LocationId>
  onNavigate: (id: LocationId) => void
  muted: boolean
  onToggleMute: () => void
  onRestart: () => void
  onHint: () => void
}) {
  return (
    <header className="hud">
      <div className="hud-left">
        <span className="hud-title">{locationTitle}</span>
        <span className="objective">{objective}</span>
      </div>

      {timer && (
        <div className={`timer-bar${timer.critical ? ' critical' : ''}`}>
          <span className="timer-label">EVAC TIMER</span>
          <span className="timer-text">{timer.text}</span>
        </div>
      )}

      <div className="facility-nav">
        {LOCATION_ORDER.map((id) => {
          const unlocked = unlockedLocations.has(id)
          const active = id === currentLocation
          return (
            <button
              key={id}
              type="button"
              className={`nav-btn${active ? ' active' : ''}${!unlocked ? ' locked' : ''}`}
              disabled={!unlocked || active}
              onClick={() => onNavigate(id)}
            >
              {unlocked ? LOCATIONS[id].name : '??? LOCKED'}
            </button>
          )
        })}
      </div>

      <div className="hud-right">
        <button type="button" className="icon-btn" title="Ask for a hint" onClick={onHint}>
          HINT
        </button>
        <button type="button" className="icon-btn" title="Toggle sound" onClick={onToggleMute}>
          {muted ? 'UNMUTE' : 'MUTE'}
        </button>
        <button type="button" className="icon-btn" title="Restart" onClick={onRestart}>
          RESTART
        </button>
      </div>
    </header>
  )
}
