import type { ReactNode } from 'react'
import SplitReveal from '../components/SplitReveal'

/** The top of every app page: a kicker, the landing's big masked-line title, and one line of lead. */
export default function PageHeader({
  kicker,
  title,
  lead,
  children,
}: {
  kicker: string
  title: ReactNode
  lead: ReactNode
  children?: ReactNode
}) {
  return (
    <header className="page-head">
      <span className="caption muted page-kicker">{kicker}</span>
      <SplitReveal scroll={false}>
        <h1 className="display-xl">{title}</h1>
      </SplitReveal>
      <p className="lead muted page-lead">{lead}</p>
      {children}
    </header>
  )
}
