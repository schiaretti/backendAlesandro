import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuração do diretório de uploads
const UPLOAD_DIR = path.join(__dirname, '../uploads');

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

// Configuração de armazenamento
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
        cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
        const ext = path.extname(file.originalname);
        cb(null, `poste_${uniqueSuffix}${ext}`);
    }
});

// Filtro de arquivos
const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Apenas imagens (JPEG/JPG/PNG) são permitidas'), false);
    }
};

// Middleware principal
const handleUpload = (options = {}) => {
    const upload = multer({
        storage,
        fileFilter,
        limits: {
            fileSize: options.fileSize || 10 * 1024 * 1024, // 10MB padrão
            files: options.maxFiles || 10
        }
    });

    return (req, res, next) => {
        // Middleware para normalizar campos de array
        const normalizeFields = (req, res, next) => {
            const arrayFields = ['tipos', 'especies', 'latitudes', 'longitudes'];
            arrayFields.forEach(field => {
                if (req.body[field] && !Array.isArray(req.body[field])) {
                    req.body[field] = [req.body[field]];
                }
            });
            next();
        };

        normalizeFields(req, res, () => {
            upload.array('fotos')(req, res, async (err) => {
                if (err) {
                    cleanUploads(req.files);
                    const errorMessages = {
                        LIMIT_FILE_SIZE: 'Tamanho máximo do arquivo excedido (10MB)',
                        LIMIT_FILE_COUNT: 'Número máximo de arquivos excedido',
                        'LIMIT_UNEXPECTED_FILE': 'Campo de upload incorreto'
                    };
                    return res.status(400).json({
                        success: false,
                        message: errorMessages[err.code] || 'Erro no upload de arquivos',
                        code: err.code || 'UPLOAD_ERROR'
                    });
                }

                // Processamento dos metadados
                if (req.files?.length && req.body.tipos) {
                    req.files = req.files.map((file, index) => ({
                        ...file,
                        // Adiciona metadados essenciais
                        tipo: req.body.tipos[index] || 'OUTRO',
                        path: file.path, // Caminho absoluto
                        relativePath: `/uploads/${file.filename}`, // Caminho relativo
                        // Metadados específicos para árvores
                        ...(req.body.tipos[index] === 'ARVORE' && {
                            especieArvore: req.body.especies?.[index],
                            fotoLatitude: parseFloat(req.body.latitudes?.[index]) || null,
                            fotoLongitude: parseFloat(req.body.longitudes?.[index]) || null
                        }),
                        // Coordenadas padrão para outros tipos
                        ...(req.body.tipos[index] !== 'ARVORE' && {
                            fotoLatitude: parseFloat(req.body.latitude) || null,
                            fotoLongitude: parseFloat(req.body.longitude) || null
                        })
                    }));
                }

                console.log('Files processed:', req.files?.map(f => ({
                    filename: f.filename,
                    path: f.path,
                    tipo: f.tipo,
                    size: f.size,
                    ...(f.tipo === 'ARVORE' && {
                        especie: f.especieArvore,
                        coords: [f.fotoLatitude, f.fotoLongitude]
                    })
                })));

                next();
            });
        });
    };
};

export { handleUpload, cleanUploads };