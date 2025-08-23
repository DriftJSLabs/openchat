import { beforeEach, vi, afterEach } from 'vitest'
import '@testing-library/jest-dom'

console.log('[SETUP] Setup file loading...')

// Mock Web Workers with in-memory database FIRST
const mockDatabase = new Map<string, any>()
let mockRowId = 1

// Mock the global Worker constructor using vi.stubGlobal for better compatibility
class MockWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((error: ErrorEvent) => void) | null = null;
  
  constructor(_scriptURL: string) {
    console.log('[MOCK WORKER] Constructor called with:', _scriptURL)
    // Don't simulate initialization yet - wait for actual INITIALIZE message
  }
  
  postMessage(message: any) {
    console.log(`[MOCK WORKER] Processing message type: ${message.type}`)
    let result: any
      
      if (message.type === 'INITIALIZE') {
        console.log(`[MOCK WORKER] Initializing database`)
        result = { success: true }
      } else if (message.type === 'QUERY') {
        const sql = message.payload?.sql || ''
        const params = message.payload?.params || []
        console.log(`[MOCK WORKER] Query: ${sql}, params:`, params)
        
        if (sql.includes('SELECT * FROM user WHERE id = ?')) {
          const userId = params[0]
          console.log(`[MOCK DB] Looking for user_${userId}, database keys:`, Array.from(mockDatabase.keys()))
          const user = mockDatabase.get(`user_${userId}`)
          console.log(`[MOCK DB] Found user:`, user)
          result = user ? [{ ...user, emailVerified: Boolean(user.emailVerified) }] : []
        } else if (sql.includes('SELECT * FROM chat WHERE user_id = ?')) {
          const userId = params[0]
          const chats = []
          for (const [key, value] of mockDatabase.entries()) {
            if (key.startsWith('chat_') && value.userId === userId && !value.isDeleted) {
              chats.push({
                ...value,
                isPinned: Boolean(value.isPinned),
                isArchived: Boolean(value.isArchived), 
                isDeleted: Boolean(value.isDeleted)
              })
            }
          }
          result = chats.sort((a, b) => b.updatedAt - a.updatedAt)
        } else if (sql.includes('SELECT * FROM chat WHERE id = ?')) {
          const chatId = params[0]
          const chat = mockDatabase.get(`chat_${chatId}`)
          result = chat && !chat.isDeleted ? [{
            ...chat,
            isPinned: Boolean(chat.isPinned),
            isArchived: Boolean(chat.isArchived),
            isDeleted: Boolean(chat.isDeleted)
          }] : []
        } else if (sql.includes('SELECT * FROM message WHERE chat_id = ?')) {
          const chatId = params[0]
          const messages = []
          for (const [key, value] of mockDatabase.entries()) {
            if (key.startsWith('message_') && value.chatId === chatId && !value.isDeleted) {
              messages.push({
                ...value,
                isDeleted: Boolean(value.isDeleted)
              })
            }
          }
          result = messages.sort((a, b) => a.createdAt - b.createdAt)
        } else if (sql.includes('SELECT * FROM sync_event WHERE user_id = ?')) {
          const userId = params[0]
          const events = []
          for (const [key, value] of mockDatabase.entries()) {
            if (key.startsWith('sync_event_') && value.userId === userId && !value.synced) {
              events.push({
                ...value,
                synced: Boolean(value.synced)
              })
            }
          }
          result = events
        } else if (sql.includes('SELECT * FROM sync_config WHERE user_id = ?')) {
          const userId = params[0]
          const config = mockDatabase.get(`sync_config_${userId}`)
          result = config ? [config] : []
        } else {
          result = []
        }
      } else if (message.type === 'RUN') {
        const sql = message.payload?.sql || ''
        const params = message.payload?.params || []
        
        if (sql.includes('INSERT INTO user')) {
          const [id, name, email, emailVerified, image, createdAt, updatedAt] = params
          const user = { id, name, email, emailVerified, image, createdAt, updatedAt }
          mockDatabase.set(`user_${id}`, user)
          console.log(`[MOCK DB] User inserted:`, user, `Key: user_${id}`, `Database size:`, mockDatabase.size)
        } else if (sql.includes('INSERT INTO chat')) {
          const [id, title, userId, chatType, settings, tags, isPinned, isArchived, lastActivityAt, messageCount, createdAt, updatedAt, isDeleted] = params
          const chat = { id, title, userId, chatType, settings, tags, isPinned, isArchived, lastActivityAt, messageCount, createdAt, updatedAt, isDeleted }
          mockDatabase.set(`chat_${id}`, chat)
          console.log(`[MOCK DB] Chat inserted:`, chat)
        } else if (sql.includes('INSERT INTO message')) {
          const [id, chatId, role, content, messageType, metadata, parentMessageId, editHistory, tokenCount, createdAt, isDeleted] = params
          const message = { id, chatId, role, content, messageType, metadata, parentMessageId, editHistory, tokenCount, createdAt, isDeleted }
          mockDatabase.set(`message_${id}`, message)
          console.log(`[MOCK DB] Message inserted:`, message)
        } else if (sql.includes('INSERT INTO sync_event')) {
          const [id, entityType, entityId, operation, data, timestamp, userId, deviceId, synced] = params
          const event = { id, entityType, entityId, operation, data, timestamp, userId, deviceId, synced }
          mockDatabase.set(`sync_event_${id}`, event)
          console.log(`[MOCK DB] Sync event inserted:`, event)
        } else if (sql.includes('INSERT INTO sync_config')) {
          const [id, userId, mode, endpoint, apiKey, encryptionEnabled, compressionEnabled, batchSize, syncInterval, lastSyncAt, createdAt, updatedAt] = params
          const config = { id, userId, mode, endpoint, apiKey, encryptionEnabled, compressionEnabled, batchSize, syncInterval, lastSyncAt, createdAt, updatedAt }
          mockDatabase.set(`sync_config_${userId}`, config)
        } else if (sql.includes('UPDATE chat SET ')) {
          if (sql.includes('title = ?')) {
            const idIndex = params.length - 1
            const chat = mockDatabase.get(`chat_${params[idIndex]}`)
            if (chat) {
              chat.title = params[0]
              if (sql.includes('updated_at = ?')) {
                chat.updatedAt = params[1]
              }
              mockDatabase.set(`chat_${params[idIndex]}`, chat)
            }
          } else if (sql.includes('is_deleted = 1')) {
            const timestamp = params[0]
            const id = params[1]
            const chat = mockDatabase.get(`chat_${id}`)
            if (chat) {
              chat.isDeleted = true
              chat.updatedAt = timestamp
              mockDatabase.set(`chat_${id}`, chat)
            }
          }
        }
        
        result = { changes: 1, lastInsertRowid: mockRowId++ }
      } else if (message.type === 'TRANSACTION') {
        console.log(`[MOCK WORKER] Processing transaction with ${message.payload?.operations?.length || 0} operations`)
        const operations = message.payload?.operations || []
        let totalChanges = 0
        
        for (const op of operations) {
          if (op.sql.includes('INSERT INTO')) {
            // Same insert logic as RUN operations
            totalChanges++
          }
        }
        
        result = { success: true, changes: totalChanges }
      } else {
        console.log(`[MOCK WORKER] Unknown message type: ${message.type}`)
        result = { success: true }
      }
      
      const mockResponse = {
        data: {
          type: `${message.type}_RESULT`,
          id: message.id,
          success: true,
          result
        }
      }
    console.log(`[MOCK WORKER] Sending response for ${message.type}:`, mockResponse.data)
    
    // Send response synchronously to avoid timing issues
    if (this.onmessage) {
      this.onmessage(mockResponse as MessageEvent)
    }
  }
  
  terminate() {}
  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() { return false }
}

// Use vi.stubGlobal to properly mock the Worker constructor
vi.stubGlobal('Worker', MockWorker);

// Set up environment variables for tests
process.env.OPENROUTER_API_KEY = 'test-openrouter-api-key-12345'
process.env.NEXTAUTH_SECRET = 'test-secret-12345'
process.env.NEXTAUTH_URL = 'http://localhost:3000'

// Mock Next.js headers and cookies FIRST - before any other imports
vi.mock('next/headers', () => ({
  headers: vi.fn(() => ({
    get: vi.fn((header: string) => {
      const mockHeaders: Record<string, string> = {
        'user-agent': 'test-browser',
        'x-forwarded-for': '192.168.1.1',
        'content-type': 'application/json',
        'origin': 'http://localhost:3000',
        'host': 'localhost:3000'
      }
      return mockHeaders[header.toLowerCase()] || null
    })
  })),
  cookies: vi.fn(() => ({
    get: vi.fn(() => ({ value: 'mock-session-token' }))
  }))
}))

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    pathname: '/',
    query: {},
    asPath: '/'
  })),
  usePathname: vi.fn(() => '/'),
  useSearchParams: vi.fn(() => new URLSearchParams())
}))

// Mock environment variables
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SERVER_URL', 'http://localhost:3000')
  vi.stubEnv('OPENROUTER_API_KEY', 'test-key')
  vi.stubEnv('NODE_ENV', 'test')
})

// Mock Web Workers with in-memory database
const mockDatabase = new Map<string, any>()
let mockRowId = 1

// Worker mock is now defined above - no need for duplicate

// Clean up after each test
afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  // Clear mock database between tests
  mockDatabase.clear()
})

// Mock browser APIs
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    length: 0,
    key: vi.fn()
  },
  writable: true
})

Object.defineProperty(window, 'sessionStorage', {
  value: {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    length: 0,
    key: vi.fn()
  },
  writable: true
})

// Mock HTMLCanvasElement and document.createElement for canvas
Object.defineProperty(global, 'HTMLCanvasElement', {
  value: vi.fn().mockImplementation(() => ({
    getContext: vi.fn(() => ({
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Array(4) })),
      putImageData: vi.fn(),
      createImageData: vi.fn(() => ({ data: new Array(4) })),
      setTransform: vi.fn(),
      drawImage: vi.fn(),
      save: vi.fn(),
      fillText: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      stroke: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      rotate: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      measureText: vi.fn(() => ({ width: 0 })),
      transform: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      textBaseline: 'top',
      font: '14px Arial'
    })),
    toDataURL: vi.fn(() => 'data:image/png;base64,test'),
    getBoundingClientRect: vi.fn(() => ({ top: 0, left: 0, width: 0, height: 0 }))
  })),
  writable: true
})

// Store original methods safely
const originalCreateElement = global.document?.createElement?.bind(global.document)
const originalCreateElementNS = global.document?.createElementNS?.bind(global.document)

// Mock document.createElement to return proper canvas
Object.defineProperty(global.document, 'createElement', {
  value: vi.fn((tagName) => {
    if (tagName === 'canvas') {
      return {
        getContext: vi.fn(() => ({
          fillRect: vi.fn(),
          clearRect: vi.fn(),
          getImageData: vi.fn(() => ({ data: new Array(4) })),
          putImageData: vi.fn(),
          createImageData: vi.fn(() => ({ data: new Array(4) })),
          setTransform: vi.fn(),
          drawImage: vi.fn(),
          save: vi.fn(),
          fillText: vi.fn(),
          restore: vi.fn(),
          beginPath: vi.fn(),
          moveTo: vi.fn(),
          lineTo: vi.fn(),
          closePath: vi.fn(),
          stroke: vi.fn(),
          translate: vi.fn(),
          scale: vi.fn(),
          rotate: vi.fn(),
          arc: vi.fn(),
          fill: vi.fn(),
          measureText: vi.fn(() => ({ width: 0 })),
          transform: vi.fn(),
          rect: vi.fn(),
          clip: vi.fn(),
          textBaseline: 'top',
          font: '14px Arial'
        })),
        toDataURL: vi.fn(() => 'data:image/png;base64,test'),
        getBoundingClientRect: vi.fn(() => ({ top: 0, left: 0, width: 0, height: 0 }))
      }
    }
    // Use bound original function or return empty object
    try {
      return originalCreateElement ? originalCreateElement(tagName) : { tagName, children: [], style: {} }
    } catch {
      return { tagName, children: [], style: {} }
    }
  }),
  writable: true
})

// Add createElementNS support  
Object.defineProperty(global.document, 'createElementNS', {
  value: vi.fn((namespaceURI, qualifiedName) => {
    if (qualifiedName === 'svg' || namespaceURI === 'http://www.w3.org/2000/svg') {
      return {
        getAttribute: vi.fn(),
        setAttribute: vi.fn(),
        getBoundingClientRect: vi.fn(() => ({ top: 0, left: 0, width: 0, height: 0 })),
        children: [],
        childNodes: []
      }
    }
    try {
      return originalCreateElementNS ? originalCreateElementNS(namespaceURI, qualifiedName) : { tagName: qualifiedName, namespaceURI, children: [], style: {} }
    } catch {
      return { tagName: qualifiedName, namespaceURI, children: [], style: {} }
    }
  }),
  writable: true
})

// Mock IndexedDB
global.indexedDB = {
  open: vi.fn(() => ({
    onsuccess: vi.fn(),
    onerror: vi.fn(),
    result: {
      transaction: vi.fn(() => ({
        objectStore: vi.fn(() => ({
          get: vi.fn(() => ({ onsuccess: vi.fn() })),
          put: vi.fn(() => ({ onsuccess: vi.fn() })),
          delete: vi.fn(() => ({ onsuccess: vi.fn() }))
        }))
      }))
    }
  })),
  deleteDatabase: vi.fn(),
  cmp: vi.fn()
} as any

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  observe() {}
  unobserve() {}
  disconnect() {}
} as any

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  observe() {}
  unobserve() {}
  disconnect() {}
} as any



// Mock global fetch
global.fetch = vi.fn()

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  }))
})

// Mock window.dispatchEvent - ensure window exists first
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'dispatchEvent', {
    writable: true,
    value: vi.fn(() => true)
  })
} else {
  // Create window if it doesn't exist
  global.window = {
    dispatchEvent: vi.fn(() => true)
  } as any
}

// Mock CustomEvent
global.CustomEvent = vi.fn().mockImplementation((type, options) => ({
  type,
  detail: options?.detail || {}
})) as any

// Mock process.env for environment variables
const originalEnv = process.env
beforeEach(() => {
  process.env = { ...originalEnv }
})