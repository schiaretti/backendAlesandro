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

// Rotas de Postes
router.post('/postes', authenticateToken, upload.array('fotos'), async (req, res) => {
    try {
        const { body, files } = req;
        
        // 1. Defina as fotos obrigatórias (const ou let)
        const FOTOS_OBRIGATORIAS = ['PANORAMICA', 'LUMINARIA'];
        
        // 2. Processamento seguro dos tipos de foto
        const tiposRecebidos = files?.map((file, index) => {
            // Corrige o acesso ao tipo (remove tabs e formatação)
            let tipo = body['tipo_fotos'];
            
            // Se for array, pega o item correspondente
            if (Array.isArray(tipo)) {
                tipo = tipo[index];
            }
            
            return String(tipo || '')
                .trim() // Remove espaços e tabs
                .toUpperCase();
        }).filter(Boolean) || []; // Filtra valores vazios

        // 3. Verificação de fotos obrigatórias
        const faltantes = FOTOS_OBRIGATORIAS.filter(tipo => 
            !tiposRecebidos.includes(tipo)
        );

        if (faltantes.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Fotos obrigatórias faltando: ${faltantes.join(', ')}`,
                code: 'MISSING_REQUIRED_PHOTOS',
                required: FOTOS_OBRIGATORIAS,
                received: tiposRecebidos
            });
        }

        // 4. Criação do poste 
        const novoPoste = await prisma.postes.create({
            data: {
                usuarioId: req.user.id,
                coords: body.coords,
                cidade: body.cidade,
                endereco: body.endereco,
                numero: body.numero,
                cep: body.cep,
                isLastPost: body.isLastPost === 'true',
                localizacao: body.localizacao,
                transformador: body.transformador,
                medicao: body.medicao,
                telecom: body.telecom,
                concentrador: body.concentrador,
                poste: body.poste,
                alturaposte: body.alturaposte,
                estruturaposte: body.estruturaposte,
                tipoBraco: body.tipoBraco,
                tamanhoBraco: body.tamanhoBraco,
                quantidadePontos: body.quantidadePontos,
                tipoLampada: body.tipoLampada,
                potenciaLampada: body.potenciaLampada,
                tipoReator: body.tipoReator,
                tipoComando: body.tipoComando,
                tipoRede: body.tipoRede,
                tipoCabo: body.tipoCabo,
                numeroFases: body.numeroFases,
                tipoVia: body.tipoVia,
                hierarquiaVia: body.hierarquiaVia,
                tipoPavimento: body.tipoPavimento,
                quantidadeFaixas: body.quantidadeFaixas,
                tipoPasseio: body.tipoPasseio,
                canteiroCentral: body.canteiroCentral,
                finalidadeInstalacao: body.finalidadeInstalacao,
                especieArvore: body.especieArvore,
                createdAt: new Date(body.createdAt || undefined)
            }
        });

        // 5. Processamento das fotos
        if (files?.length > 0) {
            await Promise.all(files.map(async (file, index) => {
                const tipo = tiposRecebidos[index] || 'OUTRA';
                await prisma.foto.create({
                    data: {
                        url: `/uploads/${file.filename}`,
                        tipo: tipo,
                        posteId: novoPoste.id,
                        createdAt: new Date()
                    }
                });
            }));
        }

        res.status(201).json({
            success: true,
            message: 'Poste cadastrado com sucesso',
            data: await prisma.postes.findUnique({
                where: { id: novoPoste.id },
                include: { fotos: true }
            })
        });

    } catch (error) {
        console.error('Erro detalhado:', {
            error: error.message,
            stack: error.stack,
            body: req.body,
            files: req.files?.map(f => f.originalname)
        });

        res.status(500).json({
            success: false,
            message: 'Erro interno no servidor',
            code: 'INTERNAL_SERVER_ERROR',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});
    


router.get('/listar-postes', authenticateToken, async (req, res) => {
    try {
        const postes = await prisma.postes.findMany({
            where: { usuarioId: req.user.id },
            include: { fotos: true },
            orderBy: { createdAt: 'desc' }
        });

        res.json({
            success: true,
            data: postes
        });
    } catch (error) {
        console.error('Erro ao listar postes:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao listar postes',
            code: 'POST_LIST_ERROR'
        });
    }
});

export default router;