
# v1.3 Match Detail — UI-only 状态机对照表（冻结级）
约定：下表只定义 UI 是否展示入口（UI-only）。所有真正写入仍由 RPC 决定成败。
“scope” 一律用 is_user_in_match_scope(match_id, auth.uid()) 判断。

0) 关键布尔量（UI 计算用）

isOrganizer：auth.uid() === match.organizer_id

mp：当前用户在 match_participants 的记录（若无则为 null）

isActiveParticipant：mp && mp.status !== 'removed'

isPending：mp?.status === 'pending'

isRemoved：mp?.status === 'removed'

hasUserAccepted：mp?.user_accepted_at != null

hasOrgApproved：mp?.org_approved_at != null

isConfirmedDerived：mp && mp.status !== 'removed' && hasUserAccepted && hasOrgApproved

inScope：is_user_in_match_scope(match.id, auth.uid())（必须走现有 helper/RPC）

1) 非参与者（mp == null）
UI 入口	显示条件	调用 RPC	备注
Request Join	!isActiveParticipant && inScope	rpc_match_request_join(match_id)	v1.3：Request 只由 scope 决定；不看 admission_mode
（可选）说明文案	!inScope	无	显示 “Not in scope”/“Need invite from organizer”

v1.3 允许：不在 scope 的用户只能通过 ORG invite（或分享链接后仍需 scope 成立——你的冻结语义里 request 面向群）

2) Pending participant（mp.status == 'pending'）
2.1 用户侧动作
UI 入口	显示条件	调用 RPC	备注
Accept	isPending && !hasUserAccepted && mp.join_method === 'invited'	rpc_match_accept_invite(match_id)	传统 invite
Accept	isPending && !hasUserAccepted && mp.join_method === 'requested' && mp.nominated_by != null	rpc_match_accept_invite(match_id)（复用）	v1.3：nominate 也走用户显式 accept
（不显示 Accept）	isPending && mp.join_method === 'requested' && mp.nominated_by == null	无	self-request 已默认 user accepted，不应有 accept 按钮
2.2 退出/撤回（用户）
UI 入口	显示条件	调用 RPC	备注
Withdraw	isPending	rpc_match_user_withdraw(match_id)	v1.3：统一 withdraw（不要用旧 decline/leave 名称）
2.3 ORG / 管理动作
UI 入口	显示条件	调用 RPC	备注
Approve	isOrganizer && isPending && hasUserAccepted	rpc_match_org_approve_participant(match_participant_id)	v1.3：org 可先后并行，但 approve 时必须允许“用户未 accept 时也可先 approve”吗？→ 若你冻结允许并行，则这里可放宽为 true
Remove	isOrganizer && isPending	rpc_match_remove_participant(match_participant_id)	removed 立即生效

你 v1.3 已裁决“确认顺序可并行”，因此 Approve 的显示条件建议：

显示：isOrganizer && isPending

RPC 内保证幂等 + reconcile
（UI 不强依赖 hasUserAccepted）

3) Confirmed participant（派生已确认：isConfirmedDerived）
UI 入口	显示条件	调用 RPC	备注
Leave match	isConfirmedDerived	rpc_match_user_withdraw(match_id)	v1.3：leave 也统一为 withdraw
（可选）Nominate user	isConfirmedDerived && match.can_participants_nominate === true	rpc_match_nominate_user(match_id, user_id)	你已裁决 nominate 默认关闭
（可选）Add guest	isConfirmedDerived && match.can_participants_add_guests === true	rpc_match_add_guest_participant(...)	需 ORG approve
4) Removed（mp.status == 'removed'）
UI 入口	显示条件	调用 RPC	备注
Rejoin (Waiting for organizer)	isRemoved && mp.removed_by != auth.uid()	无	v1.3：ORG remove 后必须 ORG reactivate，用户只能等待
Rejoin	isRemoved && mp.removed_by == auth.uid()	rpc_match_rejoin(match_id)（如你实现）或走 request_join	仅适用于 self-withdraw 的再加入策略

若你最终裁决 match 层面不允许 user 自助 rejoin（全部要求 ORG reactivate），那就把第二行删掉即可。

5) Claude 必须做的代码层迁移指令（一句话版）

删除/停用任何 admission_mode / admissionMode 判断

Request Join 的显示与否只依赖：inScope && !isActiveParticipant

Accept 的显示与否只依赖：mp.join_method + nominated_by + user_accepted_at