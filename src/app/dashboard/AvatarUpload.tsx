'use client'

import { useCallback, useRef, useState } from 'react'
import ReactCrop, {
  type Crop,
  centerCrop,
  makeAspectCrop,
} from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { setAvatarUrl } from '@/lib/api/identities'

const AVATAR_SIZE = 256
const ASPECT = 1

interface Props {
  userId: string
  currentAvatarUrl: string | null
  onSaved: () => void
  compact?: boolean
}

function getCroppedCanvas(
  image: HTMLImageElement,
  crop: Crop,
  maxSize: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  const scaleX = image.naturalWidth / image.width
  const scaleY = image.naturalHeight / image.height

  let cropX: number
  let cropY: number
  let cropW: number
  let cropH: number

  if (crop.unit === '%') {
    cropX = (crop.x / 100) * image.naturalWidth
    cropY = (crop.y / 100) * image.naturalHeight
    cropW = (crop.width / 100) * image.naturalWidth
    cropH = (crop.height / 100) * image.naturalHeight
  } else {
    cropX = crop.x * scaleX
    cropY = crop.y * scaleY
    cropW = crop.width * scaleX
    cropH = crop.height * scaleY
  }

  canvas.width = maxSize
  canvas.height = maxSize
  ctx.drawImage(
    image,
    cropX,
    cropY,
    cropW,
    cropH,
    0,
    0,
    maxSize,
    maxSize,
  )
  return canvas
}

function centerAspectCrop(
  mediaWidth: number,
  mediaHeight: number,
  aspect: number,
): Crop {
  return centerCrop(
    makeAspectCrop(
      { unit: '%', width: 90 },
      aspect,
      mediaWidth,
      mediaHeight,
    ),
    mediaWidth,
    mediaHeight,
  )
}

export function AvatarUpload({ userId, currentAvatarUrl, onSaved, compact = false }: Props) {
  const [src, setSrc] = useState<string | null>(null)
  const [crop, setCrop] = useState<Crop>()
  const [completedCrop, setCompletedCrop] = useState<Crop>()
  const imgRef = useRef<HTMLImageElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.')
      return
    }

    setError(null)
    const reader = new FileReader()
    reader.onload = () => {
      setSrc(reader.result as string)
      setCrop(undefined)
    }
    reader.readAsDataURL(file)
  }

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget
    setCrop(centerAspectCrop(width, height, ASPECT))
  }

  const handleCropComplete = useCallback((nextCrop: Crop) => {
    setCompletedCrop(nextCrop)
  }, [])

  const handleSave = async () => {
    if (!imgRef.current || !completedCrop) return
    setUploading(true)
    setError(null)

    try {
      const canvas = getCroppedCanvas(imgRef.current, completedCrop, AVATAR_SIZE)
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          output => (output ? resolve(output) : reject(new Error('Canvas export failed'))),
          'image/webp',
          0.9,
        )
      })

      const supabase = createSupabaseBrowserClient()
      const path = `${userId}/avatar.webp`
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, blob, { upsert: true, contentType: 'image/webp' })
      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
      await setAvatarUrl(supabase, `${urlData.publicUrl}?t=${Date.now()}`)

      setSrc(null)
      setCrop(undefined)
      setCompletedCrop(undefined)
      onSaved()
    } catch (err: unknown) {
      setError((err as { message?: string })?.message ?? 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  const handleRemove = async () => {
    setUploading(true)
    setError(null)

    try {
      const supabase = createSupabaseBrowserClient()
      await supabase.storage.from('avatars').remove([`${userId}/avatar.webp`])
      await setAvatarUrl(supabase, null)
      onSaved()
    } catch (err: unknown) {
      setError((err as { message?: string })?.message ?? 'Remove failed.')
    } finally {
      setUploading(false)
    }
  }

  const handleCancel = () => {
    setSrc(null)
    setCrop(undefined)
    setCompletedCrop(undefined)
    setError(null)
  }

  if (compact) {
    return (
      <div className="space-y-2">
        {!src ? (
          <div className="space-y-1.5">
            <div className="relative h-[68px] w-[68px]">
              <div className="flex h-[68px] w-[68px] items-center justify-center overflow-hidden rounded-full bg-gradient-to-b from-slate-100 to-slate-200">
                {currentAvatarUrl ? (
                  <img src={currentAvatarUrl} alt="Profile photo" className="h-full w-full object-cover" />
                ) : (
                  <span className="relative mt-4 h-7 w-12 rounded-t-full bg-slate-300/80 before:absolute before:-top-6 before:left-1/2 before:h-6 before:w-6 before:-translate-x-1/2 before:rounded-full before:bg-slate-300/80" aria-hidden="true" />
                )}
              </div>
              <label className="absolute bottom-0 right-0 cursor-pointer">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#CBD5E1] bg-white text-[#071A44] shadow-sm transition hover:border-[#94A3B8]">
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
                    <path d="m5 19 3.9-.8L18.6 8.5a2 2 0 0 0 0-2.8l-.3-.3a2 2 0 0 0-2.8 0L5.8 15.1 5 19Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="m14.2 6.8 3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={onFileChange}
                />
              </label>
            </div>
            {currentAvatarUrl && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={uploading}
                className="text-[9px] font-semibold text-slate-500 transition hover:text-rose-600 disabled:opacity-50"
              >
                Remove photo
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="max-w-xs">
              <ReactCrop
                crop={crop}
                onChange={setCrop}
                onComplete={handleCropComplete}
                aspect={ASPECT}
                circularCrop
                className="max-w-full"
              >
                <img
                  ref={imgRef}
                  src={src}
                  alt="Crop preview"
                  onLoad={onImageLoad}
                  style={{ maxHeight: 240 }}
                />
              </ReactCrop>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={uploading || !completedCrop}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
              >
                {uploading ? 'Saving...' : 'Save photo'}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={uploading}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-rose-600">{error}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold tracking-tight text-slate-900">Photo</h3>
        <p className="mt-1 text-sm text-slate-500">Shown on your profile and around the app.</p>
      </div>

      <div className="flex items-start gap-4">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-200">
          {currentAvatarUrl ? (
            <img src={currentAvatarUrl} alt="Profile photo" className="h-full w-full object-cover" />
          ) : (
            <span className="text-2xl text-slate-400">?</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          {!src ? (
            <div className="flex flex-wrap gap-2">
              <label className="cursor-pointer">
                <span className="inline-flex rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800">
                  Upload photo
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={onFileChange}
                />
              </label>
              {currentAvatarUrl && (
                <button
                  type="button"
                  onClick={handleRemove}
                  disabled={uploading}
                  className="rounded-2xl px-4 py-2.5 text-sm font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
                >
                  Remove photo
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="max-w-xs">
                <ReactCrop
                  crop={crop}
                  onChange={setCrop}
                  onComplete={handleCropComplete}
                  aspect={ASPECT}
                  circularCrop
                  className="max-w-full"
                >
                  <img
                    ref={imgRef}
                    src={src}
                    alt="Crop preview"
                    onLoad={onImageLoad}
                    style={{ maxHeight: 280 }}
                  />
                </ReactCrop>
              </div>
              <p className="text-xs text-slate-500">
                Drag to adjust the crop area. Photo will be resized to {AVATAR_SIZE}x{AVATAR_SIZE}.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={uploading || !completedCrop}
                  className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
                >
                  {uploading ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={uploading}
                  className="rounded-2xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {error && <p className="mt-2 text-sm text-rose-500">{error}</p>}
        </div>
      </div>
    </div>
  )
}
