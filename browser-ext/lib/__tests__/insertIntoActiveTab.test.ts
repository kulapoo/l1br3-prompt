import { describe, it, expect, vi, beforeEach } from 'vitest'
import { insertIntoActiveTab } from '../insertIntoActiveTab'

const mockQuery = vi.fn()
const mockSendMessage = vi.fn()

beforeEach(() => {
  vi.stubGlobal('browser', {
    tabs: {
      query: mockQuery,
      sendMessage: mockSendMessage,
    },
  })
  mockQuery.mockReset()
  mockSendMessage.mockReset()
})

describe('insertIntoActiveTab', () => {
  it('sends INSERT_TEXT to the active tab', async () => {
    mockQuery.mockResolvedValue([{ id: 42 }])
    mockSendMessage.mockResolvedValue(undefined)

    await insertIntoActiveTab('hello world')

    expect(mockQuery).toHaveBeenCalledWith({ active: true, currentWindow: true })
    expect(mockSendMessage).toHaveBeenCalledWith(42, { type: 'INSERT_TEXT', text: 'hello world' })
  })

  it('no-ops when query returns an empty array', async () => {
    mockQuery.mockResolvedValue([])

    await insertIntoActiveTab('hello')

    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('no-ops when the active tab has no id', async () => {
    mockQuery.mockResolvedValue([{ id: undefined }])

    await insertIntoActiveTab('hello')

    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('resolves without throwing when sendMessage rejects', async () => {
    mockQuery.mockResolvedValue([{ id: 7 }])
    mockSendMessage.mockRejectedValue(new Error('Could not establish connection'))

    await expect(insertIntoActiveTab('hello')).resolves.toBeUndefined()
  })
})
