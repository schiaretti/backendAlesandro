import express from 'express';
import { fileURLToPath } from 'url'; // Adicione esta importação
import path from 'path';
import publicRoutes from './routes/public.js';
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
          
          usuarios: '/api/private/listar-usuarios'
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
});