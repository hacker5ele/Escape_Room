export function TravelTransition({ locationName }: { locationName: string | null }) {
  return (
    <div className={`travel-transition${locationName ? ' active' : ''}`}>
      <span>{locationName ? `ENTERING: ${locationName.toUpperCase()}` : ''}</span>
    </div>
  )
}
