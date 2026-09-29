import { useRef } from 'react'
import { useBlockNumber } from 'wagmi'
import { chain, PANDOCK, TELEGRAM_BOT, X_HANDLE } from '../config'
import { short } from '../format'
import { gsap, reducedMotion, useGSAP } from '../motion'
import SplitReveal from '../components/SplitReveal'
import Magnetic from '../components/Magnetic'
import Mark from '../components/Mark'
import Link from '../components/Link'

const MARK = 'Pandock'
const explorer = chain.blockExplorers.default.url

const BUILT_ON = [
  ['Arc', 'https://arc.io'],
  ['USDC by Circle', 'https://www.circle.com/usdc'],
  ['ArcStocks', 'https://arcstocks.app'],
  ['CoinMarketCap', 'https://coinmarketcap.com/api/'],
  ['Robinhood Chain', 'https://docs.robinhood.com/chain/'],
]

export default function Footer() {
  const root = useRef<HTMLElement>(null)
  const { data: block } = useBlockNumber({ watch: true, query: { refetchInterval: 1000 } })

  // The wordmark climbs out from under the page edge as you reach the bottom.
  useGSAP(
    () => {
      if (reducedMotion()) return
      // Plays through on its own once the mark comes into view (not scrubbed), so the last
      // letter can never be left halfway up when the page runs out before the scroll range does.
      gsap.from('.mark-char', {
        yPercent: 105,
        duration: 1.1,
        ease: 'expo.out',
        stagger: 0.06,
        scrollTrigger: { trigger: '.footer-mark', start: 'top 92%', toggleActions: 'play none none reverse' },
      })
    },
    { scope: root },
  )

  return (
    <>
      <section className="closer">
        <SplitReveal>
          <h2 className="display-xl">
            Somebody’s birthday
            <br />
            is coming up.
          </h2>
        </SplitReveal>
        <div data-rise>
          <Magnetic>
            <Link to="/app/gift" className="btn-primary btn-large">Send them a box</Link>
          </Magnetic>
        </div>
      </section>

      <footer ref={root} className="footer">
        <div className="footer-cols">
          <div className="footer-col">
            <span className="caption-strong footer-brand">
              <Mark className="footer-brand-mark" />
              Pandock
            </span>
            <p className="caption muted">Sealed boxes of tokenized stocks. Bought, gifted and opened on Arc.</p>
          </div>
          <div className="footer-col">
            <span className="caption-strong">Explore</span>
            <a href="#how">How it works</a>
            <a href="#prizes">What’s inside</a>
            <a href="#market">Market</a>
            <a href="#odds">The odds</a>
          </div>
          <div className="footer-col">
            <span className="caption-strong">Built on</span>
            {BUILT_ON.map(([label, href]) => (
              <a key={label} href={href} target="_blank" rel="noreferrer">
                {label}
              </a>
            ))}
          </div>
          <div className="footer-col">
            <span className="caption-strong">Follow</span>
            <a href={`https://x.com/${X_HANDLE}`} target="_blank" rel="noreferrer">
              X @{X_HANDLE}
            </a>
            <a href={`https://t.me/${TELEGRAM_BOT}`} target="_blank" rel="noreferrer">
              Telegram @{TELEGRAM_BOT}
            </a>
          </div>
          <div className="footer-col">
            <span className="caption-strong">Network</span>
            <span>{chain.name} · {chain.id}</span>
            <span className="tabular">Block {block ? block.toLocaleString('en-US') : '…'}</span>
            {PANDOCK ? (
              <a href={`${explorer}/address/${PANDOCK}`} target="_blank" rel="noreferrer">
                Contract {short(PANDOCK)}
              </a>
            ) : (
              <span className="muted">Contract not deployed yet</span>
            )}
          </div>
        </div>

        <p className="fine-print">
          Prizes are random; a box can be worth more or less than you paid. Stock tokens by ArcStocks, backed one to
          one on Robinhood Chain. Not available to US persons.
        </p>

        <div className="footer-mark" aria-label={MARK}>
          <span className="mark-char mark-logo" aria-hidden="true">
            <Mark />
          </span>
          {[...MARK].map((c, i) => (
            <span key={i} className="mark-char" aria-hidden="true">
              {c}
            </span>
          ))}
        </div>
      </footer>
    </>
  )
}
