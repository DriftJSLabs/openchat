// Production-ready storage for streaming data
// Uses Vercel KV in production, falls back to memory for development

import { kv } from '@vercel/kv';

interface StreamData {
  messages: any[];
  model: string;
  partialResponse: string;
  timestamp: number;
  token?: string;
}

// Development fallback storage
const memoryStorage = new Map<string, StreamData>();

// TTL for stream data (30 minutes)
const STREAM_TTL = 30 * 60; // 30 minutes in seconds

export async function storeStreamData(streamId: string, data: StreamData): Promise<void> {
  try {
    if (process.env.KV_URL) {
      // Use Vercel KV in production
      await kv.setex(`stream:${streamId}`, STREAM_TTL, JSON.stringify(data));
    } else {
      // Use memory storage in development
      memoryStorage.set(streamId, data);
      
      // Clean up old entries after TTL (simple cleanup for dev)
      setTimeout(() => {
        memoryStorage.delete(streamId);
      }, STREAM_TTL * 1000);
    }
  } catch (error) {
    console.warn('Failed to store stream data, falling back to memory:', error);
    memoryStorage.set(streamId, data);
  }
}

export async function getStreamData(streamId: string): Promise<StreamData | null> {
  try {
    if (process.env.KV_URL) {
      // Use Vercel KV in production
      const data = await kv.get(`stream:${streamId}`);
      return data ? JSON.parse(data as string) : null;
    } else {
      // Use memory storage in development
      return memoryStorage.get(streamId) || null;
    }
  } catch (error) {
    console.warn('Failed to retrieve stream data from KV, checking memory:', error);
    return memoryStorage.get(streamId) || null;
  }
}

export async function deleteStreamData(streamId: string): Promise<void> {
  try {
    if (process.env.KV_URL) {
      // Use Vercel KV in production
      await kv.del(`stream:${streamId}`);
    } else {
      // Use memory storage in development
      memoryStorage.delete(streamId);
    }
  } catch (error) {
    console.warn('Failed to delete stream data from KV, deleting from memory:', error);
    memoryStorage.delete(streamId);
  }
}

// Cleanup function for old stream data
export async function cleanupOldStreams(): Promise<void> {
  if (!process.env.KV_URL) {
    // For memory storage, entries are automatically cleaned up by setTimeout
    return;
  }
  
  try {
    // For KV storage, data automatically expires due to TTL
    // No manual cleanup needed
  } catch (error) {
    console.warn('Failed to cleanup old streams:', error);
  }
}