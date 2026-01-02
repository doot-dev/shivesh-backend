import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Base upload directory
const baseUploadDir = path.join(__dirname, '../../public/uploads/kyc');
if (!fs.existsSync(baseUploadDir)) {
  fs.mkdirSync(baseUploadDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Get clientId from request body
    const clientId = req.body.clientId;

    if (!clientId) {
      return cb(new Error('Client ID is required'));
    }

    // Create client-specific directory
    const clientDir = path.join(baseUploadDir, clientId.toString());

    if (!fs.existsSync(clientDir)) {
      fs.mkdirSync(clientDir, { recursive: true });
    }

    cb(null, clientDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename: timestamp-originalname
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
export const uploadKYC = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: fileFilter
});

// Middleware for multiple file uploads
export const uploadMultipleKYC = uploadKYC.array('kycDocuments', 10); // Max 10 files

// Middleware for single file upload
export const uploadSingleKYC = uploadKYC.single('kycDocument');

// Helper function to get public URL for uploaded file
export function getPublicUrl(clientId, filename) {
  return `/uploads/kyc/${clientId}/${filename}`;
}

// Helper function to delete uploaded file
export async function deleteUploadedFile(clientId, filename) {
  try {
    const filePath = path.join(baseUploadDir, clientId.toString(), filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error deleting file:', error);
    return false;
  }
}

// Helper function to delete entire client folder
export async function deleteClientFolder(clientId) {
  try {
    const clientDir = path.join(baseUploadDir, clientId.toString());
    if (fs.existsSync(clientDir)) {
      fs.rmSync(clientDir, { recursive: true, force: true });
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error deleting client folder:', error);
    return false;
  }
}
