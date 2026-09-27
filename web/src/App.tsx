import { useEffect, useState } from 'react'
import { ConnectKitButton } from 'connectkit'
import { gsap, lenis, reducedMotion, ScrollTrigger, scrollToHash, startSmoothScroll, useGSAP } from './motion'
import Hero from './sections/Hero'
import Reveal from './sections/Reveal'
import How from './sections/How'
import Prizes from './sections/Prizes'
import MyBoxes from './sections/MyBoxes'
import Odds from './sections/Odds'
import Footer from './sections/Footer'
import Mark from './components/Mark'
import { chain } from './config'

export default function App() {
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
        <How />
        <Prizes />
        <Odds />
        <MyBoxes />
      </main>
      <Footer />
    </>
  )
}

const LINKS = [
  ['How it works', '#how'],
  ['What’s inside', '#prizes'],
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
    gsap
      .timeline({ delay: 0.15 })
      .from('.nav-bar', { yPercent: -140, opacity: 0, duration: 1.1, ease: 'expo.out' })
      .from(
        '.brand, .nav-links li, .nav-end, .nav-burger',
        { y: -14, opacity: 0, duration: 0.8, ease: 'expo.out', stagger: 0.06 },
        '-=0.75',
      )
    return () => root.style.removeProperty('--nav-p')
  })

  useEffect(() => {
    if (open) lenis?.stop()
    else lenis?.start()
  }, [open])

  // Our own pill, ConnectKit's modal: show() opens wallet choice, or the account view once connected.
  const wallet = (
    <ConnectKitButton.Custom>
      {({ show, isConnected, truncatedAddress, ensName }) => (
        // isConnecting is also true while the modal is merely open, so it isn't shown as a label.
        <button className="nav-cta" onClick={show}>
          {isConnected ? (ensName ?? truncatedAddress) : 'Connect'}
        </button>
      )}
    </ConnectKitButton.Custom>
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
        <div className="nav-end">{wallet}</div>
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
          {wallet}
        </div>
      )}
    </header>
  )
}
