import express from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import authenticateToken from '../middlewares/auth.js';
import upload from '../middlewares/fileUpload.js';

const prisma = new PrismaClient();
const router = express.Router();

// Rotas de Usuário (protegidas por autenticação)
router.post('/cadastro-usuarios', authenticateToken, async (req, res) => {
    try {
        const { email, nome, senha, nivel } = req.body;

        // Validação básica
        if (!email || !nome || !senha || !nivel) {
            return res.status(400).json({ 
                success: false,
                message: 'Todos os campos são obrigatórios'
            });
        }

        const salt = await bcrypt.genSalt(10);
        const hashSenha = await bcrypt.hash(senha, salt);

        const usuarioDb = await prisma.usuarios.create({
            data: { email, nome, senha: hashSenha, nivel }
        });

        res.status(201).json({
            success: true,
            data: {
                id: usuarioDb.id,
                email: usuarioDb.email,
                nome: usuarioDb.nome,
                nivel: usuarioDb.nivel
            }
        });
    } catch (error) {
        console.error('Erro no cadastro:', error);
        res.status(500).json({
            success: false,
            message: 'Erro no servidor',
            code: 'USER_CREATION_ERROR'
        });
    }
});

router.get('/listar-usuarios', authenticateToken, async (req, res) => {
    try {
        const usuarios = await prisma.usuarios.findMany({
            select: {
                id: true,
                email: true,
                nome: true,
                nivel: true,
                createdAt: true
            }
        });

        res.json({
            success: true,
            data: usuarios
        });
    } catch (error) {
        console.error('Erro ao listar usuários:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao listar usuários',
            code: 'USER_LIST_ERROR'
        });
    }
});






export default router;