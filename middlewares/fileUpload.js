import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import AWS from 'aws-sdk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuração do S3 (opcional - só se for usar)
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
  region: process.env.AWS_REGION
});

// Função para upload no S3
const uploadToS3 = async (file) => {
  try {
    const params = {
      Bucket: process.env.S3_BUCKET,
      Key: `uploads/${file.filename}`,
      Body: await fs.readFile(file.path),
      ContentType: file.mimetype,
      ACL: 'public-read'
    };
    
    const result = await s3.upload(params).promise();
    await fs.unlink(file.path);
    return result.Location;
  } catch (err) {
    await fs.unlink(file.path).catch(() => {});
    throw err;
  }
};

// Função para limpar uploads
const cleanUploads = async (files) => {
  if (!files?.length) return;

  await Promise.all(files.map(async (file) => {
    try {
      await fs.unlink(file.path);
      console.log(`Arquivo removido: ${file.path}`);
    } catch (err) {
      console.error(`Erro ao limpar ${file.path}:`, err.message);
    }
  }));
};

// Configuração do Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const ext = path.extname(file.originalname);
    cb(null, `poste_${timestamp}_${randomStr}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
  if (allowedTypes.includes(file.mimetype)) {
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
      fileSize: options.maxFileSize || 5 * 1024 * 1024, // 5MB
      files: options.maxFiles || 10
    }
  });

  return async (req, res, next) => {
    try {
      // Normaliza campos para arrays
      const arrayFields = ['tipos', 'especies', 'latitudes', 'longitudes'];
      arrayFields.forEach(field => {
        if (req.body[field] && !Array.isArray(req.body[field])) {
          req.body[field] = [req.body[field]];
        }
      });

      // Processa upload
      await new Promise((resolve, reject) => {
        uploader.array('fotos')(req, res, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });

      // Adiciona metadados
      if (req.files?.length && req.body.tipos) {
        req.files.forEach((file, index) => {
          file.tipo = req.body.tipos[index] || 'OUTRO';
          if (file.tipo === 'ARVORE') {
            file.especieArvore = req.body.especies?.[index];
            file.fotoLatitude = parseFloat(req.body.latitudes?.[index]) || null;
            file.fotoLongitude = parseFloat(req.body.longitudes?.[index]) || null;
          }
        });
      }

      // Opcional: Upload para S3
      if (process.env.STORAGE_TYPE === 's3' && req.files?.length) {
        req.files = await Promise.all(
          req.files.map(async (file) => {
            file.url = await uploadToS3(file);
            return file;
          })
        );
      }

      next();
    } catch (err) {
      await cleanUploads(req.files);
      
      const errorMessages = {
        LIMIT_FILE_SIZE: 'Tamanho máximo do arquivo excedido (5MB)',
        LIMIT_FILE_COUNT: 'Número máximo de arquivos excedido',
        LIMIT_UNEXPECTED_FILE: 'Campo de upload inválido'
      };

      res.status(400).json({
        success: false,
        message: errorMessages[err.code] || 'Falha no upload de arquivos',
        code: err.code || 'UPLOAD_ERROR'
      });
    }
  };
};

export { handleUpload, cleanUploads };