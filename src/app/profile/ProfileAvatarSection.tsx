'use client'

import { useRouter } from 'next/navigation'
import { AvatarUpload } from '@/app/dashboard/AvatarUpload'

interface Props {
  userId: string
  currentAvatarUrl: string | null
  onAvatarSaved: () => Promise<void>
}

export function ProfileAvatarSection({ userId, currentAvatarUrl, onAvatarSaved }: Props) {
  const router = useRouter()

  const handleSaved = async () => {
    await onAvatarSaved()
    router.refresh()
  }

  return (
    <AvatarUpload
      userId={userId}
      currentAvatarUrl={currentAvatarUrl}
      onSaved={handleSaved}
    />
  )
}
