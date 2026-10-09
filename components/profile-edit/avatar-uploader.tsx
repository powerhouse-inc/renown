import { useEffect, useRef, useState, type DragEvent } from 'react'
import { AvatarUploadError, uploadAvatar } from '../../services/avatar-upload'
import { sourceImageProblem } from '../../utils/image-crop'
import { AvatarCropper } from './avatar-cropper'

export type AvatarUploadState = 'idle' | 'uploading' | 'error'

interface AvatarUploaderProps {
  hasAvatar: boolean
  ensAvatar?: string | null
  getBearer: () => Promise<string>
  /** A finished upload: its ref and a local preview URL. */
  onUploaded: (ref: string, previewUrl: string) => void
  onClear: () => void
  onUseEnsAvatar: (url: string) => void
  onBusyChange: (busy: boolean) => void
  error?: string
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      // The pixels are decoded; the object URL is no longer needed.
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('This file could not be read as an image.'))
    }
    image.src = url
  })
}

/** Drop or pick an image → crop → upload; plus clear and "Use ENS avatar". */
export function AvatarUploader({ hasAvatar, ensAvatar, getBearer, onUploaded, onClear, onUseEnsAvatar, onBusyChange, error }: AvatarUploaderProps) {
  const input = useRef<HTMLInputElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const restoreFocus = useRef(false)
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [state, setState] = useState<AvatarUploadState>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  function closeCropper() {
    restoreFocus.current = true
    setImage(null)
  }

  // Back to the "Change avatar" button once the dialog is gone (and the button is enabled again).
  useEffect(() => {
    if (!image && state !== 'uploading' && restoreFocus.current) {
      restoreFocus.current = false
      trigger.current?.focus()
    }
  }, [image, state])

  async function choose(file: File | undefined) {
    if (!file) return
    const problem = sourceImageProblem(file)
    if (problem) {
      setState('error')
      setMessage(problem)
      return
    }
    try {
      setImage(await loadImage(file))
      setMessage(null)
      setState('idle')
    } catch (e) {
      setState('error')
      setMessage(e instanceof Error ? e.message : 'This file could not be read as an image.')
    }
  }

  async function upload(blob: Blob) {
    closeCropper()
    setState('uploading')
    onBusyChange(true)
    try {
      const ref = await uploadAvatar(blob, await getBearer())
      onUploaded(ref, URL.createObjectURL(blob))
      setState('idle')
      setMessage(null)
    } catch (e) {
      setState('error')
      setMessage(
        e instanceof AvatarUploadError && e.code === 'RATE_LIMITED'
          ? 'Too many uploads. Try again in an hour.'
          : e instanceof Error
            ? e.message
            : 'Upload failed.',
      )
    } finally {
      onBusyChange(false)
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    void choose(e.dataTransfer.files[0])
  }

  const shown = message ?? error
  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-4 text-center transition-colors ${
          dragOver ? 'border-primary bg-primary/5' : 'border-border'
        }`}
      >
        <p className="text-muted-foreground text-sm">
          {state === 'uploading' ? 'Uploading…' : 'Drop an image here, or'}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <button
            ref={trigger}
            type="button"
            onClick={() => input.current?.click()}
            aria-describedby={shown ? 'avatar-error' : undefined}
            disabled={state === 'uploading'}
            className="bg-primary text-primary-foreground hover:bg-primary/80 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60"
          >
            {hasAvatar ? 'Change avatar' : 'Upload avatar'}
          </button>
          {hasAvatar && (
            <button type="button" onClick={onClear} className="border-border text-foreground hover:bg-foreground/10 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors">
              Remove
            </button>
          )}
          {ensAvatar && (
            <button type="button" onClick={() => onUseEnsAvatar(ensAvatar)} className="border-border text-foreground hover:bg-foreground/10 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors">
              Use ENS avatar
            </button>
          )}
        </div>
        <p className="text-muted-foreground text-xs">PNG, JPEG or WebP, up to 2 MB. Cropped to a square.</p>
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          data-testid="avatar-file"
          onChange={(e) => {
            void choose(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </div>
      {shown && (
        <p id="avatar-error" role="alert" className="text-destructive text-xs">
          {shown}
        </p>
      )}
      {image && <AvatarCropper image={image} onCancel={closeCropper} onDone={(blob) => void upload(blob)} />}
    </div>
  )
}
