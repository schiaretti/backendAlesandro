import express from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

// Middleware de autenticação (já ajustado anteriormente)
import auth from '../middlewares/auth.js';
import verificarAdmin from '../middlewares/verificarAdmin.js';

// Rota de CADASTRO (protegida para admin)
router.post('/cadastro-usuarios', auth, verificarAdmin, async (req, res) => {
    try {
        const { email, nome, senha, nivel } = req.body;

        if (!email || !nome || !senha || !nivel) {
            return res.status(400).json({ 
                success: false,
                message: 'Todos os campos são obrigatórios'
            });
        }

        // Verifica se o nível é válido (opcional)
        if (!['admin', 'usuario', 'cadastrador'].includes(nivel)) {
            return res.status(400).json({
                success: false,
                message: 'Nível de usuário inválido'
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
            message: 'Nível de usuário inválido. Use: admin, usuario ou cadastrador Erro no servidor!',
            code: 'USER_CREATION_ERROR'
        });
    }
});

// Rota de LISTAGEM (protegida para admin)
router.get('/listar-usuarios', auth, verificarAdmin, async (req, res) => {
    try {

         // Se houver o parâmetro ?count=true, retorna apenas a contagem
        if (req.query.count === 'true') {
            const totalUsuarios = await prisma.usuarios.count();
            return res.json({
                success: true,
                count: totalUsuarios
            });
        }
        
        const usuarios = await prisma.usuarios.findMany({
            select: {
                id: true,
                email: true,
                nome: true,
                nivel: true
                
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

// Rota para EDITAR usuário (protegida para admin)
router.put('/editar-usuario/:id', auth, verificarAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { email, nome, senha, nivel } = req.body;

        if (!email && !nome && !senha && !nivel) {
            return res.status(400).json({
                success: false,
                message: 'Pelo menos um campo deve ser fornecido para edição'
            });
        }

        const usuarioExistente = await prisma.usuarios.findUnique({ where: { id } });
        if (!usuarioExistente) {
            return res.status(404).json({
                success: false,
                message: 'Usuário não encontrado'
            });
        }

        // Validações
        const dadosAtualizacao = {};
        
        if (email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return res.status(400).json({
                    success: false,
                    message: 'Formato de e-mail inválido'
                });
            }
            if (email !== usuarioExistente.email) {
                const emailExistente = await prisma.usuarios.findUnique({ where: { email } });
                if (emailExistente) {
                    return res.status(400).json({
                        success: false,
                        message: 'Este e-mail já está em uso'
                    });
                }
            }
            dadosAtualizacao.email = email;
        }

        if (nome) dadosAtualizacao.nome = nome;
        
        if (nivel) {
            if (!['admin', 'usuario', 'cadastrador'].includes(nivel)) {
                return res.status(400).json({
                    success: false,
                    message: 'Nível de usuário inválido. Use: admin, usuario ou cadastrador'
                });
            }
            dadosAtualizacao.nivel = nivel;
        }

        if (senha) {
            const salt = await bcrypt.genSalt(10);
            dadosAtualizacao.senha = await bcrypt.hash(senha, salt);
        }

        const usuarioAtualizado = await prisma.usuarios.update({
            where: { id },
            data: dadosAtualizacao,
            select: {
                id: true,
                email: true,
                nome: true,
                nivel: true
                
            }
        });

        res.json({
            success: true,
            message: 'Usuário atualizado com sucesso',
            data: usuarioAtualizado
        });

    } catch (error) {
        console.error('Erro ao editar usuário:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao editar usuário',
            code: 'USER_UPDATE_ERROR',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Rota para DELETAR usuário (protegida para admin)
router.delete('/deletar-usuario/:id', auth, verificarAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // Verifica se o usuário existe
        const usuarioExistente = await prisma.usuarios.findUnique({
            where: { id }
        });

        if (!usuarioExistente) {
            return res.status(404).json({
                success: false,
                message: 'Usuário não encontrado'
            });
        }

        // Impede que um admin se delete (opcional)
        if (usuarioExistente.nivel === 'admin' && usuarioExistente.id === req.usuario.id) {
            return res.status(403).json({
                success: false,
                message: 'Você não pode deletar seu próprio usuário admin'
            });
        }

        // Deleta o usuário
        await prisma.usuarios.delete({
            where: { id }
        });

        res.json({
            success: true,
            message: 'Usuário deletado com sucesso'
        });

    } catch (error) {
        console.error('Erro ao deletar usuário:', error);
        
        // Tratamento especial para erro de chave estrangeira
        if (error.code === 'P2003') {
            return res.status(400).json({
                success: false,
                message: 'Não é possível deletar usuário com registros associados',
                code: 'USER_HAS_RELATIONS'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Erro ao deletar usuário',
            code: 'USER_DELETION_ERROR'
        });
    }
});



export default router;