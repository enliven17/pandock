import { useRef, useState } from 'react'
import { useAccount, useReadContract, useSwitchChain, useWriteContract } from 'wagmi'
import { chain, PANDOCK, pandockAbi } from '../config'
import { fmt } from '../format'
import { gsap, reducedMotion, useGSAP } from '../motion'
import SplitReveal from '../components/SplitReveal'
import Magnetic from '../components/Magnetic'
import WaterCaustics from '../components/WaterCaustics'

/** Type-only hero. The box gets its own stage right below (Reveal). */
export default function Hero() {
  const root = useRef<HTMLElement>(null)
  const [qty, setQty] = useState(1)
  const { isConnected, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const { writeContractAsync, isPending } = useWriteContract()
  const { data: price } = useReadContract({
    address: PANDOCK,
    abi: pandockAbi,
    functionName: 'boxPrice',
    query: { enabled: !!PANDOCK },
  })

  const buy = async () => {
    if (!price) return
    if (chainId !== chain.id) return switchChain({ chainId: chain.id })
    await writeContractAsync({
      address: PANDOCK!,
      abi: pandockAbi,
      functionName: 'buy',
      args: [BigInt(qty)],
      value: price * BigInt(qty),
    })
  }

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
            <div className="chips" role="group" aria-label="How many boxes">
              {[1, 5, 10].map((n) => (
                <button
                  key={n}
                  className={`chip ${qty === n ? 'chip-selected' : ''}`}
                  aria-pressed={qty === n}
                  onClick={() => setQty(n)}
                >
                  {n} {n === 1 ? 'box' : 'boxes'}
                </button>
              ))}
            </div>
            <Magnetic>
              <button className="btn-primary" disabled={!isConnected || !price || isPending} onClick={buy}>
                {isPending ? 'Confirm in wallet…' : `Buy${price ? ` · ${fmt(price * BigInt(qty))} USDC` : ''}`}
              </button>
            </Magnetic>
            <a className="btn-secondary" href="#how">See how</a>
          </div>
          <p className="caption muted">{price ? fmt(price) : '0.10'} USDC per box</p>
        </div>
      </div>
    </section>
  )
}
