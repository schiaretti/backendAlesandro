import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import dotenv from 'dotenv';

dotenv.config();

// --- Configuração do Firebase ---
const serviceAccount = JSON.parse(
  Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf-8')
); 

const firebaseApp = initializeApp({
  credential: cert(serviceAccount),
  storageBucket: `alliluminacaopublica.firebasestorage.app` 
});

const bucket = getStorage(firebaseApp).bucket();

// --- Configurações ---
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/jpg'];

// Configuração do Multer (usando memoryStorage)
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Tipo de arquivo inválido. Apenas imagens (JPEG/JPG/PNG) são permitidas.'), false);
  }
};

// Função para deletar arquivos do Firebase
const cleanUploads = async (fileUrls) => {
  if (!fileUrls?.length) return;

  console.log(`Iniciando limpeza de ${fileUrls.length} arquivos no Firebase...`);
  await Promise.all(fileUrls.map(async (url) => {
    try {
      const filePath = decodeURIComponent(url.split('/o/')[1].split('?')[0]);
      const file = bucket.file(filePath);
      await file.delete();
      console.log(`Arquivo removido do Firebase: ${filePath}`);
    } catch (err) {
      console.error(`Erro ao remover arquivo do Firebase:`, err.message);
    }
  }));
};

// --- Middleware handleUpload para Firebase ---
const handleUpload = (options = {}) => {
  const uploader = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: { 
      fileSize: options.maxFileSize || MAX_FILE_SIZE,
      files: options.maxFiles || 10
    }
  });

  return async (req, res, next) => {
    try {
      // Normaliza campos
      const arrayFields = ['tipos', 'especies', 'latitudes', 'longitudes', 'coordsArvore'];
      arrayFields.forEach(field => {
        if (req.body[field] && !Array.isArray(req.body[field])) {
          req.body[field] = [req.body[field]];
        }
      });

      // Processa o upload
      await new Promise((resolve, reject) => {
        uploader.array('fotos', options.maxFiles || 10)(req, res, (err) => {
          if (err) {
            if (err instanceof multer.MulterError) {
              const errorMessages = {
                LIMIT_FILE_SIZE: `Tamanho máximo do arquivo excedido (${(options.maxFileSize || MAX_FILE_SIZE) / (1024 * 1024)}MB)`,
                LIMIT_FILE_COUNT: `Número máximo de arquivos excedido (${options.maxFiles || 10})`,
                LIMIT_UNEXPECTED_FILE: 'Campo de upload inesperado. Use o campo "fotos".'
              };
              err.message = errorMessages[err.code] || err.message;
              err.statusCode = 400;
            }
            return reject(err);
          }
          resolve();
        });
      });

      // Upload para Firebase Storage
      if (req.files?.length) {
        const tiposArray = Array.isArray(req.body.tipos) ? req.body.tipos : (req.body.tipos ? [req.body.tipos] : []);
        const especiesArray = Array.isArray(req.body.especies) ? req.body.especies : (req.body.especies ? [req.body.especies] : []);

        for (const [index, file] of req.files.entries()) {
          const fileExt = path.extname(file.originalname);
          const fileName = `postes/${Date.now()}-${uuidv4()}${fileExt}`;
          const fileRef = bucket.file(fileName);

          // Faz o upload para o Firebase
          await fileRef.save(file.buffer, {
            metadata: {
              contentType: file.mimetype,
              metadata: { // Metadados adicionais
                originalName: file.originalname,
                uploadDate: new Date().toISOString()
              }
            }
          });

          // Torna o arquivo público
          await fileRef.makePublic();
          
          // Obtém URL pública
          const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileRef.name}`;

          // Adiciona metadados ao objeto file
          file.tipo = tiposArray[index] || 'OUTRO';
          if (file.tipo === 'ARVORE') {
            file.especieArvore = especiesArray[index];
          }
          file.url = publicUrl;
          file.firebasePath = fileName;
        }
      }

      next();
    } catch (err) {
      // Limpa arquivos em caso de erro
      if (req.files) {
        const uploadedUrls = req.files.filter(f => f.url).map(f => f.url);
        await cleanUploads(uploadedUrls);
      }

      const statusCode = err.statusCode || 500;
      const message = err.message || 'Erro no processamento do upload';
      console.error(`Erro no handleUpload [${statusCode}]:`, message, err.stack);

      res.status(statusCode).json({
        success: false,
        message,
        code: err.code || 'UPLOAD_PROCESSING_ERROR',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
      });
    }
  };
};

export { handleUpload, cleanUploads };