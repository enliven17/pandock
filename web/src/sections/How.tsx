import { useRef } from 'react'
import { gsap, reducedMotion, useGSAP } from '../motion'
import Mark from '../components/Mark'

const STEPS = [
  ['Buy', 'Pay in USDC. On Arc it is also the gas, so there is nothing else to hold.'],
  ['Gift', 'Send sealed boxes to a whole group chat in one confirmation. Nobody knows what is inside.'],
  ['Open', 'A block that does not exist yet decides the draw. A slice of a real stock lands in the wallet.'],
]

export default function How() {
  const root = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      if (reducedMotion()) return
      const n = STEPS.length
      const tl = gsap.timeline({
        defaults: { ease: 'power3.inOut', duration: 1 },
        scrollTrigger: {
          trigger: root.current,
          start: 'top top',
          end: `+=${n * 130}%`,
          scrub: 1.2,
          pin: true,
          // directional: false snaps to the nearest step; the default (directional) would jump a whole
          // step ahead on the slightest scroll into the section.
          snap: { snapTo: 1 / (n - 1), directional: false, delay: 0.2, duration: { min: 0.6, max: 1.2 }, ease: 'power2.inOut' },
        },
      })
      gsap.set('.how-step:not(:first-child)', { yPercent: 40, opacity: 0 })
      // The watermark turns a little with each step, so the background moves with the story.
      tl.fromTo('.how-watermark', { rotate: -8, yPercent: 6 }, { rotate: 10, yPercent: -6, ease: 'none', duration: n - 1 }, 0)
      for (let i = 1; i < n; i++) {
        tl.to('.how-digits', { yPercent: (-100 / n) * i }, i - 1)
          .to(`.how-step:nth-child(${i})`, { yPercent: -40, opacity: 0 }, i - 1)
          .to(`.how-step:nth-child(${i + 1})`, { yPercent: 0, opacity: 1 }, i - 0.8)
          .to(`.how-dot:nth-child(${i + 1})`, { scale: 1, opacity: 1, duration: 0.3 }, i - 0.6)
      }
    },
    { scope: root },
  )

  return (
    <section id="how" ref={root} className="how">
      <Mark className="how-watermark" />
      <div className="how-grid">
        <div className="how-numeral" aria-hidden="true">
          <div className="how-digits">
            {STEPS.map((_, i) => (
              <span key={i}>{i + 1}</span>
            ))}
          </div>
        </div>
        <div className="how-steps">
          {STEPS.map(([t, d]) => (
            <div key={t} className="how-step">
              <h2 className="display-xl">{t}.</h2>
              <p className="lead muted-dark">{d}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="how-dots" aria-hidden="true">
        {STEPS.map((_, i) => (
          <span key={i} className="how-dot" />
        ))}
      </div>
    </section>
  )
}
