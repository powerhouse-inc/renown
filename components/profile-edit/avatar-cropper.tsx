import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { cancelsOnKey, cropRect, INITIAL_CROP, MAX_ZOOM, MIN_ZOOM, panBy, renderAvatar, type CropState } from '../../utils/image-crop'

const VIEWPORT = 240
const KEY_STEP = 12
const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), canvas[tabindex="0"]'

interface AvatarCropperProps {
  image: HTMLImageElement
  onCancel: () => void
  onDone: (blob: Blob) => void
}

/** Square crop: drag to position, slider to zoom; produces a 256×256 WebP. */
export function AvatarCropper({ image, onCancel, onDone }: AvatarCropperProps) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number } | null>(null)
  const [crop, setCrop] = useState<CropState>(INITIAL_CROP)
  const [busy, setBusy] = useState(false)
  const width = image.naturalWidth
  const height = image.naturalHeight

  useEffect(() => {
    const context = canvas.current?.getContext('2d')
    if (!context) return
    const { sx, sy, size } = cropRect(width, height, crop)
    context.clearRect(0, 0, VIEWPORT, VIEWPORT)
    context.drawImage(image, sx, sy, size, size, 0, 0, VIEWPORT, VIEWPORT)
  }, [image, width, height, crop])

  function onPointerDown(e: PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY }
  }
  function onPointerMove(e: PointerEvent<HTMLCanvasElement>) {
    if (!drag.current) return
    const dx = e.clientX - drag.current.x
    const dy = e.clientY - drag.current.y
    drag.current = { x: e.clientX, y: e.clientY }
    setCrop((c) => panBy(c, width, height, VIEWPORT, dx, dy))
  }

  // Modal behaviour: focus moves in on open; Escape cancels; Tab stays inside.
  useEffect(() => {
    canvas.current?.focus()
  }, [])

  function onDialogKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      // Cancelling while the crop is being rendered would still start the upload afterwards.
      if (cancelsOnKey(e.key, busy)) onCancel()
      return
    }
    if (e.key !== 'Tab' || !dialog.current) return
    const items = Array.from(dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE))
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (e.shiftKey && active === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  function onCanvasKeyDown(e: KeyboardEvent<HTMLCanvasElement>) {
    const step = (e.shiftKey ? 4 : 1) * KEY_STEP
    // Arrow keys move the visible window; dragging moves the image, hence the sign.
    const dx = e.key === 'ArrowLeft' ? step : e.key === 'ArrowRight' ? -step : 0
    const dy = e.key === 'ArrowUp' ? step : e.key === 'ArrowDown' ? -step : 0
    if (!dx && !dy) return
    e.preventDefault()
    setCrop((c) => panBy(c, width, height, VIEWPORT, dx, dy))
  }

  async function done() {
    setBusy(true)
    try {
      onDone(await renderAvatar(image, crop))
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div ref={dialog} onKeyDown={onDialogKeyDown} role="dialog" aria-modal="true" aria-label="Crop avatar" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="border-border bg-background w-full max-w-sm space-y-5 rounded-2xl border p-6 shadow-modal">
        <h2 className="text-foreground text-lg font-semibold">Position your avatar</h2>
        <div className="flex justify-center">
          <canvas
            ref={canvas}
            width={VIEWPORT}
            height={VIEWPORT}
            className="cursor-grab touch-none rounded-full ring-4 ring-white/20 outline-none focus-visible:ring-primary active:cursor-grabbing"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
            tabIndex={0}
            aria-label="Crop position: drag, or use the arrow keys (hold Shift for larger steps)"
            onKeyDown={onCanvasKeyDown}
          />
        </div>
        <label className="text-muted-foreground flex items-center gap-3 text-sm">
          Zoom
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={crop.zoom}
            onChange={(e) => setCrop((c) => ({ ...c, zoom: Number(e.target.value) }))}
            className="accent-primary flex-1"
          />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="text-foreground hover:bg-foreground/10 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void done()}
            disabled={busy}
            className="bg-primary text-primary-foreground hover:bg-primary/80 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60"
          >
            {busy ? 'Preparing…' : 'Use this crop'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
