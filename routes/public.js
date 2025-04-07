import express from 'express'
import { PrismaClient } from '@prisma/client'
import bcrypt, { hash } from 'bcrypt'
import jwt from 'jsonwebtoken'
import fs from 'fs';
import { handleUpload, cleanUploads } from '../middlewares/fileUpload.js';

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
    console.log('Iniciando listagem de postes');
    try {
        const { page = 1, limit = 1000 } = req.query;

        // 1. Busca os postes com tratamento para campos não-nulos
        const postes = await prisma.postes.findMany({
            where: {
                latitude: { not: null },  // Filtra apenas registros com latitude válida
                longitude: { not: null }  // Filtra apenas registros com longitude válida
            },
            select: {
                id: true,
                latitude: true,
                longitude: true,
                endereco: true,
                cidade: true,
                createdAt: true
            },
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * limit,
            take: Number(limit)
        });

        // 2. Formatação dos dados (agora seguro pois os valores não são nulos)
        const postesFormatados = postes.map(poste => ({
            id: poste.id,
            endereco: poste.endereco,
            cidade: poste.cidade,
            coords: [poste.latitude, poste.longitude],
            createdAt: poste.createdAt
        }));

        res.json({
            success: true,
            data: postesFormatados,
            count: postesFormatados.length
        });

    } catch (error) {
        console.error('Erro detalhado ao listar postes:', {
            message: error.message,
            stack: error.stack,
            prismaError: error.code,
        });

        res.status(500).json({
            success: false,
            message: 'Erro ao listar postes',
            details: process.env.NODE_ENV === 'development' ? error.message : 'Erro interno',
            code: error.code
        });
    }
});

router.post('/postes', handleUpload({maxFiles: 5 }), async (req, res) => {
    try {
        const { body, files } = req;

        // 1. Validação dos campos obrigatórios (atualizada)
        const requiredFields = ['cidade', 'endereco', 'numero', 'usuarioId'];
        const missingFields = requiredFields.filter(field => !body[field]);

        if (missingFields.length > 0) {
            cleanUploads(files);
            return res.status(400).json({
                success: false,
                message: `Campos obrigatórios faltando: ${missingFields.join(', ')}`,
                code: 'MISSING_REQUIRED_FIELDS'
            });
        }

        // 2. Validação das coordenadas (adaptada para o schema)
        let latitude, longitude;
        try {
            const coords = body.coords ? JSON.parse(body.coords) : [null, null];
            latitude = parseFloat(coords[0]);
            longitude = parseFloat(coords[1]);

            // Validação dos valores
            if (isNaN(latitude) || isNaN(longitude) ||
                latitude < -90 || latitude > 90 ||
                longitude < -180 || longitude > 180) {
                throw new Error('Valores inválidos');
            }
        } catch (error) {
            cleanUploads(files);
            return res.status(400).json({
                success: false,
                message: 'Coordenadas inválidas. Formato esperado: [latitude, longitude] com valores numéricos',
                code: 'INVALID_COORDINATES'
            });
        }

        // Tipos de foto permitidos
        const TIPOS_FOTO = {
            PANORAMICA: 'PANORAMICA',
            LUMINARIA: 'LUMINARIA',
            ARVORE: 'ARVORE',
            TELECOM: 'TELECOM',
            LAMPADA: 'LAMPADA',
        };

        // Verificação de fotos obrigatórias
        const requiredPhotos = ['PANORAMICA', 'LUMINARIA'];
        const uploadedTypes = req.files?.map(f => f.tipo) || [];

        const missingPhotos = requiredPhotos.filter(type =>
            !uploadedTypes.includes(type)
        );

        if (missingPhotos.length > 0) {
            cleanUploads(req.files);
            return res.status(400).json({
                success: false,
                message: `Fotos obrigatórias faltando: ${missingPhotos.join(', ')}`,
                code: 'MISSING_REQUIRED_PHOTOS'
            });
        }

        // 4. Criação do poste com transação
        const result = await prisma.$transaction(async (prisma) => {
            const poste = await prisma.postes.create({
                data: {
                    // Campos de localização
                    latitude: latitude,
                    longitude: longitude,
                    cidade: body.cidade,
                    endereco: body.endereco,
                    numero: body.numero,
                    cep: body.cep,

                    // Campos booleanos
                    isLastPost: body.isLastPost === 'true',
                    canteiroCentral: body.canteiroCentral === 'true',

                    // Relacionamento
                    usuarioId: body.usuarioId,

                    // Demais campos
                    localizacao: body.localizacao,
                    transformador: body.transformador,
                    medicao: body.medicao,
                    telecom: body.telecom,
                    concentrador: body.concentrador,
                    poste: body.poste,
                    alturaposte: body.alturaposte ? parseFloat(body.alturaposte) : null,
                    estruturaposte: body.estruturaposte,
                    tipoBraco: body.tipoBraco,
                    tamanhoBraco: body.tamanhoBraco ? parseFloat(body.tamanhoBraco) : null,
                    quantidadePontos: body.quantidadePontos ? parseInt(body.quantidadePontos) : null,
                    tipoLampada: body.tipoLampada,
                    potenciaLampada: body.potenciaLampada ? parseInt(body.potenciaLampada) : null,
                    tipoReator: body.tipoReator,
                    tipoComando: body.tipoComando,
                    tipoRede: body.tipoRede,
                    tipoCabo: body.tipoCabo,
                    numeroFases: body.numeroFases ? parseInt(body.numeroFases) : null,
                    tipoVia: body.tipoVia,
                    hierarquiaVia: body.hierarquiaVia,
                    tipoPavimento: body.tipoPavimento,
                    quantidadeFaixas: body.quantidadeFaixas ? parseInt(body.quantidadeFaixas) : null,
                    tipoPasseio: body.tipoPasseio,
                    finalidadeInstalacao: body.finalidadeInstalacao,
                    especieArvore: body.especieArvore,
                    fotos: {
                        create: req.files?.map(file => ({
                            url: `/uploads/${file.filename}`,
                            tipo: file.tipo,
                            coords: JSON.stringify([latitude, longitude])
                        }))
                    }
                }
            });
        

            return poste;
        });

        res.status(201).json({
            success: true,
            data: result
        });

    } catch (error) {

        cleanUploads(req.files);

        console.error('Erro ao criar poste:', {
            message: error.message,
            stack: error.stack,
            body: req.body
        });

        res.status(500).json({
            success: false,
            message: 'Erro interno no servidor',
            code: 'INTERNAL_SERVER_ERROR',
            details: process.env.NODE_ENV === 'development' ? {
                error: error.message,
                stack: error.stack
            } : undefined
        });
    }
});




export default router