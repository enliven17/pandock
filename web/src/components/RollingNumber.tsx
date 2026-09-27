import { useEffect, useRef } from 'react'
import { gsap, reducedMotion } from '../motion'

/** A number that rolls to its new value instead of snapping; `format` renders each frame. */
export default function RollingNumber({
  value,
  format = (n) => Math.round(n).toString(),
  className,
}: {
  value: number
  format?: (n: number) => string
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const shown = useRef({ v: value })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (reducedMotion()) {
      shown.current.v = value
      el.textContent = format(value)
      return
    }
    const tween = gsap.to(shown.current, {
      v: value,
      duration: 0.7,
      ease: 'expo.out',
      onUpdate: () => {
        el.textContent = format(shown.current.v)
      },
    })
    return () => {
      tween.kill()
    }
  }, [value, format])

  return (
    <span ref={ref} className={className}>
      {format(value)}
    </span>
  )
}
