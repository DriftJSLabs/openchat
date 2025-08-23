import { getDatabaseErrorHandler, DatabaseErrorType } from './error-handler';
import { getRetryManager } from './retry-manager';

export interface SyncPermissions {
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canSync: boolean;
  scopedToUser: boolean;
  allowedEntities: ('chat' | 'message' | 'user')[];
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string[];
}

export interface DeviceCredentials {
  deviceId: string;
  deviceFingerprint: string;
  encryptionKey: string;
  lastUsed: number;
  trusted: boolean;
}

export interface SyncSessionInfo {
  sessionId: string;
  userId: string;
  deviceId: string;
  permissions: SyncPermissions;
  startTime: number;
  lastActivity: number;
  encryptionEnabled: boolean;
}

/**
 * Authentication and authorization manager for sync operations
 */
export class SyncAuthManager {
  private tokens: AuthTokens | null = null;
  private deviceCredentials: DeviceCredentials | null = null;
  private currentSession: SyncSessionInfo | null = null;
  private permissions: SyncPermissions | null = null;
  private errorHandler = getDatabaseErrorHandler();
  private retryManager = getRetryManager();
  private encryptionKey: CryptoKey | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.setupTokenRefresh();
    this.loadStoredCredentials();
  }

  /**
   * Authenticate and establish sync session
   */
  async authenticate(credentials: {
    userId: string;
    password?: string;
    refreshToken?: string;
    deviceFingerprint?: string;
  }): Promise<SyncSessionInfo> {
    try {
      // Determine authentication method
      const authMethod = credentials.refreshToken ? 'refresh' : 'password';
      
      const authResponse = await this.performAuthentication(authMethod, credentials);
      
      // Store tokens securely
      this.tokens = {
        accessToken: authResponse.accessToken,
        refreshToken: authResponse.refreshToken,
        expiresAt: Date.now() + (authResponse.expiresIn * 1000),
        scope: authResponse.scope || []
      };

      // Get or create device credentials
      this.deviceCredentials = await this.getOrCreateDeviceCredentials(
        credentials.deviceFingerprint || await this.generateDeviceFingerprint(),
        credentials.userId
      );

      // Establish sync session
      this.currentSession = await this.establishSyncSession(credentials.userId);
      
      // Get user permissions
      this.permissions = await this.getUserPermissions(credentials.userId);

      // Setup automatic token refresh
      this.scheduleTokenRefresh();

      // Store credentials securely
      await this.storeCredentialsSecurely();

      return this.currentSession;

    } catch (error) {
      const dbError = this.errorHandler.handleError(error, { operation: 'authenticate' });
      throw dbError;
    }
  }

  /**
   * Refresh authentication tokens
   */
  async refreshAuthentication(): Promise<void> {
    if (!this.tokens?.refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const refreshResponse = await this.retryManager.execute(async () => {
        const response = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            refreshToken: this.tokens!.refreshToken,
            deviceId: this.deviceCredentials?.deviceId
          })
        });

        if (!response.ok) {
          if (response.status === 401) {
            // Refresh token is invalid - need to re-authenticate
            this.clearCredentials();
            throw new Error('Refresh token expired - re-authentication required');
          }
          throw new Error(`Token refresh failed: ${response.status}`);
        }

        return response.json();
      }, 'token-refresh');

      // Update tokens
      this.tokens = {
        ...this.tokens,
        accessToken: refreshResponse.accessToken,
        expiresAt: Date.now() + (refreshResponse.expiresIn * 1000)
      };

      // Update stored credentials
      await this.storeCredentialsSecurely();

      // Reschedule next refresh
      this.scheduleTokenRefresh();

    } catch (error) {
      this.errorHandler.handleError(error, { operation: 'refreshAuthentication' });
      throw error;
    }
  }

  /**
   * Authorize sync operation
   */
  async authorizeOperation(
    operation: 'read' | 'write' | 'delete' | 'sync',
    entityType: 'chat' | 'message' | 'user',
    entityId?: string,
    userId?: string
  ): Promise<boolean> {
    if (!this.permissions || !this.currentSession) {
      return false;
    }

    // Check basic permissions
    switch (operation) {
      case 'read':
        if (!this.permissions.canRead) return false;
        break;
      case 'write':
        if (!this.permissions.canWrite) return false;
        break;
      case 'delete':
        if (!this.permissions.canDelete) return false;
        break;
      case 'sync':
        if (!this.permissions.canSync) return false;
        break;
    }

    // Check entity type permissions
    if (!this.permissions.allowedEntities.includes(entityType)) {
      return false;
    }

    // Check user scoping
    if (this.permissions.scopedToUser && userId && userId !== this.currentSession.userId) {
      return false;
    }

    // Additional entity-specific checks
    if (entityId) {
      return await this.checkEntitySpecificPermissions(entityType, entityId, operation);
    }

    return true;
  }

  /**
   * Create authenticated request headers
   */
  async createAuthHeaders(includeDeviceInfo: boolean = true): Promise<Record<string, string>> {
    if (!this.tokens?.accessToken) {
      throw new Error('No access token available');
    }

    // Check if token is expired
    if (Date.now() >= this.tokens.expiresAt - 60000) { // Refresh 1 minute before expiry
      await this.refreshAuthentication();
    }

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.tokens.accessToken}`,
      'Content-Type': 'application/json'
    };

    if (includeDeviceInfo && this.deviceCredentials) {
      headers['X-Device-ID'] = this.deviceCredentials.deviceId;
      headers['X-Device-Fingerprint'] = this.deviceCredentials.deviceFingerprint;
    }

    if (this.currentSession) {
      headers['X-Session-ID'] = this.currentSession.sessionId;
    }

    return headers;
  }

  /**
   * Encrypt sensitive data for sync
   */
  async encryptSyncData(data: any): Promise<{ encrypted: string; iv: string }> {
    if (!this.encryptionKey) {
      await this.initializeEncryption();
    }

    const jsonData = JSON.stringify(data);
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(jsonData);

    const iv = crypto.getRandomValues(new Uint8Array(12)); // 12 bytes for AES-GCM
    
    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      this.encryptionKey!,
      dataBuffer
    );

    return {
      encrypted: this.arrayBufferToBase64(encryptedBuffer),
      iv: this.arrayBufferToBase64(iv)
    };
  }

  /**
   * Decrypt sync data
   */
  async decryptSyncData(encryptedData: string, iv: string): Promise<any> {
    if (!this.encryptionKey) {
      await this.initializeEncryption();
    }

    const encryptedBuffer = this.base64ToArrayBuffer(encryptedData);
    const ivBuffer = this.base64ToArrayBuffer(iv);

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBuffer },
      this.encryptionKey!,
      encryptedBuffer
    );

    const decoder = new TextDecoder();
    const jsonData = decoder.decode(decryptedBuffer);
    return JSON.parse(jsonData);
  }

  /**
   * Validate sync request integrity
   */
  async validateSyncRequest(request: any, signature: string): Promise<boolean> {
    if (!this.deviceCredentials?.encryptionKey) {
      return false;
    }

    try {
      // Create HMAC signature of the request
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(this.deviceCredentials.encryptionKey),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign', 'verify']
      );

      const requestBuffer = encoder.encode(JSON.stringify(request));
      const signatureBuffer = this.base64ToArrayBuffer(signature);

      return await crypto.subtle.verify(
        'HMAC',
        key,
        signatureBuffer,
        requestBuffer
      );
    } catch (error) {
      console.error('Signature validation failed:', error);
      return false;
    }
  }

  /**
   * Create signed sync request
   */
  async createSignedSyncRequest(request: any): Promise<{ request: any; signature: string }> {
    if (!this.deviceCredentials?.encryptionKey) {
      throw new Error('No device encryption key available');
    }

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(this.deviceCredentials.encryptionKey),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const requestBuffer = encoder.encode(JSON.stringify(request));
    const signatureBuffer = await crypto.subtle.sign('HMAC', key, requestBuffer);

    return {
      request,
      signature: this.arrayBufferToBase64(signatureBuffer)
    };
  }

  // Private methods
  private async performAuthentication(method: 'password' | 'refresh', credentials: any): Promise<any> {
    const endpoint = method === 'refresh' ? '/api/auth/refresh' : '/api/auth/login';
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(credentials)
    });

    if (!response.ok) {
      throw new Error(`Authentication failed: ${response.status}`);
    }

    return response.json();
  }

  private async getOrCreateDeviceCredentials(
    fingerprint: string,
    userId: string
  ): Promise<DeviceCredentials> {
    try {
      // Try to get existing device credentials
      const response = await fetch('/api/devices/register', {
        method: 'POST',
        headers: await this.createAuthHeaders(false),
        body: JSON.stringify({
          fingerprint,
          userId,
          trusted: true // Mark as trusted after successful auth
        })
      });

      if (!response.ok) {
        throw new Error(`Device registration failed: ${response.status}`);
      }

      const deviceData = await response.json();

      return {
        deviceId: deviceData.id,
        deviceFingerprint: fingerprint,
        encryptionKey: deviceData.encryptionKey || this.generateEncryptionKey(),
        lastUsed: Date.now(),
        trusted: true
      };
    } catch (error) {
      this.errorHandler.handleError(error, { operation: 'getOrCreateDeviceCredentials' });
      throw error;
    }
  }

  private async establishSyncSession(userId: string): Promise<SyncSessionInfo> {
    const sessionId = this.generateSessionId();
    
    const session: SyncSessionInfo = {
      sessionId,
      userId,
      deviceId: this.deviceCredentials!.deviceId,
      permissions: this.permissions!,
      startTime: Date.now(),
      lastActivity: Date.now(),
      encryptionEnabled: true
    };

    // Register session with server
    try {
      const response = await fetch('/api/sync/session', {
        method: 'POST',
        headers: await this.createAuthHeaders(),
        body: JSON.stringify({
          sessionId,
          deviceId: this.deviceCredentials!.deviceId
        })
      });

      if (!response.ok) {
        console.warn('Failed to register sync session with server');
      }
    } catch (error) {
      console.warn('Session registration failed:', error);
    }

    return session;
  }

  private async getUserPermissions(userId: string): Promise<SyncPermissions> {
    try {
      const response = await fetch(`/api/users/${userId}/permissions`, {
        headers: await this.createAuthHeaders(false)
      });

      if (!response.ok) {
        // Return default permissions if fetch fails
        return this.getDefaultPermissions();
      }

      return await response.json();
    } catch (error) {
      console.warn('Failed to fetch user permissions:', error);
      return this.getDefaultPermissions();
    }
  }

  private getDefaultPermissions(): SyncPermissions {
    return {
      canRead: true,
      canWrite: true,
      canDelete: true,
      canSync: true,
      scopedToUser: true,
      allowedEntities: ['chat', 'message']
    };
  }

  private async checkEntitySpecificPermissions(
    entityType: string,
    entityId: string,
    operation: string
  ): Promise<boolean> {
    // Implement entity-specific permission checks
    // For example, check if user owns the chat/message
    try {
      const response = await fetch(`/api/${entityType}/${entityId}/permissions`, {
        headers: await this.createAuthHeaders()
      });

      if (!response.ok) {
        return false;
      }

      const permissions = await response.json();
      return permissions[operation] === true;
    } catch (error) {
      return false;
    }
  }

  private setupTokenRefresh(): void {
    // Schedule token refresh before expiry
    this.scheduleTokenRefresh();
  }

  private scheduleTokenRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    if (!this.tokens) {
      return;
    }

    // Refresh 5 minutes before expiry
    const refreshTime = this.tokens.expiresAt - Date.now() - (5 * 60 * 1000);
    
    if (refreshTime > 0) {
      this.refreshTimer = setTimeout(() => {
        this.refreshAuthentication().catch(error => {
          console.error('Automatic token refresh failed:', error);
        });
      }, refreshTime);
    }
  }

  /**
   * SECURITY FIX: Load credentials from secure encrypted storage
   */
  private async loadStoredCredentials(): Promise<void> {
    try {
      // Security: Use IndexedDB with encryption instead of localStorage
      const encryptedTokens = await this.getSecureStorageItem('sync-tokens');
      const encryptedDevice = await this.getSecureStorageItem('device-credentials');

      if (encryptedTokens) {
        this.tokens = await this.decryptStorageData(encryptedTokens);
      }

      if (encryptedDevice) {
        this.deviceCredentials = await this.decryptStorageData(encryptedDevice);
      }
    } catch (error) {
      console.warn('Failed to load stored credentials:', error);
      // Clear potentially corrupted data
      await this.clearSecureCredentials();
    }
  }

  /**
   * SECURITY FIX: Store credentials using secure encryption
   */
  private async storeCredentialsSecurely(): Promise<void> {
    try {
      if (this.tokens) {
        const encryptedTokens = await this.encryptStorageData(this.tokens);
        await this.setSecureStorageItem('sync-tokens', encryptedTokens);
      }

      if (this.deviceCredentials) {
        const encryptedDevice = await this.encryptStorageData(this.deviceCredentials);
        await this.setSecureStorageItem('device-credentials', encryptedDevice);
      }
    } catch (error) {
      console.warn('Failed to store credentials securely:', error);
      throw new Error('Failed to securely store credentials');
    }
  }

  /**
   * SECURITY FIX: Secure credential clearing
   */
  private clearCredentials(): void {
    this.tokens = null;
    this.deviceCredentials = null;
    this.currentSession = null;
    this.permissions = null;
    this.encryptionKey = null;

    // Clear secure storage
    this.clearSecureCredentials().catch(error => {
      console.warn('Failed to clear secure credentials:', error);
    });

    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /**
   * SECURITY FIX: Proper encryption initialization with secure key derivation
   */
  private async initializeEncryption(): Promise<void> {
    if (!this.deviceCredentials?.encryptionKey) {
      throw new Error('No encryption key available');
    }

    try {
      const encoder = new TextEncoder();
      
      // Generate or retrieve a proper salt
      let salt = await this.getSecureStorageItem('encryption-salt');
      if (!salt) {
        const saltArray = new Uint8Array(16);
        crypto.getRandomValues(saltArray);
        salt = this.arrayBufferToBase64(saltArray);
        await this.setSecureStorageItem('encryption-salt', salt);
      }
      
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(this.deviceCredentials.encryptionKey),
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
      );

      this.encryptionKey = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: this.base64ToArrayBuffer(salt),
          iterations: 100000,
          hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );
    } catch (error) {
      console.error('Failed to initialize encryption:', error);
      throw new Error('Encryption initialization failed');
    }
  }

  /**
   * SECURITY FIX: Secure device fingerprinting with privacy considerations
   */
  private async generateDeviceFingerprint(): Promise<string> {
    // Create a device fingerprint with limited information for privacy
    const fingerprint = [
      navigator.language || 'unknown',
      screen.width || 0,
      screen.height || 0,
      new Date().getTimezoneOffset() || 0,
      // Remove canvas fingerprinting for privacy
      'openchat-app'
    ].join('|');
    
    return await this.secureHash(fingerprint);
  }

  private generateSessionId(): string {
    return crypto.getRandomValues(new Uint32Array(4)).join('-');
  }

  /**
   * SECURITY FIX: Generate cryptographically secure encryption key
   */
  private generateEncryptionKey(): string {
    // Generate a proper 256-bit key
    const keyArray = new Uint8Array(32);
    crypto.getRandomValues(keyArray);
    return Array.from(keyArray, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * SECURITY FIX: Use crypto API for secure hashing
   */
  private async secureHash(input: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * SECURITY FIX: Secure storage implementation using IndexedDB with encryption
   */
  private async getStorageEncryptionKey(): Promise<CryptoKey> {
    const stored = await this.getSecureStorageItem('storage-encryption-key');
    
    if (stored) {
      const keyData = this.base64ToArrayBuffer(stored);
      return await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt']
      );
    }
    
    // Generate new key
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    
    const exportedKey = await crypto.subtle.exportKey('raw', key);
    await this.setSecureStorageItem('storage-encryption-key', this.arrayBufferToBase64(exportedKey));
    
    return key;
  }

  private async encryptStorageData(data: any): Promise<string> {
    const key = await this.getStorageEncryptionKey();
    const jsonData = JSON.stringify(data);
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(jsonData);
    
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      dataBuffer
    );
    
    return JSON.stringify({
      data: this.arrayBufferToBase64(encryptedBuffer),
      iv: this.arrayBufferToBase64(iv)
    });
  }

  private async decryptStorageData(encryptedData: string): Promise<any> {
    const key = await this.getStorageEncryptionKey();
    const { data, iv } = JSON.parse(encryptedData);
    
    const encryptedBuffer = this.base64ToArrayBuffer(data);
    const ivBuffer = this.base64ToArrayBuffer(iv);
    
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBuffer },
      key,
      encryptedBuffer
    );
    
    const decoder = new TextDecoder();
    const jsonData = decoder.decode(decryptedBuffer);
    return JSON.parse(jsonData);
  }

  private async getSecureStorageItem(key: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('OpenChatSecureStorage', 1);
      
      request.onerror = () => reject(request.error);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('credentials')) {
          db.createObjectStore('credentials');
        }
      };
      
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['credentials'], 'readonly');
        const store = transaction.objectStore('credentials');
        const getRequest = store.get(key);
        
        getRequest.onsuccess = () => {
          resolve(getRequest.result || null);
        };
        
        getRequest.onerror = () => reject(getRequest.error);
      };
    });
  }

  private async setSecureStorageItem(key: string, value: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('OpenChatSecureStorage', 1);
      
      request.onerror = () => reject(request.error);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('credentials')) {
          db.createObjectStore('credentials');
        }
      };
      
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['credentials'], 'readwrite');
        const store = transaction.objectStore('credentials');
        const putRequest = store.put(value, key);
        
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      };
    });
  }

  private async deleteSecureStorageItem(key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('OpenChatSecureStorage', 1);
      
      request.onerror = () => reject(request.error);
      
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['credentials'], 'readwrite');
        const store = transaction.objectStore('credentials');
        const deleteRequest = store.delete(key);
        
        deleteRequest.onsuccess = () => resolve();
        deleteRequest.onerror = () => reject(deleteRequest.error);
      };
    });
  }

  /**
   * Clear credentials from secure storage
   */
  private async clearSecureCredentials(): Promise<void> {
    try {
      await this.deleteSecureStorageItem('sync-tokens');
      await this.deleteSecureStorageItem('device-credentials');
      await this.deleteSecureStorageItem('storage-encryption-key');
    } catch (error) {
      console.warn('Failed to clear secure storage:', error);
    }
  }

  // Public API methods
  isAuthenticated(): boolean {
    return this.tokens !== null && this.currentSession !== null;
  }

  getCurrentSession(): SyncSessionInfo | null {
    return this.currentSession;
  }

  getPermissions(): SyncPermissions | null {
    return this.permissions;
  }

  async logout(): Promise<void> {
    try {
      if (this.currentSession) {
        // Notify server of logout
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: await this.createAuthHeaders(),
          body: JSON.stringify({
            sessionId: this.currentSession.sessionId
          })
        });
      }
    } catch (error) {
      console.warn('Logout notification failed:', error);
    } finally {
      this.clearCredentials();
    }
  }
}

// Singleton instance
let syncAuthManager: SyncAuthManager | null = null;

export function getSyncAuthManager(): SyncAuthManager {
  if (!syncAuthManager) {
    syncAuthManager = new SyncAuthManager();
  }
  return syncAuthManager;
}