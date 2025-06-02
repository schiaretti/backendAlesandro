/*import express from 'express';
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

// 1. Configuração avançada do diretório de uploads
const uploadDir = path.resolve(process.env.UPLOAD_DIR || './data/uploads');
const MAX_FILE_SIZE = process.env.MAX_FILE_SIZE || '10mb';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

// 2. Garantia de criação do diretório com tratamento robusto
const ensureUploadsDir = () => {
  try {
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { 
        recursive: true,
        mode: 0o755 // rwxr-xr-x
      });
      console.log(`📁 Diretório de uploads criado em: ${uploadDir}`);
      
      // Cria um arquivo README para documentação interna
      const readmePath = path.join(uploadDir, 'README.md');
      if (!fs.existsSync(readmePath)) {
        fs.writeFileSync(readmePath, `# Diretório de Uploads\n\nArquivos enviados pelos usuários são armazenados aqui.\n\n**Não remova manualmente os arquivos!**`);
      }
    }
  } catch (err) {
    console.error('❌ Falha crítica ao configurar diretório de uploads:', err);
    process.exit(1); // Encerra o processo se não conseguir criar a pasta
  }
};

// 3. Middlewares essenciais com configurações aprimoradas
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${req.ip}`);
  next();
});

app.use(cors({
  origin: CORS_ORIGIN,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token', 'x-requested-with'],
  exposedHeaders: ['Authorization', 'x-file-id'],
  credentials: true,
  maxAge: 86400
}));

app.use(express.json({ 
  limit: MAX_FILE_SIZE,
  verify: (req, res, buf) => {
    req.rawBody = buf.toString(); // Para validações adicionais
  }
}));

app.use(express.urlencoded({ 
  extended: true, 
  limit: MAX_FILE_SIZE 
}));

// 4. Configuração de arquivos estáticos com segurança
app.use('/uploads', (req, res, next) => {
  // Proteção básica contra directory traversal
  if (req.path.includes('../')) {
    return res.status(403).json({ 
      success: false,
      message: 'Acesso proibido ao recurso'
    });
  }
  next();
}, express.static(uploadDir, {
  dotfiles: 'ignore', // Ignora arquivos ocultos
  etag: true,
  fallthrough: false,
  index: false,
  lastModified: true,
  maxAge: '1d'
}));

// 5. Rotas principais
app.use('/api', publicRoutes);
app.use('/api', auth, privateRoutes);

// 6. Endpoints de sistema melhorados
app.get('/health', async (req, res) => {
  try {
    // Teste de conexão com o banco
    await prisma.$queryRaw`SELECT 1`;
    
    // Teste de escrita no diretório
    const testFile = path.join(uploadDir, `.healthcheck_${Date.now()}`);
    fs.writeFileSync(testFile, 'OK');
    fs.unlinkSync(testFile);
    
    res.status(200).json({
      status: 'OK',
      services: {
        database: true,
        filesystem: true
      },
      system: {
        uploadDir: uploadDir,
        freeSpace: fs.statSync(uploadDir).size,
        nodeVersion: process.version,
        environment: process.env.NODE_ENV || 'development'
      }
    });
  } catch (error) {
    res.status(503).json({
      status: 'SERVICE_UNAVAILABLE',
      error: error.message,
      failedService: error.code === 'P1001' ? 'database' : 'filesystem',
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/system/info', (req, res) => {
  res.status(200).json({
    status: 'online',
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    resources: {
      uploadDir: {
        path: uploadDir,
        totalFiles: fs.readdirSync(uploadDir).length,
        totalSize: calculateFolderSize(uploadDir)
      }
    },
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

// 7. Tratamento de erros global aprimorado
app.use((err, req, res, next) => {
  console.error('❌ Erro:', {
    message: err.message,
    stack: err.stack,
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method
  });

  // Erros específicos do Prisma
  if (err.code?.startsWith('P')) {
    return res.status(400).json({
      success: false,
      message: 'Erro de banco de dados',
      code: err.code,
      meta: err.meta
    });
  }

  // Erros de upload
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      success: false,
      message: `Arquivo muito grande. Limite: ${MAX_FILE_SIZE}`,
      code: 'FILE_SIZE_LIMIT_EXCEEDED'
    });
  }

  // Erro genérico
  res.status(500).json({
    success: false,
    message: 'Erro interno do servidor',
    reference: `ERR-${Date.now()}`,
    ...(process.env.NODE_ENV === 'development' && { 
      stack: err.stack,
      details: err.message 
    })
  });
});

// 8. Inicialização robusta do servidor
const startServer = async () => {
  try {
    // Pré-inicialização
    ensureUploadsDir();
    await prisma.$connect();
    
    // Verificação de dependências
    verifyDependencies();

    const server = app.listen(PORT, () => {
      console.log(`
      🚀 Servidor rodando em http://localhost:${PORT}
      📁 Diretório de uploads: ${uploadDir}
      ⏱  ${new Date().toLocaleString()}
      `);
    });

    // Gerenciamento de shutdown
    const shutdown = async (signal) => {
      console.log(`\n🛑 Recebido ${signal}, encerrando graciosamente...`);
      server.close(async () => {
        await prisma.$disconnect();
        console.log('✅ Servidor encerrado com sucesso');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('unhandledRejection', (err) => {
      console.error('⚠️ Unhandled Rejection:', err);
      shutdown('UNHANDLED_REJECTION');
    });

  } catch (error) {
    console.error('🔥 Falha catastrófica na inicialização:', error);
    process.exit(1);
  }
};

// Funções auxiliares
function calculateFolderSize(dir) {
  const files = fs.readdirSync(dir);
  return files.reduce((acc, file) => {
    const filePath = path.join(dir, file);
    const stats = fs.statSync(filePath);
    return acc + stats.size;
  }, 0);
}

function verifyDependencies() {
  try {
    require.resolve('@prisma/client');
    require.resolve('express');
    // Adicione outras verificações conforme necessário
  } catch (err) {
    console.error('❌ Dependência não encontrada:', err.message);
    process.exit(1);
  }
}

// Inicia o servidor
startServer();*/
import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

// Dynamic imports for dependency verification
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Import routes and middleware
import publicRoutes from './routes/public.js';
import privateRoutes from './routes/private.js';
import auth from './middlewares/auth.js';

// Configuration setup
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 3000;

// File upload configuration
const uploadDir = path.resolve(process.env.UPLOAD_DIR || './data/uploads');
const MAX_FILE_SIZE = process.env.MAX_FILE_SIZE || '10mb';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

// Ensure upload directory exists
const ensureUploadsDir = () => {
  try {
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { 
        recursive: true,
        mode: 0o755
      });
      console.log(`📁 Upload directory created at: ${uploadDir}`);
      
      // Create README file
      const readmePath = path.join(uploadDir, 'README.md');
      if (!fs.existsSync(readmePath)) {
        fs.writeFileSync(readmePath, `# Upload Directory\n\nUser-uploaded files are stored here.\n\n**Do not manually remove files!**`);
      }
    }
  } catch (err) {
    console.error('❌ Failed to setup upload directory:', err);
    process.exit(1);
  }
};

// Enhanced middleware setup
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${req.ip}`);
  next();
});

app.use(cors({
  origin: CORS_ORIGIN,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token', 'x-requested-with'],
  exposedHeaders: ['Authorization', 'x-file-id'],
  credentials: true,
  maxAge: 86400
}));

app.use(express.json({ 
  limit: MAX_FILE_SIZE,
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

app.use(express.urlencoded({ 
  extended: true, 
  limit: MAX_FILE_SIZE 
}));

// Secure static file serving
app.use('/uploads', (req, res, next) => {
  if (req.path.includes('../')) {
    return res.status(403).json({ 
      success: false,
      message: 'Access denied'
    });
  }
  next();
}, express.static(uploadDir, {
  dotfiles: 'ignore',
  etag: true,
  fallthrough: false,
  index: false,
  lastModified: true,
  maxAge: '1d'
}));

// Routes
app.use('/api', publicRoutes);
app.use('/api', auth, privateRoutes);

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    
    const testFile = path.join(uploadDir, `.healthcheck_${Date.now()}`);
    fs.writeFileSync(testFile, 'OK');
    fs.unlinkSync(testFile);
    
    res.status(200).json({
      status: 'OK',
      services: {
        database: true,
        filesystem: true
      },
      system: {
        uploadDir: uploadDir,
        freeSpace: fs.statSync(uploadDir).size,
        nodeVersion: process.version,
        environment: process.env.NODE_ENV || 'development'
      }
    });
  } catch (error) {
    res.status(503).json({
      status: 'SERVICE_UNAVAILABLE',
      error: error.message,
      failedService: error.code === 'P1001' ? 'database' : 'filesystem',
      timestamp: new Date().toISOString()
    });
  }
});

// System info endpoint
app.get('/system/info', (req, res) => {
  res.status(200).json({
    status: 'online',
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    resources: {
      uploadDir: {
        path: uploadDir,
        totalFiles: fs.readdirSync(uploadDir).length,
        totalSize: calculateFolderSize(uploadDir)
      }
    },
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

// Error handling
app.use((err, req, res, next) => {
  console.error('❌ Error:', {
    message: err.message,
    stack: err.stack,
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method
  });

  if (err.code?.startsWith('P')) {
    return res.status(400).json({
      success: false,
      message: 'Database error',
      code: err.code,
      meta: err.meta
    });
  }

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      success: false,
      message: `File too large. Limit: ${MAX_FILE_SIZE}`,
      code: 'FILE_SIZE_LIMIT_EXCEEDED'
    });
  }

  res.status(500).json({
    success: false,
    message: 'Internal server error',
    reference: `ERR-${Date.now()}`,
    ...(process.env.NODE_ENV === 'development' && { 
      stack: err.stack,
      details: err.message 
    })
  });
});

// Helper functions
function calculateFolderSize(dir) {
  const files = fs.readdirSync(dir);
  return files.reduce((acc, file) => {
    const filePath = path.join(dir, file);
    const stats = fs.statSync(filePath);
    return acc + stats.size;
  }, 0);
}

async function verifyDependencies() {
  try {
    // ES Modules compatible check
    await Promise.all([
      import('@prisma/client'),
      import('express')
    ]);
    console.log('✅ All dependencies are available');
  } catch (err) {
    console.error('❌ Missing dependency:', err.message);
    process.exit(1);
  }
}

// Server startup
const startServer = async () => {
  try {
    ensureUploadsDir();
    await prisma.$connect();
    await verifyDependencies();

    const server = app.listen(PORT, () => {
      console.log(`
      🚀 Server running at http://localhost:${PORT}
      📁 Upload directory: ${uploadDir}
      ⏱  ${new Date().toLocaleString()}
      `);
    });

    const shutdown = async (signal) => {
      console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
      server.close(async () => {
        await prisma.$disconnect();
        console.log('✅ Server stopped successfully');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('unhandledRejection', (err) => {
      console.error('⚠️ Unhandled Rejection:', err);
      shutdown('UNHANDLED_REJECTION');
    });

  } catch (error) {
    console.error('🔥 Critical startup failure:', error);
    process.exit(1);
  }
};

startServer();