import type { AnchorHTMLAttributes, MouseEvent } from 'react'
import { navigate } from '../router'

/** An <a> that routes in-app for plain left clicks and behaves like a normal link otherwise (new tab, etc.). */
export default function Link({ to, onClick, ...rest }: { to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e)
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    navigate(to)
  }
  return <a href={to} onClick={handle} {...rest} />
}
