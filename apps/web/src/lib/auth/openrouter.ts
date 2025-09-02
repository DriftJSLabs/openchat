import CryptoJS from 'crypto-js';
import { secureLogger } from '../secure-logger';
import { API_CONFIG, STORAGE_KEYS, ERROR_MESSAGES } from '../constants';

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

  return `${API_CONFIG.OPENROUTER.AUTH_URL}?${params.toString()}`;
}

// Exchange code for token
export async function exchangeCodeForToken(
  code: string,
  codeVerifier: string
): Promise<{ key: string } | null> {
  try {
    secureLogger.debug('Exchanging code for token...');
    const response = await fetch(`${API_CONFIG.OPENROUTER.BASE_URL}${API_CONFIG.OPENROUTER.ENDPOINTS.KEYS}`, {
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

    secureLogger.debug('Token exchange response:', `${response.status} ${response.ok ? 'OK' : 'Failed'}`);

    if (!response.ok) {
      const errorText = await response.text();
      secureLogger.error('Token exchange failed:', `Status ${response.status}`);
      throw new Error(`${ERROR_MESSAGES.TOKEN_EXCHANGE_FAILED}: ${response.status}`);
    }

    const result = await response.json();
    secureLogger.debug('Token exchange successful');
    return result;
  } catch (error) {
    secureLogger.error('Token exchange error:', error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

// Secure token storage using encryption
// Generate a unique encryption key per browser session for better security
const getEncryptionKey = (): string => {
  const key = STORAGE_KEYS.ENCRYPTION_KEY;
  let sessionKey = sessionStorage.getItem(key);
  
  if (!sessionKey) {
    // Generate a cryptographically secure random key
    const keyBuffer = new Uint8Array(32);
    crypto.getRandomValues(keyBuffer);
    sessionKey = btoa(String.fromCharCode(...keyBuffer));
    sessionStorage.setItem(key, sessionKey);
  }
  
  return sessionKey;
};

const STORAGE_KEY = STORAGE_KEYS.OPENROUTER_TOKEN;
const PKCE_STORAGE_KEY = STORAGE_KEYS.PKCE_STATE;

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
    secureLogger.debug('Testing OpenRouter token...');
    const response = await fetch(`${API_CONFIG.OPENROUTER.BASE_URL}${API_CONFIG.OPENROUTER.ENDPOINTS.KEY_TEST}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    secureLogger.debug('Token test response:', `${response.status} ${response.ok ? 'Valid' : 'Invalid'}`);
    return response.ok;
  } catch (error) {
    secureLogger.error('Token test error:', error instanceof Error ? error.message : 'Unknown error');
    return false;
  }
}

// Fetch available models from OpenRouter
export async function fetchOpenRouterModels(token: string): Promise<any[]> {
  try {
    secureLogger.debug('Fetching OpenRouter models...');
    const response = await fetch(`${API_CONFIG.OPENROUTER.BASE_URL}${API_CONFIG.OPENROUTER.ENDPOINTS.MODELS}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    secureLogger.debug('Models fetch response:', `${response.status} ${response.ok ? 'OK' : 'Failed'}`);

    if (!response.ok) {
      secureLogger.error('Models fetch failed:', `Status ${response.status}`);
      throw new Error(`${ERROR_MESSAGES.MODELS_FETCH_FAILED}: ${response.status}`);
    }

    const data = await response.json();
    secureLogger.debug('Models fetched:', `${data.data?.length || 0} models`);
    
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
    secureLogger.error('Error fetching models:', error instanceof Error ? error.message : 'Unknown error');
    return [];
  }
}