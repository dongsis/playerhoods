// 用户资料
export interface Profile {
  id: string
  display_name: string | null
  gender: 'female' | 'male' | 'unspecified'
  avatar_url: string | null
  created_at: string
  updated_at: string
}

// 用户设置
export interface UserSettings {
  user_id: string
  email: string
  timezone: string
  daily_match_cap: number
  weekly_match_cap: number
  updated_at: string
}

// 球局类型
export type GameType = 'singles' | 'doubles' | 'practice'

// 双打模式
export type DoublesMode = 'mens' | 'womens' | 'mixed' | 'open'

// 球局状态
export type MatchStatus = 'active' | 'cancelled'

// 确定状态
export type FinalizedStatus = 'tentative' | 'finalized'

// 球局
export interface Match {
  id: string
  organizer_id: string
  status: MatchStatus
  game_type: GameType
  doubles_mode: DoublesMode | null
  court_count: number
  required_count: number
  time_status: FinalizedStatus
  venue_status: FinalizedStatus
  scheduled_at: string | null
  venue: string | null
  duration_minutes: number | null  // 球局时长（分钟）
  gender_target_female: number | null
  gender_target_male: number | null
  created_at: string
  updated_at: string
}

// 球局详情（含派生字段）
export interface MatchDetails extends Match {
  confirmed_count: number
  is_full: boolean
  is_finalized: boolean
  is_formed: boolean  // 是否已成局（confirmed_count >= required_count）
  organizer_name: string | null
}

// 参与者状态
export type ParticipantState = 'pending' | 'confirmed' | 'waitlisted' | 'removed'

// 参与者
export interface Participant {
  id: string
  match_id: string
  user_id: string
  state: ParticipantState
  created_at: string
  updated_at: string
}

// 参与者（含用户信息）
export interface ParticipantWithProfile extends Participant {
  profile: Profile
}

// 参与者状态变更历史
export interface ParticipantHistory {
  id: string
  participant_id: string
  old_state: ParticipantState | null
  new_state: ParticipantState
  changed_at: string
  changed_by: string | null  // 谁触发的变更（组织者或用户自己）
}

// 参与者（含历史记录）
export interface ParticipantWithHistory extends ParticipantWithProfile {
  history: ParticipantHistory[]
}

// 创建球局表单数据
export interface CreateMatchData {
  game_type: GameType
  doubles_mode?: DoublesMode
  court_count: number
  required_count: number
  time_status: FinalizedStatus
  venue_status: FinalizedStatus
  scheduled_at?: string
  venue?: string
  duration_minutes?: number
  gender_target_female?: number
  gender_target_male?: number
}

// ============================================================================
// Group 相关类型
// ============================================================================
// Group 是唯一的人群概念，是 access boundary + action boundary
// 不是社交网络、不是聊天群、不存在好友/关注关系
// 关系只能通过「邀请 + 接受」显式成立

// Group 类型
// direct: 2-4人直约，对等无治理需求
// organized: ≥5人，需要 boundary keeper
export type GroupType = 'direct' | 'organized'

// Group 可见性
// private: 仅成员可见（默认）
// discoverable: 符合条件的用户可发现，需申请加入
// link_accessible: 不公开展示，仅通过链接/邀请码访问
export type GroupVisibility = 'private' | 'discoverable' | 'link_accessible'

// Group 准入策略 (Contract v1: §2.2)
// invite_only: 仅通过邀请加入（direct group 唯一选项）
// organizer_approval: 新人需 boundary keeper 确认（organized group 默认）
// auto_join: 符合条件的用户自动加入（仅 organized group）
export type GroupJoinPolicy = 'invite_only' | 'organizer_approval' | 'auto_join'

// Group 成员状态
// pending: 等待确认（申请加入或被邀请但未接受）
// active: 正式成员
// removed: 已移除（保留记录用于审计）
export type GroupMemberStatus = 'pending' | 'active' | 'removed'

// Group 加入方式
// invited: 被邀请加入
// applied: 主动申请加入
// link: 通过链接加入
// founder: 创建时加入
export type GroupJoinMethod = 'invited' | 'applied' | 'link' | 'founder'

// Group 基础类型
export interface Group {
  id: string
  group_type: GroupType
  name: string | null
  visibility: GroupVisibility
  join_policy: GroupJoinPolicy
  created_by: string
  boundary_keeper_user_id: string | null  // organized: 必填; direct: 必须为 null
  invite_code: string | null
  invite_code_expires_at: string | null
  invite_code_max_uses: number | null
  invite_code_uses: number
  // 可选元数据 (Slice 2.1)
  club: string | null  // 俱乐部/场地上下文
  skill_level: string | null  // 技术水平描述
  created_at: string
  updated_at: string
}

// Group 详情（含派生字段）
export interface GroupDetails extends Group {
  member_count: number
  pending_count: number
  boundary_keeper_name: string | null
}

// Group 成员
export interface GroupMember {
  id: string
  group_id: string
  user_id: string
  status: GroupMemberStatus
  join_method: GroupJoinMethod
  invited_by: string | null
  joined_at: string | null
  created_at: string
  updated_at: string
}

// Group 成员（含用户信息）
export interface GroupMemberWithProfile extends GroupMember {
  profile: Profile
}

// 创建 Group 表单数据
export interface CreateGroupData {
  group_type: GroupType
  name?: string  // organized 必填，direct 可选
  visibility?: GroupVisibility
  join_policy?: GroupJoinPolicy
  // 可选元数据 (Slice 2.1)
  club?: string
  skill_level?: string
}
