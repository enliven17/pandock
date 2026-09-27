import { ConnectKitButton } from 'connectkit'
import { useSwitchChain } from 'wagmi'
import { chain } from '../config'
import { usePath } from '../router'
import Link from '../components/Link'
import Mark from '../components/Mark'
import Box from '../components/Box'
import PageHeader from './PageHeader'
import { useBoxes } from './useBoxes'
import BuyPage from './BuyPage'
import BoxesPage from './BoxesPage'
import GiftPage from './GiftPage'

const TABS = [
  { to: '/app', label: 'Buy' },
  { to: '/app/boxes', label: 'My boxes' },
  { to: '/app/gift', label: 'Gift' },
]

export function WalletButton({ className = 'nav-cta' }: { className?: string }) {
  return (
    <ConnectKitButton.Custom>
      {({ show, isConnected, truncatedAddress, ensName }) => (
        // isConnecting is also true while the modal is merely open, so it isn't used as a label.
        <button className={className} onClick={show}>
          {isConnected ? (ensName ?? truncatedAddress) : 'Connect wallet'}
        </button>
      )}
    </ConnectKitButton.Custom>
  )
}

export default function AppShell() {
  const path = usePath()
  const boxes = useBoxes()
  const { switchChain, isPending: switching } = useSwitchChain()
  const Page = path.startsWith('/app/boxes') ? BoxesPage : path.startsWith('/app/gift') ? GiftPage : BuyPage

  return (
    <div className="app">
      {/* The landing's floating pill, held in its scrolled state. */}
      <header className="nav-shell app-nav" style={{ '--nav-p': 1 } as React.CSSProperties}>
        <nav className="nav-bar app-nav-bar" aria-label="App">
          <Link to="/" className="brand">
            <Mark className="brand-mark" />
            Pandock
            {chain.testnet && <span className="nav-badge">Testnet</span>}
          </Link>
          <div className="app-tabs">
            {TABS.map((t) => (
              <Link
                key={t.to}
                to={t.to}
                className={`app-tab ${path === t.to ? 'is-active' : ''}`}
                aria-current={path === t.to ? 'page' : undefined}
              >
                {t.label}
                {t.to === '/app/boxes' && boxes.balance > 0n && <span className="app-tab-count">{boxes.balance.toString()}</span>}
              </Link>
            ))}
          </div>
          <WalletButton />
        </nav>
      </header>

      <main className="app-main" key={path}>
        {(boxes.wrongChain || !boxes.live) && (
          <div className="app-status">
            {boxes.wrongChain ? (
              <>
                <span className="status-dot" aria-hidden="true" />
                <span className="caption">Wrong network. Pandock runs on {chain.name}.</span>
                <button className="status-action" disabled={switching} onClick={() => switchChain({ chainId: chain.id })}>
                  {switching ? 'Switching…' : 'Switch'}
                </button>
              </>
            ) : (
              <>
                <span className="status-dot status-dot-quiet" aria-hidden="true" />
                <span className="caption">Preview: the box contract isn’t live on {chain.name} yet.</span>
              </>
            )}
          </div>
        )}

        {boxes.isConnected ? (
          <Page boxes={boxes} />
        ) : (
          <section className="app-connect">
            <Box className="app-connect-box" />
            <PageHeader
              title={<>Connect a wallet<br />to get started.</>}
              lead={<>Boxes are bought with USDC on {chain.name}. Gas is paid in USDC too.</>}
            >
              <WalletButton className="btn-primary btn-large" />
            </PageHeader>
          </section>
        )}
      </main>
    </div>
  )
}

export type Boxes = ReturnType<typeof useBoxes>
