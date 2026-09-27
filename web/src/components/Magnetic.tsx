import { useRef, type ReactNode } from 'react'
import { gsap, reducedMotion, useGSAP } from '../motion'

// Portfolio's magnetic-button, rebuilt on gsap.quickTo so the page needs no second motion library.
export default function Magnetic({ children, strength = 0.35 }: { children: ReactNode; strength?: number }) {
  const ref = useRef<HTMLSpanElement>(null)

  useGSAP(
    () => {
      const el = ref.current!
      if (reducedMotion() || !matchMedia('(hover: hover)').matches) return
      const x = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'elastic.out(1, 0.4)' })
      const y = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'elastic.out(1, 0.4)' })
      const move = (e: PointerEvent) => {
        const r = el.getBoundingClientRect()
        x((e.clientX - r.left - r.width / 2) * strength)
        y((e.clientY - r.top - r.height / 2) * strength)
      }
      const reset = () => {
        x(0)
        y(0)
      }
      el.addEventListener('pointermove', move)
      el.addEventListener('pointerleave', reset)
      return () => {
        el.removeEventListener('pointermove', move)
        el.removeEventListener('pointerleave', reset)
      }
    },
    { scope: ref },
  )

  return (
    <span ref={ref} className="magnetic">
      {children}
    </span>
  )
}
