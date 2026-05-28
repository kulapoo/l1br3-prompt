import React from 'react'
import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { PromptStats } from '../types'

vi.mock('../hooks/usePromptStats', () => ({ usePromptStats: vi.fn() }))

import { usePromptStats } from '../hooks/usePromptStats'
import { AnalyticsPanel } from './AnalyticsPanel'

const fullStats: PromptStats = {
  totalPrompts: 12,
  totalCopies: 47,
  favoritesCount: 4,
  topUsed: [
    { id: 't1', title: 'Brainstorm', usageCount: 9, lastUsed: '2026-05-25T00:00:00Z' },
    { id: 't2', title: 'Summarize', usageCount: 5, lastUsed: '2026-05-20T00:00:00Z' },
  ],
  stale: [
    { id: 's1', title: 'Forgotten', usageCount: 1, lastUsed: '2026-01-01T00:00:00Z' },
    { id: 's2', title: 'Never Touched', usageCount: 0, lastUsed: null },
  ],
  byCategory: [
    { category: 'Code', count: 6 },
    { category: 'Writing', count: 4 },
    { category: null, count: 2 },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AnalyticsPanel', () => {
  it('renders KPI numbers from stats', () => {
    vi.mocked(usePromptStats).mockReturnValue({ stats: fullStats, isLoading: false, isFromCache: false })
    render(<AnalyticsPanel />)
    expect(screen.getByText('12')).toBeTruthy()
    expect(screen.getByText('47')).toBeTruthy()
    // Favorites = 4; also "Writing" by-category = 4. Both should appear.
    expect(screen.getAllByText('4').length).toBeGreaterThanOrEqual(2)
  })

  it('renders top used list', () => {
    vi.mocked(usePromptStats).mockReturnValue({ stats: fullStats, isLoading: false, isFromCache: false })
    render(<AnalyticsPanel />)
    expect(screen.getByText('Brainstorm')).toBeTruthy()
    expect(screen.getByText('Summarize')).toBeTruthy()
    expect(screen.getByText('9 ×')).toBeTruthy()
  })

  it('shows "Never used" for null lastUsed in stale list', () => {
    vi.mocked(usePromptStats).mockReturnValue({ stats: fullStats, isLoading: false, isFromCache: false })
    render(<AnalyticsPanel />)
    expect(screen.getByText('Never Touched')).toBeTruthy()
    expect(screen.getByText('Never used')).toBeTruthy()
  })

  it('renders by-category list including Uncategorized for null', () => {
    vi.mocked(usePromptStats).mockReturnValue({ stats: fullStats, isLoading: false, isFromCache: false })
    render(<AnalyticsPanel />)
    expect(screen.getByText('Code')).toBeTruthy()
    expect(screen.getByText('Writing')).toBeTruthy()
    expect(screen.getByText('Uncategorized')).toBeTruthy()
  })

  it('shows empty state when totalPrompts === 0', () => {
    vi.mocked(usePromptStats).mockReturnValue({
      stats: { ...fullStats, totalPrompts: 0, totalCopies: 0, favoritesCount: 0, topUsed: [], stale: [], byCategory: [] },
      isLoading: false,
      isFromCache: false,
    })
    render(<AnalyticsPanel />)
    expect(screen.getByText('No prompts yet')).toBeTruthy()
  })

  it('shows "Stats unavailable offline" when stats null and not loading', () => {
    vi.mocked(usePromptStats).mockReturnValue({ stats: null, isLoading: false, isFromCache: false })
    render(<AnalyticsPanel />)
    expect(screen.getByText('Stats unavailable offline')).toBeTruthy()
  })

  it('shows loading skeleton when isLoading', () => {
    vi.mocked(usePromptStats).mockReturnValue({ stats: null, isLoading: true, isFromCache: false })
    render(<AnalyticsPanel />)
    expect(screen.getByTestId('analytics-loading')).toBeTruthy()
  })

  it('shows cached banner when isFromCache', () => {
    vi.mocked(usePromptStats).mockReturnValue({ stats: fullStats, isLoading: false, isFromCache: true })
    render(<AnalyticsPanel />)
    expect(screen.getByText(/Showing cached stats/)).toBeTruthy()
  })
})
