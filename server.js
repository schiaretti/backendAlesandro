/*import express from 'express';
import { fileURLToPath } from 'url'; // Adicione esta importação
import path from 'path';
import publicRoutes from './routes/public.js';
import privateRoutes from './routes/private.js'
import auth from './middlewares/auth.js';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

// Configuração de caminhos
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();
const app = express();

// Middlewares essenciais
app.use(express.json());
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token']
}));

// Servir arquivos estáticos (uploads)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/', (req, res) => {
    res.status(200).json({
      endpoints: {
        public: {
          login: '/api/login',
          health: '/health',
          listarPostes: '/api/listar-postes',
          postes: '/api/postes'
        },
        private: {
         
          listarUsuarios: '/api/listar-usuarios'
        }
      }
    });
  });

  

// No server.js, antes das rotas
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});


// Rotas
app.use('/api', publicRoutes);
app.use('/api', privateRoutes)


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

// Configuração do servidor
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => { // Remova '0.0.0.0'
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});

// Encerramento elegante
process.on('SIGTERM', async () => {
    await prisma.$disconnect();
    process.exit(0);
});*/

import express from 'express';
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
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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