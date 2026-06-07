import { createFileRoute, Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { MaskingRulesTable } from '../components/MaskingRulesTable'
import { getSyncDashboardData } from '../server/syncDashboard'
import type { SyncExecution } from '../../src/sync/evidence.ts'

export const Route = createFileRoute('/dashboard')({
  component: DashboardRoute,
  loader: async () => await getSyncDashboardData(),
})

function DashboardRoute() {
  const data = Route.useLoaderData()

  return (
    <DashboardShell
      navigationCounts={data.navigationCounts}
      workspace={data.workspace}
    >
      <DashboardIndex />
    </DashboardShell>
  )
}

function DashboardShell({
  children,
  navigationCounts,
  workspace,
}: {
  children: ReactNode
  navigationCounts: {
    projects: number
    rules: number
    logs: number
  }
  workspace: {
    name: string
    detail: string
  }
}) {
  const navigation = [
    { label: 'Projects', href: '#projects', count: String(navigationCounts.projects) },
    { label: 'Rules', href: '#rules', count: String(navigationCounts.rules) },
    { label: 'Logs', href: '#logs', count: String(navigationCounts.logs) },
  ] as const

  return (
    <div className="min-h-screen bg-neutral-950">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col lg:flex-row">
        <aside className="border-b border-neutral-800 bg-neutral-950/95 px-4 py-3 lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:border-b-0 lg:border-r lg:px-5 lg:py-5">
          <div className="flex items-center justify-between gap-3 lg:block">
            <Link
              to="/"
              className="group flex items-center gap-3"
              activeOptions={{ exact: true }}
            >
              <span className="grid size-9 place-items-center rounded-md border border-teal-500/40 bg-teal-500/10 font-mono text-sm font-semibold text-teal-200">
                pm
              </span>
              <span>
                <span className="block text-sm font-semibold tracking-wide text-neutral-50">
                  proofmark
                </span>
                <span className="block text-xs text-neutral-500">
                  Control Plane
                </span>
              </span>
            </Link>

            <div className="hidden rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-200 lg:mt-5 lg:inline-flex">
              synced
            </div>
          </div>

          <nav className="mt-3 flex gap-1 overflow-x-auto lg:mt-8 lg:block lg:space-y-1 lg:overflow-visible">
            {navigation.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="flex min-w-28 items-center justify-between gap-3 rounded-md border border-transparent px-3 py-2 text-sm font-medium text-neutral-400 transition hover:border-neutral-800 hover:bg-neutral-900 hover:text-neutral-100 lg:min-w-0"
              >
                <span>{item.label}</span>
                <span className="rounded border border-neutral-800 bg-neutral-900 px-1.5 py-0.5 font-mono text-[11px] text-neutral-500">
                  {item.count}
                </span>
              </a>
            ))}
          </nav>

          <div className="mt-8 hidden border-t border-neutral-800 pt-5 lg:block">
            <div className="text-xs uppercase tracking-[0.18em] text-neutral-600">
              Workspace
            </div>
            <div className="mt-3 rounded-md border border-neutral-800 bg-neutral-900/60 px-3 py-3">
              <div className="text-sm font-medium text-neutral-200">
                {workspace.name}
              </div>
              <div className="mt-1 font-mono text-xs text-neutral-500">
                {workspace.detail}
              </div>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <main className="min-h-screen px-4 py-5 sm:px-6 lg:px-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}

function DashboardIndex() {
  const {
    syncExecutions,
    projectSummary,
    latestSync,
    dryRunEvidence,
    certificate,
    dataSource,
  } = Route.useLoaderData()

  return (
    <div className="mx-auto w-full max-w-7xl">
      <header className="flex flex-col gap-4 border-b border-neutral-800 pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-teal-300">
            dashboard
          </div>
          <h1 className="mt-2 text-2xl font-semibold text-neutral-50">
            Sync Control
          </h1>
        </div>
        <div className="flex flex-wrap gap-2 font-mono text-xs text-neutral-400">
          <span className="rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-1.5">
            latest {latestSync.finishedAt}
          </span>
          <span
            className={`rounded-md border px-2.5 py-1.5 ${
              dataSource.kind === 'postgres'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                : dataSource.kind === 'demo'
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                  : 'border-neutral-800 bg-neutral-900 text-neutral-400'
            }`}
          >
            {dataSource.label}
          </span>
          <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-emerald-200">
            {latestSync.rowsScrubbedLabel} rows scrubbed
          </span>
        </div>
      </header>

      <section
        id="projects"
        className="grid gap-3 py-5 sm:grid-cols-2 xl:grid-cols-4"
      >
        {projectSummary.map((item) => (
          <article
            key={item.label}
            className="rounded-md border border-neutral-800 bg-neutral-900/70 px-4 py-4"
          >
            <div className="text-xs font-medium uppercase tracking-[0.16em] text-neutral-500">
              {item.label}
            </div>
            <div className={`mt-3 text-2xl font-semibold ${item.tone}`}>
              {item.value}
            </div>
          </article>
        ))}
      </section>

      <section id="rules" className="pb-5">
        <MaskingRulesTable />
      </section>

      <div className="grid gap-5">
        <section
          id="dry-run"
          className="rounded-md border border-neutral-800 bg-neutral-900/50"
        >
          <div className="flex flex-col gap-3 border-b border-neutral-800 px-4 py-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-neutral-100">
                Dry-Run Evidence
              </h2>
              <p className="mt-1 text-xs text-neutral-500">
                {dataSource.message}
              </p>
            </div>
            <span
              className={`inline-flex w-fit rounded-md border px-2.5 py-1.5 font-mono text-xs ${
                certificate.passed
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                  : 'border-red-500/30 bg-red-500/10 text-red-200'
              }`}
            >
              {certificate.passed ? 'certificate pass' : 'certificate fail'}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="border-b border-neutral-800 text-xs uppercase tracking-[0.14em] text-neutral-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Field</th>
                  <th className="px-4 py-3 font-medium">Original sample</th>
                  <th className="px-4 py-3 font-medium">Masked sample</th>
                  <th className="px-4 py-3 font-medium">Strategy</th>
                  <th className="px-4 py-3 font-medium">Detected by</th>
                </tr>
              </thead>
              {dryRunEvidence.length > 0 ? (
                <tbody className="divide-y divide-neutral-800">
                  {dryRunEvidence.map((row) => (
                    <tr key={`${row.tableName}.${row.columnName}`} className="text-neutral-300">
                      <td className="px-4 py-3 font-mono text-xs text-neutral-100">
                        {row.tableName}.{row.columnName}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-neutral-400">
                        {row.originalValue}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-emerald-200">
                        {row.maskedValue}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {row.strategy}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs text-neutral-300">
                          {row.detection}
                        </div>
                        <div className="mt-0.5 font-mono text-[11px] text-neutral-500">
                          {row.confidence} confidence
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              ) : (
                <tbody>
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-neutral-500">
                      {certificate.summary}
                    </td>
                  </tr>
                </tbody>
              )}
            </table>
          </div>
        </section>

        <section
          id="logs"
          className="rounded-md border border-neutral-800 bg-neutral-900/50"
        >
          <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
            <h2 className="text-sm font-semibold text-neutral-100">
              Sync Logs
            </h2>
            <span className="font-mono text-xs text-neutral-500">
              last 24h
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-neutral-800 text-xs uppercase tracking-[0.14em] text-neutral-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Execution</th>
                  <th className="px-4 py-3 font-medium">Project</th>
                  <th className="px-4 py-3 font-medium">Database</th>
                  <th className="px-4 py-3 font-medium">Finished</th>
                  <th className="px-4 py-3 font-medium">Rows</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {syncExecutions.map((sync) => (
                  <tr key={sync.id} className="text-neutral-300">
                    <td className="px-4 py-3 font-mono text-xs text-neutral-400">
                      {sync.id}
                    </td>
                    <td className="px-4 py-3 font-medium text-neutral-100">
                      {sync.project}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {sync.database}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {sync.finishedAt}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-neutral-100">
                        {sync.rowsScrubbedLabel}
                      </div>
                      <div className="mt-0.5 font-mono text-xs text-neutral-500">
                        {sync.rulesApplied} rules / {sync.duration}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={sync.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: SyncExecution['status'] }) {
  const className =
    status === 'success'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
      : status === 'warning'
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
        : 'border-red-500/30 bg-red-500/10 text-red-200'

  return (
    <span
      className={`inline-flex rounded-md border px-2 py-1 font-mono text-xs ${className}`}
    >
      {status}
    </span>
  )
}
