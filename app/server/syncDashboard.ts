import { createServerFn } from '@tanstack/react-start'

export const getSyncDashboardData = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { loadSyncDashboardData } = await import('../../src/sync/dashboardData.ts')

    return await loadSyncDashboardData({
      allowDemo: process.env.PROOFMARK_DEMO === '1',
      allowUnconfigured: true,
    })
  },
)
