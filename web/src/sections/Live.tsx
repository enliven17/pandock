import { useEffect, useRef, useState } from 'react'
import { chain, stockOf } from '../config'
import { gsap, reducedMotion, ScrollTrigger, useGSAP } from '../motion'
import { usePrices } from '../prices'
import { useStats } from '../stats'
import RollingNumber from '../components/RollingNumber'
import SplitReveal from '../components/SplitReveal'

const whole = (n: number) => Math.round(n).toLocaleString('en-US')
const dollars = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

/** Lifetime numbers, read from the contract's counters. Hidden until there is something to show. */
export default function Live() {
  const s = useStats()
  const { data: prices } = usePrices()
  const show = !!s && s.sold > 0
  const root = useRef<HTMLElement>(null)
  // Numbers sit at zero until the section scrolls into view, then roll up to the live values.
  const [seen, setSeen] = useState(reducedMotion)

  // The pinned sections below were measured without this one; re-measure once it takes up space.
  useEffect(() => {
    if (show) ScrollTrigger.refresh()
  }, [show])

  useGSAP(
    () => {
      if (!show || reducedMotion()) return
      gsap.fromTo(
        '.live-stat',
        { y: 56, opacity: 0, scale: 0.96 },
        {
          y: 0,
          opacity: 1,
          scale: 1,
          duration: 1.1,
          ease: 'expo.out',
          stagger: 0.09,
          scrollTrigger: { trigger: '.stats-4', start: 'top 85%', once: true, onEnter: () => setSeen(true) },
        },
      )
    },
    { scope: root, dependencies: [show] },
  )

  const paidOut = (s?.paidOut ?? []).reduce((sum, p) => sum + (prices?.[stockOf(p.token).symbol] ?? 0) * p.shares, 0)
  const stats = [
    { value: s?.sold ?? 0, format: whole, label: 'boxes sold' },
    { value: s?.opened ?? 0, format: whole, label: 'boxes opened' },
    { value: paidOut, format: dollars, label: 'paid out in stock' },
    { value: s?.decisions ?? 0, format: whole, label: 'Treasurer decisions on-chain' },
  ]

  // Always mounted, only hidden: GSAP wraps the pinned sections below in pin-spacers, so a section
  // React inserted later would have no valid sibling to insert before.
  return (
    <section id="live" ref={root} className="odds-section live-section" hidden={!show}>
      <div className="odds-head">
        <SplitReveal>
          <h2 className="display-xl">Live on {chain.name}.</h2>
        </SplitReveal>
        <p className="lead muted" data-rise>
          Every number here is read from the contract, not from us.
        </p>
      </div>
      <div className="stats stats-4">
        {stats.map((st) => (
          <div key={st.label} className="stat live-stat">
            <RollingNumber value={seen ? st.value : 0} format={st.format} duration={1.8} className="stat-value" />
            <span className="body muted">{st.label}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
