import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

// --- Configurações Atualizadas ---

// 1. Define o diretório de upload usando a variável de ambiente do Railway
//    Fallback para '/data' se a variável não estiver definida (embora no Railway ela deva estar)
const UPLOAD_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || '/data';

// 2. Removido: A criação do diretório (fs.mkdir) NÃO deve ser feita aqui no topo.
//    Ela deve ser feita na inicialização principal do seu servidor (app.js ou server.js)
//    antes de começar a aceitar requisições. Exemplo de como fazer isso no seu arquivo principal:
//    
//    import fs from 'fs/promises';
//    const UPLOAD_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || '/data';
//    
//    async function initializeApp() {
//      try {
//        await fs.mkdir(UPLOAD_DIR, { recursive: true });
//        console.log(`Diretório de upload garantido em: ${UPLOAD_DIR}`);
//        // Inicie seu servidor aqui...
//        // app.listen(...);
//      } catch (error) {
//        console.error('Erro ao criar diretório de upload:', error);
//        process.exit(1); // Falha na inicialização se não puder criar o diretório
//      }
//    }
//    initializeApp();

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/jpg'];

// --- Configuração do Multer Atualizada ---
const storage = multer.diskStorage({
  // 3. Define o destino para usar o UPLOAD_DIR (caminho do volume)
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    // Gera um nome único para o arquivo
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    const extension = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${extension}`);
  }
});

// Filtro de arquivo (sem alterações)
const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Tipo de arquivo inválido. Apenas imagens (JPEG/JPG/PNG) são permitidas.'), false);
  }
};

// Função para limpar uploads (agora opera dentro do volume)
const cleanUploads = async (files) => {
  if (!files?.length) return;

  console.log(`Iniciando limpeza de ${files.length} arquivos no volume...`);
  await Promise.all(files.map(async (file) => {
    if (typeof file?.path !== 'string') {
      console.warn('Arquivo com path inválido para limpeza:', file);
      return;
    }
    try {
      // file.path agora será algo como /data/unique-name.jpg
      await fs.unlink(file.path);
      console.log(`Arquivo removido do volume: ${file.path}`);
    } catch (err) {
      if (err.code !== 'ENOENT') { // Ignora erro se o arquivo já não existe
        console.error(`Erro ao remover arquivo ${file.path} do volume:`, err.message);
      }
    }
  }));
};

// --- Middleware handleUpload Atualizado ---
const handleUpload = (options = {}) => {
  // Configura o multer com o storage atualizado, filtro e limites
  const uploader = multer({
    storage: storage, // Usa a configuração de storage atualizada
    fileFilter: fileFilter,
    limits: { fileSize: options.maxFileSize || MAX_FILE_SIZE } 
  });

  return async (req, res, next) => {
    try {
      // Normaliza campos (sem alterações)
      const arrayFields = ['tipos', 'especies', 'latitudes', 'longitudes', 'coordsArvore'];
      arrayFields.forEach(field => {
        if (req.body[field] && !Array.isArray(req.body[field])) {
          req.body[field] = [req.body[field]];
        }
      });

      // Processa o upload usando uploader.array('fotos')
      await new Promise((resolve, reject) => {
        // Usando 'fotos' como nome do campo, e até 10 arquivos (ajuste se necessário)
        uploader.array('fotos', options.maxFiles || 10)(req, res, (err) => {
          if (err) {
            // Trata erros específicos do multer
            if (err instanceof multer.MulterError) {
              console.error('Erro do Multer:', err);
              // Mapeia códigos de erro do Multer para mensagens amigáveis
              const errorMessages = {
                LIMIT_FILE_SIZE: `Tamanho máximo do arquivo excedido (${(options.maxFileSize || MAX_FILE_SIZE) / (1024 * 1024)}MB)`,
                LIMIT_FILE_COUNT: `Número máximo de arquivos excedido (${options.maxFiles || 10})`,
                LIMIT_UNEXPECTED_FILE: 'Campo de upload inesperado. Use o campo "fotos".'
              };
              err.message = errorMessages[err.code] || err.message;
              err.statusCode = 400; // Define um status code apropriado
            } else {
              // Outros erros durante o upload
              console.error('Erro durante o upload:', err);
            }
            return reject(err);
          }
          // Se não houve erro, resolve a Promise
          resolve();
        });
      });

      // Adiciona metadados e URL aos arquivos
      if (req.files?.length) {
        const tiposArray = Array.isArray(req.body.tipos) ? req.body.tipos : (req.body.tipos ? [req.body.tipos] : []);
        const especiesArray = Array.isArray(req.body.especies) ? req.body.especies : (req.body.especies ? [req.body.especies] : []);

        req.files.forEach((file, index) => {
          file.tipo = tiposArray[index] || 'OUTRO';
          if (file.tipo === 'ARVORE') {
            file.especieArvore = especiesArray[index];
          }
          // 4. Define a URL pública relativa.
          //    ASSUMINDO que você vai servir a pasta do volume (`/data`) 
          //    através de uma rota `/uploads` no seu servidor Express.
          //    Ex: app.use('/uploads', express.static(UPLOAD_DIR));
          //    Se a rota for diferente, ajuste o prefixo aqui (/uploads/).
          file.url = `/uploads/${file.filename}`;
        });
      }

      // Passa para o próximo middleware se tudo correu bem
      next();
    } catch (err) {
      // Limpa arquivos que possam ter sido salvos no volume antes do erro
      if (req.files) {
        await cleanUploads(req.files);
      }

      // Resposta de erro genérica
      const statusCode = err.statusCode || 500;
      const message = err.message || 'Erro no processamento do upload';
      console.error(`Erro final no handleUpload [${statusCode}]: ${message}`);

      res.status(statusCode).json({
        success: false,
        message,
        code: err.code || 'UPLOAD_PROCESSING_ERROR'
      });
    }
  };
};

export { handleUpload, cleanUploads, UPLOAD_DIR }; // Exporta UPLOAD_DIR para ser usado no server.js

