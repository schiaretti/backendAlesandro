import express from 'express'
import { PrismaClient } from '@prisma/client'
import bcrypt, { hash } from 'bcrypt'
import jwt from 'jsonwebtoken'
import upload from '../middlewares/fileUpload.js';

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

router.get('/listar-postes', async (req, res) => {
    try {

        console.log('Usuário autenticado:', req.user); // Log do usuário

        const postes = await prisma.postes.findMany({

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

// Rotas de Postes
/*router.post('/postes', upload.array('fotos'), async (req, res) => {
    try {
        const { body, files } = req;

        // 1. Defina as fotos obrigatórias (const ou let)
        const FOTOS_OBRIGATORIAS = ['PANORAMICA', 'LUMINARIA'];

        // 2. Processamento seguro dos tipos de foto - VERSÃO CORRIGIDA
        const tiposRecebidos = files?.map((file, index) => {
            // Captura o tipo da foto de três formas diferentes
            let tipo;

            // Tentativa 1: Pega do array body.tipo_fotos[]
            if (Array.isArray(body.tipo_fotos)) {
                tipo = body.tipo_fotos[index];
            }
            // Tentativa 2: Pega do campo body.tipo_fotos[index]
            else if (body[`tipo_fotos[${index}]`]) {
                tipo = body[`tipo_fotos[${index}]`];
            }
            // Tentativa 3: Pega do campo único body.tipo_fotos
            else {
                tipo = body.tipo_fotos;
            }

            // Garante que o tipo seja uma string válida
            return String(tipo || file.originalname.split('.')[0] || 'OUTRA')
                .trim()
                .toUpperCase();
        }) || [];

        // DEBUG: Mostra os tipos recebidos para verificação
        console.log('Tipos de foto recebidos:', tiposRecebidos);
        console.log('Estrutura completa do body:', body);

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
});*/
router.post('/postes', upload.array('fotos'), async (req, res) => {
    try {
        const { body, files } = req;

        // 1. Validação das fotos obrigatórias
        const FOTOS_OBRIGATORIAS = ['PANORAMICA', 'LUMINARIA'];
        const tiposRecebidos = body.tipo_fotos || [];
        
        const faltantes = FOTOS_OBRIGATORIAS.filter(tipo => 
            !tiposRecebidos.includes(tipo)
        );

        if (faltantes.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Fotos obrigatórias faltando: ${faltantes.join(', ')}`,
                code: 'MISSING_REQUIRED_PHOTOS'
            });
        }

        // 2. Validação dos dados básicos
        const camposObrigatorios = ['coords', 'cidade', 'endereco', 'numero', 'cep'];
        const camposFaltantes = camposObrigatorios.filter(campo => !body[campo]);
        
        if (camposFaltantes.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Campos obrigatórios faltando: ${camposFaltantes.join(', ')}`,
                code: 'MISSING_REQUIRED_FIELDS'
            });
        }

        // 3. Criação do poste com transação
        const [novoPoste] = await prisma.$transaction([
            prisma.postes.create({
                data: {
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
                    usuario: { connect: { id: body.usuarioId } },
                    fotos: {
                        create: files?.map((file, index) => ({
                            url: `/uploads/${file.filename}`,
                            tipo: tiposRecebidos[index] || 'OUTRA',
                            coords: body.coords
                        }))
                    }
                },
                include: { fotos: true }
            })
        ]);

        res.status(201).json({
            success: true,
            data: novoPoste
        });

    } catch (error) {
        console.error('Erro no cadastro de poste:', {
            error: error.message,
            stack: error.stack,
            body: req.body,
            files: req.files?.map(f => f.originalname)
        });

        res.status(500).json({
            success: false,
            message: 'Erro interno no servidor',
            code: 'INTERNAL_SERVER_ERROR',
            details: process.env.NODE_ENV === 'development' ? {
                message: error.message,
                stack: error.stack
            } : undefined
        });
    }
});




export default router