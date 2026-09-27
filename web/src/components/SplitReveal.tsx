import { useRef, type ReactNode } from 'react'
import { gsap, reducedMotion, SplitText, useGSAP } from '../motion'

// Ported from portfolio/registry/cankatui/split-text: masked line reveal, fonts-ready aware.
export default function SplitReveal({
  children,
  scroll = true,
  delay = 0,
  className,
}: {
  children: ReactNode
  scroll?: boolean
  delay?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const el = ref.current!
      gsap.set(el, { opacity: 1 })
      if (reducedMotion()) return
      const target = el.firstElementChild as HTMLElement | null
      if (!target) return

      let split: SplitText | undefined
      let cancelled = false
      const build = () => {
        split = SplitText.create(target, {
          type: 'lines',
          mask: 'lines',
          linesClass: 'split-line',
          onSplit: (self) =>
            gsap.from(self.lines, {
              yPercent: 110,
              duration: 1.1,
              ease: 'expo.out',
              stagger: 0.09,
              delay,
              scrollTrigger: scroll ? { trigger: el, start: 'top 85%' } : undefined,
            }),
        })
      }
      if (document.fonts.status === 'loaded') build()
      else document.fonts.ready.then(() => !cancelled && build())
      return () => {
        cancelled = true
        split?.revert()
      }
    },
    { scope: ref },
  )

  return (
    <div ref={ref} className={className} style={{ opacity: 0 }}>
      {children}
    </div>
  )
}
