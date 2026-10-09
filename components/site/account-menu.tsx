import Link from 'next/link'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { ProfileAvatar } from '../profile/profile-avatar'
import type { RenownProfile } from '../../services/switchboard'
import { accountLinks, shortAddress } from './account-links'

export interface AccountMenuProps {
  address: string
  displayName?: string | null
  /** External avatar (ENS or legacy URL) from the session. */
  avatarUrl?: string | null
  profile: RenownProfile | null
  onSignOut: () => void
}

/** The signed-in avatar button and its menu. Esc closes and returns focus; arrows move between items. */
export function AccountMenu({ address, displayName, avatarUrl, profile, onSignOut }: AccountMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const name = displayName || profile?.displayName || shortAddress(address)

  useEffect(() => {
    if (!open) return
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    return () => document.removeEventListener('mousedown', onPointer)
  }, [open])

  function close() {
    setOpen(false)
    buttonRef.current?.focus()
  }

  function onMenuKey(event: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
    const index = items.indexOf(document.activeElement as HTMLElement)
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      items[(index + 1) % items.length]?.focus()
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      items[(index - 1 + items.length) % items.length]?.focus()
    } else if (event.key === 'Tab') {
      setOpen(false)
    }
  }

  const itemClass =
    'text-ink hover:bg-surface-2 focus-visible:bg-surface-2 flex w-full items-center rounded-lg px-3 py-2 text-left text-sm outline-none'

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Account menu for ${name}`}
        onClick={() => setOpen((value) => !value)}
        className="border-hairline-strong hover:border-primary/50 flex h-10 items-center gap-2 rounded-full border py-1 pr-3 pl-1 transition-colors"
      >
        <ProfileAvatar
          documentId={profile?.documentId}
          avatar={profile?.avatar}
          userImage={avatarUrl ?? profile?.userImage}
          seed={address}
          alt=""
          className="h-8 w-8"
        />
        <span className="text-ink max-w-[10rem] truncate text-sm font-medium">{name}</span>
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`text-ink-muted motion-safe:transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Account"
          onKeyDown={onMenuKey}
          className="border-hairline bg-background shadow-modal absolute top-12 right-0 z-50 w-60 rounded-2xl border p-1.5"
        >
          <div className="border-hairline mb-1 border-b px-3 pt-2 pb-3">
            <p className="text-ink truncate text-sm font-semibold">{name}</p>
            <p className="text-ink-muted font-mono text-xs">{shortAddress(address)}</p>
          </div>
          {accountLinks(address, profile).map((link) => (
            <Link key={link.href} href={link.href} role="menuitem" className={itemClass} onClick={() => setOpen(false)}>
              {link.label}
            </Link>
          ))}
          <button
            type="button"
            role="menuitem"
            className={`${itemClass} text-destructive`}
            onClick={() => {
              setOpen(false)
              onSignOut()
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
