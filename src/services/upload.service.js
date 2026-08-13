import cloudinary from '../config/cloudinary.js';
import { Readable } from 'stream';

class UploadService {
  async uploadSingle(file, folder = 'hbs-products') {
    return new Promise((resolve, reject) => {
      // Different transformations based on folder
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
    // Hero slider images need different transformations
    if (folder === 'hbs-hero') {
      return [
        { width: 1920, height: 800, crop: 'fill', gravity: 'center' },
        { quality: 'auto:good' },
        { fetch_format: 'auto' }
      ];
    }
    
    // Default product/general images
    return [
      { width: 1000, height: 1000, crop: 'limit' },
      { quality: 'auto:good' }
    ];
  }

  async uploadMultiple(files, folder = 'hbs-products') {
    const uploadPromises = files.map(file => this.uploadSingle(file, folder));
    return Promise.all(uploadPromises);
  }

  async deleteImage(publicId) {
    try {
      const result = await cloudinary.uploader.destroy(publicId);
      return result;
    } catch (error) {
      throw new Error(`Failed to delete image: ${error.message}`);
    }
  }

  getPublicIdFromUrl(url) {
    const parts = url.split('/');
    const filename = parts[parts.length - 1];
    const publicId = filename.split('.')[0];
    return `${parts[parts.length - 2]}/${publicId}`;
  }
}

export default new UploadService();

