import { useEffect, useState } from 'react'
import { gsap, lenis, reducedMotion, ScrollTrigger, scrollToHash, startSmoothScroll, useGSAP } from './motion'
import Hero from './sections/Hero'
import Reveal from './sections/Reveal'
import How from './sections/How'
import Prizes from './sections/Prizes'
import Odds from './sections/Odds'
import Live from './sections/Live'
import Market from './sections/Market'
import Footer from './sections/Footer'
import Mark from './components/Mark'
import { chain } from './config'
import Link from './components/Link'

/** The marketing page. Buying, opening and gifting live in the app (/app). */
export default function Landing() {
  useEffect(() => {
    startSmoothScroll()
    // Route in-page anchors through Lenis so jumps glide instead of teleporting.
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest('a[href^="#"]')
      if (!a) return
      e.preventDefault()
      scrollToHash(a.getAttribute('href')!)
    }
    document.addEventListener('click', onClick)
    document.fonts.ready.then(() => ScrollTrigger.refresh())
    return () => document.removeEventListener('click', onClick)
  }, [])

  useGSAP(() => {
    if (reducedMotion()) return
    ScrollTrigger.batch('[data-rise]', {
      start: 'top 88%',
      once: true,
      onEnter: (els) => gsap.from(els, { y: 48, opacity: 0, duration: 1.1, ease: 'expo.out', stagger: 0.1 }),
    })
  })

  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Reveal />
        <Live />
        <How />
        <Prizes />
        <Market />
        <Odds />
      </main>
      <Footer />
    </>
  )
}

const LINKS = [
  ['How it works', '#how'],
  ['What’s inside', '#prizes'],
  ['Market', '#market'],
  ['The odds', '#odds'],
]

// Ported from nexum/apps/landing Navbar: one scrubbed number (--nav-p) morphs the docked,
// full-width bar into a floating pill, so every property eases continuously instead of flipping.
function Nav() {
  const [open, setOpen] = useState(false)

  useGSAP(() => {
    const root = document.documentElement
    const p = { v: 0 }
    const set = () => root.style.setProperty('--nav-p', String(p.v))
    if (reducedMotion()) {
      ScrollTrigger.create({ start: 80, onToggle: (st) => ((p.v = st.isActive ? 1 : 0), set()) })
      return
    }
    gsap.to(p, { v: 1, ease: 'none', onUpdate: set, scrollTrigger: { start: 0, end: 160, scrub: 0.6 } })

    // Entrance: the bar drops in from above the viewport, then its contents settle in one by one.
    // fromTo with explicit end states: a `from` that re-runs mid-flight (hot reload, a remount) takes the
    // half-dropped position as its target and leaves the bar stuck above the fold.
    gsap
      .timeline({ delay: 0.15 })
      .fromTo('.nav-bar', { yPercent: -140, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 1.1, ease: 'expo.out' })
      .fromTo(
        '.brand, .nav-links li, .nav-end, .nav-burger',
        { y: -14, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.8, ease: 'expo.out', stagger: 0.06 },
        '-=0.75',
      )
    return () => root.style.removeProperty('--nav-p')
  })

  useEffect(() => {
    if (open) lenis?.stop()
    else lenis?.start()
  }, [open])

  // The landing page only points into the app; the wallet connects there.
  const launch = (
    <Link to="/app" className="nav-cta" onClick={() => setOpen(false)}>
      Launch app
    </Link>
  )

  return (
    <header className="nav-shell" style={open ? ({ '--nav-p': 1 } as React.CSSProperties) : undefined}>
      <nav className="nav-bar" aria-label="Primary">
        <a href="#top" className="brand" onClick={() => setOpen(false)}>
          <Mark className="brand-mark" />
          Pandock
          {chain.testnet && <span className="nav-badge">Testnet</span>}
        </a>
        <ul className="nav-links">
          {LINKS.map(([label, href]) => (
            <li key={href}>
              <a href={href}>{label}</a>
            </li>
          ))}
        </ul>
        <div className="nav-end">{launch}</div>
        <button
          className={`nav-burger ${open ? 'is-open' : ''}`}
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((v) => !v)}
        >
          <span />
          <span />
        </button>
      </nav>
      {open && (
        <div id="mobile-menu" className="nav-panel">
          {LINKS.map(([label, href]) => (
            <a key={href} href={href} onClick={() => setOpen(false)}>
              {label}
            </a>
          ))}
          {launch}
        </div>
      )}
    </header>
  )
}
