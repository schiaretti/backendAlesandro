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
});


/*router.post('/postes', handleUpload({ maxFiles: 10 }), async (req, res) => {
    try {
        const { body, files } = req;

        // 1. Validação dos campos obrigatórios
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

        // Tipos de foto e validações
        const TIPOS_FOTO = {
            PANORAMICA: 'PANORAMICA',
            LUMINARIA: 'LUMINARIA',
            ARVORE: 'ARVORE',
            TELECOM: 'TELECOM',
            LAMPADA: 'LAMPADA',
            OUTRO: 'OUTRO'
        };

        // Verificação de fotos obrigatórias
        const requiredPhotos = [TIPOS_FOTO.PANORAMICA, TIPOS_FOTO.LUMINARIA];
        const uploadedPhotoTypes = files?.map(f => f.tipo) || [];

        const missingRequiredPhotos = requiredPhotos.filter(
            requiredType => !uploadedPhotoTypes.includes(requiredType)
        );

        if (missingRequiredPhotos.length > 0) {
            cleanUploads(files);
            return res.status(400).json({
                success: false,
                message: `Fotos obrigatórias faltando: ${missingRequiredPhotos.join(', ')}`,
                code: 'MISSING_REQUIRED_PHOTOS'
            });
        }

        // Dentro da transação do Prisma, antes de criar as fotos:
        const idsExistentes = await prisma.foto.findMany({
            where: {
                idUnicoArvore: {
                    in: idsUnicos.filter(id => id) // Filtra valores válidos
                }
            },
            select: { idUnicoArvore: true }
        });

        if (idsExistentes.length > 0) {
            throw new Error(`IDs de árvore já existentes: ${idsExistentes.map(f => f.idUnicoArvore).join(', ')}`);
        }

        // Processamento de metadados
        const processArrayField = (field) => {
            if (!field) return [];
            return Array.isArray(field) ? field : [field];
        };

        const especies = processArrayField(body.especies);
        const idsUnicos = processArrayField(body.idsUnicos);
        const coordsArvores = processArrayField(body.coordsArvore);

        // Validação específica para fotos de árvores
        const treePhotos = files?.filter(f => f.tipo === TIPOS_FOTO.ARVORE) || [];

        if (treePhotos.length > 0 && treePhotos.length !== especies.length) {
            cleanUploads(files);
            return res.status(400).json({
                success: false,
                message: 'Todas as fotos de árvores devem ter uma espécie associada',
                code: 'MISSING_TREE_SPECIES'
            });
        }

        // Criação do poste com transação
        const poste = await prisma.$transaction(async (prisma) => {
            // Preparar dados das fotos
            const fotosData = files?.map((file, index) => {
                const fotoData = {
                    url: `/uploads/${file.filename}`,
                    tipo: file.tipo,
                    fotoLatitude: latitude,
                    fotoLongitude: longitude
                };

                // Adiciona metadados específicos para árvores
                if (file.tipo === TIPOS_FOTO.ARVORE) {
                    fotoData.especieArvore = especies[index];
                    fotoData.idUnicoArvore = idsUnicos[index] || `arv-${Date.now()}-${index}`;

                    // Sobrescreve coordenadas se específicas
                    if (coordsArvores[index]) {
                        const [lat, lng] = JSON.parse(coordsArvores[index]);
                        fotoData.fotoLatitude = lat;
                        fotoData.fotoLongitude = lng;
                    }
                }

                return fotoData;
            });

            return await prisma.postes.create({
                data: {
                    numeroIdentificacao: body.numeroIdentificacao,
                    latitude: latitude,
                    longitude: longitude,
                    cidade: body.cidade,
                    endereco: body.endereco,
                    numero: body.numero,
                    cep: body.cep,
                    isLastPost: body.isLastPost === 'true',
                    canteiroCentral: body.canteiroCentral === 'true',
                    usuarioId: body.usuarioId,
                    emFrente: body.emFrente,
                    localizacao: body.localizacao,
                    transformador: body.transformador,
                    medicao: body.medicao,
                    telecom: body.telecom,
                    distanciaEntrePostes: body.distanciaEntrePostes,
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
                    especieArvore: body.especieArvore, // Espécie geral (se aplicável)
                    fotos: {
                        create: fotosData
                    }
                },
                include: {
                    fotos: true
                }
            });
        });

        res.status(201).json({
            success: true,
            data: poste
        });

    } catch (error) {
        cleanUploads(req.files);

        console.error('Erro ao criar poste:', {
            message: error.message,
            stack: error.stack,
            body: req.body
        });

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

router.get('/listar-postes', async (req, res) => {
    console.log('Iniciando listagem de postes');
    try {
        const { page = 1, limit = 1000 } = req.query;

        // 1. Busca os postes com tratamento para campos não-nulos
        const postes = await prisma.postes.findMany({
            where: {
                latitude: { not: null },
                longitude: { not: null }
            },
            select: {
                id: true,
                numeroIdentificacao: true,
                latitude: true,
                longitude: true,
                endereco: true,
                cidade: true
                // Removido createdAt pois não existe no seu modelo
            },
            // Removido orderBy: { createdAt: 'desc' } pois o campo não existe
            skip: (page - 1) * limit,
            take: Number(limit)
        });

        // 2. Formatação dos dados
        const postesFormatados = postes.map(poste => ({
            id: poste.id,
            numeroIdentificacao: poste.numeroIdentificacao,
            endereco: poste.endereco,
            cidade: poste.cidade,
            coords: [poste.latitude, poste.longitude]
            // Removido createdAt
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

router.get('/count-postes', async (req, res) => {
    console.log('Contagem de postes solicitada');
    try {
        // Conta apenas postes com coordenadas válidas
        const count = await prisma.postes.count({
            where: {
                latitude: { not: null },
                longitude: { not: null }
            }
        });

        res.json({
            success: true,
            count: count
        });

    } catch (error) {
        console.error('Erro ao contar postes:', {
            message: error.message,
            stack: error.stack,
            prismaError: error.code,
        });

        res.status(500).json({
            success: false,
            message: 'Erro ao contar postes',
            details: process.env.NODE_ENV === 'development' ? error.message : 'Erro interno',
            code: error.code
        });
    }
});

router.post('/postes', handleUpload({ maxFiles: 10 }), async (req, res) => {
    try {
        const { body, files } = req;

        // 1. Validação dos campos obrigatórios
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

        // Tipos de foto e validações
        const TIPOS_FOTO = {
            PANORAMICA: 'PANORAMICA',
            LUMINARIA: 'LUMINARIA',
            ARVORE: 'ARVORE',
            TELECOM: 'TELECOM',
            LAMPADA: 'LAMPADA',
            OUTRO: 'OUTRO'
        };

        // Verificação de fotos obrigatórias
        const requiredPhotos = [TIPOS_FOTO.PANORAMICA, TIPOS_FOTO.LUMINARIA];
        const uploadedPhotoTypes = files?.map(f => f.tipo) || [];

        const missingRequiredPhotos = requiredPhotos.filter(
            requiredType => !uploadedPhotoTypes.includes(requiredType)
        );

        if (missingRequiredPhotos.length > 0) {
            cleanUploads(files);
            return res.status(400).json({
                success: false,
                message: `Fotos obrigatórias faltando: ${missingRequiredPhotos.join(', ')}`,
                code: 'MISSING_REQUIRED_PHOTOS'
            });
        }

        // Processamento de metadados
        const processArrayField = (field) => {
            if (!field) return [];
            return Array.isArray(field) ? field : [field];
        };

        const especies = processArrayField(body.especies);
        const coordsArvores = processArrayField(body.coordsArvore);

        // Validação específica para fotos de árvores
        const treePhotos = files?.filter(f => f.tipo === TIPOS_FOTO.ARVORE) || [];

        if (treePhotos.length > 0) {
            if (treePhotos.length !== especies.length) {
                cleanUploads(files);
                return res.status(400).json({
                    success: false,
                    message: 'Todas as fotos de árvores devem ter uma espécie associada',
                    code: 'MISSING_TREE_SPECIES'
                });
            }

        }

        // Criação do poste com transação
        const poste = await prisma.$transaction(async (prisma) => {
            // Preparar dados das fotos (sem IDs únicos)
            const fotosData = files?.map((file, index) => {
                const fotoData = {
                    url: `/uploads/${file.filename}`,
                    tipo: file.tipo,
                    fotoLatitude: latitude, // Coordenadas padrão do poste
                    fotoLongitude: longitude
                };

                // Adiciona metadados específicos para árvores
                if (file.tipo === TIPOS_FOTO.ARVORE) {
                    fotoData.especieArvore = especies[index];

                    // Sobrescreve coordenadas se específicas
                    if (coordsArvores[index]) {
                        const [lat, lng] = JSON.parse(coordsArvores[index]);
                        fotoData.fotoLatitude = lat;
                        fotoData.fotoLongitude = lng;
                    }
                }

                return fotoData;
            });


            return await prisma.postes.create({
                data: {
                    numeroIdentificacao: body.numeroIdentificacao,
                    latitude: latitude,
                    longitude: longitude,
                    cidade: body.cidade,
                    endereco: body.endereco,
                    numero: body.numero,
                    cep: body.cep,
                    isLastPost: body.isLastPost === 'true',
                    canteiroCentral: body.canteiroCentral === 'true',
                    usuarioId: body.usuarioId,
                    emFrente: body.emFrente,
                    localizacao: body.localizacao,
                    transformador: body.transformador,
                    medicao: body.medicao,
                    telecom: body.telecom,
                    distanciaEntrePostes: body.distanciaEntrePostes ? parseInt(body.distanciaEntrePostes) : null,
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
                        create: fotosData
                    }
                },
                include: {
                    fotos: true
                }
            });
        });

        res.status(201).json({
            success: true,
            data: poste
        });

    } catch (error) {
        cleanUploads(req.files);

        console.error('Erro ao criar poste:', {
            message: error.message,
            stack: error.stack,
            body: req.body
        });

        if (error.code === 'P2002') {
            if (error.meta?.target?.includes('numeroIdentificacao')) {
                return res.status(400).json({
                    success: false,
                    message: 'Número do poste já existe no sistema',
                    code: 'DUPLICATE_POST_NUMBER'
                });
            }
            if (error.meta?.target?.includes('Foto_idUnicoArvore_key')) {
                return res.status(400).json({
                    success: false,
                    message: 'ID de árvore já existe no sistema',
                    code: 'DUPLICATE_TREE_ID'
                });
            }
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
});

router.put('/postes/:id/localizacao', async (req, res) => {
    console.log('Iniciando atualização de localização:', req.params.id, req.body);
    
    try {
        const { id } = req.params;
        const { latitude, longitude } = req.body;

        // Validação mais robusta
        if (latitude === undefined || longitude === undefined) {
            console.log('Campos faltando:', { latitude, longitude });
            return res.status(400).json({
                success: false,
                message: 'Latitude e longitude são obrigatórias',
                code: 'MISSING_COORDINATES'
            });
        }

        // Converter para números
        const lat = Number(latitude);
        const lng = Number(longitude);
        
        console.log('Coordenadas convertidas:', { lat, lng });

        // Validação numérica mais segura
        if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
            console.log('Coordenadas inválidas:', { lat, lng });
            return res.status(400).json({
                success: false,
                message: 'Latitude e longitude devem ser valores numéricos válidos',
                code: 'INVALID_COORDINATES_FORMAT'
            });
        }

        // Validação de faixa
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            console.log('Coordenadas fora da faixa:', { lat, lng });
            return res.status(400).json({
                success: false,
                message: 'Valores de coordenadas inválidos (latitude deve estar entre -90 e 90, longitude entre -180 e 180)',
                code: 'INVALID_COORDINATES_RANGE'
            });
        }

        // Verificar se o poste existe antes de atualizar
        const posteExistente = await prisma.postes.findUnique({
            where: { id }
        });

        if (!posteExistente) {
            console.log('Poste não encontrado:', id);
            return res.status(404).json({
                success: false,
                message: 'Poste não encontrado',
                code: 'POST_NOT_FOUND'
            });
        }

        console.log('Atualizando poste:', id, 'com coordenadas:', lat, lng);
        
        // Atualização no banco de dados
        const posteAtualizado = await prisma.postes.update({
            where: { id },
            data: {
                latitude: lat,
                longitude: lng,
               
            },
            select: {
                id: true,
                numeroIdentificacao: true,
                latitude: true,
                longitude: true,
                endereco: true,
                cidade: true
            }
        });

        console.log('Poste atualizado com sucesso:', posteAtualizado);
        
        return res.json({
            success: true,
            message: 'Localização atualizada com sucesso',
            data: posteAtualizado
        });

    } catch (error) {
        console.error('Erro detalhado:', {
            message: error.message,
            stack: error.stack,
            code: error.code,
            meta: error.meta
        });
        
        // Tratamento específico para erros do Prisma
        if (error.code === 'P2025') {
            return res.status(404).json({
                success: false,
                message: 'Poste não encontrado',
                code: 'POST_NOT_FOUND'
            });
        }

        // Tratamento para erros de conexão com o banco
        if (error.code === 'P1001') {
            return res.status(503).json({
                success: false,
                message: 'Serviço de banco de dados indisponível',
                code: 'DATABASE_UNAVAILABLE'
            });
        }

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




export default router

