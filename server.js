/*import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import publicRoutes from './routes/public.js';
import privateRoutes from './routes/private.js'; // Verifique o caminho
import auth from './middlewares/auth.js';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

// Configuração de caminhos
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();
const app = express();

// Middlewares essenciais (ORDEM IMPORTANTE!)
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`); // Usar originalUrl
  next();
});

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token'],
  exposedHeaders: ['Authorization'], // Importante para o frontend
  credentials: true // Se estiver usando cookies
}));

app.use(express.json());

// Servir arquivos estáticos
app.use('/uploads', express.static(uploadDir, {
    setHeaders: (res) => {
        res.set('Cache-Control', 'public, max-age=31536000');
    }
}));

// Rotas (registradas após middlewares)
app.use('/api', publicRoutes);
app.use('/api', privateRoutes); // Garanta que privateRoutes exporta um router

// Health Check
app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      status: 'OK',
      database: 'conectado'
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      database: 'desconectado',
      error: error.message
    });
  }
});

// Adicione temporariamente no server.js antes das rotas
app.use('/api/cadastro-usuarios', (req, res, next) => {
  console.log('Headers recebidos:', req.headers);
  next();
});

// Documentação de endpoints
app.get('/', (req, res) => {
  res.status(200).json({
    endpoints: {
      public: {
        login: 'POST /api/login',
        health: 'GET /health',
        listarPostes: '/api/listar-postes',
        postes: '/api/postes'
      },
      private: {
        cadastroUsuarios: 'POST /api/cadastro-usuarios', // Adicionado
        listarUsuarios: 'GET /api/listar-usuarios'
      }
    }
  });
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});

// Encerramento elegante
process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

// Adicione logo após a criação do app
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log(`Diretório de uploads criado em: ${uploadDir}`);
}*/

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
const uploadDir = path.join(__dirname, 'uploads');

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
app.use('/uploads', cors(), express.static(uploadDir, {
  setHeaders: (res, path) => {
    if (path.endsWith('.jpg') || path.endsWith('.png') || path.endsWith('.jpeg')) {
      res.set('Cache-Control', 'public, max-age=31536000, immutable');
    }
  },
  fallthrough: false
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