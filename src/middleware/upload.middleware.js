import multer from 'multer';
import path from 'path';
import ApiError from '../utils/ApiError.js';

const storage = multer.memoryStorage();

const imageFileFilter = (req, file, cb) => {
  const allowedExts = /jpeg|jpg|png|gif|webp|heic|heif/i;
  const extname = allowedExts.test(path.extname(file.originalname).toLowerCase());
  const mimetype = file.mimetype.startsWith('image/') ||
    /jpeg|jpg|png|gif|webp|heic|heif|octet-stream/i.test(file.mimetype);

  if (extname || mimetype) {
    cb(null, true);
  } else {
    cb(new ApiError('Only image files are allowed (JPEG, JPG, PNG, GIF, WEBP, HEIC, HEIF)', 400), false);
  }
};

const receiptFileFilter = (req, file, cb) => {
  const allowedExts = /jpeg|jpg|png|gif|webp|heic|heif|pdf/i;
  const extname = allowedExts.test(path.extname(file.originalname).toLowerCase());
  const mimetype = file.mimetype.startsWith('image/') ||
    file.mimetype === 'application/pdf' ||
    /jpeg|jpg|png|gif|webp|heic|heif|pdf|octet-stream/i.test(file.mimetype);

  if (extname || mimetype) {
    cb(null, true);
  } else {
    cb(new ApiError('Only image or PDF files are allowed (JPEG, JPG, PNG, GIF, WEBP, HEIC, HEIF, PDF)', 400), false);
  }
};

const upload = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    fieldSize: 10 * 1024 * 1024 // 10MB
  }
});

const receiptUpload = multer({
  storage,
  fileFilter: receiptFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    fieldSize: 10 * 1024 * 1024 // 10MB
  }
});

export const uploadSingle = upload.single('image');
export const uploadReceiptSingle = receiptUpload.single('receipt');
export const uploadMultiple = upload.array('images', 50);
export const uploadTestimonialImage = upload.single('customerImage');
export const uploadFields = upload.fields([
  { name: 'images', maxCount: 50 },
  { name: 'receipt', maxCount: 1 }
]);

