'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import {
  createGroupFileResource,
  createGroupLinkResource,
  deleteGroupResource,
  postGroupMessage,
  setGroupResourceArchived,
  setGroupResourcePinned,
  updateGroup,
} from '@/lib/api/groups'
import type { GroupResourceTag } from '@/lib/types/database'

function revalidateGroupSurfaces(groupId: string) {
  revalidatePath(`/groups/${groupId}`)
  revalidatePath('/groups')
  revalidatePath('/dashboard')
}

export async function postGroupMessageAction(groupId: string, body: string) {
  const supabase = await createSupabaseServerClient()
  const user = await getUser()
  if (!user) {
    throw new Error('not_authenticated')
  }

  await postGroupMessage(supabase, groupId, user.id, body)
  revalidateGroupSurfaces(groupId)
}

export async function createGroupLinkResourceAction(
  groupId: string,
  data: {
    title: string
    tag: GroupResourceTag
    link_url: string
  },
) {
  const supabase = await createSupabaseServerClient()
  const user = await getUser()
  if (!user) {
    throw new Error('not_authenticated')
  }

  await createGroupLinkResource(supabase, groupId, user.id, data)
  revalidateGroupSurfaces(groupId)
}

export async function createGroupFileResourceAction(
  groupId: string,
  data: {
    title: string
    tag: GroupResourceTag
    storage_bucket: string
    storage_path: string
    public_url: string
    mime_type: string | null
    byte_size: number | null
  },
) {
  const supabase = await createSupabaseServerClient()
  const user = await getUser()
  if (!user) {
    throw new Error('not_authenticated')
  }

  await createGroupFileResource(supabase, groupId, user.id, data)
  revalidateGroupSurfaces(groupId)
}

export async function setGroupResourcePinnedAction(groupId: string, resourceId: string, isPinned: boolean) {
  const supabase = await createSupabaseServerClient()
  await setGroupResourcePinned(supabase, resourceId, isPinned)
  revalidateGroupSurfaces(groupId)
}

export async function setGroupResourceArchivedAction(groupId: string, resourceId: string, archived: boolean) {
  const supabase = await createSupabaseServerClient()
  await setGroupResourceArchived(supabase, resourceId, archived)
  revalidateGroupSurfaces(groupId)
}

export async function deleteGroupResourceAction(groupId: string, resourceId: string) {
  const supabase = await createSupabaseServerClient()
  await deleteGroupResource(supabase, resourceId)
  revalidateGroupSurfaces(groupId)
}

export async function updateGroupSettingsAction(
  groupId: string,
  data: {
    name: string
    description?: string | null
    primary_sport_id?: number | null
  },
) {
  const supabase = await createSupabaseServerClient()
  await updateGroup(supabase, groupId, data)
  revalidateGroupSurfaces(groupId)
}
