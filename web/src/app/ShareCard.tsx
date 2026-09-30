import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * The invite card on screen, then one more tap to post it. X's web intent carries only text and a link, so:
 * phones hand the image itself to the share sheet (the X app attaches it); desktops copy it to the clipboard and
 * open X with the text, ready for a paste. The link also unfurls into the same card wherever X shows cards for it.
 */
export default function ShareCard({ card, cardUrl, text, link, onClose }: { card?: File; cardUrl: string; text: string; link: string; onClose: () => void }) {
  const [note, setNote] = useState('')
  const intent = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}`
  const phone = !!card && matchMedia('(pointer: coarse)').matches && !!navigator.canShare?.({ files: [card] })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const share = async () => {
    if (phone && card) {
      return navigator.share({ files: [card], text: `${text} ${link}` }).catch((err: Error) => {
        if (err.name !== 'AbortError') window.open(intent, '_blank', 'noopener')
      })
    }
    try {
      if (!card || !('ClipboardItem' in window)) throw new Error('no clipboard images')
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': card })])
      setNote('Card copied. Paste it into the post (Ctrl+V or ⌘V) before you send.')
    } catch {
      setNote('Your browser can’t copy images: download the card and add it to the post.')
    }
    window.open(intent, '_blank', 'noopener')
  }

  return createPortal(
    <div className="share-modal" role="dialog" aria-modal="true" aria-label="Share your invite">
      <div className="share-backdrop" onClick={onClose} />
      <div className="share-sheet">
        <button className="share-close" aria-label="Close" onClick={onClose}>×</button>
        <img className="share-card" src={cardUrl} alt="Your Pandock invite card" width={1200} height={630} />
        <p className="body share-text">{text} <span className="muted">{link.replace(/^https?:\/\//, '')}</span></p>
        <div className="share-actions">
          <button className="btn-primary btn-large" onClick={share}>Share on X</button>
          <a className="btn-light" href={cardUrl} download="pandock-invite.png">Download card</a>
        </div>
        {note && <p className="caption muted">{note}</p>}
      </div>
    </div>,
    document.body,
  )
}
