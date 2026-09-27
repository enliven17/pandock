import { ConnectKitButton } from 'connectkit'
import { useSwitchChain } from 'wagmi'
import { chain } from '../config'
import { usePath } from '../router'
import Link from '../components/Link'
import Mark from '../components/Mark'
import Box from '../components/Box'
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
      <header className="app-bar">
        <Link to="/" className="brand">
          <Mark className="brand-mark" />
          Pandock
          {chain.testnet && <span className="nav-badge">Testnet</span>}
        </Link>
        <nav className="app-tabs" aria-label="App">
          {TABS.map((t) => (
            <Link key={t.to} to={t.to} className={`app-tab ${path === t.to ? 'is-active' : ''}`} aria-current={path === t.to ? 'page' : undefined}>
              {t.label}
              {t.to === '/app/boxes' && boxes.balance > 0n && <span className="app-tab-count">{boxes.balance.toString()}</span>}
            </Link>
          ))}
        </nav>
        <WalletButton />
      </header>

      <main className="app-main">
        {boxes.wrongChain && (
          <div className="app-banner">
            <span className="body">Pandock runs on {chain.name}.</span>
            <button className="btn-primary" disabled={switching} onClick={() => switchChain({ chainId: chain.id })}>
              {switching ? 'Switching…' : `Switch to ${chain.name}`}
            </button>
          </div>
        )}
        {!boxes.live && (
          <div className="app-banner app-banner-quiet">
            <span className="body">The box contract isn’t deployed on this network yet, so buying and opening are off for now.</span>
          </div>
        )}

        {boxes.isConnected ? (
          <Page boxes={boxes} />
        ) : (
          <section className="app-connect">
            <Box className="app-connect-box" />
            <h1 className="display-lg">Connect a wallet to get started.</h1>
            <p className="body muted">Boxes are bought with USDC on {chain.name}. Gas is paid in USDC too.</p>
            <WalletButton className="btn-primary btn-large" />
          </section>
        )}
      </main>
    </div>
  )
}

export type Boxes = ReturnType<typeof useBoxes>
