import r2Service from './r2.service.js';

class UploadService {
  /**
   * Upload a single file to Cloudflare R2
   */
  async uploadSingle(file, folder = 'hbs-products', options = {}) {
    return r2Service.uploadSingle(file, folder, options);
  }

  /**
   * Upload multiple files to Cloudflare R2.
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
      console.error(`[UploadService] Batch upload failed for folder '${folder}'. Cleaning up ${results.length} uploaded files...`);
      for (const item of results) {
        try {
          await this.deleteImage(item, { isUncommittedBatchRollback: true });
        } catch (cleanupErr) {
          console.error(`[UploadService] Cleanup failed for item: ${JSON.stringify(item)} - ${cleanupErr.message}`);
        }
      }
      throw error;
    }
  }

  /**
   * Delete file from Cloudflare R2
   */
  async deleteImage(imageOrIdentifier, options = {}) {
    if (!imageOrIdentifier) return null;
    return r2Service.deleteFile(imageOrIdentifier, options);
  }

  /**
   * Check if image exists in storage
   */
  async checkImageExists(imageOrIdentifier, options = {}) {
    if (!imageOrIdentifier) return false;
    return r2Service.checkObjectExists(imageOrIdentifier, options);
  }
}

export default new UploadService();
