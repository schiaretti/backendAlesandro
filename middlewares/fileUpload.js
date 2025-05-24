/*import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Função para limpar uploads
 const cleanUploads = (files) => {
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
};

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'uploads');
        fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, `foto_${uniqueSuffix}${ext}`);
    }
});

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


 const handleUpload = (options = {}) => {
    const uploader = multer({
        storage,
        fileFilter,
        limits: {
            fileSize: options.fileSize || 5 * 1024 * 1024,
            files: options.maxFiles || 10
        }
    });

    return (req, res, next) => {
        const fieldsMiddleware = (req, res, next) => {
            // Converte todos os campos relevantes para arrays
            const arrayFields = ['tipos', 'especies', 'latitudes', 'longitudes'];
            arrayFields.forEach(field => {
                if (req.body[field] && !Array.isArray(req.body[field])) {
                    req.body[field] = [req.body[field]];
                }
            });
            next();
        };

        fieldsMiddleware(req, res, () => {
            uploader.array('fotos')(req, res, (err) => {
                if (err) {
                    cleanUploads(req.files);
                    const errorMap = {
                        LIMIT_FILE_SIZE: 'Tamanho máximo do arquivo excedido (5MB)',
                        LIMIT_FILE_COUNT: 'Número máximo de arquivos excedido',
                        'LIMIT_UNEXPECTED_FILE': 'Campo de upload incorreto'
                    };
                    return res.status(400).json({
                        success: false,
                        message: errorMap[err.code] || 'Erro no upload de arquivos',
                        code: err.code || 'UPLOAD_ERROR'
                    });
                }

                // Associação CORRETA dos metadados
                if (req.files && req.body.tipos) {
                    req.files.forEach((file, index) => {
                        file.tipo = req.body.tipos?.[index] || 'OUTRO';

                        if (file.tipo === 'ARVORE') {
                            // Corrigido para usar 'especies' em vez de 'especieArvore'
                            file.especieArvore = req.body.especies?.[index]; // <<< Correção aqui
                            file.fotoLatitude = parseFloat(req.body.latitudes?.[index]) || null;
                            file.fotoLongitude = parseFloat(req.body.longitudes?.[index]) || null;
                        }
                    });
                }

                console.log('Files processed:', req.files.map(f => ({
                    filename: f.filename,
                    tipo: f.tipo,
                    especieArvore: f.especieArvore,
                    coords: f.fotoLatitude && f.fotoLongitude ?
                        [f.fotoLatitude, f.fotoLongitude] : null
                })));

                next();
            });
        });
    };
};

export { 
    handleUpload, 
    cleanUploads, 
    storage,
    fileFilter 
};*/

import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

// Configurações globais
const DEFAULT_OPTIONS = {
  maxFileSize: 5 * 1024 * 1024, // 5MB
  maxFiles: 10,
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/jpg'],
  uploadDir: process.env.UPLOAD_DIR || path.join(__dirname, 'uploads')
};

// Utilitários
const generateUniqueFilename = (originalname) => {
  const ext = path.extname(originalname);
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 8);
  return `foto_${timestamp}_${randomString}${ext}`;
};

// Gerenciamento de arquivos
class FileManager {
  static async ensureUploadDir(uploadDir) {
    try {
      await fs.access(uploadDir);
    } catch {
      await fs.mkdir(uploadDir, { recursive: true });
      console.log(`Diretório criado: ${uploadDir}`);
    }
  }

  static async cleanFiles(files) {
    if (!files?.length) return;

    await Promise.all(files.map(async (file) => {
      try {
        await fs.unlink(file.path);
        console.log(`Arquivo removido: ${file.path}`);
      } catch (err) {
        console.error(`Erro ao remover ${file.path}:`, err.message);
      }
    }));
  }
}

// Configuração do Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
    fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueName = `foto_${Date.now()}-${Math.random().toString(36).slice(2, 8)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const createFileFilter = (allowedTypes) => (req, file, cb) => {
  const isValidMimeType = allowedTypes.includes(file.mimetype);
  const isValidExtension = allowedTypes.some(type => 
    file.originalname.toLowerCase().endsWith(type.split('/')[1])
  );

  if (isValidMimeType && isValidExtension) {
    cb(null, true);
  } else {
    cb(new Error(`Tipo de arquivo inválido. Permitidos: ${allowedTypes.join(', ')}`), false);
  }
};

// Middleware principal
export const handleUpload = (options = {}) => {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const uploadDir = config.uploadDir;

  const uploader = multer({
    storage: createStorage(uploadDir),
    fileFilter: createFileFilter(config.allowedMimeTypes),
    limits: {
      fileSize: config.maxFileSize,
      files: config.maxFiles
    }
  });

  return async (req, res, next) => {
    try {
      // Normaliza os campos de metadados
      const normalizeFields = () => {
        const arrayFields = ['tipos', 'especies', 'latitudes', 'longitudes'];
        arrayFields.forEach(field => {
          if (req.body[field] && !Array.isArray(req.body[field])) {
            req.body[field] = [req.body[field]];
          }
        });
      };

      // Processa o upload
      await new Promise((resolve, reject) => {
        normalizeFields();
        
        uploader.array('fotos')(req, res, (err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      });

      // Adiciona metadados aos arquivos
      if (req.files?.length && req.body.tipos) {
        req.files.forEach((file, index) => {
          file.metadata = {
            tipo: req.body.tipos[index] || 'OUTRO',
            especieArvore: req.body.especies?.[index],
            coordenadas: {
              latitude: parseFloat(req.body.latitudes?.[index]) || null,
              longitude: parseFloat(req.body.longitudes?.[index]) || null
            }
          };
        });

        console.debug('Arquivos processados:', req.files.map(f => ({
          filename: f.filename,
          ...f.metadata
        })));
      }

      next();
    } catch (err) {
      await FileManager.cleanFiles(req.files);

      const errorMessages = {
        LIMIT_FILE_SIZE: `Tamanho máximo excedido (${config.maxFileSize / 1024 / 1024}MB)`,
        LIMIT_FILE_COUNT: `Máximo de ${config.maxFiles} arquivos permitidos`,
        LIMIT_UNEXPECTED_FILE: 'Campo de upload inválido'
      };

      res.status(400).json({
        success: false,
        message: errorMessages[err.code] || 'Falha no upload de arquivos',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    }
  };
};


// Exportações
export const cleanUploads = FileManager.cleanFiles;
export const fileFilter = createFileFilter(DEFAULT_OPTIONS.allowedMimeTypes);