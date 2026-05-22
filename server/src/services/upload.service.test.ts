import fs from 'fs';
import path from 'path';
import os from 'os';
import { UploadService, ProcessedImage } from './upload.service';

/**
 * Unit tests for UploadService.
 * Tests image processing, validation, and cleanup functionality.
 *
 * Requirements: 3.1, 3.2, 3.4, 3.7
 */

// Helper to create a temp directory for test uploads
function createTempUploadDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'upload-test-'));
}

// JPEG magic bytes: FF D8 FF E0
const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);

// PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);

// WebP magic bytes: RIFF....WEBP
const WEBP_HEADER = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);

// Invalid file header (plain text)
const INVALID_HEADER = Buffer.from('This is not an image file at all');

/**
 * Creates a mock Multer file object for testing.
 */
function createMockFile(
  uploadDir: string,
  options: {
    mimetype?: string;
    size?: number;
    header?: Buffer;
    filename?: string;
    originalname?: string;
  } = {},
): Express.Multer.File {
  const {
    mimetype = 'image/jpeg',
    size = 1024,
    header = JPEG_HEADER,
    filename = `test-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`,
    originalname = 'photo.jpg',
  } = options;

  const filePath = path.join(uploadDir, filename);

  // Write a file with the specified header + padding to reach desired size
  const padding = Buffer.alloc(Math.max(0, size - header.length));
  fs.writeFileSync(filePath, Buffer.concat([header, padding]));

  return {
    fieldname: 'images',
    originalname,
    encoding: '7bit',
    mimetype,
    size,
    destination: uploadDir,
    filename,
    path: filePath,
    buffer: Buffer.concat([header, padding]),
    stream: null as any,
  };
}

describe('UploadService', () => {
  let uploadDir: string;
  let service: UploadService;

  beforeEach(() => {
    uploadDir = createTempUploadDir();
    service = new UploadService(uploadDir);
  });

  afterEach(() => {
    // Clean up temp directory
    try {
      fs.rmSync(uploadDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('processImages', () => {
    it('should process a single valid JPEG file', async () => {
      const file = createMockFile(uploadDir, { mimetype: 'image/jpeg', header: JPEG_HEADER });

      const result = await service.processImages([file]);

      expect(result).toHaveLength(1);
      expect(result[0].url).toBe(`/uploads/${file.filename}`);
      expect(result[0].filename).toBe(file.filename);
    });

    it('should process a single valid PNG file', async () => {
      const file = createMockFile(uploadDir, {
        mimetype: 'image/png',
        header: PNG_HEADER,
        filename: 'test-image.png',
        originalname: 'photo.png',
      });

      const result = await service.processImages([file]);

      expect(result).toHaveLength(1);
      expect(result[0].url).toBe('/uploads/test-image.png');
    });

    it('should process a single valid WebP file', async () => {
      const file = createMockFile(uploadDir, {
        mimetype: 'image/webp',
        header: WEBP_HEADER,
        filename: 'test-image.webp',
        originalname: 'photo.webp',
      });

      const result = await service.processImages([file]);

      expect(result).toHaveLength(1);
      expect(result[0].url).toBe('/uploads/test-image.webp');
    });

    it('should process multiple valid files (up to 5)', async () => {
      const files = [
        createMockFile(uploadDir, { mimetype: 'image/jpeg', header: JPEG_HEADER, filename: 'img1.jpg' }),
        createMockFile(uploadDir, { mimetype: 'image/png', header: PNG_HEADER, filename: 'img2.png' }),
        createMockFile(uploadDir, { mimetype: 'image/webp', header: WEBP_HEADER, filename: 'img3.webp' }),
      ];

      const result = await service.processImages(files);

      expect(result).toHaveLength(3);
      expect(result[0].filename).toBe('img1.jpg');
      expect(result[1].filename).toBe('img2.png');
      expect(result[2].filename).toBe('img3.webp');
    });

    it('should reject empty file array', async () => {
      await expect(service.processImages([])).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('At least 1 image file is required'),
      });
    });

    it('should reject null/undefined files', async () => {
      await expect(service.processImages(null as any)).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('At least 1 image file is required'),
      });
    });

    it('should reject more than 5 files', async () => {
      const files = Array.from({ length: 6 }, (_, i) =>
        createMockFile(uploadDir, { filename: `img${i}.jpg` }),
      );

      await expect(service.processImages(files)).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('Maximum 5 images per product'),
      });
    });

    it('should reject file exceeding 5MB', async () => {
      // Create a small file on disk but report size > 5MB (mimics Multer behavior)
      const filename = 'oversized.jpg';
      const filePath = path.join(uploadDir, filename);
      fs.writeFileSync(filePath, JPEG_HEADER);

      const oversizedFile: Express.Multer.File = {
        fieldname: 'images',
        originalname: 'big-photo.jpg',
        encoding: '7bit',
        mimetype: 'image/jpeg',
        size: 5 * 1024 * 1024 + 1, // 5MB + 1 byte (reported size)
        destination: uploadDir,
        filename,
        path: filePath,
        buffer: JPEG_HEADER,
        stream: null as any,
      };

      await expect(service.processImages([oversizedFile])).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('exceeds maximum size of 5MB'),
      });
    });

    it('should accept file exactly at 5MB limit', async () => {
      // Create a small file on disk but report size = exactly 5MB
      const filename = 'maxsize.jpg';
      const filePath = path.join(uploadDir, filename);
      fs.writeFileSync(filePath, JPEG_HEADER);

      const maxSizeFile: Express.Multer.File = {
        fieldname: 'images',
        originalname: 'max-photo.jpg',
        encoding: '7bit',
        mimetype: 'image/jpeg',
        size: 5 * 1024 * 1024, // Exactly 5MB
        destination: uploadDir,
        filename,
        path: filePath,
        buffer: JPEG_HEADER,
        stream: null as any,
      };

      const result = await service.processImages([maxSizeFile]);
      expect(result).toHaveLength(1);
    });

    it('should reject file with invalid header (spoofed MIME type)', async () => {
      const spoofedFile = createMockFile(uploadDir, {
        mimetype: 'image/jpeg',
        header: INVALID_HEADER, // Not a real JPEG
      });

      await expect(service.processImages([spoofedFile])).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('invalid content'),
      });
    });

    it('should reject file with mismatched MIME type and header', async () => {
      // Claims to be JPEG but has PNG header
      const mismatchedFile = createMockFile(uploadDir, {
        mimetype: 'image/jpeg',
        header: PNG_HEADER,
      });

      await expect(service.processImages([mismatchedFile])).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('invalid content'),
      });
    });

    it('should clean up all files on validation failure', async () => {
      const validFile = createMockFile(uploadDir, {
        mimetype: 'image/jpeg',
        header: JPEG_HEADER,
        filename: 'valid.jpg',
      });
      const invalidFile = createMockFile(uploadDir, {
        mimetype: 'image/jpeg',
        header: INVALID_HEADER,
        filename: 'invalid.jpg',
      });

      await expect(service.processImages([validFile, invalidFile])).rejects.toThrow();

      // Both files should be cleaned up
      expect(fs.existsSync(path.join(uploadDir, 'valid.jpg'))).toBe(false);
      expect(fs.existsSync(path.join(uploadDir, 'invalid.jpg'))).toBe(false);
    });
  });

  describe('cleanupFiles', () => {
    it('should delete existing files', async () => {
      const file = createMockFile(uploadDir, { filename: 'to-delete.jpg' });
      expect(fs.existsSync(file.path)).toBe(true);

      await service.cleanupFiles([file]);

      expect(fs.existsSync(file.path)).toBe(false);
    });

    it('should handle non-existent files gracefully', async () => {
      const file = {
        path: path.join(uploadDir, 'nonexistent.jpg'),
        filename: 'nonexistent.jpg',
      } as Express.Multer.File;

      // Should not throw
      await expect(service.cleanupFiles([file])).resolves.toBeUndefined();
    });

    it('should handle empty array', async () => {
      await expect(service.cleanupFiles([])).resolves.toBeUndefined();
    });

    it('should handle null/undefined', async () => {
      await expect(service.cleanupFiles(null as any)).resolves.toBeUndefined();
    });
  });
});
