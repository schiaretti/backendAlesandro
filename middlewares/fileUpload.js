/*const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
};

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../uploads');
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

export const handleUpload = (options = {}) => {
    const uploader = multer({
        storage,
        fileFilter,
        limits: {
            fileSize: options.fileSize || 5 * 1024 * 1024, // 5MB
            files: options.maxFiles || 5
        }
    });

    return (req, res, next) => {
        uploader.array('fotos')(req, res, (err) => {
            if (err) {
                cleanUploads(req.files);
                const errorMap = {
                    LIMIT_FILE_SIZE: 'Tamanho máximo do arquivo excedido (5MB)',
                    LIMIT_FILE_COUNT: 'Número máximo de arquivos excedido'
                };
                return res.status(400).json({
                    success: false,
                    message: errorMap[err.code] || 'Erro no upload de arquivos',
                    code: err.code || 'UPLOAD_ERROR'
                });
            }

            // Adiciona tipos aos arquivos
            if (req.files && req.body.tipos) {
                const tipos = Array.isArray(req.body.tipos) ? req.body.tipos : [req.body.tipos];
                req.files.forEach((file, index) => {
                    file.tipo = tipos[index] || 'OUTRO';
                });
            }

            next();
        });
    };
};*/

import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Primeiro definimos storage e fileFilter (que estão faltando no seu código)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../uploads');
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

// 2. Definimos cleanUploads como uma exportação separada
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
};

// 3. Depois definimos handleUpload
export const handleUpload = (options = {}) => {
    return (req, res, next) => {
        console.log('Incoming headers:', req.headers);
        
        uploader.fields([
            { name: 'fotos', maxCount: 8 },
            { name: 'fotosArvore', maxCount: 5 }
        ])(req, res, (err) => {
            if (err) {
                console.error('Multer error:', {
                    code: err.code,
                    field: err.field,
                    stack: err.stack
                });
                return res.status(400).json({
                    success: false,
                    message: `Erro no upload: ${err.message}`,
                    code: err.code
                });
            }

            console.log('Files received:', {
                fotos: req.files?.fotos?.map(f => f.originalname),
                fotosArvore: req.files?.fotosArvore?.map(f => f.originalname)
            });

            next();
        });
    };
};

