import express from 'express';
import publicRoutes from './routes/public.js';
import privateRoutes from './routes/private.js';
import auth from './middlewares/auth.js';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

// Inicializa o Prisma Client
const prisma = new PrismaClient();

const app = express();

// Middlewares essenciais
app.use(express.json());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*', // Melhor usar variável de ambiente
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token']
}));

// Conexão com o Prisma
async function connectPrisma() {
  try {
    await prisma.$connect();
    console.log('✅ Prisma conectado ao banco de dados');
  } catch (error) {
    console.error('❌ Erro ao conectar Prisma:', error);
    process.exit(1); // Encerra o servidor se não conectar
  }
}

// Adicione esta rota antes das outras rotas
app.get('/', (req, res) => {
    res.status(200).json({
      message: 'API em funcionamento!',
      endpoints: {
        login: '/api/login',
        health: '/health',
        // adicione outros endpoints relevantes
      }
    });
  });

// Rotas
app.use('/api', publicRoutes);
app.use('/api', auth, privateRoutes);

// Health Check melhorado
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

app.listen(PORT, '0.0.0.0', async () => {
  await connectPrisma(); // Conecta ao banco antes de iniciar
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`🔗 Health check em http://localhost:${PORT}/health`);
});

// Encerramento elegante
process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});