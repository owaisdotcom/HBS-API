import cloudinary from '../config/cloudinary.js';
import r2Service from './r2.service.js';
import { Readable } from 'stream';

class UploadService {
  getStorageProvider() {
    return process.env.IMAGE_STORAGE_PROVIDER || 'r2';
  }

  /**
   * Upload a single file to current storage provider (default R2)
   */
  async uploadSingle(file, folder = 'hbs-products', options = {}) {
    const provider = options.provider || this.getStorageProvider();
    
    if (provider === 'r2') {
      return r2Service.uploadSingle(file, folder, options);
    }

    // Fallback: Cloudinary
    return new Promise((resolve, reject) => {
      const transformations = this.getTransformations(folder);
      
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'auto',
          transformation: transformations
        },
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve({
              provider: 'cloudinary',
              url: result.secure_url,
              publicId: result.public_id
            });
          }
        }
      );

      Readable.from(file.buffer).pipe(uploadStream);
    });
  }

  getTransformations(folder) {
    if (folder === 'hbs-hero') {
      return [
        { width: 1920, height: 800, crop: 'fill', gravity: 'center' },
        { quality: 'auto:good' },
        { fetch_format: 'auto' }
      ];
    }
    return [
      { width: 1000, height: 1000, crop: 'limit' },
      { quality: 'auto:good' },
      { fetch_format: 'auto' }
    ];
  }

  /**
   * Upload multiple files to storage provider.
   * Cleans up successful uploads in the batch if any file fails.
   */
  async uploadMultiple(files, folder = 'hbs-products', options = {}) {
    if (!files || files.length === 0) return [];
    
    const results = [];
    try {
      for (const file of files) {
        const result = await this.uploadSingle(file, folder, options);
        results.push(result);
      }
      return results;
    } catch (error) {
      console.error(`[UploadService] Batch upload failed for folder '${folder}'. Cleaning up ${results.length} successfully uploaded files...`);
      for (const item of results) {
        try {
          await this.deleteImage(item);
        } catch (cleanupErr) {
          console.error(`[UploadService] Cleanup failed for item: ${JSON.stringify(item)} - ${cleanupErr.message}`);
        }
      }
      throw error;
    }
  }

  /**
   * Universal delete function handling both R2 and Cloudinary assets
   */
  async deleteImage(imageOrIdentifier) {
    if (!imageOrIdentifier) return null;

    let provider = null;
    let publicId = null;
    let key = null;
    let url = null;

    if (typeof imageOrIdentifier === 'object') {
      provider = imageOrIdentifier.provider;
      publicId = imageOrIdentifier.publicId;
      key = imageOrIdentifier.key;
      url = imageOrIdentifier.url;
    } else if (typeof imageOrIdentifier === 'string') {
      url = imageOrIdentifier;
      if (url.includes('res.cloudinary.com')) {
        provider = 'cloudinary';
        publicId = this.getPublicIdFromUrl(url);
      } else if (url.includes('images.hijabsbyshiza.com') || url.includes('.r2.cloudflarestorage.com')) {
        provider = 'r2';
        key = r2Service.extractKey(url);
      } else if (url.includes('/')) {
        if (url.startsWith('hbs-') || url.includes('.')) {
          provider = 'r2';
          key = url;
        } else {
          provider = 'cloudinary';
          publicId = url;
        }
      }
    }

    if (provider === 'r2' || key || (url && (url.includes('images.hijabsbyshiza.com') || url.includes('.r2.cloudflarestorage.com')))) {
      return r2Service.deleteFile(imageOrIdentifier);
    }

    if (provider === 'cloudinary' || publicId || (url && url.includes('res.cloudinary.com'))) {
      try {
        const targetPublicId = publicId || (url ? this.getPublicIdFromUrl(url) : imageOrIdentifier);
        const result = await cloudinary.uploader.destroy(targetPublicId);
        console.log(`[Cloudinary] Delete result for ${targetPublicId}:`, result);
        return result;
      } catch (error) {
        throw new Error(`Failed to delete Cloudinary image: ${error.message}`);
      }
    }

    // Default fallback: try R2, then Cloudinary
    try {
      return await r2Service.deleteFile(imageOrIdentifier);
    } catch (e) {
      console.warn(`[UploadService] Fallback R2 delete failed, trying Cloudinary: ${e.message}`);
      const targetPublicId = typeof imageOrIdentifier === 'string' ? imageOrIdentifier : (publicId || (url ? this.getPublicIdFromUrl(url) : null));
      if (targetPublicId) {
        return cloudinary.uploader.destroy(targetPublicId);
      }
    }
  }

  getPublicIdFromUrl(url) {
    if (!url || typeof url !== 'string') return '';
    const parts = url.split('/');
    const filename = parts[parts.length - 1];
    const publicId = filename.split('.')[0];
    return `${parts[parts.length - 2]}/${publicId}`;
  }
}

export default new UploadService();
