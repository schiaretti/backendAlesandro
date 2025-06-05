
import express from 'express';
// import path from 'path'; // Módulo path pode não ser mais necessário
// import fs from 'fs/promises'; // REMOVIDO - Não é mais necessário para uploads locais
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

// Import routes and middleware
import publicRoutes from './routes/public.js';
import privateRoutes from './routes/private.js';
import auth from './middlewares/auth.js';

// --- Configuration ---
const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*'; // Adicionado valor padrão por segurança

// CORS configuration
app.use(cors({
  origin: CORS_ORIGIN,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token', 'x-requested-with'],
  exposedHeaders: ['Authorization', 'x-file-id'],
  credentials: true,
  maxAge: 86400
}));

// Middleware para parsear JSON (essencial para APIs)
app.use(express.json());
// Middleware para parsear corpos urlencoded (útil para formulários HTML)
app.use(express.urlencoded({ extended: true }));


// --- Routes ---
app.use('/api', publicRoutes);
app.use('/api', auth, privateRoutes); // Aplica middleware de autenticação às rotas privadas

// --- Health Check Endpoint (Async) ---
// Simplificado: Verifica apenas a conexão com o banco de dados
app.get('/health', async (req, res) => {
  let dbOk = false;
  let dbError = null;

  // Verifica o Banco de Dados
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch (error) {
    console.error('Health Check: Falha na consulta ao banco de dados:', error);
    dbError = error.message;
  }

  // Determina o status geral e o código de resposta
  const overallOk = dbOk; // Verificação do sistema de arquivos removida
  const statusCode = overallOk ? 200 : 503;

  res.status(statusCode).json({
    status: overallOk ? 'OK' : 'SERVICE_UNAVAILABLE',
    services: {
      database: { ok: dbOk, error: dbError }
      // Verificação do sistema de arquivos removida
    },
    system: {
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || 'development'
    },
    timestamp: new Date().toISOString()
  });
});

// --- System Info Endpoint (Async) ---
// Simplificado: Informações do sistema de arquivos removidas
app.get('/system/info', async (req, res) => {
  try {
    // Informações do sistema de arquivos removidas
    res.status(200).json({
      status: 'online',
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      // Seção 'resources' removida
      endpoints: {
        public: {
          login: 'POST /api/login',
          health: 'GET /health'
        },
        private: {
          postes: 'POST /api/postes', // Exemplo adicionado
          // Adicione outros endpoints privados aqui para informação
        }
      }
    });
  } catch (error) {
    console.error('Erro ao buscar informações do sistema:', error);
    res.status(500).json({ success: false, message: 'Falha ao recuperar informações do sistema' });
  }
});

// --- Error Handling Middleware ---
// Mantido: Trata erros do Prisma, Multer (ainda relevante) e outros erros
app.use((err, req, res, next) => {
  console.error('❌ Erro Capturado pelo Handler Global:', {
    message: err.message,
    code: err.code,
    statusCode: err.statusCode,
    // Evitar logar stack completa em produção por segurança
    stack: (process.env.NODE_ENV === 'development' ? err.stack : undefined),
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method
  });

  // Tratamento de Erros do Prisma
  if (err.code?.startsWith('P')) {
    return res.status(400).json({
      success: false,
      message: 'Operação no banco de dados falhou.',
      code: err.code,
      meta: err.meta
    });
  }

  // Tratamento de Erros do Multer (ainda pode ocorrer no middleware de upload)
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      success: false,
      message: 'Arquivo muito grande.', // Mensagem simplificada
      code: 'FILE_SIZE_LIMIT_EXCEEDED'
    });
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({
      success: false,
      message: 'Muitos arquivos enviados.',
      code: 'FILE_COUNT_LIMIT_EXCEEDED'
    });
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({
      success: false,
      message: `Campo de arquivo inesperado: ${err.field}.`,
      code: 'UNEXPECTED_FILE_FIELD'
    });
  }

  // Resposta de Erro Genérica
  const statusCode = typeof err.statusCode === 'number' ? err.statusCode : 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Ocorreu um erro interno no servidor.',
    reference: `ERR-${Date.now()}`,
    // Incluir stack apenas em desenvolvimento
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// --- Verificação de Dependências (Opcional, mas recomendado) ---
// Mantido: Boa prática
async function verifyDependencies() {
  try {
    await Promise.all([
      import('@prisma/client'),
      import('express'),
      import('cors')
    ]);
    console.log('✅ Todas as dependências críticas verificadas.');
    return true;
  } catch (err) {
    console.error('❌ Dependência crítica faltando:', err.message);
    return false;
  }
}

// --- Lógica de Inicialização do Servidor ---
const startServer = async () => {
  console.log('🚀 Iniciando inicialização do servidor...');

  // 1. Verifica Dependências
  if (!await verifyDependencies()) {
    process.exit(1);
  }

  // 2. Garantir que o Diretório de Upload Exista (REMOVIDO)
  // await ensureUploadDir(); // REMOVIDO

  // 3. Conecta ao Banco de Dados
  try {
    await prisma.$connect();
    console.log('💾 Banco de dados conectado com sucesso.');
  } catch (dbError) {
    console.error('🔥 Falha crítica na inicialização: Não foi possível conectar ao banco de dados.', dbError);
    process.exit(1);
  }

  // 4. Começa a Escutar Requisições
  const server = app.listen(PORT, () => {
    console.log(`
    ✅ Servidor está rodando e escutando em http://localhost:${PORT}
    // Log do diretório de uploads removido
    🌿 Ambiente: ${process.env.NODE_ENV || 'development'}
    ⏱  Timestamp: ${new Date().toLocaleString()}
    `);
  });

  // --- Tratamento de Encerramento Gracioso ---
  // Mantido: Importante para produção
  const shutdown = async (signal) => {
    console.log(`\n🚦 Recebido ${signal}. Iniciando encerramento gracioso...`);
    server.close(async () => {
      console.log('🔌 Servidor HTTP fechado.');
      try {
        await prisma.$disconnect();
        console.log('💾 Conexão com o banco de dados fechada.');
      } catch (dbDisconnectError) {
        console.error('⚠️ Erro ao desconectar do banco de dados:', dbDisconnectError);
      }
      console.log('🏁 Encerramento completo.');
      process.exit(0);
    });

    // Força o encerramento se demorar muito
    setTimeout(() => {
      console.error('⏰ Encerramento gracioso demorou demais. Forçando saída.');
      process.exit(1);
    }, 10000); // Timeout de 10 segundos
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Rejeição Não Tratada em:', promise, 'razão:', reason);
    // Considere chamar shutdown('UNHANDLED_REJECTION');
  });
  process.on('uncaughtException', (error) => {
    console.error('💥 Exceção Não Capturada:', error);
    shutdown('UNCAUGHT_EXCEPTION'); // Recomendado sair
  });

};

// --- Inicia a Aplicação ---
startServer();


