import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Base upload directory — must sit under the `public/uploads` tree that app.js
// serves statically, or fileUrl points at a file nothing can fetch.
const baseUploadDir = path.join(__dirname, '../../public/uploads/cube-tests');
if (!fs.existsSync(baseUploadDir)) {
  fs.mkdirSync(baseUploadDir, { recursive: true });
}

// Configure storage — one folder per order, so an order's cube tests stay together
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const orderId = req.params.orderId;

    if (!orderId) {
      return cb(new Error('Order ID is required'));
    }

    const orderDir = path.join(baseUploadDir, orderId.toString());

    if (!fs.existsSync(orderDir)) {
      fs.mkdirSync(orderDir, { recursive: true });
    }

    cb(null, orderDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const nameWithoutExt = path.basename(file.originalname, ext);
    const sanitizedName = nameWithoutExt.replace(/[^a-zA-Z0-9]/g, '_');
    cb(null, `${sanitizedName}-${uniqueSuffix}${ext}`);
  }
});

// File filter - only allow images and PDFs
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|pdf/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only .png, .jpg, .jpeg and .pdf files are allowed!'));
  }
};

// Create multer upload instance
export const uploadCubeTestFile = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: fileFilter
});

// Middleware for single file upload
export const uploadSingleCubeTestFile = uploadCubeTestFile.single('file');

// Helper function to get public URL for uploaded file
export function getCubeTestPublicUrl(orderId, filename) {
  return `/uploads/cube-tests/${orderId}/${filename}`;
}

// Helper function to delete uploaded file
export function deleteCubeTestFile(orderId, filename) {
  try {
    const filePath = path.join(baseUploadDir, orderId.toString(), filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error deleting cube test file:', error);
    return false;
  }
}
