import { Database, MoreVertical, Plus, Search, Shield } from 'lucide-react'
import { useMemo, useState } from 'react'

type MaskingRuleType = 'faker' | 'static' | 'mutation'

type MaskingRule = {
  id: string
  tableName: string
  columnName: string
  strategy: string
  type: MaskingRuleType
  lastSynced: string
}

const mockRules: Array<MaskingRule> = [
  {
    id: 'rule_1',
    tableName: 'users',
    columnName: 'email',
    strategy: 'faker.internet.email',
    type: 'faker',
    lastSynced: '2h ago',
  },
  {
    id: 'rule_2',
    tableName: 'users',
    columnName: 'password_hash',
    strategy: 'static_hash',
    type: 'static',
    lastSynced: '2h ago',
  },
  {
    id: 'rule_3',
    tableName: 'orders',
    columnName: 'credit_card_last4',
    strategy: 'scramble',
    type: 'mutation',
    lastSynced: '5m ago',
  },
  {
    id: 'rule_4',
    tableName: 'profiles',
    columnName: 'phone_number',
    strategy: 'faker.phone.number',
    type: 'faker',
    lastSynced: '1d ago',
  },
]

const strategyClasses: Record<MaskingRuleType, string> = {
  faker: 'border-blue-500/20 bg-blue-500/10 text-blue-400',
  static: 'border-purple-500/20 bg-purple-500/10 text-purple-400',
  mutation: 'border-orange-500/20 bg-orange-500/10 text-orange-400',
}

export function MaskingRulesTable() {
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLowerCase()
  const filteredRules = useMemo(() => {
    if (!normalizedQuery) {
      return mockRules
    }

    return mockRules.filter((rule) =>
      [
        rule.tableName,
        rule.columnName,
        rule.strategy,
        rule.type,
      ].some((value) => value.toLowerCase().includes(normalizedQuery)),
    )
  }, [normalizedQuery])

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold text-zinc-100">
            <Shield className="size-5 text-emerald-500" />
            Masking Rules
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            Define how production PII is mutated during the pull process.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              aria-label="Search masking rules"
              placeholder="Search tables or columns..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full rounded-md border border-zinc-800 bg-zinc-900 py-2 pl-9 pr-4 text-sm text-zinc-200 transition-all placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600 sm:w-72"
            />
          </div>
          <button
            type="button"
            disabled
            className="flex cursor-not-allowed items-center justify-center gap-2 rounded-md border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-500"
          >
            <Plus className="size-4" />
            Add Rule
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/50">
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-zinc-400">
                  Table
                </th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-zinc-400">
                  Column
                </th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-zinc-400">
                  Strategy
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-zinc-400">
                  Last Synced
                </th>
                <th className="w-10 px-4 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {filteredRules.map((rule) => (
                <tr
                  key={rule.id}
                  className="group transition-colors hover:bg-zinc-900/30"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 text-sm text-zinc-300">
                      <Database className="size-3.5 text-zinc-500" />
                      <span className="font-mono text-zinc-300">
                        {rule.tableName}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-sm text-zinc-400">
                      {rule.columnName}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${strategyClasses[rule.type]}`}
                    >
                      {rule.strategy}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-xs text-zinc-500">
                      {rule.lastSynced}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      disabled
                      aria-label={`Open actions for ${rule.tableName}.${rule.columnName}`}
                      className="cursor-not-allowed rounded p-1 text-zinc-700 opacity-0 focus:opacity-100 group-hover:opacity-100"
                    >
                      <MoreVertical className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredRules.length === 0 && (
          <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
            <Shield className="mb-3 size-8 text-zinc-700" />
            <h3 className="text-sm font-medium text-zinc-300">
              No matching rules
            </h3>
            <p className="mt-1 max-w-sm text-xs text-zinc-500">
              Adjust the search text to inspect another table, column, or
              strategy.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
