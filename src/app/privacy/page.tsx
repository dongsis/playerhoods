import { LegalDocumentPage } from '@/app/components/LegalDocumentPage'

export default function PrivacyPage() {
  return (
    <LegalDocumentPage
      pageTitle="Privacy Notice"
      subtitle="This page includes the full combined PlayerHoods legal notice, with privacy-specific commitments and data handling details beginning at Section 11."
      focusPrivacy
    />
  )
}
