import fs from 'fs';
import path from 'path';
import { AppError } from '../middleware/errorHandler';
import { ErrorCode } from '@shared/errors';
import {
  UPLOAD_DIR,
  MAX_FILE_SIZE,
  MAX_IMAGES_PER_PRODUCT,
  ALLOWED_MIME_TYPES,
} from '../config/upload';

/**
 * Result of a successfully processed image upload.
 */
export interface ProcessedImage {
  /** Public URL path to access the image */
  url: string;
  /** UUID-based filename stored on disk */
  filename: string;
}

/**
 * Magic bytes (file signatures) for validating image file headers.
 * This provides content-based validation beyond the MIME type reported by the client.
 */
const FILE_SIGNATURES: { mime: string; bytes: number[]; offset?: number }[] = [
  // JPEG: starts with FF D8 FF
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  // PNG: starts with 89 50 4E 47 0D 0A 1A 0A
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  // WebP: starts with RIFF....WEBP (bytes 0-3: RIFF, bytes 8-11: WEBP)
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] },
];

/** WebP secondary signature at offset 8 */
const WEBP_SIGNATURE = [0x57, 0x45, 0x42, 0x50];

/**
 * Upload Service
 *
 * Handles product image processing including validation, storage, and cleanup.
 * Ensures atomicity: either all files are saved successfully or none are (rollback on failure).
 *
 * Requirements: 3.1, 3.2, 3.4, 3.7
 */
export class UploadService {
  private uploadDir: string;

  constructor(uploadDir?: string) {
    this.uploadDir = uploadDir || UPLOAD_DIR;
    this.ensureUploadDir();
  }

  /**
   * Processes uploaded image files: validates content and returns metadata.
   *
   * Preconditions:
   * - `files` contains 1–5 files
   * - Each file has mimetype in ['image/jpeg', 'image/png', 'image/webp']
   * - Each file size ≤ 5MB (5,242,880 bytes)
   *
   * Postconditions:
   * - Each file is saved to the upload directory with a unique UUID-based filename
   * - Returns array of { url, filename } for each processed file
   * - If any file fails validation: throws AppError(400) with details
   * - No partial writes: either all files are saved or none are
   *
   * @param files - Array of Multer file objects
   * @returns Array of processed image metadata
   * @throws AppError if validation fails
   */
  async processImages(files: Express.Multer.File[]): Promise<ProcessedImage[]> {
    // Validate file count
    if (!files || files.length === 0) {
      throw new AppError(
        400,
        ErrorCode.ValidationError,
        'At least 1 image file is required.',
      );
    }

    if (files.length > MAX_IMAGES_PER_PRODUCT) {
      throw new AppError(
        400,
        ErrorCode.ValidationError,
        `Maximum ${MAX_IMAGES_PER_PRODUCT} images per product. Received: ${files.length}`,
      );
    }

    const processedImages: ProcessedImage[] = [];

    try {
      for (const file of files) {
        // Validate file size
        this.validateFileSize(file);

        // Validate MIME type from file header (magic bytes)
        await this.validateFileHeader(file);

        // File has already been written to disk by Multer at this point.
        // Record the processed image metadata.
        processedImages.push({
          url: `/uploads/${file.filename}`,
          filename: file.filename,
        });
      }

      return processedImages;
    } catch (error) {
      // Rollback: clean up any files that were written during this batch
      await this.cleanupFiles(files);
      throw error;
    }
  }

  /**
   * Removes uploaded files from disk. Used for rollback on failure.
   * Silently ignores files that don't exist (already cleaned up or never written).
   *
   * @param files - Array of Multer file objects to clean up
   */
  async cleanupFiles(files: Express.Multer.File[]): Promise<void> {
    if (!files || files.length === 0) return;

    const deletionPromises = files.map(async (file) => {
      const filePath = file.path || path.join(this.uploadDir, file.filename);
      try {
        await fs.promises.unlink(filePath);
      } catch {
        // File may not exist if it was never written — ignore
      }
    });

    await Promise.all(deletionPromises);
  }

  /**
   * Validates that a file's size does not exceed the maximum allowed.
   *
   * @param file - Multer file object
   * @throws AppError if file exceeds 5MB
   */
  private validateFileSize(file: Express.Multer.File): void {
    if (file.size > MAX_FILE_SIZE) {
      throw new AppError(
        400,
        ErrorCode.ValidationError,
        `File "${file.originalname}" exceeds maximum size of 5MB. Size: ${(file.size / (1024 * 1024)).toFixed(2)}MB`,
      );
    }
  }

  /**
   * Validates a file's content by reading its magic bytes (file header).
   * This prevents spoofed MIME types from being accepted.
   *
   * @param file - Multer file object (must have a path on disk)
   * @throws AppError if file header doesn't match an accepted format
   */
  private async validateFileHeader(file: Express.Multer.File): Promise<void> {
    const filePath = file.path || path.join(this.uploadDir, file.filename);

    // Read the first 12 bytes to check file signature
    const fd = await fs.promises.open(filePath, 'r');
    try {
      const buffer = Buffer.alloc(12);
      await fd.read(buffer, 0, 12, 0);

      const isValid = this.matchesFileSignature(buffer, file.mimetype);
      if (!isValid) {
        throw new AppError(
          400,
          ErrorCode.ValidationError,
          `File "${file.originalname}" has invalid content. Accepted formats: JPEG, PNG, WebP.`,
        );
      }
    } finally {
      await fd.close();
    }
  }

  /**
   * Checks if a buffer's magic bytes match the expected file signature
   * for the given MIME type.
   *
   * @param buffer - First 12 bytes of the file
   * @param mimetype - The declared MIME type to validate against
   * @returns true if the file header matches the expected signature
   */
  private matchesFileSignature(buffer: Buffer, mimetype: string): boolean {
    if (!ALLOWED_MIME_TYPES.includes(mimetype as typeof ALLOWED_MIME_TYPES[number])) {
      return false;
    }

    switch (mimetype) {
      case 'image/jpeg':
        return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;

      case 'image/png':
        return (
          buffer[0] === 0x89 &&
          buffer[1] === 0x50 &&
          buffer[2] === 0x4e &&
          buffer[3] === 0x47 &&
          buffer[4] === 0x0d &&
          buffer[5] === 0x0a &&
          buffer[6] === 0x1a &&
          buffer[7] === 0x0a
        );

      case 'image/webp':
        // RIFF header at offset 0 and WEBP at offset 8
        return (
          buffer[0] === 0x52 &&
          buffer[1] === 0x49 &&
          buffer[2] === 0x46 &&
          buffer[3] === 0x46 &&
          buffer[8] === 0x57 &&
          buffer[9] === 0x45 &&
          buffer[10] === 0x42 &&
          buffer[11] === 0x50
        );

      default:
        return false;
    }
  }

  /**
   * Ensures the upload directory exists, creating it if necessary.
   */
  private ensureUploadDir(): void {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }
}
