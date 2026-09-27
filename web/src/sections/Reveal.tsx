import { useRef } from 'react'
import { gsap, reducedMotion, useGSAP } from '../motion'
import Box from '../components/Box'
import Logo from '../components/Logo'

const TICKERS = ['QQQ', 'TSLA', 'NVDA', 'META', 'GOOGL', 'AAPL', 'AMZN', 'SPY']
const TILT = [-10, 6, -7, 4, -3, 6, -6, 9]
// Landing spots on a fan over the box mouth: [angle in degrees, ring]. Hand-placed so no two chips
// share a column at the same height, mirrored left/right because the box sits dead centre.
const FAN: [number, number][] = [
  [170, 1], [145, 0.6], [125, 1], [105, 0.82], [75, 0.82], [55, 1], [35, 0.6], [10, 1],
]
const NAV_SAFE = 120 // keep the burst below the floating nav
const SENTENCE = 'Every slice is a real share.'

/** Pinned stage: the box arrives centred, the lid comes off, the tickers burst out,
 *  and the dark grows out of the box mouth into the next section. */
export default function Reveal() {
  const root = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      if (reducedMotion()) return
      const q = (s: string) => root.current!.querySelector(s)!.getBoundingClientRect()
      gsap.set('.fly', { xPercent: -50, yPercent: -50 })

      const idle = gsap.to('.box-lid', { y: -6, duration: 1.8, ease: 'sine.inOut', yoyo: true, repeat: -1 })

      // Landing spots measured from the live layout, relative to where a .fly sits at x/y = 0.
      const spot = (i: number) => {
        const st = q('.reveal-stage')
        const bx = q('.box')
        const wrap = q('.box-wrap')
        const mx = bx.left - st.left + bx.width / 2
        const my = bx.top - st.top + bx.height * 0.3
        const ox = wrap.left - st.left + wrap.width / 2
        const oy = wrap.top - st.top + wrap.height * 0.32
        let tx: number, ty: number
        if (st.width < 700) {
          // Phones: two staggered columns above the box instead of a fan.
          const rows = TICKERS.length / 2
          const top = NAV_SAFE + 10
          const step = (my - 60 - top) / (rows - 1)
          tx = st.width * (i % 2 ? 0.72 : 0.28) + (Math.floor(i / 2) % 2 ? 12 : -12)
          ty = top + Math.floor(i / 2) * step + (i % 2 ? step * 0.4 : 0)
        } else {
          const rx = Math.min(mx - 90, st.width - 90 - mx, 560)
          const ry = Math.min(my - NAV_SAFE - 30, st.height * 0.48)
          const [deg, k] = FAN[i]
          const a = (deg * Math.PI) / 180
          tx = mx + Math.cos(a) * rx * k
          ty = Math.max(NAV_SAFE, my - 40 - Math.sin(a) * ry * k)
        }
        return { x: tx - ox, y: ty - oy }
      }

      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: root.current,
          start: 'top top',
          end: '+=300%',
          scrub: 1.6,
          pin: true,
          invalidateOnRefresh: true,
          onUpdate: (st) => st.progress > 0.02 && idle.kill(),
        },
      })
      tl.to('.reveal-caption', { y: 30, opacity: 0, duration: 0.12 }, 0)
      tl.to('.box-lid', { y: -210, x: 70, rotate: 16, transformOrigin: '50% 100%', duration: 0.4, ease: 'power2.out' }, 0.05)
        .to('.box-lid', { opacity: 0, duration: 0.12 }, 0.36)
        .to('.box', { scale: 1.06, duration: 0.45 }, 0)
      TICKERS.forEach((_, i) => {
        tl.fromTo(
          `.fly-${i}`,
          { x: 0, y: 40, rotate: 0, scale: 0.4, opacity: 0 },
          {
            x: () => spot(i).x,
            y: () => spot(i).y,
            rotate: TILT[i],
            scale: 1,
            opacity: 1,
            duration: 0.34,
            ease: 'power2.out',
          },
          0.14 + i * 0.025,
        )
      })

      const mouth = () => {
        const st = q('.reveal-stage')
        const b = q('.box')
        return `${((b.left + b.width / 2 - st.left) / st.width) * 100}% ${((b.top + b.height * 0.3 - st.top) / st.height) * 100}%`
      }
      tl.fromTo(
        '.reveal-void',
        { clipPath: () => `circle(0% at ${mouth()})` },
        { clipPath: () => `circle(150% at ${mouth()})`, duration: 0.4, ease: 'power2.in', immediateRender: false },
        0.52,
      )
        .to('.box', { scale: 0.6, opacity: 0, duration: 0.25 }, 0.62)
        .to('.fly', { scale: 0.7, opacity: 0, stagger: 0.02, duration: 0.2 }, 0.72)
        .fromTo(
          '.void-word',
          { yPercent: 115, rotate: 4 },
          { yPercent: 0, rotate: 0, duration: 0.12, stagger: 0.035, ease: 'power3.out' },
          0.76,
        )
        .to({}, { duration: 0.12 }) // let the sentence sit for a beat before the pin releases
    },
    { scope: root },
  )

  return (
    <section ref={root} className="reveal" aria-label="Inside the box">
      <div className="reveal-stage">
        <div className="reveal-void">
          <p className="void-copy" aria-label={SENTENCE}>
            {SENTENCE.split(' ').map((w, i) => (
              <span key={i} className="void-mask" aria-hidden="true">
                <span className="void-word">{w}</span>
              </span>
            ))}
          </p>
        </div>
        <div className="reveal-center">
        <div className="box-wrap">
          <Box />
          {TICKERS.map((t, i) => (
            <span key={t} className={`fly fly-${i}`}>
              <Logo symbol={t} className="fly-logo" />
              {t}
            </span>
          ))}
        </div>
        <div className="reveal-caption">
          <h2 className="display-lg">One box. Eight stocks inside.</h2>
          <p className="body muted">Keep scrolling to open it.</p>
        </div>
        </div>
      </div>
    </section>
  )
}
