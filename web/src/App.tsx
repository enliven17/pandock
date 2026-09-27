import { usePath } from './router'
import Landing from './Landing'
import AppShell from './app/AppShell'

export default function App() {
  const path = usePath()
  return path === '/app' || path.startsWith('/app/') ? <AppShell /> : <Landing />
}
