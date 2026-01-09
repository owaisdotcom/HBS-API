import cloudinary from '../config/cloudinary.js';
import { Readable } from 'stream';

class UploadService {
  async uploadSingle(file, folder = 'hbs-products') {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'auto',
          transformation: [
            { width: 1000, height: 1000, crop: 'limit' },
            { quality: 'auto:good' }
          ]
        },
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve(result.secure_url);
          }
        }
      );

      Readable.from(file.buffer).pipe(uploadStream);
    });
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

