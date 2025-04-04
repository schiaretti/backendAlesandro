/*import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
  allowedTypes.includes(file.mimetype) 
    ? cb(null, true) 
    : cb(new Error('Apenas imagens JPEG/JPG/PNG são permitidas'), false);
};

export default multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});*/

import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Função melhorada para limpar uploads
export const cleanUploads = (files) => {
    if (!files?.length) return;
    
    files.forEach(file => {
        try {
            if (fs.existsSync(file.path)) {
                fs.unlinkSync(file.path);
                console.log(`Arquivo removido: ${file.path}`);
            } else {
                console.warn(`Arquivo não encontrado para limpeza: ${file.path}`);
            }
        } catch (err) {
            console.error(`Erro ao limpar arquivo ${file.path}:`, err.message);
            // Não interrompe o fluxo por erros de limpeza
        }
    });
};

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../uploads');
        
        // Cria o diretório se não existir (com tratamento de erro)
        try {
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
                console.log(`Diretório de upload criado: ${uploadDir}`);
            }
            cb(null, uploadDir);
        } catch (err) {
            console.error(`Erro ao criar diretório ${uploadDir}:`, err);
            cb(err);
        }
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        const filename = file.fieldname + '-' + uniqueSuffix + ext;
        cb(null, filename);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Apenas imagens JPEG/JPG/PNG são permitidas'), false);
    }
};

// Configuração do multer com tratamento de erros
const upload = multer({
    storage,
    fileFilter,
    limits: { 
        fileSize: 5 * 1024 * 1024, // 5MB
        files: 5 // Limite de 5 arquivos
    }
});

// Middleware wrapper para melhor tratamento de erros
export const handleUpload = (fieldName, maxCount) => {
    return (req, res, next) => {
        const uploadMiddleware = upload.array(fieldName, maxCount);
        
        uploadMiddleware(req, res, (err) => {
            if (err) {
                // Limpa arquivos em caso de erro
                if (req.files) cleanUploads(req.files);
                
                let errorMessage = 'Erro no upload de arquivos';
                let statusCode = 400;
                
                if (err.code === 'LIMIT_FILE_SIZE') {
                    errorMessage = 'Tamanho máximo do arquivo excedido (5MB)';
                } else if (err.code === 'LIMIT_FILE_COUNT') {
                    errorMessage = 'Número máximo de arquivos excedido';
                } else if (err.message.includes('Apenas imagens')) {
                    errorMessage = err.message;
                } else {
                    statusCode = 500;
                    errorMessage = 'Erro interno no servidor';
                }
                
                return res.status(statusCode).json({ 
                    success: false,
                    message: errorMessage,
                    code: err.code || 'UPLOAD_ERROR'
                });
            }
            next();
        });
    };
};

export default upload;