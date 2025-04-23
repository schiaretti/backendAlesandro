/*import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
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

/*const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../uploads');
        console.log('Destination:', uploadDir); // <-- Adicione este log
        fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, `foto_${uniqueSuffix}${ext}`);
    }
});*/

/*const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage });


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
            files: options.maxFiles || 10
        }
    });

    return (req, res, next) => {
        uploader.array('fotos')(req, res, (err) => {
            console.log('Uploaded files:', req.files); // <-- Adicione este log
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

/*import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
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
            files: options.maxFiles || 10
        }
    });

    return (req, res, next) => {
        // Middleware para processar os metadados antes do upload
        const fieldsMiddleware = (req, res, next) => {
            // Converte campos de string para array quando necessário
            if (req.body.tipos && !Array.isArray(req.body.tipos)) {
                req.body.tipos = [req.body.tipos];
            }
            if (req.body.especies && !Array.isArray(req.body.especies)) {
                req.body.especies = [req.body.especies];
            }
            if (req.body.latitudes && !Array.isArray(req.body.latitudes)) {
                req.body.latitudes = [req.body.latitudes];
            }
            if (req.body.longitudes && !Array.isArray(req.body.longitudes)) {
                req.body.longitudes = [req.body.longitudes];
            }
            next();
        };

        // Aplica os middlewares em sequência
        fieldsMiddleware(req, res, () => {
            uploader.array('fotos')(req, res, (err) => {
                console.log('Files uploaded:', req.files);
                console.log('Body data:', req.body);

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

                // Associa os metadados aos arquivos
                if (req.files && req.body.tipos) {
                    req.files.forEach((file, index) => {
                        file.tipo = req.body.tipos?.[index] || 'OUTRO';
                        
                        // Adiciona metadados específicos para árvores
                        if (file.tipo === 'ARVORE') {
                            file.especieArvore = req.body.especies?.[index];
                            file.latitude = req.body.latitudes?.[index] || null;
                            file.longitude = req.body.longitudes?.[index] || null;
                           
                        }
                    });
                }

                next();
            });
        });
    };
};*/

export const handleUpload = (options = {}) => {
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