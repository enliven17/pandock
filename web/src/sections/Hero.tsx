import { useRef } from 'react'
import { useReadContract } from 'wagmi'
import { PANDOCK, pandockAbi } from '../config'
import Link from '../components/Link'
import { fmt } from '../format'
import { gsap, reducedMotion, useGSAP } from '../motion'
import SplitReveal from '../components/SplitReveal'
import Magnetic from '../components/Magnetic'
import WaterCaustics from '../components/WaterCaustics'

/** Type-only hero. The box gets its own stage right below (Reveal). */
export default function Hero() {
  const root = useRef<HTMLElement>(null)
  const { data: price } = useReadContract({
    address: PANDOCK,
    abi: pandockAbi,
    functionName: 'boxPrice',
    query: { enabled: !!PANDOCK },
  })

  useGSAP(
    () => {
      if (reducedMotion()) return
      gsap.from('.hero-meta > *', { y: 24, opacity: 0, duration: 1, ease: 'expo.out', stagger: 0.08, delay: 0.55 })
      // As the reader heads for the box, the headline drifts up and out of the way.
      gsap.to('.hero-copy', {
        yPercent: -18,
        opacity: 0.15,
        ease: 'none',
        scrollTrigger: { trigger: root.current, start: 'top top', end: 'bottom top', scrub: 1 },
      })
    },
    { scope: root },
  )

  return (
    <section id="top" ref={root} className="hero">
      <WaterCaustics className="hero-water" />
      <div className="hero-copy">
        <SplitReveal scroll={false} delay={0.1}>
          <h1 className="hero-display">
            Open the box.
            <br />
            Own the market.
          </h1>
        </SplitReveal>
        <div className="hero-meta">
          <p className="lead">Sealed boxes of real tokenized stocks on Arc.</p>
          <div className="hero-actions">
            <Magnetic>
              <Link to="/app" className="btn-primary btn-large">Launch app</Link>
            </Magnetic>
            <a className="btn-secondary btn-large" href="#how">See how</a>
          </div>
          <p className="caption muted">{price ? fmt(price) : '0.10'} USDC per box</p>
        </div>
      </div>
    </section>
  )
}
