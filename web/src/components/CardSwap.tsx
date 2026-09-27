import { useEffect, useRef, type ReactNode } from 'react'
import { gsap, reducedMotion, useGSAP } from '../motion'

// Ported from portfolio/components/CardSwap: a 3D stack where the front card drops and returns to the back.
// Extended: pass `active` to pull a specific card to the front (autoplay pauses while it is set).
type Slot = { x: number; y: number; z: number; zIndex: number }

const slot = (i: number, dx: number, dy: number, total: number): Slot => ({
  x: i * dx,
  y: -i * dy,
  z: -i * dx * 1.5,
  zIndex: total - i,
})

export default function CardSwap({
  cards,
  active = null,
  onFront,
  width = 340,
  height = 420,
  dx = 44,
  dy = 52,
  delay = 3800,
}: {
  cards: ReactNode[]
  active?: number | null
  onFront?: (index: number) => void
  width?: number
  height?: number
  dx?: number
  dy?: number
  delay?: number
}) {
  const root = useRef<HTMLDivElement>(null)
  const goTo = useRef<(front: number) => void>(() => {})
  const inView = useRef(false)
  const held = useRef(false) // a card is being held at the front via `active`
  const onFrontRef = useRef(onFront)
  useEffect(() => {
    onFrontRef.current = onFront
  }, [onFront])

  useGSAP(
    () => {
      const els = gsap.utils.toArray<HTMLElement>('.swap-card', root.current)
      const total = els.length
      els.forEach((el, i) =>
        gsap.set(el, { ...slot(i, dx, dy, total), xPercent: -50, yPercent: -50, skewY: 5, force3D: true }),
      )
      if (reducedMotion() || total < 2) return

      let order = els.map((_, i) => i)
      let tl: gsap.core.Timeline | null = null

      // Every card in front of `front` drops out and rejoins at the back, in order.
      goTo.current = (front: number) => {
        const k = order.indexOf(front)
        if (k <= 0) return
        const leaving = order.slice(0, k)
        const next = [...order.slice(k), ...leaving]
        tl?.progress(1)
        tl = gsap.timeline({ defaults: { ease: 'power3.inOut' } })
        tl.to(leaving.map((i) => els[i]), { y: '+=520', rotate: -4, duration: 0.7, stagger: 0.05 })
        tl.addLabel('promote', '-=0.4')
        next.forEach((idx, pos) => {
          const s = slot(pos, dx, dy, total)
          tl!.set(els[idx], { zIndex: s.zIndex }, 'promote')
          tl!.to(els[idx], { x: s.x, y: s.y, z: s.z, rotate: 0, duration: 0.8 }, `promote+=${pos * 0.05}`)
        })
        order = next
        onFrontRef.current?.(front)
      }

      const timer = window.setInterval(() => {
        if (inView.current && !held.current && !document.hidden) goTo.current(order[1])
      }, delay)
      const io = new IntersectionObserver(([e]) => (inView.current = e.isIntersecting))
      io.observe(root.current!)
      return () => {
        io.disconnect()
        clearInterval(timer)
      }
    },
    { scope: root, dependencies: [cards.length] },
  )

  useEffect(() => {
    held.current = active !== null
    if (active !== null) goTo.current(active)
  }, [active])

  return (
    // --stack-rise: how far the stack climbs above its own box (the back card sits dy·(n-1) higher),
    // so a single-column layout can leave exactly that much room above it.
    <div
      ref={root}
      className="swap"
      style={{ width, height, '--stack-rise': `${dy * (cards.length - 1) + 32}px` } as React.CSSProperties}
    >
      {cards.map((c, i) => (
        <div key={i} className="swap-card" style={{ width, height }}>
          {c}
        </div>
      ))}
    </div>
  )
}
