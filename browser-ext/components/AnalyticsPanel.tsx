import { BarChart3, Clock, Heart, FileText, Layers, WifiOff } from 'lucide-react'
import { usePromptStats } from '../hooks/usePromptStats'
import type { PromptStatItem } from '../types'

function formatLastUsed(iso: string | null): string {
  if (!iso) return 'Never used'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 'Never used'
  const days = Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24))
  if (days < 1) return 'Today'
  if (days === 1) return '1 day ago'
  if (days < 30) return `${days} days ago`
  const months = Math.floor(days / 30)
  return months === 1 ? '1 month ago' : `${months} months ago`
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex-1 p-4 bg-slate-900 border border-slate-800 rounded-lg">
      <div className="flex items-center gap-2 text-slate-400 text-xs uppercase tracking-wide">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold text-slate-100 tabular-nums">{value}</div>
    </div>
  )
}

function StatList({
  title,
  icon,
  items,
  emptyLabel,
  showLastUsed,
}: {
  title: string
  icon: React.ReactNode
  items: PromptStatItem[]
  emptyLabel: string
  showLastUsed?: boolean
}) {
  return (
    <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg">
      <div className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-3">
        {icon}
        <span>{title}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-slate-500">{emptyLabel}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-2 text-sm text-slate-200"
            >
              <span className="truncate">{item.title}</span>
              <span className="text-xs text-slate-400 tabular-nums shrink-0">
                {showLastUsed ? formatLastUsed(item.lastUsed) : `${item.usageCount} ×`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function AnalyticsPanel() {
  const { stats, isLoading, isFromCache } = usePromptStats()

  if (isLoading) {
    return (
      <div className="p-4 space-y-3" data-testid="analytics-loading">
        <div className="flex gap-3">
          <div className="flex-1 h-20 bg-slate-900 border border-slate-800 rounded-lg animate-pulse" />
          <div className="flex-1 h-20 bg-slate-900 border border-slate-800 rounded-lg animate-pulse" />
          <div className="flex-1 h-20 bg-slate-900 border border-slate-800 rounded-lg animate-pulse" />
        </div>
        <div className="h-40 bg-slate-900 border border-slate-800 rounded-lg animate-pulse" />
        <div className="h-40 bg-slate-900 border border-slate-800 rounded-lg animate-pulse" />
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="p-6 text-center text-slate-400">
        <WifiOff size={24} className="mx-auto mb-2 text-slate-500" />
        <p className="text-sm">Stats unavailable offline</p>
        <p className="text-xs text-slate-500 mt-1">Connect to the local backend to see analytics.</p>
      </div>
    )
  }

  if (stats.totalPrompts === 0) {
    return (
      <div className="p-6 text-center text-slate-400">
        <FileText size={24} className="mx-auto mb-2 text-slate-500" />
        <p className="text-sm">No prompts yet</p>
        <p className="text-xs text-slate-500 mt-1">Save a prompt to see stats.</p>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-3 overflow-y-auto">
      {isFromCache && (
        <div className="flex items-center gap-2 px-3 py-2 bg-slate-900 border border-slate-800 rounded-md text-xs text-slate-400">
          <WifiOff size={12} />
          <span>Showing cached stats — backend offline.</span>
        </div>
      )}

      <div className="flex gap-3">
        <Kpi icon={<FileText size={12} />} label="Prompts" value={stats.totalPrompts} />
        <Kpi icon={<BarChart3 size={12} />} label="Copies" value={stats.totalCopies} />
        <Kpi icon={<Heart size={12} />} label="Favorites" value={stats.favoritesCount} />
      </div>

      <StatList
        title="Top used"
        icon={<BarChart3 size={14} />}
        items={stats.topUsed}
        emptyLabel="No prompts used yet."
      />

      <StatList
        title="Stale (30+ days)"
        icon={<Clock size={14} />}
        items={stats.stale}
        emptyLabel="Nothing stale — nice work."
        showLastUsed
      />

      <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-3">
          <Layers size={14} />
          <span>By category</span>
        </div>
        {stats.byCategory.length === 0 ? (
          <p className="text-xs text-slate-500">No categories.</p>
        ) : (
          <ul className="space-y-2">
            {stats.byCategory.map((c, i) => (
              <li
                key={`${c.category ?? 'none'}-${i}`}
                className="flex items-center justify-between gap-2 text-sm text-slate-200"
              >
                <span className="truncate">{c.category ?? 'Uncategorized'}</span>
                <span className="text-xs text-slate-400 tabular-nums shrink-0">{c.count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
