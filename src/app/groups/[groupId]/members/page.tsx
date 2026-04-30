import { redirect } from 'next/navigation'

interface Props {
  params: Promise<{ groupId: string }>
}

export default async function GroupMembersPage({ params }: Props) {
  const { groupId } = await params
  redirect(`/groups/${groupId}`)
}
