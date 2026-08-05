import { useCallback, useEffect, useId, useRef, useState } from 'react'

/**
 * The tabbed shell for the signed-in page.
 *
 * Everything used to be stacked down one narrow column — game status, rooms,
 * leaderboard, friends and the activity log, all at once. That is a lot of
 * unrelated information competing at the same level, and it got worse with
 * every feature added.
 *
 * Three things here are deliberate rather than decorative:
 *
 * **Only the active panel is mounted.** Friends and chat poll the API on a
 * timer; keeping all four alive would multiply that polling by four for panels
 * nobody is looking at.
 *
 * **The selection lives in the URL hash**, so a reload keeps you where you
 * were, the browser's back button behaves, and a tab can be linked to
 * directly — `/#friends` opens on friends. `history.replaceState` rather than
 * assigning to `location.hash`, so switching tabs does not fill the back stack
 * with entries the player has to walk out of.
 *
 * **Arrow keys move between tabs**, which is what the WAI-ARIA tabs pattern
 * requires and what anybody navigating by keyboard will try. Selection follows
 * focus, which is allowed here because switching panels is cheap.
 */
export interface TabDefinition {
  id: string
  label: string
  /** An unread or waiting count. Omitted or zero renders nothing. */
  badge?: number
  render: () => React.ReactNode
}

export function Tabs({ tabs, label }: { tabs: TabDefinition[]; label: string }) {
  const base = useId()
  const first = tabs[0]?.id ?? ''

  const [activeId, setActiveId] = useState(() => fromHash(tabs, first))
  const buttons = useRef(new Map<string, HTMLButtonElement>())

  // The caller builds `tabs` inline, so it is a new array on every render and
  // depending on it directly would tear down and re-add the listener below
  // every time. What the effects actually care about is which tabs exist.
  const ids = tabs.map((tab) => tab.id).join('|')

  // Someone pasting a link, or using back and forward.
  useEffect(() => {
    const onHashChange = () => setActiveId(fromHash(ids.split('|'), first))
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [ids, first])

  // A tab can disappear — the set is allowed to change, and does while the
  // game is still loading — so never leave the page pointing at one that is
  // no longer there.
  useEffect(() => {
    if (!ids.split('|').includes(activeId)) setActiveId(first)
  }, [ids, activeId, first])

  const select = useCallback((id: string) => {
    setActiveId(id)
    window.history.replaceState(null, '', `#${id}`)
  }, [])

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const index = tabs.findIndex((tab) => tab.id === activeId)
      if (index === -1) return

      let next: number | null = null
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
      else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length
      else if (event.key === 'Home') next = 0
      else if (event.key === 'End') next = tabs.length - 1
      if (next === null) return

      event.preventDefault()
      const id = tabs[next]!.id
      select(id)
      buttons.current.get(id)?.focus()
    },
    [tabs, activeId, select],
  )

  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0]
  if (!active) return null

  return (
    <div className="flex flex-col">
      <div role="tablist" aria-label={label} className="tabs" onKeyDown={onKeyDown}>
        {tabs.map((tab) => {
          const selected = tab.id === active.id
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`${base}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel-${tab.id}`}
              // Roving tabindex: one stop for the whole strip, then arrow
              // keys within it. Without this, tabbing through the page means
              // stopping on every tab in turn.
              tabIndex={selected ? 0 : -1}
              ref={(node) => {
                if (node) buttons.current.set(tab.id, node)
                else buttons.current.delete(tab.id)
              }}
              onClick={() => select(tab.id)}
              className="tab"
            >
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="tab-badge" aria-label={`${tab.badge} waiting`}>
                  {tab.badge > 99 ? '99+' : tab.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div
        role="tabpanel"
        id={`${base}-panel-${active.id}`}
        aria-labelledby={`${base}-tab-${active.id}`}
        // Focusable so that a keyboard user tabbing off the strip lands in the
        // panel they just chose rather than skipping past its content.
        tabIndex={0}
        // Not a `.pane` itself. What a tab holds is one or more panels that
        // bring their own — the friends tab alone holds the party panel and
        // the friends list — and wrapping those in another would nest a panel
        // inside a panel. The strip's bottom rule is the join instead.
        className="mt-5 flex flex-col gap-5"
      >
        {active.render()}
      </div>
    </div>
  )
}

function fromHash(tabs: readonly (TabDefinition | string)[], fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const id = window.location.hash.replace(/^#/, '')
  const known = tabs.map((tab) => (typeof tab === 'string' ? tab : tab.id))
  return known.includes(id) ? id : fallback
}
