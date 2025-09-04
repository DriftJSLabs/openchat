// PKCE utilities for OpenRouter OAuth
export interface PKCEState {
  codeVerifier: string;
  codeChallenge: string;
  state: string;
}

// Generate random string for code verifier
function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// Generate code challenge from verifier using SHA256
async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// Generate PKCE parameters
export async function generatePKCEParams(): Promise<PKCEState> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = generateCodeVerifier(); // Use same function for state

  return {
    codeVerifier,
    codeChallenge,
    state,
  };
}

// Build OpenRouter OAuth URL
export function buildOpenRouterAuthUrl(
  pkceParams: PKCEState,
  callbackUrl: string
): string {
  const params = new URLSearchParams({
    callback_url: callbackUrl,
    code_challenge: pkceParams.codeChallenge,
    code_challenge_method: 'S256',
    state: pkceParams.state,
  });

  return `https://openrouter.ai/auth?${params.toString()}`;
}

// Exchange code for token
export async function exchangeCodeForToken(
  code: string,
  codeVerifier: string
): Promise<{ key: string } | null> {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/auth/keys', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code,
        code_verifier: codeVerifier,
        code_challenge_method: 'S256',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token exchange failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    return null;
  }
}

// Secure token storage using encryption with user-specific key derivation
const STORAGE_KEY = 'openrouter-token';
const PKCE_STORAGE_KEY = 'openrouter-pkce-state';
const SALT_KEY = 'openrouter-salt';

// Derive encryption key from browser fingerprint and optional user data
async function deriveEncryptionKey(): Promise<CryptoKey> {
  // Get or create a salt for this browser instance
  let salt = localStorage.getItem(SALT_KEY);
  if (!salt) {
    const saltArray = crypto.getRandomValues(new Uint8Array(16));
    salt = btoa(String.fromCharCode(...saltArray));
    localStorage.setItem(SALT_KEY, salt);
  }

  // Create a unique browser fingerprint
  const fingerprint = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
    // Use environment variable if available, otherwise use a default
    process.env.NEXT_PUBLIC_ENCRYPTION_SEED || window.location.hostname
  ].join('|');

  // Import the fingerprint as a key material
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(fingerprint),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  // Derive a key using PBKDF2
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(salt),
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Encrypt data using Web Crypto API
async function encryptData(data: string): Promise<string | null> {
  try {
    const key = await deriveEncryptionKey();
    const encoder = new TextEncoder();
    
    // Generate a random IV for each encryption
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoder.encode(data)
    );
    
    // Combine IV and encrypted data
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);
    
    return btoa(String.fromCharCode(...combined));
  } catch (error) {
    return null;
  }
}

// Decrypt data using Web Crypto API
async function decryptData(encryptedData: string): Promise<string | null> {
  try {
    const key = await deriveEncryptionKey();
    const decoder = new TextDecoder();
    
    // Decode from base64
    const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
    
    // Extract IV and encrypted data
    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encrypted
    );
    
    return decoder.decode(decrypted);
  } catch (error) {
    // Try legacy decryption for backward compatibility
    return await attemptLegacyDecryption(encryptedData);
  }
}

// Attempt to decrypt data encrypted with the old method for backward compatibility
async function attemptLegacyDecryption(encryptedData: string): Promise<string | null> {
  try {
    // Check if CryptoJS is available (it might not be after removing the import)
    if (typeof window !== 'undefined' && 'CryptoJS' in window) {
      const CryptoJS = (window as any).CryptoJS;
      const bytes = CryptoJS.AES.decrypt(encryptedData, 'openrouter-token-key');
      const decrypted = bytes.toString(CryptoJS.enc.Utf8);
      
      // If successful, re-encrypt with new method
      if (decrypted) {
        const newEncrypted = await encryptData(decrypted);
        if (newEncrypted) {
          localStorage.setItem(STORAGE_KEY, newEncrypted);
        }
        return decrypted;
      }
    }
  } catch {
    // Legacy decryption failed
  }
  return null;
}

export async function storeToken(token: string): Promise<void> {
  const encrypted = await encryptData(token);
  if (encrypted) {
    localStorage.setItem(STORAGE_KEY, encrypted);
  } else {
    throw new Error('Failed to encrypt token');
  }
}

export async function getStoredToken(): Promise<string | null> {
  const encrypted = localStorage.getItem(STORAGE_KEY);
  if (!encrypted) return null;

  return await decryptData(encrypted);
}

export function removeToken(): void {
  localStorage.removeItem(STORAGE_KEY);
  // Also clean up salt when removing token for complete cleanup
  localStorage.removeItem(SALT_KEY);
}

export async function storePKCEState(state: PKCEState): Promise<void> {
  const encrypted = await encryptData(JSON.stringify(state));
  if (encrypted) {
    sessionStorage.setItem(PKCE_STORAGE_KEY, encrypted);
  } else {
    throw new Error('Failed to encrypt PKCE state');
  }
}

export async function getPKCEState(): Promise<PKCEState | null> {
  const encrypted = sessionStorage.getItem(PKCE_STORAGE_KEY);
  if (!encrypted) return null;

  const decrypted = await decryptData(encrypted);
  if (decrypted) {
    try {
      return JSON.parse(decrypted);
    } catch {
      return null;
    }
  }
  return null;
}

export function removePKCEState(): void {
  sessionStorage.removeItem(PKCE_STORAGE_KEY);
}

// Test token validity
export async function testToken(token: string): Promise<boolean> {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/auth/key', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}

// Fetch available models from OpenRouter
export async function fetchOpenRouterModels(token: string): Promise<any[]> {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch models: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    // Filter and sort models
    const models = (data.data || [])
      .filter((model: any) => model.id && !model.id.includes('test'))
      .sort((a: any, b: any) => {
        // Prioritize free models and popular ones
        const aFree = a.pricing?.prompt === '0' || a.pricing?.completion === '0';
        const bFree = b.pricing?.prompt === '0' || b.pricing?.completion === '0';
        
        if (aFree && !bFree) return -1;
        if (!aFree && bFree) return 1;
        
        // Then sort by name
        return (a.name || a.id).localeCompare(b.name || b.id);
      });
    
    return models;
  } catch (error) {
    return [];
  }
}