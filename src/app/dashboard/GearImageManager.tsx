'use client'

import { useMemo, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import type { GearImage, GearImageKind } from '@/lib/types/database'

type Props = {
  userId: string
  gearItemId?: string | null
  imageKind?: GearImageKind
  images: GearImage[]
  emptyLabel: string
  onCreateImage: (input: {
    gear_item_id?: string | null
    image_kind?: GearImageKind
    storage_path: string
    public_url: string
    caption?: string | null
    sort_order?: number
    is_cover?: boolean
  }) => Promise<GearImage>
  onUpdateImage: (imageId: string, input: {
    caption?: string | null
    sort_order?: number
    is_cover?: boolean
    cutout_storage_path?: string | null
    cutout_public_url?: string | null
  }) => Promise<GearImage>
  onDeleteImage: (imageId: string) => Promise<void>
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'image'
}

function distance(a: [number, number, number], b: [number, number, number]) {
  const dr = a[0] - b[0]
  const dg = a[1] - b[1]
  const db = a[2] - b[2]
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

function getGearImageErrorMessage(error: unknown, fallback: string): string {
  const message = (error as { message?: string })?.message ?? fallback
  if (message.toLowerCase().includes('bucket not found')) {
    return 'Gear image storage is not initialized yet in this environment.'
  }
  return message
}

async function createBackgroundRemovedBlob(file: File): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const src = URL.createObjectURL(file)
    const element = new Image()
    element.onload = () => {
      URL.revokeObjectURL(src)
      resolve(element)
    }
    element.onerror = () => {
      URL.revokeObjectURL(src)
      reject(new Error('Could not process image.'))
    }
    element.src = src
  })

  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Canvas is not available.')
  }

  ctx.drawImage(image, 0, 0)
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const pixels = data.data
  const width = canvas.width
  const height = canvas.height
  const corners: [number, number, number][] = [
    [pixels[0], pixels[1], pixels[2]],
    [pixels[(width - 1) * 4], pixels[(width - 1) * 4 + 1], pixels[(width - 1) * 4 + 2]],
    [pixels[(width * (height - 1)) * 4], pixels[(width * (height - 1)) * 4 + 1], pixels[(width * (height - 1)) * 4 + 2]],
    [
      pixels[(width * height - 1) * 4],
      pixels[(width * height - 1) * 4 + 1],
      pixels[(width * height - 1) * 4 + 2],
    ],
  ]
  const background: [number, number, number] = [
    Math.round(corners.reduce((sum, color) => sum + color[0], 0) / corners.length),
    Math.round(corners.reduce((sum, color) => sum + color[1], 0) / corners.length),
    Math.round(corners.reduce((sum, color) => sum + color[2], 0) / corners.length),
  ]

  const threshold = 44
  for (let index = 0; index < pixels.length; index += 4) {
    const pixel: [number, number, number] = [pixels[index], pixels[index + 1], pixels[index + 2]]
    if (distance(pixel, background) < threshold) {
      pixels[index + 3] = 0
    }
  }

  ctx.putImageData(data, 0, 0)
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not export cutout.'))), 'image/png')
  })
}

export function GearImageManager({
  userId,
  gearItemId = null,
  imageKind = 'item',
  images,
  emptyLabel,
  onCreateImage,
  onUpdateImage,
  onDeleteImage,
}: Props) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const sortedImages = useMemo(
    () => [...images].sort((left, right) => left.sort_order - right.sort_order || left.created_at.localeCompare(right.created_at)),
    [images],
  )

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length) return
    const supabase = createSupabaseBrowserClient()
    setError(null)

    for (const [index, file] of Array.from(files).entries()) {
      const path = `${userId}/${gearItemId ?? 'showcase'}/${Date.now()}-${index}-${slugify(file.name)}`
      const { error: uploadError } = await supabase.storage
        .from('gear-media')
        .upload(path, file, { upsert: false, contentType: file.type || 'image/jpeg' })
      if (uploadError) {
        setError(getGearImageErrorMessage(uploadError, 'Could not upload image.'))
        return
      }
      const { data: urlData } = supabase.storage.from('gear-media').getPublicUrl(path)
      await onCreateImage({
        gear_item_id: gearItemId ?? null,
        image_kind: imageKind,
        storage_path: path,
        public_url: `${urlData.publicUrl}?t=${Date.now()}`,
        sort_order: sortedImages.length + index,
        is_cover: sortedImages.length === 0 && index === 0,
      })
    }
  }

  const setCover = async (imageId: string) => {
    setBusyId(imageId)
    setError(null)
    try {
      for (const image of sortedImages) {
        await onUpdateImage(image.id, { is_cover: image.id === imageId })
      }
    } catch (err: unknown) {
      setError(getGearImageErrorMessage(err, 'Could not set cover.'))
    } finally {
      setBusyId(null)
    }
  }

  const moveImage = async (imageId: string, direction: -1 | 1) => {
    const index = sortedImages.findIndex((image) => image.id === imageId)
    const swapIndex = index + direction
    if (index < 0 || swapIndex < 0 || swapIndex >= sortedImages.length) return

    const current = sortedImages[index]
    const swap = sortedImages[swapIndex]
    setBusyId(imageId)
    setError(null)
    try {
      await onUpdateImage(current.id, { sort_order: swap.sort_order })
      await onUpdateImage(swap.id, { sort_order: current.sort_order })
    } catch (err: unknown) {
      setError(getGearImageErrorMessage(err, 'Could not reorder image.'))
    } finally {
      setBusyId(null)
    }
  }

  const removeBackground = async (image: GearImage) => {
    setBusyId(image.id)
    setError(null)
    try {
      const response = await fetch(image.public_url)
      const blob = await response.blob()
      const file = new File([blob], 'source.png', { type: blob.type || 'image/png' })
      const cutoutBlob = await createBackgroundRemovedBlob(file)
      const cutoutPath = image.storage_path.replace(/(\.[a-z0-9]+)?$/i, '-cutout.png')
      const supabase = createSupabaseBrowserClient()
      const { error: uploadError } = await supabase.storage
        .from('gear-media')
        .upload(cutoutPath, cutoutBlob, { upsert: true, contentType: 'image/png' })
      if (uploadError) throw uploadError
      const { data } = supabase.storage.from('gear-media').getPublicUrl(cutoutPath)
      await onUpdateImage(image.id, {
        cutout_storage_path: cutoutPath,
        cutout_public_url: `${data.publicUrl}?t=${Date.now()}`,
      })
    } catch (err: unknown) {
      setError(getGearImageErrorMessage(err, 'Could not remove background.'))
    } finally {
      setBusyId(null)
    }
  }

  const restoreOriginal = async (image: GearImage) => {
    setBusyId(image.id)
    setError(null)
    try {
      await onUpdateImage(image.id, {
        cutout_storage_path: null,
        cutout_public_url: null,
      })
    } catch (err: unknown) {
      setError(getGearImageErrorMessage(err, 'Could not restore original image.'))
    } finally {
      setBusyId(null)
    }
  }

  const removeImage = async (image: GearImage) => {
    setBusyId(image.id)
    setError(null)
    try {
      const supabase = createSupabaseBrowserClient()
      const paths = [image.storage_path, image.cutout_storage_path].filter((value): value is string => Boolean(value))
      if (paths.length > 0) {
        await supabase.storage.from('gear-media').remove(paths)
      }
      await onDeleteImage(image.id)
    } catch (err: unknown) {
      setError(getGearImageErrorMessage(err, 'Could not remove image.'))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="cursor-pointer">
          <span className="inline-flex rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800">
            Upload image
          </span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(event) => void uploadFiles(event.target.files)}
          />
        </label>
        <span className="text-xs text-slate-400">
          Original and background-removed versions are stored separately.
        </span>
      </div>

      {sortedImages.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-500">
          {emptyLabel}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {sortedImages.map((image, index) => (
            <div key={image.id} className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_12px_28px_-24px_rgba(15,23,42,0.32)]">
              <div className="overflow-hidden rounded-2xl border border-slate-100 bg-slate-50">
                <img
                  src={image.cutout_public_url || image.public_url}
                  alt={image.caption || 'Gear image'}
                  className="h-56 w-full object-contain"
                />
              </div>
              <div className="mt-3 space-y-3">
                <input
                  type="text"
                  defaultValue={image.caption ?? ''}
                  onBlur={(event) => void onUpdateImage(image.id, { caption: event.target.value })}
                  placeholder="Add caption"
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-slate-300 focus:ring-4 focus:ring-slate-100"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void setCover(image.id)}
                    disabled={busyId === image.id}
                    className={`rounded-2xl px-3 py-2 text-xs font-medium ${
                      image.is_cover ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {image.is_cover ? 'Cover image' : 'Set cover'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void moveImage(image.id, -1)}
                    disabled={busyId === image.id || index === 0}
                    className="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-40"
                  >
                    Move up
                  </button>
                  <button
                    type="button"
                    onClick={() => void moveImage(image.id, 1)}
                    disabled={busyId === image.id || index === sortedImages.length - 1}
                    className="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-40"
                  >
                    Move down
                  </button>
                  {!image.cutout_public_url ? (
                    <button
                      type="button"
                      onClick={() => void removeBackground(image)}
                      disabled={busyId === image.id}
                      className="rounded-2xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                    >
                      Remove background
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void restoreOriginal(image)}
                      disabled={busyId === image.id}
                      className="rounded-2xl bg-sky-50 px-3 py-2 text-xs font-medium text-sky-700 hover:bg-sky-100"
                    >
                      Restore original
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void removeImage(image)}
                    disabled={busyId === image.id}
                    className="rounded-2xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-100"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-rose-500">{error}</p>}
    </div>
  )
}
