import {
  acceptMatchIdentityLinkAction,
  cancelMatchWithReasonAction,
  keepSeparateMatchIdentityLinkAction,
  removeMatchParticipantAction,
  postMatchMessageAction,
  saveMatchLineupAction,
  updateMatchCourtPlanAction,
  updateMatchDetailsAction,
  updateMatchOrganizerNoteAction,
} from './match-detail.actions'
import { MatchDetailPageView } from './MatchDetailPageView'
import { loadMatchDetailPageData } from './match-detail.loader'
import { buildMatchDetailPageViewModel } from './match-detail.view-model'

interface Props {
  params: Promise<{ matchId: string }>
}

export default async function MatchDetailPage({ params }: Props) {
  const { matchId } = await params
  const loaderData = await loadMatchDetailPageData(matchId)
  const viewModel = buildMatchDetailPageViewModel(loaderData)
  const matchSnapshot = {
    id: viewModel.match.id,
    game_type: viewModel.match.game_type,
    match_date: viewModel.match.match_date,
    start_time: viewModel.match.start_time,
  }

  return (
    <MatchDetailPageView
      viewModel={viewModel}
      onUpdateMatchDetails={updateMatchDetailsAction.bind(null, matchId, viewModel.venueName, matchSnapshot)}
      onUpdateOrganizerNote={updateMatchOrganizerNoteAction.bind(null, matchId)}
      onPostMessage={postMatchMessageAction.bind(null, matchId)}
      onSaveLineup={saveMatchLineupAction.bind(null, matchId)}
      onCancelMatch={cancelMatchWithReasonAction.bind(null, matchId)}
      onSaveCourtPlan={updateMatchCourtPlanAction.bind(null, matchId)}
      onRemoveParticipant={removeMatchParticipantAction.bind(null, matchId)}
      onAcceptIdentityLink={acceptMatchIdentityLinkAction.bind(null, matchId)}
      onKeepSeparateIdentityLink={keepSeparateMatchIdentityLinkAction.bind(null, matchId)}
    />
  )
}
