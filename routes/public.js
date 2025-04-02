import express from 'express'
import { PrismaClient } from '@prisma/client'
import bcrypt, { hash } from 'bcrypt'
import jwt from 'jsonwebtoken'


const prisma = new PrismaClient()
const router = express.Router()
const JWT_SECRET = process.env.JWT_SECRET


// Rota de login corrigida
router.post('/login', async (req, res) => {
    try {
        const { email, senha } = req.body;

        // Validação dos campos
        if (!email || !senha) {
            return res.status(400).json({
                success: false,
                message: 'Email e senha são obrigatórios',
                code: 'MISSING_CREDENTIALS'
            });
        }

        // Busca o usuário
        const usuario = await prisma.usuarios.findUnique({
            where: { email }
        });

        if (!usuario) {
            return res.status(404).json({
                success: false,
                message: 'Usuário não encontrado',
                code: 'USER_NOT_FOUND'
            });
        }

        // Verifica a senha
        const senhaValida = await bcrypt.compare(senha, usuario.senha);
        
        if (!senhaValida) {
            return res.status(401).json({
                success: false,
                message: 'Credenciais inválidas',
                code: 'INVALID_CREDENTIALS'
            });
        }

        // Gera o token JWT
        const token = jwt.sign(
            {
                id: usuario.id,
                nivel: usuario.nivel
            }, 
            process.env.JWT_SECRET,
            { expiresIn: '1d' }
        );

        // Resposta formatada corretamente
        res.status(200).json({
            success: true,
            message: 'Login realizado com sucesso',
            token,
            user: {
                id: usuario.id,
                email: usuario.email,
                nome: usuario.nome,
                nivel: usuario.nivel
            }
        });

    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno no servidor',
            code: 'INTERNAL_SERVER_ERROR',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});



export default router