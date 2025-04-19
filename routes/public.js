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

/*router.get('/listar-postes', async (req, res) => {
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
                numeroIdentificacao: true,
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
            numeroIdentificacao: poste.numeroIdentificacao,
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
});*/

/*router.post('/postes', handleUpload({ maxFiles: 5 }), async (req, res) => {
    try {
        const { body, files } = req;

        // 1. Validação dos campos obrigatórios (incluindo numeroIdentificacao)
        const requiredFields = ['cidade', 'endereco', 'numero', 'usuarioId', 'numeroIdentificacao'];
        const missingFields = requiredFields.filter(field => !body[field]);

        if (missingFields.length > 0) {
            cleanUploads(files);
            return res.status(400).json({
                success: false,
                message: `Campos obrigatórios faltando: ${missingFields.join(', ')}`,
                code: 'MISSING_REQUIRED_FIELDS'
            });
        }

        // 2. Validação do formato do numeroIdentificacao
        if (!/^\d{5}-\d{1}$/.test(body.numeroIdentificacao)) {
            cleanUploads(files);
            return res.status(400).json({
                success: false,
                message: 'Formato do número do poste inválido. Deve ser XXXXX-X (5 dígitos, traço, 1 dígito)',
                code: 'INVALID_POST_NUMBER_FORMAT'
            });
        }

        // 3. Validação das coordenadas
        let latitude, longitude;
        try {
            const coords = body.coords ? JSON.parse(body.coords) : [null, null];
            latitude = parseFloat(coords[0]);
            longitude = parseFloat(coords[1]);

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
            OUTRO: 'OUTRO'
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
                    // Campo de identificação único (ADICIONADO)
                    numeroIdentificacao: body.numeroIdentificacao,
                    
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
                    emFrente: body.emFrente,
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
                    numeroFases: body.numeroFases,
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
                },
                include: {
                    fotos: true
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

        // Tratamento específico para violação de campo único
        if (error.code === 'P2002' && error.meta?.target?.includes('numeroIdentificacao')) {
            return res.status(400).json({
                success: false,
                message: 'Número do poste já existe no sistema',
                code: 'DUPLICATE_POST_NUMBER'
            });
        }

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
});*/
/*router.post('/postes', handleUpload({ maxFiles: 10 }), async (req, res) => {

    // Adicione no início do endpoint
    console.log('Dados recebidos:', {
        body: req.body,
        files: {
            normais: fotos.length,
            arvores: fotosArvore.length
        },
        arvoresData
    });
    try {

        // Todos os arquivos (fotos normais e de árvores)
        console.log('Todos os arquivos:', req.allFiles);

        // Acesso específico por tipo:
        const fotosNormais = req.files?.fotos || [];
        const fotosArvore = req.files?.fotosArvore || [];

        const { body } = req; // Removido files da desestruturação


        // 1. Validação reforçada dos campos obrigatórios
        const requiredFields = {
            cidade: 'Cidade',
            endereco: 'Endereço',
            numero: 'Número',
            usuarioId: 'ID do Usuário',
            numeroIdentificacao: 'Número de Identificação'
        };

        const missingFields = Object.entries(requiredFields)
            .filter(([field]) => !body[field]?.toString().trim())
            .map(([, name]) => name);

        if (missingFields.length > 0) {
            cleanUploads(files);
            return res.status(400).json({
                success: false,
                message: `Campos obrigatórios faltando: ${missingFields.join(', ')}`,
                code: 'MISSING_REQUIRED_FIELDS'
            });
        }



        // 2. Validação do número do poste
        const postNumberRegex = /^\d{5}-\d{1}$/;
        if (!postNumberRegex.test(body.numeroIdentificacao.toString().trim())) {
            cleanUploads(files);
            return res.status(400).json({
                success: false,
                message: 'Formato inválido para número do poste (XXXXX-X)',
                code: 'INVALID_POST_NUMBER'
            });
        }

        // 3. Parse e validação das árvores
        let arvoresData = [];
        try {
            arvoresData = body.arvores ? JSON.parse(body.arvores) : [];

            // Validação adicional das árvores
            if (!Array.isArray(arvoresData)) {
                throw new Error('Dados das árvores devem ser um array');
            }
        } catch (e) {
            cleanUploads(files);
            return res.status(400).json({
                success: false,
                message: 'Formato inválido para dados das árvores',
                code: 'INVALID_TREE_DATA',
                details: process.env.NODE_ENV === 'development' ? e.message : undefined
            });
        }

        // 4. Validação de coordenadas do poste
        let posteLat = null;
        let posteLng = null;
        try {
            const coords = body.coords ? JSON.parse(body.coords) : [null, null];
            [posteLat, posteLng] = coords.map(coord => coord !== null ? Number(coord) : null);

            // Validação de faixas de valores
            if (posteLat !== null && (isNaN(posteLat) || posteLat < -90 || posteLat > 90)) {
                throw new Error('Latitude fora do intervalo válido (-90 a 90)');
            }

            if (posteLng !== null && (isNaN(posteLng) || posteLng < -180 || posteLng > 180)) {
                throw new Error('Longitude fora do intervalo válido (-180 a 180)');
            }
        } catch (e) {
            cleanUploads(files);
            return res.status(400).json({
                success: false,
                message: 'Coordenadas do poste inválidas',
                code: 'INVALID_COORDINATES',
                details: process.env.NODE_ENV === 'development' ? e.message : undefined
            });
        }

        // 5. Validação de fotos obrigatórias
        const requiredPhotoTypes = ['PANORAMICA', 'LUMINARIA'];
        // Modifique para considerar apenas fotosNormais
        const uploadedPhotoTypes = fotosNormais.map(f => f.tipo?.toUpperCase().trim()).filter(Boolean);

        const missingPhotoTypes = requiredPhotoTypes.filter(
            type => !uploadedPhotoTypes.includes(type)
        );

        if (missingPhotoTypes.length > 0) {
            cleanUploads(files);
            return res.status(400).json({
                success: false,
                message: `Fotos obrigatórias faltando: ${missingPhotoTypes.join(', ')}`,
                code: 'MISSING_REQUIRED_PHOTOS'
            });
        }

        // 6. Preparação dos dados do poste
        const posteData = {
            // Informações básicas
            numeroIdentificacao: body.numeroIdentificacao.toString().trim(),
            cidade: body.cidade.toString().trim(),
            endereco: body.endereco.toString().trim(),
            numero: body.numero.toString().trim(),
            usuarioId: body.usuarioId.toString().trim(),

            // Coordenadas
            latitude: posteLat,
            longitude: posteLng,

            // Informações complementares
            ...prepareOptionalFields(body, [
                'cep', 'localizacao', 'emFrente', 'transformador',
                'medicao', 'telecom', 'concentrador', 'poste',
                'estruturaposte', 'tipoBraco', 'tipoLampada',
                'tipoReator', 'tipoComando', 'tipoRede', 'tipoCabo',
                'numeroFases', 'tipoVia', 'hierarquiaVia', 'tipoPavimento',
                'tipoPasseio', 'finalidadeInstalacao'
            ]),

            // Campos numéricos
            ...prepareNumericFields(body, [
                { field: 'alturaposte', type: 'float' },
                { field: 'tamanhoBraco', type: 'float' },
                { field: 'quantidadePontos', type: 'int' },
                { field: 'potenciaLampada', type: 'int' },
                { field: 'quantidadeFaixas', type: 'int' }
            ]),

            // Campos booleanos
            isLastPost: convertToBoolean(body.isLastPost),
            canteiroCentral: convertToBoolean(body.canteiroCentral)
        };

        // 7. Processamento em transação
        const result = await prisma.$transaction(async (prisma) => {
            try {
                // Cria o poste principal
                const poste = await prisma.postes.create({
                    data: {
                        ...posteData,
                        fotos: {
                            create: preparePostPhotos(files)
                        },
                        arvores: {
                            create: prepareTreesData(arvoresData, files)
                        }
                    },
                    include: {
                        fotos: true,
                        arvores: {
                            include: {
                                fotos: true
                            }
                        }
                    }
                });

                return poste;
            } catch (error) {
                console.error('Erro detalhado na transação:', {
                    error: error.message,
                    stack: error.stack,
                    arvoresData,
                    files: files.map(f => ({
                        filename: f.filename,
                        fieldname: f.fieldname,
                        originalname: f.originalname
                    }))
                });
                throw error;
            }
        });

        // 8. Resposta de sucesso
        return res.status(201).json({
            success: true,
            data: {
                ...result,
                stats: {
                    fotos: result.fotos.length,
                    arvores: result.arvores.length,
                    fotosArvores: result.arvores.reduce((acc, curr) => acc + curr.fotos.length, 0)
                }
            },
            message: 'Poste cadastrado com sucesso'
        });

    } catch (error) {
        // Limpeza de arquivos em caso de erro
        cleanUploads(req.files);

        // Log detalhado do erro
        console.error('Erro ao criar poste:', {
            error: error.message,
            stack: error.stack,
            body: req.body,
            timestamp: new Date().toISOString()
        });

        // Tratamento específico para erros do Prisma
        if (error.code === 'P2002') {
            return res.status(400).json({
                success: false,
                message: 'Número do poste já existe no sistema',
                code: 'DUPLICATE_POST_NUMBER',
                details: process.env.NODE_ENV === 'development' ? {
                    target: error.meta?.target
                } : undefined
            });
        }

        // Tratamento genérico de erros
        return res.status(500).json({
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

// Funções auxiliares (definir fora da rota)

function prepareOptionalFields(body, fields) {
    return fields.reduce((acc, field) => {
        if (body[field] !== undefined && body[field] !== null) {
            acc[field] = body[field].toString().trim();
        } else {
            acc[field] = null;
        }
        return acc;
    }, {});
}

function prepareNumericFields(body, fields) {
    return fields.reduce((acc, { field, type }) => {
        if (body[field] !== undefined && body[field] !== null && body[field] !== '') {
            acc[field] = type === 'float'
                ? parseFloat(body[field])
                : parseInt(body[field]);
        } else {
            acc[field] = null;
        }
        return acc;
    }, {});
}

function convertToBoolean(value) {
    if (value === undefined || value === null) return false;
    if (typeof value === 'boolean') return value;
    return value.toString().toLowerCase() === 'true';
}

function preparePostPhotos(files) {
    return (files || [])
        .filter(file => file.tipo && !['ARVORE', 'ÁRVORE'].includes(file.tipo.toUpperCase()))
        .map(file => ({
            url: `/uploads/${file.filename}`,
            tipo: file.tipo.toUpperCase()
        }));
}

function prepareTreesData(arvoresData, files) {
    return arvoresData.map(arvore => {
        if (!arvore.especie?.trim()) {
            throw new Error(`Espécie não informada para árvore com tempId: ${arvore.tempId}`);
        }

        if (isNaN(arvore.latitude) || isNaN(arvore.longitude)) {
            throw new Error(`Coordenadas inválidas para árvore ${arvore.tempId}`);
        }

        // Verifica se há fotos para esta árvore
        const treePhotos = prepareTreePhotos(arvore.tempId, files);
        if (treePhotos.length === 0) {
            console.warn(`Árvore ${arvore.tempId} não possui fotos associadas`);
        }

        return {
            especie: arvore.especie.trim(),
            latitude: arvore.latitude ? Number(arvore.latitude) : 0,
            longitude: arvore.longitude ? Number(arvore.longitude) : 0,
            descricao: arvore.descricao?.trim() || null,
            fotos: {
                create: treePhotos
            }
        };
    });
}

function prepareTreePhotos(tempId, files) {
    return (files || [])
        .filter(file => {
            // Verificação mais robusta
            const isTreePhoto = file.fieldname === 'fotosArvore' ||
                file.tipo?.toUpperCase() === 'ARVORE';
            const matchesTree = file.arvoreTempId === tempId ||
                (file.originalname?.includes(`arvore_${tempId}`));

            return isTreePhoto && matchesTree;
        })
        .map(file => {
            // Extrai metadados do nome do arquivo se necessário
            let latitude = 0;
            let longitude = 0;

            try {
                if (file.originalname?.startsWith('arvore_')) {
                    const metadata = JSON.parse(file.originalname.replace('arvore_', ''));
                    latitude = metadata.latitude || 0;
                    longitude = metadata.longitude || 0;
                } else {
                    latitude = file.latitude ? Number(file.latitude) : 0;
                    longitude = file.longitude ? Number(file.longitude) : 0;
                }
            } catch (e) {
                console.error('Erro ao extrair metadados da foto:', e);
            }

            return {
                url: `/uploads/${file.filename}`,
                latitude,
                longitude
            };
        });
}




router.get('/listar-postes', async (req, res) => {
    try {
        // 1. Validação dos parâmetros
        const {
            page = 1,
            limit = 1000,
            cidade,
            numeroIdentificacao,
            dataInicio,
            dataFim,
            sort = 'createdAt',
            order = 'desc'
        } = req.query;

        if (isNaN(page) || isNaN(limit) || page < 1 || limit < 1 || limit > 1000) {
            return res.status(400).json({
                success: false,
                message: 'Parâmetros de paginação inválidos'
            });
        }

        // 2. Construção da query
        const where = {
            latitude: { not: null },
            longitude: { not: null },
            ...(cidade && { cidade: { contains: cidade, mode: 'insensitive' } }),
            ...(numeroIdentificacao && {
                numeroIdentificacao: { contains: numeroIdentificacao }
            }),
            ...(dataInicio && dataFim && {
                createdAt: {
                    gte: new Date(dataInicio),
                    lte: new Date(dataFim)
                }
            })
        };

        const orderBy = { [sort]: order };

        // 3. Execução paralela para melhor performance
        const [postes, totalCount] = await Promise.all([
            prisma.postes.findMany({
                where,
                select: {
                    id: true,
                    numeroIdentificacao: true,
                    latitude: true,
                    longitude: true,
                    endereco: true,
                    cidade: true,
                    createdAt: true,
                    usuario: {
                        select: {
                            id: true,
                            nome: true
                        }
                    },
                    _count: {
                        select: {
                            fotos: true,
                            arvores: true
                        }
                    }
                },
                orderBy,
                skip: (page - 1) * limit,
                take: Number(limit)
            }),
            prisma.postes.count({ where })
        ]);

        // 4. Formatação da resposta
        const postesFormatados = postes.map(poste => ({
            id: poste.id,
            numeroIdentificacao: poste.numeroIdentificacao,
            endereco: poste.endereco,
            cidade: poste.cidade,
            coords: [poste.latitude, poste.longitude],
            createdAt: poste.createdAt,
            usuario: poste.usuario,
            contadores: poste._count
        }));

        res.json({
            success: true,
            data: postesFormatados,
            pagination: {
                currentPage: Number(page),
                totalPages: Math.ceil(totalCount / limit),
                totalItems: totalCount,
                itemsPerPage: Number(limit)
            }
        });

    } catch (error) {
        console.error('Erro ao listar postes:', {
            error: error.message,
            stack: error.stack,
            query: req.query,
            timestamp: new Date().toISOString()
        });

        res.status(500).json({
            success: false,
            message: 'Erro interno ao listar postes',
            code: 'LIST_ERROR',
            details: process.env.NODE_ENV === 'development' ? {
                message: error.message,
                stack: error.stack
            } : undefined
        });
    }
});*/

router.post('/postes', handleUpload({ maxFiles: 10 }), async (req, res) => {
    try {
        console.log('Dados recebidos:', {
            body: req.body,
            files: {
                fotos: req.fotos?.length || 0,
                fotosArvore: req.fotosArvore?.length || 0
            }
        });

        const { body } = req;
        const fotos = req.fotos || [];
        const fotosArvore = req.fotosArvore || [];
        const allFiles = [...fotos, ...fotosArvore];

        // 1. Validação de campos obrigatórios
        const requiredFields = {
            cidade: 'Cidade',
            endereco: 'Endereço',
            numero: 'Número',
            usuarioId: 'ID do Usuário',
            numeroIdentificacao: 'Número de Identificação'
        };

        const missingFields = Object.entries(requiredFields)
            .filter(([field]) => !body[field]?.toString().trim())
            .map(([, name]) => name);

        if (missingFields.length > 0) {
            cleanUploads(allFiles);
            return res.status(400).json({
                success: false,
                message: `Campos obrigatórios faltando: ${missingFields.join(', ')}`,
                code: 'MISSING_REQUIRED_FIELDS'
            });
        }

        // 2. Validação do número do poste
        const postNumberRegex = /^\d{5}-\d{1}$/;
        if (!postNumberRegex.test(body.numeroIdentificacao.toString().trim())) {
            cleanUploads(allFiles);
            return res.status(400).json({
                success: false,
                message: 'Formato inválido para número do poste (XXXXX-X)',
                code: 'INVALID_POST_NUMBER'
            });
        }

        // 3. Parse e validação das árvores
        let arvoresData = [];
        try {
            arvoresData = body.arvores ? JSON.parse(body.arvores) : [];

            if (!Array.isArray(arvoresData)) {
                throw new Error('Dados das árvores devem ser um array');
            }
        } catch (e) {
            cleanUploads(allFiles);
            return res.status(400).json({
                success: false,
                message: 'Formato inválido para dados das árvores',
                code: 'INVALID_TREE_DATA',
                details: process.env.NODE_ENV === 'development' ? e.message : undefined
            });
        }

        // 4. Validação de coordenadas do poste
        let posteLat = null;
        let posteLng = null;
        try {
            const coords = body.coords ? JSON.parse(body.coords) : [null, null];
            [posteLat, posteLng] = coords.map(coord => coord !== null ? Number(coord) : null);

            if (posteLat !== null && (isNaN(posteLat) || posteLat < -90 || posteLat > 90)) {
                throw new Error('Latitude fora do intervalo válido (-90 a 90)');
            }

            if (posteLng !== null && (isNaN(posteLng) || posteLng < -180 || posteLng > 180)) {
                throw new Error('Longitude fora do intervalo válido (-180 a 180)');
            }
        } catch (e) {
            cleanUploads(allFiles);
            return res.status(400).json({
                success: false,
                message: 'Coordenadas do poste inválidas',
                code: 'INVALID_COORDINATES',
                details: process.env.NODE_ENV === 'development' ? e.message : undefined
            });
        }

        // 5. Validação de fotos obrigatórias
        const requiredPhotoTypes = ['PANORAMICA', 'LUMINARIA'];
        const uploadedPhotoTypes = fotos.map(f => f.tipo?.toUpperCase().trim()).filter(Boolean);

        const missingPhotoTypes = requiredPhotoTypes.filter(
            type => !uploadedPhotoTypes.includes(type)
        );

        if (missingPhotoTypes.length > 0) {
            cleanUploads(allFiles);
            return res.status(400).json({
                success: false,
                message: `Fotos obrigatórias faltando: ${missingPhotoTypes.join(', ')}`,
                code: 'MISSING_REQUIRED_PHOTOS'
            });
        }

        // 6. Preparação dos dados do poste
        const posteData = {
            // Informações básicas
            numeroIdentificacao: body.numeroIdentificacao.toString().trim(),
            cidade: body.cidade.toString().trim(),
            endereco: body.endereco.toString().trim(),
            numero: body.numero.toString().trim(),
            usuarioId: body.usuarioId.toString().trim(),

            // Coordenadas
            latitude: posteLat,
            longitude: posteLng,

            // Informações complementares
            ...prepareOptionalFields(body, [
                'cep', 'localizacao', 'emFrente', 'transformador',
                'medicao', 'telecom', 'concentrador', 'poste',
                'estruturaposte', 'tipoBraco', 'tipoLampada',
                'tipoReator', 'tipoComando', 'tipoRede', 'tipoCabo',
                'numeroFases', 'tipoVia', 'hierarquiaVia', 'tipoPavimento',
                'tipoPasseio', 'finalidadeInstalacao'
            ]),

            // Campos numéricos
            ...prepareNumericFields(body, [
                { field: 'alturaposte', type: 'float' },
                { field: 'tamanhoBraco', type: 'float' },
                { field: 'quantidadePontos', type: 'int' },
                { field: 'potenciaLampada', type: 'int' },
                { field: 'quantidadeFaixas', type: 'int' }
            ]),

            // Campos booleanos
            isLastPost: convertToBoolean(body.isLastPost),
            canteiroCentral: convertToBoolean(body.canteiroCentral)
        };

        // 7. Preparação dos dados para criação
        const fotosParaCriar = preparePostPhotos(fotos);
        const arvoresParaCriar = prepareTreesData(arvoresData, fotosArvore);

        // 8. Processamento em transação
        const result = await prisma.$transaction(async (prisma) => {
            const poste = await prisma.postes.create({
                data: {
                    ...posteData,
                    fotos: { create: fotosParaCriar },
                    arvores: { create: arvoresParaCriar }
                },
                include: {
                    fotos: true,
                    arvores: {
                        include: {
                            fotos: true
                        }
                    }
                }
            });
            return poste;
        });

        // 9. Resposta de sucesso
        return res.status(201).json({
            success: true,
            data: {
                ...result,
                stats: {
                    fotos: result.fotos.length,
                    arvores: result.arvores.length,
                    fotosArvores: result.arvores.reduce((acc, curr) => acc + curr.fotos.length, 0)
                }
            },
            message: 'Poste cadastrado com sucesso'
        });

    } catch (error) {
        cleanUploads(req.fotos?.concat(req.fotosArvore || []));

        // Tratamento específico para erros do Prisma
        if (error.code === 'P2002') {
            return res.status(400).json({
                success: false,
                message: 'Número do poste já existe no sistema',
                code: 'DUPLICATE_POST_NUMBER',
                details: process.env.NODE_ENV === 'development' ? {
                    target: error.meta?.target
                } : undefined
            });
        }

        // Tratamento de erros do Multer
        if (error instanceof multer.MulterError) {
            return res.status(400).json({
                success: false,
                message: `Erro no upload: ${error.message}`,
                code: error.code
            });
        }

        // Log detalhado do erro
        console.error('Erro ao criar poste:', {
            error: error.message,
            stack: error.stack,
            body: req.body,
            timestamp: new Date().toISOString()
        });

        // Tratamento genérico de erros
        return res.status(500).json({
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

// Funções auxiliares
function prepareOptionalFields(body, fields) {
    return fields.reduce((acc, field) => {
        if (body[field] !== undefined && body[field] !== null) {
            acc[field] = body[field].toString().trim();
        } else {
            acc[field] = null;
        }
        return acc;
    }, {});
}

function prepareNumericFields(body, fields) {
    return fields.reduce((acc, { field, type }) => {
        if (body[field] !== undefined && body[field] !== null && body[field] !== '') {
            acc[field] = type === 'float' 
                ? parseFloat(body[field]) 
                : parseInt(body[field]);
        } else {
            acc[field] = null;
        }
        return acc;
    }, {});
}

function convertToBoolean(value) {
    if (value === undefined || value === null) return false;
    if (typeof value === 'boolean') return value;
    return value.toString().toLowerCase() === 'true';
}

function preparePostPhotos(files) {
    return (files || [])
        .filter(file => file.tipo && !['ARVORE', 'ÁRVORE'].includes(file.tipo.toUpperCase()))
        .map(file => ({
            url: `/uploads/${file.filename}`,
            tipo: file.tipo.toUpperCase()
        }));
}

function prepareTreesData(arvoresData, files) {
    return arvoresData.map(arvore => {
        if (!arvore.especie?.trim()) {
            throw new Error(`Espécie não informada para árvore com tempId: ${arvore.tempId}`);
        }

        if (isNaN(arvore.latitude) || isNaN(arvore.longitude)) {
            throw new Error(`Coordenadas inválidas para árvore ${arvore.tempId}`);
        }

        const treePhotos = prepareTreePhotos(arvore.tempId, files);
        if (treePhotos.length === 0) {
            console.warn(`Árvore ${arvore.tempId} não possui fotos associadas`);
        }

        return {
            especie: arvore.especie.trim(),
            latitude: arvore.latitude ? Number(arvore.latitude) : 0,
            longitude: arvore.longitude ? Number(arvore.longitude) : 0,
            descricao: arvore.descricao?.trim() || null,
            fotos: {
                create: treePhotos
            }
        };
    });
}

function prepareTreePhotos(tempId, files) {
    return (files || [])
        .filter(file => {
            const isTreePhoto = file.fieldname === 'fotosArvore' || 
                file.tipo?.toUpperCase() === 'ARVORE';
            const matchesTree = file.arvoreTempId === tempId || 
                (file.originalname?.includes(`arvore_${tempId}`));

            return isTreePhoto && matchesTree;
        })
        .map(file => {
            let latitude = 0;
            let longitude = 0;

            try {
                if (file.originalname?.startsWith('arvore_')) {
                    const metadata = JSON.parse(file.originalname.replace('arvore_', ''));
                    latitude = metadata.latitude || 0;
                    longitude = metadata.longitude || 0;
                } else {
                    latitude = file.latitude ? Number(file.latitude) : 0;
                    longitude = file.longitude ? Number(file.longitude) : 0;
                }
            } catch (e) {
                console.error('Erro ao extrair metadados da foto:', e);
            }

            return {
                url: `/uploads/${file.filename}`,
                latitude,
                longitude
            };
        });
}

export default router
       

