'use client'

import { useState, useRef, useCallback } from 'react'
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
}

function getCroppedCanvas(
  image: HTMLImageElement,
  crop: Crop,
  maxSize: number
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  const scaleX = image.naturalWidth / image.width
  const scaleY = image.naturalHeight / image.height

  let cropX: number, cropY: number, cropW: number, cropH: number
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
    cropX, cropY, cropW, cropH,
    0, 0, maxSize, maxSize
  )
  return canvas
}

function centerAspectCrop(
  mediaWidth: number,
  mediaHeight: number,
  aspect: number
): Crop {
  return centerCrop(
    makeAspectCrop(
      { unit: '%', width: 90 },
      aspect,
      mediaWidth,
      mediaHeight
    ),
    mediaWidth,
    mediaHeight
  )
}

export function AvatarUpload({ userId, currentAvatarUrl, onSaved }: Props) {
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
      setError('Please select an image (JPEG, PNG, or WebP)')
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

  const handleCropComplete = useCallback((c: Crop) => {
    setCompletedCrop(c)
  }, [])

  const handleSave = async () => {
    if (!imgRef.current || !completedCrop) return
    setUploading(true)
    setError(null)
    try {
      const canvas = getCroppedCanvas(imgRef.current, completedCrop, AVATAR_SIZE)
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          b => (b ? resolve(b) : reject(new Error('Canvas toBlob failed'))),
          'image/webp',
          0.9
        )
      })

      const supabase = createSupabaseBrowserClient()
      const path = `${userId}/avatar.webp`
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, blob, { upsert: true, contentType: 'image/webp' })

      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(path)
      // Append cache-busting param so browser shows the new image (same path is overwritten)
      const urlToStore = `${urlData.publicUrl}?t=${Date.now()}`

      await setAvatarUrl(supabase, urlToStore)
      setSrc(null)
      setCrop(undefined)
      setCompletedCrop(undefined)
      onSaved()
    } catch (err: unknown) {
      setError((err as { message?: string })?.message ?? 'Upload failed')
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
      setError((err as { message?: string })?.message ?? 'Remove failed')
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

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
        Avatar
      </h3>
      <div className="flex items-start gap-4">
        <div className="shrink-0 w-16 h-16 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center">
          {currentAvatarUrl ? (
            <img
              src={currentAvatarUrl}
              alt="Avatar"
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-2xl text-gray-400">?</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          {!src ? (
            <div className="flex flex-wrap gap-2">
              <label className="cursor-pointer">
                <span className="inline-block px-3 py-2 bg-gray-900 text-white text-sm rounded-xl hover:bg-gray-800 transition-colors">
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
                  className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-xl transition-colors disabled:opacity-50"
                >
                  Remove
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
                    alt="Crop"
                    onLoad={onImageLoad}
                    style={{ maxHeight: 280 }}
                  />
                </ReactCrop>
              </div>
              <p className="text-xs text-gray-500">
                Drag to adjust the crop area. Photo will be resized to {AVATAR_SIZE}×{AVATAR_SIZE}.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={uploading || !completedCrop}
                  className="px-3 py-2 bg-gray-900 text-white text-sm rounded-xl hover:bg-gray-800 disabled:opacity-50 transition-colors"
                >
                  {uploading ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={uploading}
                  className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {error && <p className="text-sm text-red-500 mt-1">{error}</p>}
        </div>
      </div>
    </div>
  )
}
