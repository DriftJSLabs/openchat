import type { FileAttachment } from '@/components/file-attachment';

/**
 * Upload response from server
 */
export interface UploadResponse {
  success: boolean;
  url?: string;
  thumbnail?: string;
  metadata?: {
    duration?: number;
    dimensions?: { width: number; height: number };
    pages?: number;
  };
  error?: string;
}

/**
 * Upload progress callback
 */
export type UploadProgressCallback = (progress: number) => void;

/**
 * File upload service for handling file uploads with progress tracking
 */
export class FileUploadService {
  private uploadEndpoint: string;
  private activeUploads = new Map<string, AbortController>();

  constructor(uploadEndpoint: string) {
    this.uploadEndpoint = uploadEndpoint;
  }

  /**
   * Upload a single file with progress tracking
   */
  async uploadFile(
    file: File,
    onProgress?: UploadProgressCallback,
    signal?: AbortSignal
  ): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('filename', file.name);
    formData.append('type', file.type);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
      // Set up progress tracking
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          const progress = Math.round((event.loaded / event.total) * 100);
          onProgress(progress);
        }
      };

      // Handle completion
      xhr.onload = () => {
        try {
          if (xhr.status >= 200 && xhr.status < 300) {
            const response: UploadResponse = JSON.parse(xhr.responseText);
            resolve(response);
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        } catch (error) {
          reject(new Error('Failed to parse upload response'));
        }
      };

      // Handle errors
      xhr.onerror = () => {
        reject(new Error('Upload failed due to network error'));
      };

      // Handle abort
      xhr.onabort = () => {
        reject(new Error('Upload cancelled'));
      };

      // Set up abort handling
      if (signal) {
        signal.addEventListener('abort', () => {
          xhr.abort();
        });
      }

      // Start upload
      xhr.open('POST', this.uploadEndpoint);
      xhr.setRequestHeader('Accept', 'application/json');
      
      // Add CSRF token if available
      const csrfToken = this.getCSRFToken();
      if (csrfToken) {
        xhr.setRequestHeader('X-CSRF-Token', csrfToken);
      }

      xhr.send(formData);
    });
  }

  /**
   * Upload multiple files concurrently
   */
  async uploadFiles(
    files: File[],
    onProgress?: (fileId: string, progress: number) => void,
    maxConcurrent = 3
  ): Promise<Map<string, UploadResponse>> {
    const results = new Map<string, UploadResponse>();
    const errors: Array<{ file: File; error: Error }> = [];

    // Create chunks for concurrent uploads
    const chunks = this.chunkArray(files, maxConcurrent);
    
    for (const chunk of chunks) {
      const promises = chunk.map(async (file) => {
        const fileId = this.generateFileId(file);
        const abortController = new AbortController();
        this.activeUploads.set(fileId, abortController);

        try {
          const result = await this.uploadFile(
            file,
            (progress) => onProgress?.(fileId, progress),
            abortController.signal
          );
          results.set(fileId, result);
        } catch (error) {
          errors.push({ file, error: error as Error });
          results.set(fileId, {
            success: false,
            error: (error as Error).message,
          });
        } finally {
          this.activeUploads.delete(fileId);
        }
      });

      await Promise.all(promises);
    }

    return results;
  }

  /**
   * Cancel an upload
   */
  cancelUpload(fileId: string): void {
    const controller = this.activeUploads.get(fileId);
    if (controller) {
      controller.abort();
      this.activeUploads.delete(fileId);
    }
  }

  /**
   * Cancel all active uploads
   */
  cancelAllUploads(): void {
    for (const [fileId, controller] of this.activeUploads.entries()) {
      controller.abort();
    }
    this.activeUploads.clear();
  }

  /**
   * Generate thumbnail for image files
   */
  async generateThumbnail(
    file: File,
    maxWidth = 200,
    maxHeight = 200,
    quality = 0.8
  ): Promise<string | null> {
    if (!file.type.startsWith('image/')) {
      return null;
    }

    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      img.onload = () => {
        // Calculate dimensions
        let { width, height } = img;
        
        if (width > height) {
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = (width * maxHeight) / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;

        // Draw and compress
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const dataURL = canvas.toDataURL('image/jpeg', quality);
          resolve(dataURL);
        } else {
          resolve(null);
        }
      };

      img.onerror = () => resolve(null);
      img.src = URL.createObjectURL(file);
    });
  }

  /**
   * Get file metadata
   */
  async getFileMetadata(file: File): Promise<FileAttachment['metadata']> {
    const metadata: FileAttachment['metadata'] = {};

    if (file.type.startsWith('image/')) {
      const dimensions = await this.getImageDimensions(file);
      if (dimensions) {
        metadata.dimensions = dimensions;
      }
    } else if (file.type.startsWith('video/') || file.type.startsWith('audio/')) {
      const duration = await this.getMediaDuration(file);
      if (duration) {
        metadata.duration = duration;
      }
    }

    return Object.keys(metadata).length > 0 ? metadata : undefined;
  }

  /**
   * Get image dimensions
   */
  private async getImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.width, height: img.height });
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => resolve(null);
      img.src = URL.createObjectURL(file);
    });
  }

  /**
   * Get media duration
   */
  private async getMediaDuration(file: File): Promise<number | null> {
    return new Promise((resolve) => {
      const isVideo = file.type.startsWith('video/');
      const element = isVideo ? document.createElement('video') : document.createElement('audio');
      
      element.onloadedmetadata = () => {
        resolve(element.duration);
        URL.revokeObjectURL(element.src);
      };
      element.onerror = () => resolve(null);
      element.src = URL.createObjectURL(file);
    });
  }

  /**
   * Compress image file
   */
  async compressImage(
    file: File,
    maxWidth = 1920,
    maxHeight = 1080,
    quality = 0.8
  ): Promise<File> {
    if (!file.type.startsWith('image/')) {
      return file;
    }

    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      img.onload = () => {
        let { width, height } = img;

        // Calculate new dimensions
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        if (height > maxHeight) {
          width = (width * maxHeight) / height;
          height = maxHeight;
        }

        canvas.width = width;
        canvas.height = height;

        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            (blob) => {
              if (blob) {
                const compressedFile = new File([blob], file.name, {
                  type: file.type,
                  lastModified: file.lastModified,
                });
                resolve(compressedFile);
              } else {
                resolve(file);
              }
            },
            file.type,
            quality
          );
        } else {
          resolve(file);
        }

        URL.revokeObjectURL(img.src);
      };

      img.onerror = () => resolve(file);
      img.src = URL.createObjectURL(file);
    });
  }

  /**
   * Generate unique file ID
   */
  private generateFileId(file: File): string {
    return `${file.name}-${file.size}-${file.lastModified}`;
  }

  /**
   * Chunk array into smaller arrays
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Get CSRF token for security
   */
  private getCSRFToken(): string | null {
    // Try to get CSRF token from meta tag
    const metaToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
    if (metaToken) return metaToken;

    // Try to get from cookie
    const cookieMatch = document.cookie.match(/csrf[-_]token=([^;]+)/i);
    if (cookieMatch) return cookieMatch[1];

    return null;
  }
}

/**
 * Default file upload service instance
 */
let defaultService: FileUploadService | null = null;

/**
 * Get or create default file upload service
 */
export function getFileUploadService(uploadEndpoint?: string): FileUploadService {
  if (!defaultService || uploadEndpoint) {
    defaultService = new FileUploadService(uploadEndpoint || '/api/upload');
  }
  return defaultService;
}

/**
 * React hook for file upload service
 */
export function useFileUpload(uploadEndpoint?: string) {
  const service = getFileUploadService(uploadEndpoint);

  const uploadFile = async (
    file: File,
    onProgress?: UploadProgressCallback
  ): Promise<UploadResponse> => {
    return service.uploadFile(file, onProgress);
  };

  const uploadFiles = async (
    files: File[],
    onProgress?: (fileId: string, progress: number) => void
  ): Promise<Map<string, UploadResponse>> => {
    return service.uploadFiles(files, onProgress);
  };

  const generateThumbnail = async (file: File): Promise<string | null> => {
    return service.generateThumbnail(file);
  };

  const compressImage = async (file: File): Promise<File> => {
    return service.compressImage(file);
  };

  const getMetadata = async (file: File): Promise<FileAttachment['metadata']> => {
    return service.getFileMetadata(file);
  };

  return {
    uploadFile,
    uploadFiles,
    generateThumbnail,
    compressImage,
    getMetadata,
    cancelUpload: service.cancelUpload.bind(service),
    cancelAllUploads: service.cancelAllUploads.bind(service),
  };
}