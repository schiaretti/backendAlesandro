/*import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuração do storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `file-${uniqueSuffix}${ext}`);
  }
});

// Filtro de arquivos
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png/i;
  const extname = allowedTypes.test(path.extname(file.originalname));
  const mimetype = allowedTypes.test(file.mimetype);

  if (extname && mimetype) {
    cb(null, true);
  } else {
    cb(new Error('Apenas imagens (JPEG/JPG/PNG) são permitidas'), false);
  }
};

// Middleware principal
export const handleUpload = (options = {}) => {
  const upload = multer({
    storage,
    fileFilter,
    limits: {
      fileSize: options.fileSize || 5 * 1024 * 1024, // 5MB
      files: options.maxFiles || 5
    }
  });

  return (req, res, next) => {
    upload.fields([
      { name: 'fotos', maxCount: 8 },
      { name: 'fotosArvore', maxCount: 5 }
    ])(req, res, (err) => {
      if (err) {
        console.error('Erro no upload:', err);
        return res.status(400).json({
          success: false,
          message: err.code === 'LIMIT_FILE_SIZE' 
            ? 'Arquivo muito grande (máx. 5MB)' 
            : 'Erro no upload de arquivos',
          code: err.code
        });
      }
      next();
    });
  };
};

// Função para limpar uploads
export const cleanUploads = (files) => {
  if (!files?.length) return;

  files.forEach(file => {
    try {
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
        console.log(`Arquivo removido: ${file.path}`);
      }
    } catch (err) {
      console.error(`Erro ao limpar arquivo ${file.path}:`, err.message);
    }
  });
};*/

import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuração do storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `file-${uniqueSuffix}${ext}`);
  }
});

// Filtro de arquivos
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['.jpeg', '.jpg', '.png'];
  const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png'];
  
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedTypes.includes(ext) && allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Apenas imagens (JPEG/JPG/PNG) são permitidas'), false);
  }
};

// Middleware principal
export const handleUpload = (options = {}) => {
  const upload = multer({
    storage,
    fileFilter,
    limits: {
      fileSize: options.fileSize || 5 * 1024 * 1024, // 5MB
      files: options.maxFiles || 10
    }
  });

  return (req, res, next) => {
    upload.fields([
      { name: 'fotos', maxCount: options.maxPhotos || 8 },
      { name: 'fotosArvore', maxCount: options.maxTreePhotos || 5 }
    ])(req, res, (err) => {
      if (err) {
        // Limpa arquivos enviados parcialmente
        if (req.files) {
          const allFiles = Object.values(req.files).flat();
          cleanUploads(allFiles);
        }

        let message = 'Erro no upload de arquivos';
        if (err.code === 'LIMIT_FILE_SIZE') {
          message = `Arquivo muito grande (máx. ${options.fileSize ? options.fileSize / (1024 * 1024) + 'MB' : '5MB'})`;
        } else if (err.message.includes('permitidas')) {
          message = err.message;
        }

        return res.status(400).json({
          success: false,
          message,
          code: err.code || 'UPLOAD_ERROR'
        });
      }

      // Padroniza o acesso aos arquivos
      req.fotos = req.files?.fotos || [];
      req.fotosArvore = req.files?.fotosArvore || [];
      next();
    });
  };
};

// Função para limpar uploads
export const cleanUploads = (files) => {
  if (!files || !Array.isArray(files)) return;

  files.forEach(file => {
    try {
      if (file?.path && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
        console.log(`Arquivo removido: ${file.path}`);
      }
    } catch (err) {
      console.error(`Erro ao limpar arquivo ${file?.path || 'desconhecido'}:`, err.message);
    }
  });
};