import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';
import path from 'path';

class R2Service {
  constructor() {
    this.client = null;
  }

  getClient() {
    const accountId = (process.env.R2_ACCOUNT_ID || '').trim();
    const accessKeyId = (process.env.R2_ACCESS_KEY_ID || '').trim();
    const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY || '').trim();

    if (!accountId || !accessKeyId || !secretAccessKey) {
      throw new Error(
        'R2 Configuration Error: Missing R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, or R2_SECRET_ACCESS_KEY in backend environment variables (.env). Please fill in your Cloudflare R2 credentials.'
      );
    }

    if (!this.client) {
      this.client = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId,
          secretAccessKey
        },
        forcePathStyle: true
      });
    }
    return this.client;
  }

  getBucketName() {
    return process.env.R2_BUCKET_NAME || 'hijabsbyshiza-images';
  }

  getPublicUrl() {
    const rawUrl = process.env.R2_PUBLIC_URL || 'https://images.hijabsbyshiza.com';
    return rawUrl.replace(/\/+$/, '');
  }

  /**
   * Preserves exact Cloudinary folder names for R2 object keys to enable seamless migration.
   */
  mapFolderToPrefix(folder = 'hbs-products') {
    return folder;
  }

  /**
   * Infer file extension from original name or mimetype
   */
  getFileExtension(file) {
    if (file.originalname) {
      const ext = path.extname(file.originalname).toLowerCase();
      if (ext) return ext;
    }
    
    const mimeMap = {
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/avif': '.avif',
      'image/gif': '.gif',
      'application/pdf': '.pdf'
    };
    return mimeMap[file.mimetype] || '.jpg';
  }

  /**
   * Upload single file buffer to R2
   */
  async uploadSingle(file, folder = 'hbs-products', options = {}) {
    const prefix = this.mapFolderToPrefix(folder);
    const ext = this.getFileExtension(file);
    const uniqueId = crypto.randomUUID();
    
    let key;
    if (options.subPath) {
      key = `${prefix}/${options.subPath}/${uniqueId}${ext}`;
    } else {
      key = `${prefix}/${uniqueId}${ext}`;
    }

    const bucketName = this.getBucketName();
    const publicUrl = this.getPublicUrl();
    const contentType = file.mimetype || 'application/octet-stream';
    const cacheControl = options.cacheControl || 'public, max-age=31536000, immutable';

    console.log(`[R2] Upload started: ${key}`);

    try {
      const client = this.getClient();
      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: file.buffer,
        ContentType: contentType,
        CacheControl: cacheControl
      });

      await client.send(command);

      const finalUrl = `${publicUrl}/${key}`;
      console.log(`[R2] Upload successful: ${key}`);

      return {
        provider: 'r2',
        key,
        url: finalUrl
      };
    } catch (error) {
      console.error(`[R2] Upload failed: ${key} - ${error.message}`);
      throw new Error(`R2 upload failed for key ${key}: ${error.message}`);
    }
  }

  /**
   * Extract object key from URL or string key
   */
  extractKey(imageOrKeyOrUrl) {
    if (!imageOrKeyOrUrl) return null;
    if (typeof imageOrKeyOrUrl === 'object') {
      if (imageOrKeyOrUrl.key) return imageOrKeyOrUrl.key;
      if (imageOrKeyOrUrl.url) return this.extractKey(imageOrKeyOrUrl.url);
      return null;
    }
    
    if (typeof imageOrKeyOrUrl === 'string') {
      const publicUrl = this.getPublicUrl();
      if (imageOrKeyOrUrl.startsWith(publicUrl)) {
        return imageOrKeyOrUrl.replace(`${publicUrl}/`, '');
      }
      if (imageOrKeyOrUrl.startsWith('https://images.hijabsbyshiza.com/')) {
        return imageOrKeyOrUrl.replace('https://images.hijabsbyshiza.com/', '');
      }
      if (imageOrKeyOrUrl.includes('.r2.cloudflarestorage.com/')) {
        const parts = imageOrKeyOrUrl.split('.r2.cloudflarestorage.com/');
        const afterHost = parts[1] || '';
        const slashIdx = afterHost.indexOf('/');
        return slashIdx !== -1 ? afterHost.substring(slashIdx + 1) : afterHost;
      }
      // If it doesn't look like an HTTP URL, assume it's directly a key
      if (!imageOrKeyOrUrl.startsWith('http://') && !imageOrKeyOrUrl.startsWith('https://')) {
        return imageOrKeyOrUrl;
      }
    }
    return null;
  }

  /**
   * Delete object from R2
   */
  async deleteFile(imageOrKeyOrUrl) {
    const key = this.extractKey(imageOrKeyOrUrl);
    if (!key) {
      console.warn(`[R2] Delete skipped: unable to derive key from ${JSON.stringify(imageOrKeyOrUrl)}`);
      return false;
    }

    console.log(`[R2] Delete started: ${key}`);

    try {
      const client = this.getClient();
      const command = new DeleteObjectCommand({
        Bucket: this.getBucketName(),
        Key: key
      });
      await client.send(command);
      console.log(`[R2] Delete successful: ${key}`);
      return true;
    } catch (error) {
      console.error(`[R2] Delete failed: ${key} - ${error.message}`);
      throw new Error(`R2 deletion failed for key ${key}: ${error.message}`);
    }
  }
}

export default new R2Service();
