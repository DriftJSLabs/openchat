import { describe, it, expect, beforeEach, vi } from 'vitest'
import { storeStreamData, getStreamData, deleteStreamData } from '../stream-storage'

// Mock @vercel/kv
vi.mock('@vercel/kv', () => ({
  kv: {
    setex: vi.fn(),
    get: vi.fn(),
    del: vi.fn(),
  }
}))

describe('Stream Storage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Clear environment variable for consistent testing
    delete process.env.KV_URL
  })

  const mockStreamData = {
    messages: [{ role: 'user', content: 'test message' }],
    model: 'test-model',
    partialResponse: 'test response',
    timestamp: Date.now(),
    token: 'test-token'
  }

  describe('Memory Storage (Development)', () => {
    it('should store and retrieve data in memory when KV_URL is not set', async () => {
      const streamId = 'test-stream-123'
      
      await storeStreamData(streamId, mockStreamData)
      const retrieved = await getStreamData(streamId)
      
      expect(retrieved).toEqual(mockStreamData)
    })

    it('should return null for non-existent stream', async () => {
      const retrieved = await getStreamData('non-existent-stream')
      expect(retrieved).toBe(null)
    })

    it('should delete data properly', async () => {
      const streamId = 'test-stream-456'
      
      await storeStreamData(streamId, mockStreamData)
      await deleteStreamData(streamId)
      
      const retrieved = await getStreamData(streamId)
      expect(retrieved).toBe(null)
    })
  })

  describe('Vercel KV Storage (Production)', () => {
    beforeEach(() => {
      process.env.KV_URL = 'redis://test-url'
    })

    it('should use Vercel KV when KV_URL is set', async () => {
      const { kv } = await import('@vercel/kv')
      vi.mocked(kv.get).mockResolvedValue(JSON.stringify(mockStreamData))
      
      const streamId = 'test-stream-789'
      
      await storeStreamData(streamId, mockStreamData)
      expect(kv.setex).toHaveBeenCalledWith(
        `stream:${streamId}`,
        30 * 60, // TTL
        JSON.stringify(mockStreamData)
      )
      
      const retrieved = await getStreamData(streamId)
      expect(kv.get).toHaveBeenCalledWith(`stream:${streamId}`)
      expect(retrieved).toEqual(mockStreamData)
    })

    it('should delete from KV when KV_URL is set', async () => {
      const { kv } = await import('@vercel/kv')
      const streamId = 'test-stream-delete'
      
      await deleteStreamData(streamId)
      expect(kv.del).toHaveBeenCalledWith(`stream:${streamId}`)
    })

    it('should fallback to memory storage if KV fails', async () => {
      const { kv } = await import('@vercel/kv')
      vi.mocked(kv.setex).mockRejectedValue(new Error('KV error'))
      
      const streamId = 'test-stream-fallback'
      
      // Should not throw error, should fallback to memory
      await expect(storeStreamData(streamId, mockStreamData)).resolves.not.toThrow()
      
      // Should still be able to retrieve from memory
      const retrieved = await getStreamData(streamId)
      expect(retrieved).toEqual(mockStreamData)
    })
  })

  describe('TTL and Cleanup', () => {
    it('should set appropriate TTL for stream data', async () => {
      process.env.KV_URL = 'redis://test-url'
      const { kv } = await import('@vercel/kv')
      
      const streamId = 'test-stream-ttl'
      await storeStreamData(streamId, mockStreamData)
      
      expect(kv.setex).toHaveBeenCalledWith(
        `stream:${streamId}`,
        30 * 60, // 30 minutes TTL
        JSON.stringify(mockStreamData)
      )
    })
  })
})