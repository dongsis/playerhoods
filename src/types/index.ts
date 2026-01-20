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
  gender_target_female?: number
  gender_target_male?: number
}
