import { useRef, type ReactNode } from 'react'
import { gsap, lenis, reducedMotion, useGSAP } from '../motion'

// Portfolio's marquee, on GSAP: scroll velocity speeds it up and flips it with scroll direction.
export default function Marquee({ children, speed = 60 }: { children: ReactNode; speed?: number }) {
  const ref = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      if (reducedMotion()) return
      const track = ref.current!.firstElementChild as HTMLElement
      const half = () => track.scrollWidth / 2
      let x = 0
      let dir = 1
      const tick = (_: number, dt: number) => {
        const v = lenis?.velocity ?? 0
        if (Math.abs(v) > 0.5) dir = v > 0 ? 1 : -1
        x -= (speed * dt * dir * (1 + Math.min(Math.abs(v) / 8, 4))) / 1000
        const w = half()
        if (x <= -w) x += w
        if (x > 0) x -= w
        gsap.set(track, { x })
      }
      gsap.ticker.add(tick)
      return () => gsap.ticker.remove(tick)
    },
    { scope: ref },
  )

  return (
    <div ref={ref} className="marquee" aria-hidden="true">
      <div className="marquee-track">
        {children}
        {children}
      </div>
    </div>
  )
}
