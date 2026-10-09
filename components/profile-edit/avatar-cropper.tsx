import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { cropRect, INITIAL_CROP, MAX_ZOOM, MIN_ZOOM, panBy, renderAvatar, type CropState } from '../../utils/image-crop'

const VIEWPORT = 240

interface AvatarCropperProps {
  image: HTMLImageElement
  onCancel: () => void
  onDone: (blob: Blob) => void
}

/** Square crop: drag to position, slider to zoom; produces a 256×256 WebP. */
export function AvatarCropper({ image, onCancel, onDone }: AvatarCropperProps) {
  const canvas = useRef<HTMLCanvasElement>(null)
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

  async function done() {
    setBusy(true)
    try {
      onDone(await renderAvatar(image, crop))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Crop avatar" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="border-border bg-background w-full max-w-sm space-y-5 rounded-2xl border p-6 shadow-modal">
        <h2 className="text-foreground text-lg font-semibold">Position your avatar</h2>
        <div className="flex justify-center">
          <canvas
            ref={canvas}
            width={VIEWPORT}
            height={VIEWPORT}
            className="cursor-grab touch-none rounded-full ring-4 ring-white/20 active:cursor-grabbing"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
            aria-label="Drag to position"
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
          <button type="button" onClick={onCancel} className="text-foreground hover:bg-foreground/10 rounded-lg px-4 py-2 text-sm font-semibold transition-colors">
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
    </div>
  )
}
