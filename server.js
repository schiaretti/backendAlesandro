import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

// Importações de rotas e middlewares
import publicRoutes from './routes/public.js';
import privateRoutes from './routes/private.js';
import auth from './middlewares/auth.js';

// Configuração de caminhos
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuração inicial
const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 3000;
const uploadDir = process.env.UPLOAD_DIR || '/data/uploads';
app.use('/uploads', express.static(uploadDir));

// Garante que o diretório existe
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log(`📁 Diretório de uploads criado em: ${uploadDir}`);
}

// 1. Configuração do diretório de uploads
const ensureUploadsDir = () => {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log(`📁 Diretório de uploads criado em: ${uploadDir}`);
  }
};

// 2. Middlewares essenciais
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

fs.mkdirSync(uploadDir, { recursive: true, mode: 0o755 });

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token'],
  exposedHeaders: ['Authorization'],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 3. Servir arquivos estáticos com configurações otimizadas
app.use('/uploads', express.static(uploadDir, {
  setHeaders: (res) => {
    res.set('Cache-Control', 'public, max-age=31536000');
  },
  fallthrough: false // Retorna 404 se o arquivo não existir
}));

// 4. Rotas
app.use('/api', publicRoutes);
app.use('/api', auth, privateRoutes); // Adicionei o middleware auth aqui

// 5. Endpoints de sistema
app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      status: 'OK',
      database: 'conectado',
      uploadDir: uploadDir,
      files: fs.readdirSync(uploadDir).length
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      database: 'desconectado',
      error: error.message
    });
  }
});

app.get('/test-upload/:filename', (req, res) => {
  const filePath = path.join(uploadDir, req.params.filename);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: 'Arquivo não encontrado', path: filePath });
  }
});

app.get('/', (req, res) => {
  res.status(200).json({
    status: 'online',
    environment: process.env.NODE_ENV || 'development',
    endpoints: {
      public: {
        login: 'POST /api/login',
        health: 'GET /health'
      },
      private: {
        cadastroUsuarios: 'POST /api/cadastro-usuarios',
        uploads: 'POST /api/upload'
      }
    }
  });
});

// 6. Tratamento de erros global
app.use((err, req, res, next) => {
  console.error('❌ Erro:', err.stack);
  res.status(500).json({
    success: false,
    message: 'Erro interno do servidor',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 7. Inicialização do servidor
const startServer = async () => {
  ensureUploadsDir();
  
  app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
    console.log(`📁 Diretório de uploads: ${uploadDir}`);
  });

  process.on('SIGTERM', async () => {
    console.log('🛑 Encerrando servidor...');
    await prisma.$disconnect();
    process.exit(0);
  });
};

startServer().catch(err => {
  console.error('Falha ao iniciar servidor:', err);
  process.exit(1);
});