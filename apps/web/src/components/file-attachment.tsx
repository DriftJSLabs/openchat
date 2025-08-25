'use client';

import { cn } from '@/lib/utils';
import type { HTMLAttributes } from 'react';
import { useState, useCallback, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  FileIcon,
  ImageIcon,
  VideoIcon,
  FileTextIcon,
  DownloadIcon,
  EyeIcon,
  TrashIcon,
  MoreHorizontalIcon,
  X,
  UploadIcon,
  FileAudioIcon,
  FileSpreadsheetIcon,
  ArchiveIcon,
  ZapIcon,
  AlertTriangleIcon,
  CheckCircle2Icon,
  Loader2Icon,
} from 'lucide-react';

/**
 * File attachment data structure
 */
export interface FileAttachment {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  url?: string;
  uploadProgress?: number;
  uploadStatus: 'pending' | 'uploading' | 'completed' | 'error';
  errorMessage?: string;
  thumbnail?: string;
  metadata?: {
    duration?: number; // For audio/video files
    dimensions?: { width: number; height: number }; // For images
    pages?: number; // For PDFs
  };
}

/**
 * Upload configuration
 */
export interface UploadConfig {
  maxFileSize: number; // in bytes
  maxFiles: number;
  allowedTypes: string[];
  allowedExtensions: string[];
  uploadEndpoint: string;
  thumbnailGeneration?: boolean;
  compressionEnabled?: boolean;
}

/**
 * Props for the FileAttachmentUpload component
 */
export interface FileAttachmentUploadProps extends HTMLAttributes<HTMLDivElement> {
  /** Current attachments */
  attachments: FileAttachment[];
  /** Upload configuration */
  config: UploadConfig;
  /** File selection handler */
  onFilesSelected: (files: File[]) => void;
  /** File removal handler */
  onFileRemove: (fileId: string) => void;
  /** Upload handler */
  onUpload: (file: FileAttachment) => Promise<void>;
  /** Whether upload is disabled */
  disabled?: boolean;
  /** Whether to show drag overlay */
  showDragOverlay?: boolean;
  /** Whether to accept multiple files */
  multiple?: boolean;
}

/**
 * Main file attachment upload component with drag & drop support,
 * progress tracking, and comprehensive file management.
 * 
 * Features:
 * - Drag and drop file upload with visual feedback
 * - File type validation and size limits
 * - Upload progress tracking with cancel capability
 * - File preview with thumbnails for images
 * - Support for multiple file types (documents, images, videos, etc.)
 * - Responsive grid layout for file display
 * - Error handling with retry mechanisms
 * - Accessibility compliant with keyboard navigation
 */
export function FileAttachmentUpload({
  className,
  attachments,
  config,
  onFilesSelected,
  onFileRemove,
  onUpload,
  disabled = false,
  showDragOverlay = true,
  multiple = true,
  ...props
}: FileAttachmentUploadProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [dragCounter, setDragCounter] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Get appropriate icon for file type
   */
  const getFileIcon = useCallback((type: string, name: string) => {
    const extension = name.split('.').pop()?.toLowerCase();
    
    if (type.startsWith('image/')) {
      return ImageIcon;
    } else if (type.startsWith('video/')) {
      return VideoIcon;
    } else if (type.startsWith('audio/')) {
      return FileAudioIcon;
    } else if (type.includes('pdf') || extension === 'pdf') {
      return FileTextIcon;
    } else if (['xls', 'xlsx', 'csv'].includes(extension || '')) {
      return FileSpreadsheetIcon;
    } else if (['zip', 'rar', '7z', 'tar', 'gz'].includes(extension || '')) {
      return ArchiveIcon;
    } else {
      return FileIcon;
    }
  }, []);

  /**
   * Format file size for display
   */
  const formatFileSize = useCallback((bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }, []);

  /**
   * Validate files against configuration
   */
  const validateFiles = useCallback((files: File[]): { valid: File[]; invalid: Array<{ file: File; reason: string }> } => {
    const valid: File[] = [];
    const invalid: Array<{ file: File; reason: string }> = [];

    files.forEach(file => {
      // Check file size
      if (file.size > config.maxFileSize) {
        invalid.push({
          file,
          reason: `File too large. Maximum size is ${formatFileSize(config.maxFileSize)}.`
        });
        return;
      }

      // Check file type
      const isTypeAllowed = config.allowedTypes.some(type => {
        if (type.includes('*')) {
          const [category] = type.split('/');
          return file.type.startsWith(category);
        }
        return file.type === type;
      });

      // Check file extension
      const extension = file.name.split('.').pop()?.toLowerCase();
      const isExtensionAllowed = extension && config.allowedExtensions.includes(extension);

      if (!isTypeAllowed && !isExtensionAllowed) {
        invalid.push({
          file,
          reason: 'File type not supported.'
        });
        return;
      }

      valid.push(file);
    });

    // Check total file count
    if (attachments.length + valid.length > config.maxFiles) {
      const allowedCount = config.maxFiles - attachments.length;
      const exceededFiles = valid.splice(allowedCount);
      exceededFiles.forEach(file => {
        invalid.push({
          file,
          reason: `Maximum ${config.maxFiles} files allowed.`
        });
      });
    }

    return { valid, invalid };
  }, [config, attachments.length, formatFileSize]);

  /**
   * Handle file selection from input
   */
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      const { valid, invalid } = validateFiles(files);
      
      if (invalid.length > 0) {
        // Show validation errors
        invalid.forEach(({ file, reason }) => {
          console.warn(`File "${file.name}" rejected: ${reason}`);
        });
      }
      
      if (valid.length > 0) {
        onFilesSelected(valid);
      }
    }
    
    // Reset input
    e.target.value = '';
  }, [validateFiles, onFilesSelected]);

  /**
   * Handle drag events
   */
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter(prev => prev + 1);
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter(prev => prev - 1);
    if (dragCounter <= 1) {
      setIsDragActive(false);
    }
  }, [dragCounter]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    setDragCounter(0);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      const { valid, invalid } = validateFiles(files);
      
      if (invalid.length > 0) {
        // Show validation errors
        invalid.forEach(({ file, reason }) => {
          console.warn(`File "${file.name}" rejected: ${reason}`);
        });
      }
      
      if (valid.length > 0) {
        onFilesSelected(valid);
      }
    }
  }, [validateFiles, onFilesSelected]);

  return (
    <div
      className={cn('space-y-4', className)}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      {...props}
    >
      {/* Upload Area */}
      <div
        className={cn(
          'relative border-2 border-dashed rounded-lg transition-colors',
          isDragActive 
            ? 'border-primary bg-primary/5' 
            : 'border-muted-foreground/25 hover:border-primary/50',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        {/* Drag Overlay */}
        {showDragOverlay && isDragActive && (
          <div className="absolute inset-0 bg-primary/10 rounded-lg flex items-center justify-center z-10">
            <div className="text-center space-y-2">
              <UploadIcon className="h-12 w-12 text-primary mx-auto" />
              <p className="text-lg font-medium text-primary">Drop files here</p>
              <p className="text-sm text-muted-foreground">
                Maximum {config.maxFiles} files, up to {formatFileSize(config.maxFileSize)} each
              </p>
            </div>
          </div>
        )}

        {/* Upload Button Area */}
        <div className="p-8 text-center space-y-4">
          <UploadIcon className="h-12 w-12 text-muted-foreground mx-auto" />
          <div className="space-y-2">
            <h3 className="text-lg font-medium">Upload Files</h3>
            <p className="text-sm text-muted-foreground">
              Drag and drop files here, or click to select files
            </p>
          </div>
          
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            variant="outline"
          >
            <UploadIcon className="mr-2 h-4 w-4" />
            Choose Files
          </Button>

          {/* File constraints */}
          <div className="text-xs text-muted-foreground space-y-1">
            <p>Maximum {config.maxFiles} files, up to {formatFileSize(config.maxFileSize)} each</p>
            <p>Supported: {config.allowedExtensions.join(', ')}</p>
          </div>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple={multiple}
          accept={config.allowedTypes.join(',')}
          onChange={handleFileInputChange}
          className="hidden"
          disabled={disabled}
        />
      </div>

      {/* Attached Files List */}
      {attachments.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">
            Attached Files ({attachments.length})
          </h4>
          <div className="grid gap-2">
            {attachments.map((attachment) => (
              <FileAttachmentItem
                key={attachment.id}
                attachment={attachment}
                onRemove={() => onFileRemove(attachment.id)}
                onUpload={() => onUpload(attachment)}
                getFileIcon={getFileIcon}
                formatFileSize={formatFileSize}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Props for individual file attachment item
 */
interface FileAttachmentItemProps {
  attachment: FileAttachment;
  onRemove: () => void;
  onUpload: () => void;
  getFileIcon: (type: string, name: string) => any;
  formatFileSize: (bytes: number) => string;
}

/**
 * Individual file attachment item component
 */
function FileAttachmentItem({
  attachment,
  onRemove,
  onUpload,
  getFileIcon,
  formatFileSize,
}: FileAttachmentItemProps) {
  const FileIconComponent = getFileIcon(attachment.type, attachment.name);

  return (
    <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg border">
      {/* File Icon/Thumbnail */}
      <div className="flex-shrink-0">
        {attachment.thumbnail ? (
          <img
            src={attachment.thumbnail}
            alt={attachment.name}
            className="h-10 w-10 object-cover rounded"
          />
        ) : (
          <div className="h-10 w-10 bg-muted rounded flex items-center justify-center">
            <FileIconComponent className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* File Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{attachment.name}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{formatFileSize(attachment.size)}</span>
          {attachment.uploadStatus === 'uploading' && attachment.uploadProgress !== undefined && (
            <Progress value={attachment.uploadProgress} className="w-20 h-1" />
          )}
        </div>
      </div>

      {/* Status Badge */}
      <div className="flex-shrink-0">
        {attachment.uploadStatus === 'pending' && (
          <Badge variant="secondary">
            <ZapIcon className="mr-1 h-3 w-3" />
            Ready
          </Badge>
        )}
        {attachment.uploadStatus === 'uploading' && (
          <Badge variant="secondary">
            <Loader2Icon className="mr-1 h-3 w-3 animate-spin" />
            Uploading
          </Badge>
        )}
        {attachment.uploadStatus === 'completed' && (
          <Badge variant="default" className="bg-green-500">
            <CheckCircle2Icon className="mr-1 h-3 w-3" />
            Done
          </Badge>
        )}
        {attachment.uploadStatus === 'error' && (
          <Badge variant="destructive">
            <AlertTriangleIcon className="mr-1 h-3 w-3" />
            Error
          </Badge>
        )}
      </div>

      {/* Actions */}
      <div className="flex-shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <MoreHorizontalIcon className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {attachment.url && (
              <>
                <DropdownMenuItem asChild>
                  <a href={attachment.url} target="_blank" rel="noopener noreferrer">
                    <EyeIcon className="mr-2 h-4 w-4" />
                    Preview
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={attachment.url} download={attachment.name}>
                    <DownloadIcon className="mr-2 h-4 w-4" />
                    Download
                  </a>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            {attachment.uploadStatus === 'error' && (
              <>
                <DropdownMenuItem onClick={onUpload}>
                  <UploadIcon className="mr-2 h-4 w-4" />
                  Retry Upload
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onClick={onRemove} className="text-destructive">
              <TrashIcon className="mr-2 h-4 w-4" />
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

/**
 * Props for FilePreviewModal
 */
interface FilePreviewModalProps {
  attachment: FileAttachment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Modal for previewing file attachments
 */
export function FilePreviewModal({
  attachment,
  open,
  onOpenChange,
}: FilePreviewModalProps) {
  if (!attachment) return null;

  const isImage = attachment.type.startsWith('image/');
  const isVideo = attachment.type.startsWith('video/');
  const isAudio = attachment.type.startsWith('audio/');
  const isPdf = attachment.type.includes('pdf');
  const isText = attachment.type.startsWith('text/');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileIcon className="h-5 w-5" />
            {attachment.name}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh]">
          <div className="space-y-4">
            {/* File Info */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Size:</span> {(attachment.size / 1024).toFixed(1)} KB
              </div>
              <div>
                <span className="text-muted-foreground">Type:</span> {attachment.type}
              </div>
            </div>

            {/* Preview Content */}
            <div className="border rounded-lg overflow-hidden">
              {isImage && attachment.url && (
                <img
                  src={attachment.url}
                  alt={attachment.name}
                  className="w-full h-auto max-h-96 object-contain"
                />
              )}
              
              {isVideo && attachment.url && (
                <video
                  src={attachment.url}
                  controls
                  className="w-full h-auto max-h-96"
                  preload="metadata"
                >
                  Your browser does not support the video tag.
                </video>
              )}
              
              {isAudio && attachment.url && (
                <div className="p-8 text-center">
                  <FileAudioIcon className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                  <audio
                    src={attachment.url}
                    controls
                    className="w-full max-w-md mx-auto"
                    preload="metadata"
                  >
                    Your browser does not support the audio tag.
                  </audio>
                </div>
              )}
              
              {isPdf && attachment.url && (
                <iframe
                  src={attachment.url}
                  className="w-full h-96 border-0"
                  title={attachment.name}
                />
              )}
              
              {!isImage && !isVideo && !isAudio && !isPdf && (
                <div className="p-8 text-center text-muted-foreground">
                  <FileIcon className="h-16 w-16 mx-auto mb-4" />
                  <p>Preview not available for this file type</p>
                  {attachment.url && (
                    <Button variant="outline" asChild className="mt-4">
                      <a href={attachment.url} download={attachment.name}>
                        <DownloadIcon className="mr-2 h-4 w-4" />
                        Download File
                      </a>
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Compact file attachment display for messages
 */
export interface FileAttachmentCompactProps extends HTMLAttributes<HTMLDivElement> {
  attachments: FileAttachment[];
  maxDisplay?: number;
  onPreview?: (attachment: FileAttachment) => void;
}

export function FileAttachmentCompact({
  className,
  attachments,
  maxDisplay = 3,
  onPreview,
  ...props
}: FileAttachmentCompactProps) {
  const displayAttachments = attachments.slice(0, maxDisplay);
  const remainingCount = Math.max(0, attachments.length - maxDisplay);

  if (attachments.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap gap-2', className)} {...props}>
      {displayAttachments.map((attachment) => {
        const isImage = attachment.type.startsWith('image/');
        
        return (
          <Button
            key={attachment.id}
            variant="outline"
            size="sm"
            className="h-auto p-2 flex items-center gap-2 max-w-48"
            onClick={() => onPreview?.(attachment)}
          >
            {isImage && attachment.thumbnail ? (
              <img
                src={attachment.thumbnail}
                alt={attachment.name}
                className="h-6 w-6 object-cover rounded"
              />
            ) : (
              <FileIcon className="h-4 w-4" />
            )}
            <span className="truncate text-xs">{attachment.name}</span>
          </Button>
        );
      })}
      
      {remainingCount > 0 && (
        <Badge variant="secondary" className="h-8">
          +{remainingCount} more
        </Badge>
      )}
    </div>
  );
}