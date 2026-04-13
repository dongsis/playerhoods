playerhoods AI Capability Layer (Unified) v1
1. 目标

AI 能力层的目标不是做一个聊天机器人，而是让 playerhoods.com 具备一种新的操作方式：

用户可以通过：

对话

语音

截图

邮件

联系人

外部信息

直接完成平台操作。

AI 负责：

理解

提取

组织

生成草案

用户负责：

最终确认

执行

核心理念：

AI 提案 + 人确认

2. AI 能力总体架构

平台 AI 能力分为两大类：

A. Operational AI（操作型 AI）

解决：

如何更容易创建比赛、导入联系人、解析邮件、组织信息

包括：

Match creation assistant

Contact import parser

Screenshot / email parser

Booking request assistant

Participant notification generator

B. Reflective AI（反思型 AI）

解决：

如何帮助用户复盘比赛、记录成长、提供建议

包括：

Post-play reflection dialogue

Emotional support

Training suggestion

Recovery reminder

Reflection summary

3. Conversational Match Builder
功能

用户通过语音或文字描述比赛：

示例：

“帮我约周三晚上 7 点女双，ORC，4个人。”

AI 自动生成：

match_draft

需要识别的字段

club

date

time

sport

format

participants

level preference

booking requirement

输出对象

match_draft

字段：

draft_id

venue_id

proposed_date

proposed_time

format

participant_candidates

booking_required

用户确认

用户确认后：

Create Match
4. Contact Import & Invite Circle Builder

用户可以通过：

通讯簿导入

选择联系人 → 加入 Invite Circle

截图导入

上传：

短信截图

邮件名单

群聊截图

AI 识别：

name

email

phone

文本粘贴

粘贴名单：

Nancy
Shelley
Jen
Jacky

AI 自动识别。

5. Screenshot / Email Parser

解析：

club booking email

booking screenshot

event notification

result screenshot

提取：

date

time

court

booking reference

输出：

parse_result

6. Booking Request Composer

根据 match draft 自动生成：

订场邮件草稿。

示例：

Subject:
Court booking request

Body:
Hello ORC,

We would like to reserve a court:

Date: May 15
Time: 7–9 pm
Players: 4
Format: Doubles

Thank you.
7. Venue Reply Parser

解析俱乐部回复：

示例：

Court 3 confirmed
7–9 pm
Booking ref AB12345

AI 提取：

court

time

booking reference

生成：

booking_record

8. Participant Notification Generator

当 booking 确认后：

AI 自动生成通知：

ORC confirmed our court.

Court 3
7–9 pm
Players: Nancy, Shelley, Jen, Jacky

用户确认后发送。

9. Post-Play Reflection Coach

比赛结束后触发：

Would you like to reflect on this match?
对话流程
1 情绪

“今天打得开心吗？”

2 优点

“今天哪些球打得比较好？”

3 不足

“哪些地方觉得还可以改进？”

4 配合

“和搭档配合怎么样？”

5 身体状态

“身体有没有哪里特别紧？”

6 下一步

“下次最想改进什么？”

10. Reflection Summary

对话结束后生成：

Match Reflection

字段：

mood

self_rating

strengths

weaknesses

partner_chemistry

recovery_note

next_focus

示例：

{
 "mood": "mixed",
 "self_rating": 7,
 "strengths": ["serve placement"],
 "weaknesses": ["backhand timing"],
 "partner_chemistry": "good",
 "recovery_note": "stretch shoulders",
 "next_focus": ["earlier preparation"]
}
11. AI Safety Layer

所有 AI 操作必须经过：

用户确认

关键动作：

create match

send invites

booking request

notification broadcast

contact import

12. 数据对象

核心对象：

match_draft

contact_import_batch

parse_job

booking_record

participant_notification_draft

match_reflection

ai_action_draft

ai_action_log

13. 实施阶段
Phase 1

Match draft conversation

Screenshot contact import

Booking email parser

Phase 2

Booking request assistant

Participant notification draft

Reflection dialogue

Phase 3

Voice interface

Calendar sync

Gmail / Outlook connection

14. 一句话总结

AI 能力层的目标不是聊天，而是：

把现实世界的语言、截图、邮件、联系人等输入，转成 playerhoods 的结构化操作与成长记录。

如果你愿意，我可以帮你 再做一件非常重要的事：

把这份文档升级成 真正可开发的版本，包括：

完整 数据库 schema

AI function schema

agent workflow

前端页面结构

也就是把它变成：

playerhoods_ai_system_architecture_v1.md