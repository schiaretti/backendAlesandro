import express from 'express';
import publicRoutes from './routes/public.js';
import privateRoutes from './routes/private.js';
import auth from './middlewares/auth.js';
import cors from 'cors';

const app = express();

// Configurações essenciais
app.use(express.json());
app.use(cors({
  origin: '*', // Ou especifique seus domínios permitidos
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rotas
app.use('/api', publicRoutes);
app.use('/api', auth, privateRoutes);

// Rota de health check (obrigatória para o Railway)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

// Configuração da porta para o Railway
const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});