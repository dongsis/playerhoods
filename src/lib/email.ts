import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

// 发送邮件的基础接口
interface SendEmailParams {
  to: string | string[]
  subject: string
  html: string
}

export async function sendEmail({ to, subject, html }: SendEmailParams) {
  // 如果没有配置 API Key，跳过发送（开发环境）
  if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === 're_your_api_key_here') {
    console.log('[Email] Skipped (no API key configured):', { to, subject })
    return { success: true, skipped: true }
  }

  try {
    const { data, error } = await resend.emails.send({
      from: 'PlayerHoods <noreply@playerhoods.com>',
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    })

    if (error) {
      console.error('[Email] Send failed:', error)
      return { success: false, error }
    }

    console.log('[Email] Sent successfully:', data)
    return { success: true, data }
  } catch (err) {
    console.error('[Email] Exception:', err)
    return { success: false, error: err }
  }
}

// 球局成局通知邮件
interface MatchFormationEmailParams {
  recipientEmail: string
  recipientName: string
  matchDate: string      // 格式化后的日期时间
  matchTimeRange: string // 格式化后的时间范围
  venue: string
  gameType: string       // 格式化后的球局类型
  organizerName: string
  matchUrl: string       // 球局详情链接
  participantNames: string[] // 所有上场参与者名单
}

export async function sendMatchFormationEmail(params: MatchFormationEmailParams) {
  const {
    recipientEmail,
    recipientName,
    matchDate,
    matchTimeRange,
    venue,
    gameType,
    organizerName,
    matchUrl,
    participantNames,
  } = params

  const participantList = participantNames.map(name => `<li>${name}</li>`).join('')

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>球局已成局</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
    <h1 style="margin: 0; font-size: 24px;">球局已成局！</h1>
    <p style="margin: 10px 0 0 0; opacity: 0.9;">准备好上场吧</p>
  </div>

  <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 12px 12px;">
    <p style="margin: 0 0 20px 0;">Hi ${recipientName}，</p>

    <p style="margin: 0 0 20px 0;">你参与的球局已成局，以下是详细信息：</p>

    <div style="background: white; border-radius: 8px; padding: 20px; margin-bottom: 20px; border: 1px solid #e5e7eb;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #6b7280; width: 80px;">类型</td>
          <td style="padding: 8px 0; font-weight: 500;">${gameType}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">时间</td>
          <td style="padding: 8px 0; font-weight: 500;">${matchDate}<br><span style="color: #6b7280; font-weight: normal;">${matchTimeRange}</span></td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">地点</td>
          <td style="padding: 8px 0; font-weight: 500;">${venue}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">组织者</td>
          <td style="padding: 8px 0; font-weight: 500;">${organizerName}</td>
        </tr>
      </table>
    </div>

    <div style="background: white; border-radius: 8px; padding: 20px; margin-bottom: 20px; border: 1px solid #e5e7eb;">
      <p style="margin: 0 0 10px 0; font-weight: 500;">上场名单：</p>
      <ul style="margin: 0; padding-left: 20px; color: #374151;">
        ${participantList}
      </ul>
    </div>

    <div style="text-align: center; margin-top: 25px;">
      <a href="${matchUrl}" style="display: inline-block; background: #10b981; color: white; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: 500;">
        查看球局详情
      </a>
    </div>

    <p style="margin: 25px 0 0 0; color: #6b7280; font-size: 14px;">
      祝你打球愉快！<br>
      PlayerHoods 团队
    </p>
  </div>

  <p style="text-align: center; color: #9ca3af; font-size: 12px; margin-top: 20px;">
    此邮件由 PlayerHoods 自动发送，请勿直接回复。
  </p>
</body>
</html>
`

  return sendEmail({
    to: recipientEmail,
    subject: `球局已成局 - ${matchDate} ${gameType}`,
    html,
  })
}

// 批量发送成局通知给所有参与者
export async function sendMatchFormationEmails(
  participants: Array<{ email: string; name: string }>,
  matchInfo: Omit<MatchFormationEmailParams, 'recipientEmail' | 'recipientName'>
) {
  const results = await Promise.allSettled(
    participants.map(p =>
      sendMatchFormationEmail({
        ...matchInfo,
        recipientEmail: p.email,
        recipientName: p.name,
      })
    )
  )

  const successful = results.filter(r => r.status === 'fulfilled').length
  const failed = results.filter(r => r.status === 'rejected').length

  console.log(`[Email] Match formation notifications: ${successful} sent, ${failed} failed`)

  return { successful, failed, total: participants.length }
}
