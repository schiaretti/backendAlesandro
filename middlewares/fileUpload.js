import multer from 'multer';
import path from 'path';
import fs from 'fs/promises'; // Usar promises é bom aqui
import { fileURLToPath } from 'url';
import AWS from 'aws-sdk';

// Configuração do S3 (mantida aqui, pois public.js a utiliza via import)
// Certifique-se que as variáveis de ambiente AWS_ACCESS_KEY, AWS_SECRET_KEY e AWS_REGION estão configuradas no Railway
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
  region: process.env.AWS_REGION
});

// Função para upload no S3 (mantida aqui para ser usada por public.js)
const uploadToS3 = async (file) => {
  // Verifica se o arquivo temporário existe antes de tentar ler
  try {
    await fs.access(file.path);
  } catch (err) {
    console.error(`Arquivo temporário não encontrado para S3 upload: ${file.path}`, err);
    throw new Error(`Arquivo temporário não encontrado: ${file.path}`);
  }

  try {
    const fileStream = await fs.readFile(file.path); // Lê o arquivo temporário
    const params = {
      Bucket: process.env.S3_BUCKET, // Certifique-se que S3_BUCKET está configurado
      Key: `uploads/${file.filename}`, // Usa o nome de arquivo gerado pelo multer
      Body: fileStream,
      ContentType: file.mimetype,
      ACL: 'public-read' // Garante que o objeto seja público
    };

    console.log(`Iniciando upload para S3: ${params.Key} (Bucket: ${params.Bucket})`);
    const result = await s3.upload(params).promise();
    console.log(`Upload para S3 concluído: ${result.Location}`);

    // Remove o arquivo temporário APÓS upload S3 bem-sucedido
    await fs.unlink(file.path);
    console.log(`Arquivo temporário removido após S3 upload: ${file.path}`);
    return result.Location; // Retorna a URL pública do S3

  } catch (err) {
    console.error(`Falha no upload para S3 ou limpeza: ${file.path}`, err);
    // Tenta remover o arquivo temporário mesmo em caso de falha no upload S3
    await fs.unlink(file.path).catch(unlinkErr => {
        console.error(`Falha ao limpar arquivo temporário ${file.path} após erro S3:`, unlinkErr);
    });
    // Propaga um erro claro
    throw new Error(`Falha no upload para S3: ${err.message}`);
  }
};


// Função para limpar uploads temporários (mantida aqui)
const cleanUploads = async (files) => {
  if (!files?.length) return;

  console.log(`Iniciando limpeza de ${files.length} arquivos temporários...`);
  await Promise.all(files.map(async (file) => {
    if (typeof file?.path !== 'string') {
        console.warn('Tentativa de limpar arquivo com path inválido:', file);
        return;
    }
    try {
      await fs.unlink(file.path);
      console.log(`Arquivo temporário removido: ${file.path}`);
    } catch (err) {
      // É comum o arquivo não existir se cleanUploads for chamado após uploadToS3 já ter limpado
      if (err.code !== 'ENOENT') {
          console.error(`Erro ao limpar arquivo temporário ${file.path}:`, err.message);
      }
    }
  }));
};

// Configuração do Multer
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    // Usa o diretório persistente configurado em server.js e railway.json
    const uploadDir = process.env.UPLOAD_DIR || '/data/uploads';
    try {
      // Garante que o diretório de upload temporário exista
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir); // Salva temporariamente no volume /data/uploads
    } catch (err) {
      console.error(`Erro ao criar/acessar diretório de upload temporário ${uploadDir}:`, err);
      cb(err); // Passa o erro para o multer
    }
  },
  filename: (req, file, cb) => {
    // Mantém a lógica original de nomeação para evitar colisões
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const ext = path.extname(file.originalname);
    cb(null, `poste_${timestamp}_${randomStr}${ext}`);
  }
});

// Filtro de arquivo (mantido)
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true); // Aceita o arquivo
  } else {
    // Rejeita o arquivo com um erro específico
    cb(new Error('Tipo de arquivo inválido. Apenas imagens (JPEG/JPG/PNG) são permitidas.'), false);
  }
};

// Middleware handleUpload (simplificado)
const handleUpload = (options = {}) => {
  const uploader = multer({
    storage, // Usa o diskStorage configurado acima
    fileFilter, // Usa o filtro de tipo de arquivo
    limits: {
      fileSize: options.maxFileSize || 5 * 1024 * 1024, // 5MB por padrão
      files: options.maxFiles || 10 // 10 arquivos por padrão
    }
  });

  // Retorna a função de middleware assíncrona
  return async (req, res, next) => {
    try {
      // Normaliza campos que podem vir como string ou array
      const arrayFields = ['tipos', 'especies', 'latitudes', 'longitudes', 'coordsArvore'];
      arrayFields.forEach(field => {
        if (req.body[field] && !Array.isArray(req.body[field])) {
          req.body[field] = [req.body[field]];
        }
      });

      // Executa o middleware do multer para processar 'multipart/form-data'
      // Ele vai salvar os arquivos temporariamente em /data/uploads
      // e popular req.files e req.body
      await new Promise((resolve, reject) => {
        uploader.array('fotos')(req, res, (err) => { // 'fotos' deve ser o nome do campo no form-data
          if (err) {
            // Se o erro for do fileFilter, ele já terá a mensagem correta
            // Se for erro de limite (ex: fileSize), multer adiciona um 'code'
            console.error('Erro durante o processamento do multer:', err);
            return reject(err); // Rejeita a promise para cair no catch abaixo
          }
          resolve(); // Continua se o multer processou sem erros
        });
      });

      // Adiciona metadados aos arquivos em req.files para uso na rota
      if (req.files?.length && req.body.tipos) {
         const tiposArray = Array.isArray(req.body.tipos) ? req.body.tipos : [req.body.tipos];
         const especiesArray = Array.isArray(req.body.especies) ? req.body.especies : (req.body.especies ? [req.body.especies] : []);

        req.files.forEach((file, index) => {
          file.tipo = tiposArray[index] || 'OUTRO'; // Associa tipo à foto
          if (file.tipo === 'ARVORE') {
            file.especieArvore = especiesArray[index]; // Associa espécie se for árvore
          }
          // Outros metadados como lat/lon da foto são tratados na rota /postes
        });
      }

      // **NÃO FAZ UPLOAD PARA S3 AQUI**
      // A responsabilidade do upload para S3 foi movida para a rota /api/postes (em public.js)
      // Isso garante que o upload só ocorra após validações da rota e dentro da transação do Prisma.

      next(); // Passa o controle para a próxima middleware (a rota /api/postes)

    } catch (err) {
      // Este catch lida com erros ocorridos DURANTE o processamento do multer ou na lógica ACIMA

      // Limpa arquivos temporários que o multer possa ter criado ANTES do erro
      if (req.files) {
          await cleanUploads(req.files);
      }

      // Prepara a resposta de erro
      const errorMessages = {
        LIMIT_FILE_SIZE: `Tamanho máximo do arquivo excedido (${(options.maxFileSize || 5 * 1024 * 1024) / (1024 * 1024)}MB)`,
        LIMIT_FILE_COUNT: `Número máximo de arquivos excedido (${options.maxFiles || 10})`,
        LIMIT_UNEXPECTED_FILE: 'Campo de upload inválido ou nome incorreto (esperado: "fotos")',
      };

      const statusCode = err.code && errorMessages[err.code] ? 400 : (err.message.includes('Tipo de arquivo inválido') ? 400 : 500);
      const message = errorMessages[err.code] || err.message || 'Falha no pré-processamento do upload';

      console.error(`Erro no middleware handleUpload: ${message}`, err);

      // Retorna o erro para o cliente e NÃO chama next(err) para evitar cair no handler global desnecessariamente
      res.status(statusCode).json({
        success: false,
        message: message,
        code: err.code || 'UPLOAD_MIDDLEWARE_ERROR'
      });
    }
  };
};

// Exporta as funções que precisam ser usadas em outros módulos (public.js, etc.)
export { handleUpload, cleanUploads, uploadToS3 };

