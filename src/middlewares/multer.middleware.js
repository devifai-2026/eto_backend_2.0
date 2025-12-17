import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create uploads directories if they don't exist
const createUploadDirectories = () => {
  const directories = [
    path.join(__dirname, "..", "uploads", "franchise-documents"),
    path.join(__dirname, "..", "uploads", "driver-documents"),
    path.join(__dirname, "..", "uploads", "profile-images"),
  ];

  directories.forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`✓ Created directory: ${dir}`);
    }
  });
};

// Create directories on import
createUploadDirectories();

// Franchise documents storage
const franchiseStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dest = path.join(__dirname, "..", "uploads", "franchise-documents");
    cb(null, dest);
  },
  filename: function (req, file, cb) {
    // Remove spaces and special characters from filename
    const originalName = file.originalname
      .replace(/\s+/g, "-")
      .replace(/[^a-zA-Z0-9.-]/g, "");
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1e9);
    const ext = path.extname(originalName).toLowerCase();
    const name = path.basename(originalName, ext);
    const filename = `${name}-${timestamp}-${random}${ext}`;
    cb(null, filename);
  },
});

// File filter for franchise documents
const franchiseFileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|pdf|doc|docx/;
  const extname = allowedTypes.test(
    path.extname(file.originalname).toLowerCase()
  );
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error("Only image, PDF, and Word documents are allowed"));
  }
};

// Driver documents storage
const driverStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dest = path.join(__dirname, "..", "uploads", "driver-documents");
    cb(null, dest);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname).toLowerCase();
    const filename = `${file.fieldname}-${uniqueSuffix}${ext}`;
    cb(null, filename);
  },
});

// Profile image storage
const profileStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dest = path.join(__dirname, "..", "uploads", "profile-images");
    cb(null, dest);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname).toLowerCase();
    const filename = `profile-${uniqueSuffix}${ext}`;
    cb(null, filename);
  },
});

// Profile image filter
const profileFileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed for profile pictures."), false);
  }
};

// Create multer instances
export const uploadFranchiseDocuments = multer({
  storage: franchiseStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit per file
    files: 6, // Max 6 files total (up to 5 identity + 1 trade license)
  },
  fileFilter: franchiseFileFilter,
});

export const uploadDriverDocuments = multer({
  storage: driverStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: franchiseFileFilter, // Same filter for driver documents
});

export const uploadProfileImage = multer({
  storage: profileStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB for profile images
  fileFilter: profileFileFilter,
});
