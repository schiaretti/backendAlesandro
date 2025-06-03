import express from 'express';
import path from 'path';
import fs from 'fs/promises'; // Use fs.promises for async operations
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

// Import UPLOAD_DIR from the modified fileUpload module
// *** Adjust the path if your fileUpload_volume.js is located elsewhere ***
import { UPLOAD_DIR } from './middlewares/fileUpload.js'; 

// Import routes and middleware
import publicRoutes from './routes/public.js';
import privateRoutes from './routes/private.js';
import auth from './middlewares/auth.js';

// --- Configuration ---
const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 3000;

// Use the imported UPLOAD_DIR (which uses RAILWAY_VOLUME_MOUNT_PATH or /data)
// const uploadDir = path.resolve(process.env.UPLOAD_DIR || './data/uploads'); // REMOVED - Use imported UPLOAD_DIR
const MAX_FILE_SIZE = process.env.MAX_FILE_SIZE || '10mb'; // Keep using env var or default
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

// --- Async Function to Ensure Upload Directory Exists (in Volume) ---
async function ensureUploadDir() {
  try {
    await fs.mkdir(UPLOAD_DIR, { 
      recursive: true, 
      mode: 0o755 // Set permissions if needed
    });
    console.log(`📁 Upload directory ensured at (Volume): ${UPLOAD_DIR}`);

    // Optionally create a README if it doesn't exist (async)
    const readmePath = path.join(UPLOAD_DIR, 'README.md');
    try {
      await fs.access(readmePath); // Check if file exists
    } catch (error) {
      // If file doesn't exist (access throws error), create it
      if (error.code === 'ENOENT') {
        await fs.writeFile(readmePath, `# Upload Directory (Persistent Volume)\n\nUser-uploaded files are stored here.\n\n**Do not manually remove files!**`);
        console.log(`📝 README.md created in ${UPLOAD_DIR}`);
      }
    }

  } catch (err) {
    console.error(`❌ FATAL: Failed to setup upload directory in volume (${UPLOAD_DIR}):`, err);
    process.exit(1); // Exit if we can't create the essential directory
  }
}

// --- Middleware Setup ---
// Request logger
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${req.ip}`);
  next();
});

// CORS configuration
app.use(cors({
  origin: CORS_ORIGIN,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token', 'x-requested-with'],
  exposedHeaders: ['Authorization', 'x-file-id'],
  credentials: true,
  maxAge: 86400
}));

// Body parsers with limits
app.use(express.json({ 
  limit: MAX_FILE_SIZE,
  verify: (req, res, buf) => {
    // Keep rawBody if needed by specific routes/middlewares
    req.rawBody = buf.toString(); 
  }
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: MAX_FILE_SIZE 
}));

// --- Static File Serving (from Volume) ---
console.log(`Attempting to serve static files from: ${UPLOAD_DIR}`);
app.use('/uploads', 
  // Security check: Prevent directory traversal
  (req, res, next) => {
    if (req.path.includes('../')) {
      console.warn(`Attempted directory traversal blocked: ${req.path}`);
      return res.status(403).json({ 
        success: false,
        message: 'Access denied'
      });
    }
    next();
  },
  // Serve static files from the UPLOAD_DIR (Volume path)
  express.static(UPLOAD_DIR, {
    dotfiles: 'ignore',
    etag: true,
    fallthrough: false, // Important: Don't pass to next middleware if file not found
    index: false, // Don't serve index files
    lastModified: true,
    maxAge: '1d' // Cache for 1 day
  })
);

// --- Routes ---
app.use('/api', publicRoutes);
app.use('/api', auth, privateRoutes); // Apply auth middleware to private routes

// --- Health Check Endpoint (Async) ---
app.get('/health', async (req, res) => {
  let dbOk = false;
  let fsOk = false;
  let fsError = null;
  let dbError = null;

  // Check Database
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch (error) {
    console.error('Health Check: Database query failed:', error);
    dbError = error.message;
  }

  // Check Filesystem (Write/Read/Delete in Volume)
  const testFileName = `.healthcheck_${Date.now()}`;
  const testFilePath = path.join(UPLOAD_DIR, testFileName);
  try {
    await fs.writeFile(testFilePath, 'OK');
    await fs.access(testFilePath); // Verify write
    await fs.unlink(testFilePath); // Clean up
    fsOk = true;
  } catch (error) {
    console.error(`Health Check: Filesystem check failed in ${UPLOAD_DIR}:`, error);
    fsError = error.message;
    // Attempt cleanup even if access failed
    try { await fs.unlink(testFilePath); } catch (_) {}
  }

  // Determine overall status and response code
  const overallOk = dbOk && fsOk;
  const statusCode = overallOk ? 200 : 503;

  res.status(statusCode).json({
    status: overallOk ? 'OK' : 'SERVICE_UNAVAILABLE',
    services: {
      database: { ok: dbOk, error: dbError },
      filesystem: { ok: fsOk, path: UPLOAD_DIR, error: fsError }
    },
    system: {
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || 'development'
    },
    timestamp: new Date().toISOString()
  });
});

// --- System Info Endpoint (Async) ---
// Helper function to calculate folder size asynchronously
async function calculateFolderSize(dir) {
  try {
    const files = await fs.readdir(dir);
    let totalSize = 0;
    for (const file of files) {
      try {
        const filePath = path.join(dir, file);
        const stats = await fs.stat(filePath);
        if (stats.isFile()) {
          totalSize += stats.size;
        }
        // Optionally recurse into subdirectories if needed
      } catch (statError) {
        // Ignore errors for single files (e.g., permission issues, file disappeared)
        console.warn(`Could not stat file ${path.join(dir, file)} during size calculation:`, statError.message);
      }
    }
    return totalSize;
  } catch (readDirError) {
    console.error(`Could not read directory ${dir} for size calculation:`, readDirError.message);
    return 0; // Return 0 if directory cannot be read
  }
}

app.get('/system/info', async (req, res) => { // Made async
  try {
    const uploadDirFiles = await fs.readdir(UPLOAD_DIR).catch(() => []); // Handle error if dir doesn't exist yet
    const uploadDirSize = await calculateFolderSize(UPLOAD_DIR);

    res.status(200).json({
      status: 'online',
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      resources: {
        uploadDir: {
          path: UPLOAD_DIR,
          totalFiles: uploadDirFiles.length,
          totalSize: uploadDirSize // Size in bytes
        }
      },
      endpoints: {
        public: {
          login: 'POST /api/login',
          health: 'GET /health'
        },
        private: {
          // Add your private endpoints here for info
          // Example: cadastroUsuarios: 'POST /api/cadastro-usuarios',
          // Example: uploads: 'POST /api/upload' 
        }
      }
    });
  } catch (error) {
    console.error('Error fetching system info:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve system info' });
  }
});

// --- Error Handling Middleware ---
app.use((err, req, res, next) => {
  console.error('❌ Global Error Handler Caught:', {
    message: err.message,
    code: err.code,
    statusCode: err.statusCode,
    stack: err.stack, // Log stack in development or staging
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method
  });

  // Prisma Error Handling
  if (err.code?.startsWith('P')) { // Prisma error codes start with P
    // Basic handling, refine based on specific Prisma errors if needed
    return res.status(400).json({
      success: false,
      message: 'Database operation failed.',
      code: err.code,
      meta: err.meta // Contains more details about the error
    });
  }

  // Multer Error Handling (Multer errors often have a 'code' property)
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      success: false,
      message: `File too large. Limit is ${MAX_FILE_SIZE}.`,
      code: 'FILE_SIZE_LIMIT_EXCEEDED'
    });
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({
      success: false,
      message: 'Too many files uploaded.',
      code: 'FILE_COUNT_LIMIT_EXCEEDED'
    });
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({
      success: false,
      message: `Unexpected file field: ${err.field}. Expecting 'fotos'.`, // Multer provides the field name
      code: 'UNEXPECTED_FILE_FIELD'
    });
  }

  // Generic Error Response
  const statusCode = typeof err.statusCode === 'number' ? err.statusCode : 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal server error occurred.',
    reference: `ERR-${Date.now()}`,
    // Only include stack in development for security reasons
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// --- Dependency Verification (Optional but Recommended) ---
async function verifyDependencies() {
  try {
    // Verify essential modules can be imported
    await Promise.all([
      import('@prisma/client'),
      import('express'),
      import('cors')
      // Add other critical dependencies if needed
    ]);
    console.log('✅ All critical dependencies verified.');
    return true;
  } catch (err) {
    console.error('❌ Missing critical dependency:', err.message);
    return false;
  }
}

// --- Server Startup Logic ---
const startServer = async () => {
  console.log('🚀 Starting server initialization...');

  // 1. Verify Dependencies (Optional but good practice)
  if (!await verifyDependencies()) {
    process.exit(1); // Exit if critical dependencies are missing
  }

  // 2. Ensure Upload Directory Exists (Crucial!)
  await ensureUploadDir();

  // 3. Connect to Database
  try {
    await prisma.$connect();
    console.log('💾 Database connected successfully.');
  } catch (dbError) {
    console.error('🔥 Critical startup failure: Could not connect to database.', dbError);
    process.exit(1);
  }

  // 4. Start Listening for Requests
  const server = app.listen(PORT, () => {
    console.log(`
    ✅ Server is running and listening on http://localhost:${PORT}
    📁 Uploads will be stored in: ${UPLOAD_DIR}
    🌿 Environment: ${process.env.NODE_ENV || 'development'}
    ⏱  Timestamp: ${new Date().toLocaleString()}
    `);
  });

  // --- Graceful Shutdown Handling ---
  const shutdown = async (signal) => {
    console.log(`\n🚦 Received ${signal}. Initiating graceful shutdown...`);
    server.close(async () => {
      console.log('🔌 HTTP server closed.');
      try {
        await prisma.$disconnect();
        console.log('💾 Database connection closed.');
      } catch (dbDisconnectError) {
        console.error('⚠️ Error disconnecting from database:', dbDisconnectError);
      }
      console.log('🏁 Shutdown complete.');
      process.exit(0);
    });

    // Force shutdown if graceful shutdown takes too long
    setTimeout(() => {
      console.error('⏰ Graceful shutdown timed out. Forcing exit.');
      process.exit(1);
    }, 10000); // 10 seconds timeout
  };

  process.on('SIGTERM', () => shutdown('SIGTERM')); // Standard signal for termination
  process.on('SIGINT', () => shutdown('SIGINT'));   // Signal for Ctrl+C
  process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    // Consider whether to shutdown on unhandled rejections
    // shutdown('UNHANDLED_REJECTION'); 
  });
  process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    // It's generally recommended to exit on uncaught exceptions
    shutdown('UNCAUGHT_EXCEPTION');
  });

};

// --- Start the Application ---
startServer();

