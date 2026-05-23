export const LEGAL_AGREEMENT_VERSION = '2026-05-05'

export const LEGAL_EFFECTIVE_DATE = LEGAL_AGREEMENT_VERSION

export const LEGAL_WEBSITE = 'www.playerhoods.com'

export const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || 'support@playerhoods.com'

export type LegalSection = {
  number: number
  title: string
  paragraphs: string[]
  bullets?: string[]
}

export const LEGAL_DOCUMENT_INTRO = [
  'Welcome to PlayerHoods. PlayerHoods is a sports match coordination platform that helps users organize games, invite players, manage match participation, communicate match details, and expand their playing network through clubs, groups, saved players, and contact players.',
  'By creating an account, using the platform, accepting an invitation, or participating in a match through PlayerHoods, you agree to these Terms of Use and Privacy Notice.',
]

export const LEGAL_DOCUMENT_SECTIONS: LegalSection[] = [
  {
    number: 1,
    title: 'What PlayerHoods Does',
    paragraphs: [
      'PlayerHoods helps users coordinate sports activities, including but not limited to tennis, pickleball, badminton, and other supported sports.',
      'The platform may allow users to:',
      'PlayerHoods is a coordination tool. Unless expressly stated otherwise, PlayerHoods does not operate sports venues, does not guarantee court availability, does not provide court booking services, and does not supervise matches or participants.',
    ],
    bullets: [
      'create and manage sports matches;',
      'invite registered users or non-registered contact players;',
      "use I'd like to play for eligible Open to Join matches;",
      'communicate match details through notes, match chat, emails, SMS, or other notifications;',
      'save players to a personal playing network;',
      'discover club, venue, or group-related players where applicable;',
      'manage participation status, confirmations, and match updates.',
    ],
  },
  {
    number: 2,
    title: 'Age Requirement',
    paragraphs: [
      'PlayerHoods is intended for users who are 18 years of age or older.',
      'By creating an account, using PlayerHoods, accepting an invitation, or participating in a match through PlayerHoods, you confirm that you are at least 18 years old and have the legal capacity to agree to these Terms of Use and Privacy Notice.',
      'If you are under 18 years old, you may not create an account or use PlayerHoods unless PlayerHoods later provides a specific parent, guardian, club, or supervised youth participation process.',
      'PlayerHoods may suspend or remove an account if we believe the user is under 18 or has provided false age-related information.',
    ],
  },
  {
    number: 3,
    title: 'User Accounts and Accuracy of Information',
    paragraphs: [
      'You agree to provide accurate and reasonably current information when using PlayerHoods, including your name, contact details, sports preferences, club or venue relationships, and match availability where applicable.',
      'You are responsible for maintaining the confidentiality of your account and for activities performed through your account.',
      'You agree not to impersonate another person, create misleading profiles, or submit false information about your identity, contact information, playing status, skill level, club membership, venue relationship, or relationship to another player.',
    ],
  },
  {
    number: 4,
    title: 'Contact Players and Non-Registered Participants',
    paragraphs: [
      'PlayerHoods may allow users to add "contact players." A contact player is someone who may not yet have a registered PlayerHoods account but whose name, email address, phone number, or other limited contact information is entered by a registered user for the purpose of inviting or coordinating sports matches.',
      'By adding a contact player, you confirm that:',
      'PlayerHoods will use contact player information only for platform-related purposes such as match invitations, confirmations, updates, participation management, and account linking if the contact player later chooses to create an account.',
    ],
    bullets: [
      'you know the contact player or have a reasonable basis to contact them for sports coordination;',
      'the information you enter is accurate to the best of your knowledge;',
      'you will not add people for harassment, spam, deception, advertising, or unrelated purposes;',
      'you will not pretend to act on behalf of a contact player without permission or a reasonable relationship;',
      'you understand that PlayerHoods may send match-related invitations or notifications to that contact player on your behalf.',
    ],
  },
  {
    number: 5,
    title: 'Invitations, Notifications, Emails, and SMS',
    paragraphs: [
      'PlayerHoods may send emails, SMS messages, or other notifications related to:',
      'Some messages are sent because a user invited another person or updated a match. In those cases, PlayerHoods acts as the platform delivering the user-initiated communication.',
      'You agree not to use PlayerHoods invitations, emails, SMS, or notifications for spam, mass marketing, harassment, deception, manipulation, or any unlawful or unrelated purpose.',
      'PlayerHoods may provide unsubscribe, opt-out, block, or notification preference tools where appropriate. However, some essential service messages may still be sent when necessary to operate the platform, maintain account security, or complete a user-initiated match coordination action.',
    ],
    bullets: [
      'match invitations;',
      'match confirmation or cancellation;',
      'participant acceptance or withdrawal;',
      'host approvals;',
      'match notes or match chat updates;',
      'account access, security, or service messages;',
      'other actions initiated by users through the platform.',
    ],
  },
  {
    number: 6,
    title: 'Acceptable Use',
    paragraphs: [
      'You agree not to use PlayerHoods to:',
      'PlayerHoods may suspend, restrict, remove, or terminate access if we believe a user is misusing the platform, misleading others, creating risk for other users, or violating these Terms.',
    ],
    bullets: [
      'harass, threaten, abuse, discriminate against, intimidate, or harm another person;',
      'deceive, trick, mislead, manipulate, exploit, or take unfair advantage of another person;',
      'impersonate another person or misrepresent your identity, contact information, skill level, club affiliation, venue relationship, relationship to another player, or authority to organize or manage a match;',
      'create fake, misleading, duplicate, or unauthorized profiles, accounts, contact players, invitations, match listings, venue information, club information, or group information;',
      'invite, add, contact, or message people without a reasonable personal, sports, club, venue, or match-related basis;',
      'send spam, unsolicited advertising, mass invitations, misleading invitations, or unrelated promotional messages;',
      'pressure, coerce, embarrass, or manipulate another user into joining, declining, confirming, withdrawing from, or changing a match;',
      'collect, copy, scrape, export, or use information about other users or contact players for unrelated purposes;',
      'interfere with the operation, security, availability, or performance of the platform;',
      'upload malicious code, attempt unauthorized access, bypass security controls, or test system vulnerabilities without permission;',
      'use the platform for unlawful, fraudulent, harmful, abusive, or unrelated activity.',
    ],
  },
  {
    number: 7,
    title: 'User Content',
    paragraphs: [
      'Users may submit content such as profile information, match notes, chat messages, invitations, venue notes, group information, club information, and other platform-related content.',
      'You are responsible for the content you submit.',
      'You grant PlayerHoods a limited permission to use, display, transmit, store, and process your content only as needed to operate, improve, secure, and provide the platform.',
      'You must not submit content that is unlawful, abusive, misleading, deceptive, defamatory, invasive of privacy, discriminatory, or unrelated to the purpose of the platform.',
      'PlayerHoods may remove, restrict, or hide user content if we believe it violates these Terms, creates risk, or harms the platform or other users.',
    ],
  },
  {
    number: 8,
    title: 'Match Participation and User Responsibility',
    paragraphs: [
      'Users are responsible for their own decisions to create, join, accept, decline, attend, or withdraw from matches.',
      'PlayerHoods does not guarantee:',
      'Users should use their own judgment when meeting others, sharing information, attending venues, or participating in sports activities.',
    ],
    bullets: [
      'that a match will occur;',
      'that a court will be available;',
      'that participants will attend;',
      "that other users' identities, skill levels, availability, or intentions are accurate;",
      'that any venue, club, or facility will allow access;',
      'that a match will be safe, suitable, or conflict-free.',
    ],
  },
  {
    number: 9,
    title: 'Safety and Sports Risk',
    paragraphs: [
      'Sports activities involve physical risk, including injury, collision, overexertion, weather-related risk, facility-related risk, equipment-related risk, and other unexpected events.',
      'By using PlayerHoods to arrange or join a match, you understand that PlayerHoods is not responsible for injuries, accidents, property loss, disputes, venue conditions, weather conditions, equipment issues, or participant conduct arising from offline sports activities.',
      'You are responsible for assessing your own health, fitness, skill level, equipment, and ability to participate safely.',
      'You should seek medical advice where appropriate before participating in sports activities.',
    ],
  },
  {
    number: 10,
    title: 'Clubs, Venues, and Third Parties',
    paragraphs: [
      'PlayerHoods may display information about clubs, venues, courts, groups, or other third-party locations.',
      'Unless expressly stated, PlayerHoods does not own, operate, manage, represent, or control those clubs or venues.',
      'Venue details, court availability, fees, access rules, membership requirements, guest policies, schedules, and facility conditions may change. Users should verify important details directly with the venue, club, or host.',
      'PlayerHoods is not responsible for third-party websites, services, venues, clubs, payment systems, communications, policies, or conduct outside the platform.',
    ],
  },
  {
    number: 11,
    title: 'Privacy Commitment',
    paragraphs: [
      'PlayerHoods respects user privacy and is designed to use personal information only for legitimate platform purposes.',
      'We do not sell your personal information.',
      'We do not intentionally disclose your personal information to unrelated third parties for their independent marketing purposes.',
      'We collect and use personal information only as reasonably necessary to provide, secure, improve, and support PlayerHoods.',
    ],
  },
  {
    number: 12,
    title: 'Information We May Collect',
    paragraphs: [
      'Depending on how you use PlayerHoods, we may collect:',
      'We try to collect only information that is reasonably needed for the platform.',
    ],
    bullets: [
      'name and display name;',
      'email address and phone number;',
      'login and account information;',
      'age confirmation status;',
      'sports preferences;',
      'gender or match-related preference information, if you choose to provide it;',
      'club, venue, city, or group relationships you choose to provide;',
      'saved players and contact player information;',
      'match participation information;',
      'invitation and confirmation status;',
      'messages, notes, and match-related communications;',
      'technical information such as device, browser, IP address, usage logs, and security logs.',
    ],
  },
  {
    number: 13,
    title: 'How We Use Information',
    paragraphs: [
      'We may use information to:',
    ],
    bullets: [
      'create and manage user accounts;',
      'confirm eligibility to use the platform;',
      'help users create, invite, join, confirm, and manage matches;',
      'send match-related emails, SMS, and notifications;',
      'show relevant players, groups, clubs, venues, or matches;',
      'support saved players and contact players;',
      'support account linking if a contact player later creates an account;',
      'prevent misuse, spam, fraud, deception, harassment, or security incidents;',
      'troubleshoot, maintain, and improve the platform;',
      'comply with legal obligations.',
    ],
  },
  {
    number: 14,
    title: 'How Information May Be Shared Within the Platform',
    paragraphs: [
      'Some information may be visible to other users when needed for match coordination.',
      'For example:',
      'PlayerHoods aims to limit visibility to what is useful and relevant for the platform purpose.',
    ],
    bullets: [
      'your display name may appear to people in the same match, group, club, venue, or invitation flow;',
      'your match participation status may be visible to the match host and relevant participants;',
      'your messages or notes may be visible to intended recipients;',
      'contact player details may be visible to the user who added that contact and, where needed, to the host or match coordination flow;',
      'club, venue, city, or group-related information may be used to help determine relevant match visibility, invitations, player discovery, and request-to-join options.',
    ],
  },
  {
    number: 15,
    title: 'Service Providers',
    paragraphs: [
      'PlayerHoods may use trusted service providers for hosting, authentication, database storage, email delivery, SMS delivery, analytics, security, logging, customer support, or other technical operations.',
      'These service providers may process information only as needed to provide services to PlayerHoods.',
    ],
  },
  {
    number: 16,
    title: 'Data Security',
    paragraphs: [
      'We use reasonable technical and organizational measures to protect personal information against unauthorized access, loss, misuse, alteration, or disclosure.',
      'However, no online service can guarantee perfect security. Users should also protect their own login credentials and avoid sharing sensitive information unnecessarily.',
    ],
  },
  {
    number: 17,
    title: 'Data Retention',
    paragraphs: [
      'PlayerHoods keeps personal information only as long as reasonably necessary for platform operation, account management, legal compliance, security, dispute prevention, backup, and legitimate business purposes.',
      'Some information may remain in backups, logs, historical match records, or security records for a limited period even after deletion or account closure, where reasonably necessary.',
    ],
  },
  {
    number: 18,
    title: 'Access, Correction, and Deletion Requests',
    paragraphs: [
      'You may request access to, correction of, or deletion of your personal information, subject to reasonable identity verification, technical limitations, legal requirements, and legitimate platform needs.',
      `To make a privacy request, contact us at: ${SUPPORT_EMAIL}`,
    ],
  },
  {
    number: 19,
    title: 'Legal Agreement Presentation',
    paragraphs: [
      'PlayerHoods may ask users to confirm these Terms and Privacy Notice during account creation, onboarding, or when material changes are made.',
      'To keep the user experience simple, PlayerHoods may present required legal confirmations in one unified agreement step instead of repeatedly interrupting users during normal match coordination flows.',
      `After confirmation, users may continue to access these Terms and Privacy Notice through links on ${LEGAL_WEBSITE}.`,
    ],
  },
  {
    number: 20,
    title: 'Account Suspension or Termination',
    paragraphs: [
      'PlayerHoods may suspend, restrict, remove, or terminate access if we believe that:',
      'You may stop using PlayerHoods at any time.',
    ],
    bullets: [
      'you violated these Terms;',
      'you deceived, misled, manipulated, harassed, or harmed another user;',
      "you misused another person's information;",
      'your use creates risk to other users or the platform;',
      'your account is being misused;',
      'continued access may create legal, security, privacy, safety, or operational risk.',
    ],
  },
  {
    number: 21,
    title: 'Platform Availability and Changes',
    paragraphs: [
      'PlayerHoods may change, suspend, remove, or update features at any time.',
      'We do not guarantee that the platform will always be available, uninterrupted, error-free, secure, or compatible with every device or browser.',
    ],
  },
  {
    number: 22,
    title: 'Disclaimer of Warranties',
    paragraphs: [
      'PlayerHoods is provided on an "as is" and "as available" basis.',
      'To the fullest extent permitted by law, PlayerHoods disclaims warranties of any kind, whether express, implied, or statutory, including warranties of accuracy, reliability, fitness for a particular purpose, availability, security, non-infringement, and suitability for any particular sports activity, match, venue, club, or user interaction.',
    ],
  },
  {
    number: 23,
    title: 'Limitation of Liability',
    paragraphs: [
      'To the fullest extent permitted by law, PlayerHoods and its owners, operators, employees, contractors, agents, affiliates, and service providers will not be liable for indirect, incidental, special, consequential, punitive, or exemplary damages, or for loss of data, profits, goodwill, opportunities, participation, or reputation, arising from or related to your use of the platform.',
      'PlayerHoods is not responsible for offline conduct, sports injuries, venue disputes, user disagreements, missed matches, inaccurate user-submitted information, deceptive user conduct, misleading invitations, fake profiles, unauthorized contact entries, or third-party services.',
      "Where liability cannot be excluded under applicable law, PlayerHoods' liability will be limited to the maximum extent permitted by law.",
    ],
  },
  {
    number: 24,
    title: 'Indemnity',
    paragraphs: [
      'You agree to indemnify and hold harmless PlayerHoods and its owners, operators, employees, contractors, agents, affiliates, and service providers from claims, losses, damages, liabilities, costs, and expenses arising from:',
    ],
    bullets: [
      'your misuse of the platform;',
      'your violation of these Terms;',
      'your user content;',
      'your invitations or communications sent through the platform;',
      "your deception, misrepresentation, impersonation, harassment, or misuse of another person's information;",
      "your violation of another person's rights;",
      'your offline conduct related to matches arranged through PlayerHoods.',
    ],
  },
  {
    number: 25,
    title: 'Governing Law',
    paragraphs: [
      'These Terms are governed by the laws of the Province of Ontario and the applicable laws of Canada.',
      'Any dispute will be handled in the courts or appropriate legal forums located in Ontario, unless applicable law requires otherwise.',
    ],
  },
  {
    number: 26,
    title: 'Changes to These Terms',
    paragraphs: [
      'We may update these Terms and Privacy Notice from time to time.',
      'If changes are material, we may notify users through the platform, by email, or by other reasonable means.',
      'Continued use of PlayerHoods after changes take effect means you accept the updated Terms.',
    ],
  },
  {
    number: 27,
    title: 'Contact',
    paragraphs: [
      'For questions about these Terms, privacy, safety, or account issues, contact:',
      'PlayerHoods',
      `Website: ${LEGAL_WEBSITE}`,
      `Email: ${SUPPORT_EMAIL}`,
    ],
  },
]

export const ONBOARDING_AGREEMENT_TITLE = 'Before you start using PlayerHoods'

export const ONBOARDING_AGREEMENT_INTRO =
  'PlayerHoods helps people coordinate sports matches. Please use it honestly and responsibly. You are responsible for the people you invite, the information you enter, and your own decisions to join or attend matches.'

export const ONBOARDING_CHECKBOXES = [
  'I confirm that I am at least 18 years old.',
  'I agree to the PlayerHoods Terms of Use and Privacy Notice.',
  "I agree to use PlayerHoods honestly and responsibly, and I will not mislead, deceive, impersonate, harass, or misuse another person's information.",
] as const
