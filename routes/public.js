import express from 'express'
import { PrismaClient } from '@prisma/client'
import bcrypt, { hash } from 'bcrypt'
import jwt from 'jsonwebtoken'
import upload from '../middlewares/fileUpload.js';
import fs from 'fs';
import path from 'path'; // Importe path também para lidar com caminhos
import { handleUpload } from '../middlewares/fileUpload.js';

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
        // 1. Parâmetros de paginação (opcional)
        const { page = 1, limit = 1000 } = req.query; // Aumentei o limite para seu caso de uso
        const skip = (page - 1) * limit;

        // 2. Consulta otimizada apenas com os campos necessários
        const postes = await prisma.postes.findMany({
            select: {
                id: true,
                coords: true,  // Apenas as coordenadas
                endereco: true, // Adicionei para o popup
                cidade: true    // Adicionei para o popup
            },
            orderBy: { createdAt: 'desc' },
            skip: parseInt(skip),
            take: parseInt(limit)
        });

        // 3. Processamento seguro das coordenadas
        const postesFormatados = postes.map(poste => {
            try {
                return {
                    ...poste,
                    coords: parseCoords(poste.coords) // Função de parse segura
                };
            } catch (error) {
                console.error(`Erro ao processar coordenadas do poste ${poste.id}:`, error);
                return null;
            }
        }).filter(poste => poste !== null); // Remove postes com coordenadas inválidas

        res.json({
            success: true,
            data: postesFormatados
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

// Função auxiliar para parse seguro de coordenadas
function parseCoords(coords) {
    if (Array.isArray(coords)) return coords;
    
    try {
        // Remove aspas extras e caracteres problemáticos
        const cleaned = coords.toString()
            .replace(/^"+|"+$/g, '')  // Remove aspas no início e fim
            .replace(/\\/g, '');      // Remove barras invertidas
        
        const parsed = JSON.parse(cleaned);
        return Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}


router.post('/postes', handleUpload('fotos', 5), async (req, res) => {
    try {
        const { body, files } = req;

        // 1. Validação dos campos obrigatórios
        const requiredFields = ['coords', 'cidade', 'endereco', 'numero', 'usuarioId'];
        const missingFields = requiredFields.filter(field => !body[field]);

        if (missingFields.length > 0) {
            cleanUploads(files);
            return res.status(400).json({
                success: false,
                message: `Campos obrigatórios faltando: ${missingFields.join(', ')}`,
                code: 'MISSING_REQUIRED_FIELDS'
            });
        }

        // 2. Validação das fotos obrigatórias
        const requiredPhotos = ['PANORAMICA', 'LUMINARIA'];
        const photoTypes = Array.isArray(body.tipo_fotos) ? body.tipo_fotos : 
                         body.tipo_fotos ? [body.tipo_fotos] : [];

        const missingPhotos = requiredPhotos.filter(type => !photoTypes.includes(type));

        if (missingPhotos.length > 0) {   
            cleanUploads(files);
            return res.status(400).json({
                success: false,
                message: `Fotos obrigatórias faltando: ${missingPhotos.join(', ')}`,
                code: 'MISSING_REQUIRED_PHOTOS'
            });
        }

        // 3. Validação das coordenadas
        let coordinates;
        try {
            coordinates = JSON.parse(body.coords);
            if (!Array.isArray(coordinates) || coordinates.length !== 2 || 
                isNaN(coordinates[0]) || isNaN(coordinates[1])) {
                throw new Error();
            }
        } catch (error) {
        
            return res.status(400).json({
                success: false,
                message: 'Coordenadas inválidas. Formato esperado: [latitude, longitude]',
                code: 'INVALID_COORDINATES'
            });
        }

        // 4. Criação do poste com transação
        const result = await prisma.$transaction(async (prisma) => {
            const poste = await prisma.postes.create({
                data: {
                    coords: JSON.stringify(coordinates),
                    cidade: body.cidade,
                    endereco: body.endereco,
                    numero: body.numero,
                    cep: body.cep,
                    isLastPost: body.isLastPost === 'true',
                    usuarioId: body.usuarioId,
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
                    fotos: {
                        create: files?.map((file, index) => ({
                            url: `/uploads/${file.filename}`,
                            tipo: photoTypes[index] || 'OUTRA',
                            coords: JSON.stringify(coordinates)
                        }))
                    }
                },
                include: { fotos: true }
            });

            return poste;
        });

        res.status(201).json({
            success: true,
            data: result
        });

    } catch (error) {
        cleanUploads(req.files);
        console.error('Erro ao criar poste:', error);

        res.status(500).json({
            success: false,
            message: 'Erro interno no servidor',
            code: 'INTERNAL_SERVER_ERROR',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Função auxiliar para limpar uploads em caso de erro
function cleanUploads(files) {
    if (!files?.length) return;
    
    files.forEach(file => {
        try {
            // Verifica se o arquivo existe antes de tentar deletar
            if (fs.existsSync(file.path)) {
                fs.unlinkSync(file.path);
                console.log(`Arquivo removido: ${file.path}`);
            } else {
                console.warn(`Arquivo não encontrado: ${file.path}`);
            }
        } catch (err) {
            console.error(`Erro ao limpar arquivo ${file.path}:`, err.message);
            // Não é necessário lançar o erro novamente
        }
    });
}


export default router