import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Base upload directory
const baseUploadDir = path.join(__dirname, '../app/public/uploads/bills');
if (!fs.existsSync(baseUploadDir)) {
  fs.mkdirSync(baseUploadDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const billNo = req.params.billNo || req.body.billNo;

    if (!billNo) {
      return cb(new Error('Bill number is required'));
    }

    const billDir = path.join(baseUploadDir, billNo.toString());

    if (!fs.existsSync(billDir)) {
      fs.mkdirSync(billDir, { recursive: true });
    }

    cb(null, billDir);
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
export const uploadBillDoc = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: fileFilter
});

// Middleware for single file upload
export const uploadSingleBillDoc = uploadBillDoc.single('document');

// Helper function to get public URL for uploaded file
export function getBillDocPublicUrl(billNo, filename) {
  return `/uploads/bills/${billNo}/${filename}`;
}

// Helper function to delete uploaded file
export async function deleteBillDocFile(billNo, filename) {
  try {
    const filePath = path.join(baseUploadDir, billNo.toString(), filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error deleting bill document:', error);
    return false;
  }
}
