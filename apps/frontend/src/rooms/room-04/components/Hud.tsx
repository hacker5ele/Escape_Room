import { useGame } from '../../../App'
import { useAppAuth } from '../../../auth/useAppAuth'
import { Avatar } from '../../../social/Avatar'

interface HudProps {
  hasWand: boolean
  boosted: boolean
  visionsFound: number
  visionsTotal: number
}

export function Hud({ hasWand, boosted, visionsFound, visionsTotal }: HudProps) {
  const { game } = useGame()
  const { profile } = useAppAuth()

  return (
    <div className="r4-hud">
      <div className="r4-hud-left">
        <Avatar
          size={32}
          subject={{
            userId: game.userId,
            username: game.username,
            displayName: game.playerName,
            imageUrl: profile?.imageUrl ?? null,
          }}
        />
        <span className="r4-hud-name">{game.playerName}</span>
      </div>
      <div className="r4-hud-right">
        <span className="r4-hud-progress">
          <span className="r4-hud-pips">
            {Array.from({ length: visionsTotal }, (_, i) => (
              <span key={i} className={`r4-hud-pip${i < visionsFound ? ' r4-hud-pip-filled' : ''}`} />
            ))}
          </span>
          {visionsFound}/{visionsTotal} boxes found
        </span>
        {hasWand && <span className="r4-hud-wand">Arcane Wand</span>}
        {boosted && <span className="r4-hud-boost">Hastened</span>}
      </div>
    </div>
  )
}
