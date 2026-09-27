import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import { useGSAP } from '@gsap/react'
import Lenis from 'lenis'

gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP)
// Mobile address bars resize the viewport while you scroll; re-measuring every pin on each of those
// is what makes pinned sections jump on phones. Width changes (rotation) still trigger a refresh.
ScrollTrigger.config({ ignoreMobileResize: true })

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export let lenis: Lenis | null = null

/** One Lenis instance, driven by GSAP's ticker so ScrollTrigger and smooth scroll share a clock. */
export function startSmoothScroll() {
  if (lenis || reducedMotion()) return
  // Low lerp + reduced wheel multiplier: every section glides instead of jumping ahead of the reader.
  lenis = new Lenis({ lerp: 0.075, wheelMultiplier: 0.8, touchMultiplier: 1.4 })
  lenis.on('scroll', ScrollTrigger.update)
  gsap.ticker.add((t) => lenis?.raf(t * 1000))
  gsap.ticker.lagSmoothing(0)
}

export function scrollToHash(hash: string) {
  const el = document.querySelector(hash) as HTMLElement | null
  if (!el) return
  if (lenis) lenis.scrollTo(el, { offset: -72, force: true })
  else el.scrollIntoView()
}

export { gsap, ScrollTrigger, SplitText, useGSAP }
