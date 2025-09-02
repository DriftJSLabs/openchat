import CryptoJS from 'crypto-js';

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
    console.log('Exchanging code for token...');
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

    console.log('Token exchange response:', response.status, response.ok);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Token exchange error response:', errorText);
      throw new Error(`Token exchange failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log('Token exchange successful:', !!result.key);
    return result;
  } catch (error) {
    console.error('Token exchange error:', error);
    return null;
  }
}

// Secure token storage using encryption
// Generate or retrieve encryption key from environment or create session-based key
function getEncryptionKey(): string {
  // Check for environment variable first
  if (typeof window === 'undefined') {
    // Server-side: use environment variable
    return process.env.OPENROUTER_ENCRYPTION_KEY || 'fallback-key-server';
  }
  
  // Client-side: Generate a session-based key that persists during the session
  let key = sessionStorage.getItem('encryption-session-key');
  if (!key) {
    // Generate a proper random key
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    key = btoa(String.fromCharCode(...array));
    sessionStorage.setItem('encryption-session-key', key);
  }
  return key;
}

const STORAGE_KEY = 'openrouter-token';
const PKCE_STORAGE_KEY = 'openrouter-pkce-state';

export function storeToken(token: string): void {
  const encrypted = CryptoJS.AES.encrypt(token, getEncryptionKey()).toString();
  localStorage.setItem(STORAGE_KEY, encrypted);
}

export function getStoredToken(): string | null {
  const encrypted = localStorage.getItem(STORAGE_KEY);
  if (!encrypted) return null;

  try {
    const bytes = CryptoJS.AES.decrypt(encrypted, getEncryptionKey());
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch {
    return null;
  }
}

export function removeToken(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function storePKCEState(state: PKCEState): void {
  const encrypted = CryptoJS.AES.encrypt(JSON.stringify(state), getEncryptionKey()).toString();
  sessionStorage.setItem(PKCE_STORAGE_KEY, encrypted);
}

export function getPKCEState(): PKCEState | null {
  const encrypted = sessionStorage.getItem(PKCE_STORAGE_KEY);
  if (!encrypted) return null;

  try {
    const bytes = CryptoJS.AES.decrypt(encrypted, getEncryptionKey());
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    return JSON.parse(decrypted);
  } catch {
    return null;
  }
}

export function removePKCEState(): void {
  sessionStorage.removeItem(PKCE_STORAGE_KEY);
}

// Test token validity
export async function testToken(token: string): Promise<boolean> {
  try {
    console.log('Testing OpenRouter token...');
    const response = await fetch('https://openrouter.ai/api/v1/auth/key', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    console.log('Token test response:', response.status, response.ok);
    return response.ok;
  } catch (error) {
    console.error('Token test error:', error);
    return false;
  }
}

// Fetch available models from OpenRouter
export async function fetchOpenRouterModels(token: string): Promise<any[]> {
  try {
    console.log('Fetching OpenRouter models...');
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    console.log('Models fetch response:', response.status, response.ok);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Models fetch error:', errorText);
      throw new Error(`Failed to fetch models: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('Models fetched:', data.data?.length || 0);
    
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
    console.error('Error fetching models:', error);
    return [];
  }
}