import { useCallback, useId, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

/**
 * The tab strip for the signed-in page.
 *
 * Each tab is a **real route**, not a piece of component state — so a tab is
 * linkable, survives a reload and works with the back button, and no `#` goes
 * anywhere near the URL (ADR-0040). Only the matched route renders, which is
 * what keeps friends and chat from polling in a panel nobody is looking at.
 *
 * Two things it still owns, because the router does not do them:
 *
 * **Arrow keys move between tabs.** That is what the WAI-ARIA tabs pattern
 * requires and the first thing anybody on a keyboard tries. Selection follows
 * focus, which is allowed here because switching panels is cheap.
 *
 * **A roving `tabindex`** — one stop for the whole strip rather than one per
 * tab, so tabbing through the page does not mean stopping four times.
 */
export interface TabDefinition {
  /** The route this tab selects. Matched exactly. */
  path: string
  label: string
  /** An unread or waiting count. Omitted or zero renders nothing. */
  badge?: number
}

export function Tabs({
  tabs,
  label,
  children,
}: {
  tabs: TabDefinition[]
  label: string
  /** The `<Outlet/>` for whichever tab the path selected. */
  children: React.ReactNode
}) {
  const base = useId()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const buttons = useRef(new Map<string, HTMLButtonElement>())

  // Exact rather than prefix: every tab path would otherwise also match `/`.
  const activeIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.path === pathname),
  )
  const active = tabs[activeIndex]

  const go = useCallback(
    (path: string) => {
      navigate(path)
      buttons.current.get(path)?.focus()
    },
    [navigate],
  )

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const steps: Record<string, number> = {
      ArrowRight: 1,
      ArrowDown: 1,
      ArrowLeft: -1,
      ArrowUp: -1,
      Home: -activeIndex,
      End: tabs.length - 1 - activeIndex,
    }
    const step = steps[event.key]
    if (step === undefined) return

    event.preventDefault()
    const next = tabs[(activeIndex + step + tabs.length) % tabs.length]
    if (next) go(next.path)
  }

  return (
    <div className="flex flex-col">
      <div role="tablist" aria-label={label} className="tabs" onKeyDown={onKeyDown}>
        {tabs.map((tab) => {
          const selected = tab.path === active?.path
          return (
            <button
              key={tab.path}
              type="button"
              role="tab"
              id={`${base}-tab-${tab.path}`}
              aria-selected={selected}
              aria-controls={`${base}-panel`}
              tabIndex={selected ? 0 : -1}
              ref={(node) => {
                if (node) buttons.current.set(tab.path, node)
                else buttons.current.delete(tab.path)
              }}
              onClick={() => go(tab.path)}
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
        id={`${base}-panel`}
        aria-labelledby={active ? `${base}-tab-${active.path}` : undefined}
        // Focusable so a keyboard user tabbing off the strip lands in the panel
        // they just chose rather than skipping past its content.
        tabIndex={0}
        // Not a `.pane` itself: what a tab holds brings its own, and wrapping
        // those would nest a panel inside a panel. The strip's bottom rule is
        // the join instead.
        className="mt-5 flex flex-col gap-5"
      >
        {children}
      </div>
    </div>
  )
}
