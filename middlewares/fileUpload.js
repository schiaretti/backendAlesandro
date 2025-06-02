import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

// Configurações
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, '../../uploads');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/jpg'];

// Garante que o diretório de uploads existe
await fs.mkdir(UPLOAD_DIR, { recursive: true });

// Configuração do Multer para armazenamento local
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

// Filtro de arquivo
const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Tipo de arquivo inválido. Apenas imagens (JPEG/JPG/PNG) são permitidas.'), false);
  }
};

// Função para limpar uploads temporários
const cleanUploads = async (files) => {
  if (!files?.length) return;

  console.log(`Iniciando limpeza de ${files.length} arquivos...`);
  await Promise.all(files.map(async (file) => {
    if (typeof file?.path !== 'string') {
      console.warn('Arquivo com path inválido:', file);
      return;
    }
    try {
      await fs.unlink(file.path);
      console.log(`Arquivo removido: ${file.path}`);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error(`Erro ao remover arquivo ${file.path}:`, err.message);
      }
    }
  }));
};

// Middleware handleUpload
const handleUpload = (options = {}) => {
  const uploader = multer({
    storage,
   limits: { fileSize: 10 * 1024 * 1024 } // 10MB
  });

  return async (req, res, next) => {
    try {
      // Normaliza campos que podem vir como string ou array
      const arrayFields = ['tipos', 'especies', 'latitudes', 'longitudes', 'coordsArvore'];
      arrayFields.forEach(field => {
        if (req.body[field] && !Array.isArray(req.body[field])) {
          req.body[field] = [req.body[field]];
        }
      });

      // Processa o upload
      await new Promise((resolve, reject) => {
        uploader.array('fotos')(req, res, (err) => {
          if (err) {
            console.error('Erro no multer:', err);
            return reject(err);
          }
          resolve();
        });
      });

      // Adiciona metadados aos arquivos
      if (req.files?.length && req.body.tipos) {
        const tiposArray = Array.isArray(req.body.tipos) ? req.body.tipos : [req.body.tipos];
        const especiesArray = Array.isArray(req.body.especies) ? req.body.especies : (req.body.especies ? [req.body.especies] : []);

        req.files.forEach((file, index) => {
          file.tipo = tiposArray[index] || 'OUTRO';
          if (file.tipo === 'ARVORE') {
            file.especieArvore = especiesArray[index];
          }
          // Adiciona URL pública relativa
          file.url = `/uploads/${file.filename}`;
        });
      }

      next();
    } catch (err) {
      // Limpa arquivos em caso de erro
      if (req.files) {
        await cleanUploads(req.files);
      }

      const errorMessages = {
        LIMIT_FILE_SIZE: `Tamanho máximo do arquivo excedido (${options.maxFileSize || MAX_FILE_SIZE / (1024 * 1024)}MB)`,
        LIMIT_FILE_COUNT: `Número máximo de arquivos excedido (${options.maxFiles || 10})`,
        LIMIT_UNEXPECTED_FILE: 'Campo de upload inválido (use "fotos")',
      };

      const statusCode = err.code && errorMessages[err.code] ? 400 : 500;
      const message = errorMessages[err.code] || err.message || 'Erro no processamento do upload';

      res.status(statusCode).json({
        success: false,
        message,
        code: err.code || 'UPLOAD_ERROR'
      });
    }
  };
};

export { handleUpload, cleanUploads };