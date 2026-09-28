import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { gsap, reducedMotion, useGSAP } from '../motion'
import { usePrices } from '../prices'
import Box from '../components/Box'
import Logo from '../components/Logo'
import { hasLogo } from '../components/logos'

export type Result = { id: bigint; kind: 'win' | 'empty' | 'refund' | 'expired'; symbol?: string; name?: string; amount?: string }

const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: n < 0.1 ? 3 : 2 })

/**
 * The reveal, full screen: once the wallet signs, the box lifts out of its card to the middle of a darkened
 * screen and waits there, trembling, until the draw lands; then the lid blows off and the prize rises out.
 * `from` is the box's spot on the page; `result` stays undefined while the transaction is still in flight.
 */
export default function RevealStage({ from, result, onClose }: { from: DOMRect; result?: Result; onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  const idle = useRef<gsap.core.Timeline | null>(null)
  const { data: prices } = usePrices()
  const worth = result?.kind === 'win' && result.symbol && prices?.[result.symbol] ? prices[result.symbol] * Number(result.amount) : undefined

  const close = () => {
    if (!root.current || reducedMotion()) return onClose()
    gsap.to(root.current, { opacity: 0, duration: 0.35, ease: 'power2.in', onComplete: onClose })
  }

  // Arrival: backdrop darkens while the box flies from its card to centre stage, then trembles until the result.
  useGSAP(
    () => {
      const size = Math.min(340, window.innerWidth * 0.62)
      const to = { left: (window.innerWidth - size) / 2, top: window.innerHeight * 0.42 - size / 2, width: size }
      if (reducedMotion()) {
        gsap.set('.stage-box-wrap', to)
        return
      }
      gsap.fromTo('.stage-backdrop', { opacity: 0 }, { opacity: 1, duration: 0.5, ease: 'power2.out' })
      gsap.fromTo(
        '.stage-box-wrap',
        { left: from.left, top: from.top, width: from.width, rotate: 0 },
        {
          ...to,
          duration: 0.85,
          ease: 'expo.inOut',
          keyframes: { rotate: [0, -8, 4, 0] },
          onComplete: () => {
            idle.current = gsap
              .timeline({ repeat: -1 })
              .to('.stage-box', { rotate: -3, y: -6, duration: 0.12, ease: 'sine.inOut' })
              .to('.stage-box', { rotate: 3, y: 0, duration: 0.12, ease: 'sine.inOut' })
              .to('.stage-box', { rotate: 0, duration: 0.1 })
              .to({}, { duration: 0.45 })
            gsap.to('.stage-glow', { opacity: 1, scale: 1.12, duration: 0.9, ease: 'sine.inOut', yoyo: true, repeat: -1 })
          },
        },
      )
    },
    { scope: root },
  )

  // The result lands: lid off, a burst of light, the prize rises out of the box.
  useGSAP(
    () => {
      if (!result) return
      idle.current?.kill()
      gsap.killTweensOf('.stage-glow')
      if (reducedMotion()) {
        gsap.set('.stage-prize, .stage-actions', { opacity: 1, y: 0 })
        gsap.set('.stage-box .box-lid', { opacity: 0 })
        return
      }
      const won = result.kind === 'win'
      gsap
        .timeline({ delay: 0.15 })
        .to('.stage-box', { rotate: 0, y: 0, scaleY: 0.9, scaleX: 1.05, duration: 0.18, ease: 'power2.in', transformOrigin: '50% 100%' })
        .to('.stage-box', { scaleY: 1, scaleX: 1, duration: 0.5, ease: 'elastic.out(1, 0.4)' })
        .to('.stage-box .box-lid', { y: -150, x: 40, rotate: 28, opacity: 0, duration: 0.7, ease: 'power3.out', transformOrigin: '50% 50%' }, '<')
        .fromTo('.stage-burst', { scale: 0.2, opacity: won ? 0.95 : 0.4 }, { scale: won ? 2.6 : 1.4, opacity: 0, duration: 0.9, ease: 'expo.out' }, '<')
        .fromTo('.stage-prize', { y: 80, opacity: 0, scale: 0.6 }, { y: 0, opacity: 1, scale: 1, duration: 0.9, ease: 'back.out(1.6)' }, '<0.1')
        .to('.stage-box-wrap', { y: 90, opacity: 0.35, scale: 0.8, duration: 0.8, ease: 'expo.out' }, '<')
        .fromTo('.stage-actions', { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: 'expo.out' }, '-=0.3')
    },
    { scope: root, dependencies: [result] },
  )

  useEffect(() => {
    if (!result) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const title = !result ? '' : result.kind === 'win' ? result.symbol : result.kind === 'refund' ? 'Refund' : result.kind === 'empty' ? 'Empty' : 'Expired'
  const detail = !result
    ? ''
    : result.kind === 'win'
      ? `${result.amount} shares${worth ? ` · ≈ ${usd(worth)}` : ''}`
      : result.kind === 'refund'
        ? `${result.amount} USDC back to you`
        : result.kind === 'empty'
          ? 'Better luck next box'
          : 'Revealed too late'

  return createPortal(
    <div ref={root} className={`stage ${result ? `is-${result.kind}` : 'is-waiting'}`} role="dialog" aria-modal="true" aria-label="Revealing your box">
      <div className="stage-backdrop" onClick={result ? close : undefined} />
      <div className="stage-box-wrap">
        <span className="stage-glow" aria-hidden="true" />
        <span className="stage-burst" aria-hidden="true" />
        <Box className="stage-box" />
      </div>
      {!result && (
        <p className="stage-status" aria-live="polite">
          Drawing your prize…
        </p>
      )}
      {result && (
        <div className="stage-card">
          <div className="stage-prize" aria-live="polite">
            {result.symbol && hasLogo(result.symbol) && <Logo symbol={result.symbol} className="stage-logo" />}
            <span className="stage-title">{title}</span>
            <span className="stage-detail">{detail}</span>
            {result.name && <span className="stage-name">{result.name}</span>}
          </div>
          <div className="stage-actions">
            <button className="btn-light" onClick={close} autoFocus>
              {result.kind === 'win' ? 'Keep it' : 'Close'}
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}
