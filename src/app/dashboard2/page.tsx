import { loadDashboardPageData } from '../dashboard/dashboard.loader'
import { buildDashboardPageViewModel } from '../dashboard/dashboard.view-model'
import { Dashboard2PageView } from './Dashboard2PageView'

export default async function Dashboard2Page() {
  const loaderData = await loadDashboardPageData()
  const viewModel = buildDashboardPageViewModel(loaderData)

  return <Dashboard2PageView viewModel={viewModel} />
}
