import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { ConnectKitProvider } from 'connectkit'
import { Analytics } from '@vercel/analytics/react'
import { wagmiConfig } from './config'
import App from './App'
import './index.css'
import { captureRef } from './referral'

// Keep an invite code from /r/<code> (?ref=) until a wallet accepts it.
captureRef()

const queryClient = new QueryClient()

// ConnectKit's modal, dressed in the page's tokens (DESIGN.md): system type, pill buttons, Action Blue.
const connectTheme = {
  '--ck-font-family': "'SF Pro Text', system-ui, -apple-system, BlinkMacSystemFont, Inter, sans-serif",
  '--ck-border-radius': '18px',
  '--ck-primary-button-border-radius': '999px',
  '--ck-secondary-button-border-radius': '999px',
  '--ck-body-color': '#1d1d1f',
  '--ck-body-color-muted': '#7a7a7a',
  '--ck-body-background': '#ffffff',
  '--ck-body-background-secondary': '#f5f5f7',
  '--ck-accent-color': '#0066cc',
  '--ck-accent-text-color': '#ffffff',
  '--ck-focus-color': '#0071e3',
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider theme="soft" mode="light" customTheme={connectTheme} options={{ initialChainId: 0 }}>
          <App />
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
    {/* Vercel Web Analytics: page views, and route changes from the app's own history router */}
    <Analytics />
  </StrictMode>,
)
