import multer from 'multer';
import path from 'path';
import crypto from 'crypto';

/** Maximum file size in bytes (5MB) */
export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5,242,880 bytes

/** Maximum number of images per product */
export const MAX_IMAGES_PER_PRODUCT = 5;

/** Allowed MIME types for product images */
export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

/** Upload directory path (relative to server root) */
export const UPLOAD_DIR = path.resolve(
  process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads'),
);

/**
 * Maps MIME types to file extensions.
 */
const MIME_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

/**
 * Multer disk storage configuration.
 * Generates UUID-based filenames to prevent collisions and path traversal.
 */
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const uuid = crypto.randomUUID();
    const ext = MIME_TO_EXTENSION[file.mimetype] || path.extname(file.originalname);
    cb(null, `${uuid}${ext}`);
  },
});

/**
 * Multer file filter that validates MIME type.
 * Rejects files that are not JPEG, PNG, or WebP.
 */
const fileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype as typeof ALLOWED_MIME_TYPES[number])) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Unsupported file format. Accepted formats: JPEG, PNG, WebP. Received: ${file.mimetype}`,
      ),
    );
  }
};

/**
 * Configured Multer instance for product image uploads.
 * - Local disk storage with UUID-based filenames
 * - File size limit: 5MB per file
 * - Accepted formats: JPEG, PNG, WebP
 * - Max files: 5 per request
 */
export const uploadMiddleware = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_IMAGES_PER_PRODUCT,
  },
});
