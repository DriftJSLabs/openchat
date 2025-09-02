import { describe, it, expect, beforeEach, vi } from 'vitest'
import { storeToken, getStoredToken, removeToken, generatePKCEParams } from '../openrouter'

// Mock crypto-js
vi.mock('crypto-js', () => ({
  default: {
    AES: {
      encrypt: vi.fn((text: string, key: string) => ({ toString: () => `encrypted_${text}_with_${key}` })),
      decrypt: vi.fn((encrypted: string, key: string) => ({
        toString: vi.fn(() => encrypted.replace(`encrypted_`, '').replace(`_with_${key}`, ''))
      }))
    },
    enc: {
      Utf8: 'utf8'
    }
  }
}))

describe('OpenRouter Auth', () => {
  beforeEach(() => {
    // Clear localStorage and sessionStorage mocks
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
  })

  describe('PKCE Generation', () => {
    it('should generate PKCE parameters with proper structure', async () => {
      const pkce = await generatePKCEParams()
      
      expect(pkce).toHaveProperty('codeVerifier')
      expect(pkce).toHaveProperty('codeChallenge')
      expect(pkce).toHaveProperty('state')
      
      expect(typeof pkce.codeVerifier).toBe('string')
      expect(typeof pkce.codeChallenge).toBe('string')
      expect(typeof pkce.state).toBe('string')
      
      expect(pkce.codeVerifier.length).toBeGreaterThan(0)
      expect(pkce.codeChallenge.length).toBeGreaterThan(0)
      expect(pkce.state.length).toBeGreaterThan(0)
    })

    it('should generate different PKCE parameters on each call', async () => {
      const pkce1 = await generatePKCEParams()
      const pkce2 = await generatePKCEParams()
      
      expect(pkce1.codeVerifier).not.toBe(pkce2.codeVerifier)
      expect(pkce1.codeChallenge).not.toBe(pkce2.codeChallenge)
      expect(pkce1.state).not.toBe(pkce2.state)
    })
  })

  describe('Token Storage', () => {
    it('should store and retrieve tokens with dynamic encryption', () => {
      const testToken = 'test-token-123'
      
      storeToken(testToken)
      
      // Verify localStorage was called
      expect(localStorage.setItem).toHaveBeenCalled()
      
      const retrieved = getStoredToken()
      expect(retrieved).toBe(testToken)
    })

    it('should return null for non-existent token', () => {
      const retrieved = getStoredToken()
      expect(retrieved).toBe(null)
    })

    it('should remove tokens properly', () => {
      const testToken = 'test-token-456'
      
      storeToken(testToken)
      removeToken()
      
      expect(localStorage.removeItem).toHaveBeenCalled()
    })

    it('should handle encryption/decryption errors gracefully', () => {
      // Mock a decryption error
      vi.mocked(localStorage.getItem).mockReturnValue('invalid-encrypted-data')
      
      const retrieved = getStoredToken()
      expect(retrieved).toBe(null)
    })
  })

  describe('Security', () => {
    it('should not use static encryption keys', () => {
      const testToken = 'security-test-token'
      
      storeToken(testToken)
      
      // Verify that the encryption doesn't use the old static key
      const mockCalls = vi.mocked(require('crypto-js').default.AES.encrypt).mock.calls
      expect(mockCalls.length).toBeGreaterThan(0)
      
      // The key should not be the old static key
      const encryptionKey = mockCalls[0][1]
      expect(encryptionKey).not.toBe('openrouter-token-key')
    })
  })
})