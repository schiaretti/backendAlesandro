import express from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

// Importa as funções necessárias do middleware de upload
// Certifique-se que o caminho para fileUpload.js está correto
import { handleUpload, cleanUploads, uploadToS3 } from '../middlewares/fileUpload.js';

const prisma = new PrismaClient();
const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET; // Garanta que JWT_SECRET está nas variáveis de ambiente

// --- Rota de Login --- 
router.post('/login', async (req, res) => {
    try {
        const { email, senha } = req.body;

        if (!email || !senha) {
            return res.status(400).json({
                success: false,
                message: 'Email e senha são obrigatórios',
                code: 'MISSING_CREDENTIALS'
            });
        }

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

        const senhaValida = await bcrypt.compare(senha, usuario.senha);

        if (!senhaValida) {
            return res.status(401).json({
                success: false,
                message: 'Credenciais inválidas',
                code: 'INVALID_CREDENTIALS'
            });
        }

        const token = jwt.sign(
            { id: usuario.id, nivel: usuario.nivel },
            JWT_SECRET, // Usa a variável de ambiente
            { expiresIn: '1d' } // Token expira em 1 dia
        );

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
            message: 'Erro interno no servidor durante o login',
            code: 'INTERNAL_SERVER_ERROR',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// --- Rota para Contar Usuários ---
router.get('/count-usuarios', async (req, res) => {
    console.log('Contagem de usuários solicitada');
    try {
        const count = await prisma.usuarios.count(); // Ou o nome do seu modelo de usuários
        res.json({ success: true, count: count });
    } catch (error) {
        console.error('Erro ao contar usuários:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao contar usuários',
            details: process.env.NODE_ENV === 'development' ? error.message : 'Erro interno',
            code: 'COUNT_USUARIOS_ERROR'
        });
    }
});

// --- Rota para Listar Postes --- 
router.get('/listar-postes', async (req, res) => {
    console.log('Iniciando listagem de postes');
    try {
        const { page = 1, limit = 1000 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);

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
                // Adicione outros campos se necessário para o frontend
            },
            orderBy: {
                // Ordenar por ID ou outro campo, já que createdAt não existe no seu modelo
                id: 'desc'
            },
            skip: skip,
            take: take
        });

        const postesFormatados = postes.map(poste => ({
            id: poste.id,
            numeroIdentificacao: poste.numeroIdentificacao,
            endereco: `${poste.endereco || ''}, ${poste.cidade || ''}`.trim().replace(/^,|,$/g, ''), // Combina endereço e cidade
            coords: [poste.latitude, poste.longitude]
        }));

        // Opcional: Contar o total para paginação
        const totalPostes = await prisma.postes.count({
            where: {
                latitude: { not: null },
                longitude: { not: null }
            }
        });

        res.json({
            success: true,
            data: postesFormatados,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalPostes / take),
                totalItems: totalPostes,
                itemsPerPage: take
            }
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
            code: 'LIST_POSTES_ERROR'
        });
    }
});

// --- Rota para Contar Postes --- 
router.get('/count-postes', async (req, res) => {
    console.log('Contagem de postes solicitada');
    try {
        const count = await prisma.postes.count({
            where: {
                latitude: { not: null },
                longitude: { not: null }
            }
        });
        res.json({ success: true, count: count });
    } catch (error) {
        console.error('Erro ao contar postes:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao contar postes',
            details: process.env.NODE_ENV === 'development' ? error.message : 'Erro interno',
            code: 'COUNT_POSTES_ERROR'
        });
    }
});

// --- Rota para Criar Poste (com Upload S3) --- 
/*router.post('/postes', handleUpload({ maxFiles: 10 }), async (req, res) => {
    console.log('Recebida requisição POST /api/postes');
    console.log('Body:', req.body);
    console.log('Files:', req.files ? `${req.files.length} arquivos recebidos` : 'Nenhum arquivo recebido');

    try {
        const { body, files } = req;

        // 1. Validação de campos obrigatórios do backend
        const requiredFields = ['cidade', 'endereco', 'numero', 'usuarioId', 'numeroIdentificacao', 'coords'];
        const missingFields = requiredFields.filter(field => !body[field]);
        if (missingFields.length > 0) {
            console.warn('Campos obrigatórios faltando:', missingFields);
            // Limpa arquivos se a validação falhar logo no início
            if (files) await cleanUploads(files);
            return res.status(400).json({
                success: false,
                message: `Campos obrigatórios faltando: ${missingFields.join(', ')}`,
                code: 'MISSING_REQUIRED_FIELDS'
            });
        }

        // 2. Validação do formato do numeroIdentificacao
        if (!/^\d{5}-\d{1}$/.test(body.numeroIdentificacao)) {
            console.warn('Formato inválido para numeroIdentificacao:', body.numeroIdentificacao);
            if (files) await cleanUploads(files);
            return res.status(400).json({
                success: false,
                message: 'Formato do número do poste inválido. Use: XXXXX-X (5 dígitos, traço, 1 dígito)',
                code: 'INVALID_POST_NUMBER_FORMAT'
            });
        }

        // 3. Validação e parse das coordenadas principais
        let latitude, longitude;
        try {
            // Espera [lat, lng] como string JSON
            const coordsParsed = JSON.parse(body.coords);
            if (!Array.isArray(coordsParsed) || coordsParsed.length !== 2) {
                throw new Error('Formato de coordenadas inválido.');
            }
            latitude = parseFloat(coordsParsed[0]);
            longitude = parseFloat(coordsParsed[1]);

            if (isNaN(latitude) || isNaN(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
                throw new Error('Valores de coordenadas fora da faixa permitida.');
            }
            console.log('Coordenadas principais validadas:', { latitude, longitude });
        } catch (error) {
            console.warn('Erro ao validar coordenadas principais:', body.coords, error.message);
            if (files) await cleanUploads(files);
            return res.status(400).json({
                success: false,
                message: `Coordenadas inválidas: ${error.message}. Formato esperado: string JSON '[latitude, longitude]' com valores numéricos válidos.`,
                code: 'INVALID_COORDINATES'
            });
        }

        // 4. Validação das fotos obrigatórias (usando os tipos adicionados pelo middleware)
        const TIPOS_FOTO = { PANORAMICA: 'PANORAMICA', LUMINARIA: 'LUMINARIA', ARVORE: 'ARVORE' }; // Adicione outros se necessário
        const requiredPhotos = [TIPOS_FOTO.PANORAMICA, TIPOS_FOTO.LUMINARIA];
        const uploadedPhotoTypes = files?.map(f => f.tipo) || []; // Usa f.tipo adicionado no handleUpload
        const missingRequiredPhotos = requiredPhotos.filter(type => !uploadedPhotoTypes.includes(type));

        if (missingRequiredPhotos.length > 0) {
            console.warn('Fotos obrigatórias faltando:', missingRequiredPhotos);
            if (files) await cleanUploads(files);
            return res.status(400).json({
                success: false,
                message: `Fotos obrigatórias faltando: ${missingRequiredPhotos.join(', ')}`,
                code: 'MISSING_REQUIRED_PHOTOS'
            });
        }

        // 5. Processamento de dados específicos (arrays)
        const processArrayField = (field) => {
            if (!field) return [];
            return Array.isArray(field) ? field : [field];
        };
        const especies = processArrayField(body.especies);
        const latitudesFotos = processArrayField(body.latitudes); // Latitudes específicas das fotos
        const longitudesFotos = processArrayField(body.longitudes); // Longitudes específicas das fotos

        // 6. Validação específica para fotos de árvores (se houver)
        const treePhotosIndices = files?.map((f, idx) => f.tipo === TIPOS_FOTO.ARVORE ? idx : -1).filter(idx => idx !== -1) || [];
        if (treePhotosIndices.length > 0 && treePhotosIndices.length !== especies.length) {
            console.warn('Inconsistência entre fotos de árvore e espécies:', { treePhotosCount: treePhotosIndices.length, especiesCount: especies.length });
            if (files) await cleanUploads(files);
            return res.status(400).json({
                success: false,
                message: 'Número de espécies não corresponde ao número de fotos de árvores.',
                code: 'MISMATCHED_TREE_DATA'
            });
        }

        // 7. Criação do poste dentro de uma transação Prisma
        console.log('Iniciando transação Prisma para criar poste...');
        const poste = await prisma.$transaction(async (tx) => {

            // 7.1 Upload das fotos para S3 em paralelo
            console.log(`Iniciando upload de ${files.length} fotos para S3...`);
            const fotosParaCriar = await Promise.all(files.map(async (file, index) => {
                console.log(`Processando upload S3 para: ${file.filename}`);
                // Chama a função importada de fileUpload.js
                const s3Url = await uploadToS3(file);
                console.log(`Upload S3 concluído para ${file.filename}: ${s3Url}`);

                const fotoData = {
                    url: s3Url, // URL retornada pelo S3
                    tipo: file.tipo, // Tipo adicionado pelo middleware
                    // Usa coordenadas específicas da foto se disponíveis, senão as do poste
                    fotoLatitude: latitudesFotos[index] ? parseFloat(latitudesFotos[index]) : latitude,
                    fotoLongitude: longitudesFotos[index] ? parseFloat(longitudesFotos[index]) : longitude,
                    metadata: { // Adiciona metadados úteis
                        originalName: file.originalname,
                        size: file.size,
                        mimetype: file.mimetype,
                        uploadTimestamp: new Date().toISOString()
                    }
                };

                // Adiciona dados específicos se for árvore
                if (file.tipo === TIPOS_FOTO.ARVORE) {
                    const especieIndex = treePhotosIndices.indexOf(index);
                    if (especieIndex !== -1) {
                        fotoData.especieArvore = especies[especieIndex];
                    } else {
                        console.warn(`Foto ${file.filename} marcada como ARVORE mas sem espécie correspondente no índice ${index}`);
                    }
                }

                // Valida coordenadas da foto individualmente
                if (isNaN(fotoData.fotoLatitude) || isNaN(fotoData.fotoLongitude) || fotoData.fotoLatitude < -90 || fotoData.fotoLatitude > 90 || fotoData.fotoLongitude < -180 || fotoData.fotoLongitude > 180) {
                    console.warn(`Coordenadas inválidas para a foto ${file.filename}: lat ${fotoData.fotoLatitude}, lon ${fotoData.fotoLongitude}. Usando coordenadas do poste.`);
                    fotoData.fotoLatitude = latitude;
                    fotoData.fotoLongitude = longitude;
                }

                return fotoData;
            })); // Fim do Promise.all
            console.log('Dados das fotos preparados para criação no DB:', fotosParaCriar);

            // 7.2 Cria o registro do poste no banco de dados
            console.log('Criando registro do poste no banco de dados...');
            const novoPoste = await tx.postes.create({
                data: {
                    // Campos principais
                    numeroIdentificacao: body.numeroIdentificacao,
                    latitude: latitude,
                    longitude: longitude,
                    cidade: body.cidade,
                    endereco: body.endereco,
                    numero: body.numero,
                    cep: body.cep,
                    usuarioId: body.usuarioId, // Certifique-se que este ID existe na tabela Usuarios

                    // Campos opcionais (com tratamento para null/undefined/empty string)
                    localizacao: body.localizacao || null,
                    emFrente: body.emFrente || null,
                    transformador: body.transformador || null,
                    medicao: body.medicao || null,
                    telecom: body.telecom || null,
                    concentrador: body.concentrador || null,
                    poste: body.poste || null,
                    alturaposte: body.alturaposte ? parseFloat(body.alturaposte) : null,
                    estruturaposte: body.estruturaposte || null,
                    tipoBraco: body.tipoBraco || null,
                    tamanhoBraco: body.tamanhoBraco ? parseFloat(body.tamanhoBraco) : null,
                    quantidadePontos: body.quantidadePontos ? parseInt(body.quantidadePontos) : null,
                    tipoLampada: body.tipoLampada || null,
                    potenciaLampada: body.potenciaLampada ? parseInt(body.potenciaLampada) : null,
                    tipoReator: body.tipoReator || null,
                    tipoComando: body.tipoComando || null,
                    tipoRede: body.tipoRede || null,
                    tipoCabo: body.tipoCabo || null,
                    numeroFases: body.numeroFases || null,
                    tipoVia: body.tipoVia || null,
                    hierarquiaVia: body.hierarquiaVia || null,
                    tipoPavimento: body.tipoPavimento || null,
                    quantidadeFaixas: body.quantidadeFaixas ? parseInt(body.quantidadeFaixas) : null,
                    tipoPasseio: body.tipoPasseio || null,
                    canteiroCentral: body.canteiroCentral === 'true', // Booleano
                    larguraCanteiro: body.larguraCanteiro ? parseInt(body.larguraCanteiro) : null,
                    finalidadeInstalacao: body.finalidadeInstalacao || null,
                    isLastPost: body.isLastPost === 'true', // Booleano
                    distanciaEntrePostes: body.distanciaEntrePostes ? parseInt(body.distanciaEntrePostes) : null,
                    // Não incluir especieArvore aqui, pois está ligado à foto

                    // Cria os registros de fotos relacionados
                    fotos: {
                        create: fotosParaCriar
                    }
                },
                include: {
                    fotos: true // Inclui as fotos criadas na resposta
                }
            });
            console.log('Registro do poste criado com sucesso no DB:', novoPoste.id);
            return novoPoste;
        }); // Fim da transação Prisma

        console.log('Poste criado com sucesso:', poste.id);
        res.status(201).json({
            success: true,
            message: 'Poste cadastrado com sucesso!',
            data: poste // Retorna o poste criado com as fotos incluídas
        });

    } catch (error) {
        console.error('--- ERRO AO CRIAR POSTE ---');
        console.error('Timestamp:', new Date().toISOString());
        console.error('Mensagem:', error.message);
        console.error('Código Prisma:', error.code); // Útil para erros P2002 (duplicidade), etc.
        console.error('Meta Prisma:', error.meta); // Pode indicar o campo duplicado
        console.error('Stack Trace:', error.stack);
        console.error('Request Body:', req.body); // Loga o body recebido
        console.error('Request Files:', req.files?.map(f => ({ name: f.filename, type: f.tipo, size: f.size }))); // Loga info dos arquivos

        // Limpeza dos arquivos temporários é crucial em caso de erro
        if (req.files) {
            console.log('Iniciando limpeza de arquivos temporários devido a erro...');
            // Chama a função importada de fileUpload.js
            await cleanUploads(req.files).catch(cleanErr => {
                console.error('Erro durante a limpeza dos arquivos temporários:', cleanErr);
            });
        }

        // Tratamento de erros específicos
        if (error.code === 'P2002') {
            const target = error.meta?.target;
            let userMessage = 'Erro de duplicidade ao salvar os dados.';
            if (target && typeof target === 'string' && target.includes('numeroIdentificacao')) {
                userMessage = 'Este número de identificação do poste já existe no sistema.';
            } else if (target && Array.isArray(target) && target.includes('numeroIdentificacao')) {
                userMessage = 'Este número de identificação do poste já existe no sistema.';
            }
            // Adicione outras verificações de target se necessário (ex: idUnicoArvore se implementado)
            return res.status(400).json({
                success: false,
                message: userMessage,
                code: 'DUPLICATE_ENTRY'
            });
        }

        // Erro genérico do S3 (se uploadToS3 lançar erro)
        if (error.message.includes('Falha no upload para S3')) {
            return res.status(502).json({
                success: false,
                message: 'Erro ao armazenar uma ou mais imagens. Verifique as configurações do S3.',
                code: 'S3_UPLOAD_ERROR'
            });
        }

        // Erro genérico
        res.status(500).json({
            success: false,
            message: 'Erro interno no servidor ao processar o cadastro.',
            code: 'INTERNAL_SERVER_ERROR',
            details: process.env.NODE_ENV === 'development' ? {
                error: error.message,
                stack: error.stack
            } : undefined
        });
    }
});*/

// --- Rota para Criar Poste (com Upload Local) --- 
router.post('/postes', handleUpload({ maxFiles: 10 }), async (req, res) => {
    console.log('Recebida requisição POST /api/postes');
    console.log('Body:', req.body);
    console.log('Files:', req.files ? `${req.files.length} arquivos recebidos` : 'Nenhum arquivo recebido');

    try {
        const { body, files } = req;

        // 1. Validação de campos obrigatórios
        const requiredFields = ['cidade', 'endereco', 'numero', 'usuarioId', 'numeroIdentificacao', 'coords'];
        const missingFields = requiredFields.filter(field => !body[field]);
        
        if (missingFields.length > 0) {
            console.warn('Campos obrigatórios faltando:', missingFields);
            if (files) await cleanUploads(files);
            return res.status(400).json({
                success: false,
                message: `Campos obrigatórios faltando: ${missingFields.join(', ')}`,
                code: 'MISSING_REQUIRED_FIELDS'
            });
        }

        // 2. Validação do formato do número de identificação
        if (!/^\d{5}-\d{1}$/.test(body.numeroIdentificacao)) {
            console.warn('Formato inválido para numeroIdentificacao:', body.numeroIdentificacao);
            if (files) await cleanUploads(files);
            return res.status(400).json({
                success: false,
                message: 'Formato do número do poste inválido. Use: XXXXX-X (5 dígitos, traço, 1 dígito)',
                code: 'INVALID_POST_NUMBER_FORMAT'
            });
        }

        // 3. Validação das coordenadas
        let latitude, longitude;
        try {
            const coordsParsed = JSON.parse(body.coords);
            if (!Array.isArray(coordsParsed) || coordsParsed.length !== 2) {
                throw new Error('Formato de coordenadas inválido.');
            }
            latitude = parseFloat(coordsParsed[0]);
            longitude = parseFloat(coordsParsed[1]);

            if (isNaN(latitude) || isNaN(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
                throw new Error('Valores de coordenadas fora da faixa permitida.');
            }
            console.log('Coordenadas validadas:', { latitude, longitude });
        } catch (error) {
            console.warn('Erro ao validar coordenadas:', error.message);
            if (files) await cleanUploads(files);
            return res.status(400).json({
                success: false,
                message: `Coordenadas inválidas: ${error.message}`,
                code: 'INVALID_COORDINATES'
            });
        }

        // 4. Validação das fotos obrigatórias
        const TIPOS_FOTO = { PANORAMICA: 'PANORAMICA', LUMINARIA: 'LUMINARIA', ARVORE: 'ARVORE' };
        const requiredPhotos = [TIPOS_FOTO.PANORAMICA, TIPOS_FOTO.LUMINARIA];
        const uploadedPhotoTypes = files?.map(f => f.tipo) || [];
        const missingRequiredPhotos = requiredPhotos.filter(type => !uploadedPhotoTypes.includes(type));

        if (missingRequiredPhotos.length > 0) {
            console.warn('Fotos obrigatórias faltando:', missingRequiredPhotos);
            if (files) await cleanUploads(files);
            return res.status(400).json({
                success: false,
                message: `Fotos obrigatórias faltando: ${missingRequiredPhotos.join(', ')}`,
                code: 'MISSING_REQUIRED_PHOTOS'
            });
        }

        // 5. Processamento dos dados do poste
        const posteData = {
            numeroIdentificacao: body.numeroIdentificacao,
            latitude,
            longitude,
            cidade: body.cidade,
            endereco: body.endereco,
            numero: body.numero,
            cep: body.cep,
            usuarioId: body.usuarioId,
            localizacao: body.localizacao || null,
            emFrente: body.emFrente || null,
            transformador: body.transformador || null,
            medicao: body.medicao || null,
            telecom: body.telecom || null,
            concentrador: body.concentrador || null,
            poste: body.poste || null,
            alturaposte: body.alturaposte ? parseFloat(body.alturaposte) : null,
            estruturaposte: body.estruturaposte || null,
            tipoBraco: body.tipoBraco || null,
            tamanhoBraco: body.tamanhoBraco ? parseFloat(body.tamanhoBraco) : null,
            quantidadePontos: body.quantidadePontos ? parseInt(body.quantidadePontos) : null,
            tipoLampada: body.tipoLampada || null,
            potenciaLampada: body.potenciaLampada ? parseInt(body.potenciaLampada) : null,
            tipoReator: body.tipoReator || null,
            tipoComando: body.tipoComando || null,
            tipoRede: body.tipoRede || null,
            tipoCabo: body.tipoCabo || null,
            numeroFases: body.numeroFases || null,
            tipoVia: body.tipoVia || null,
            hierarquiaVia: body.hierarquiaVia || null,
            tipoPavimento: body.tipoPavimento || null,
            quantidadeFaixas: body.quantidadeFaixas ? parseInt(body.quantidadeFaixas) : null,
            tipoPasseio: body.tipoPasseio || null,
            canteiroCentral: body.canteiroCentral === 'true',
            larguraCanteiro: body.larguraCanteiro ? parseInt(body.larguraCanteiro) : null,
            finalidadeInstalacao: body.finalidadeInstalacao || null,
            isLastPost: body.isLastPost === 'true',
            distanciaEntrePostes: body.distanciaEntrePostes ? parseInt(body.distanciaEntrePostes) : null,
            fotos: {
                create: files.map(file => ({
                    url: `/uploads/${file.filename}`,
                    tipo: file.tipo,
                    fotoLatitude: latitude,
                    fotoLongitude: longitude,
                    metadata: {
                        originalName: file.originalname,
                        size: file.size,
                        mimetype: file.mimetype
                    }
                }))
            }
        };

        // 6. Criação do poste no banco de dados
        const novoPoste = await prisma.postes.create({
            data: posteData,
            include: {
                fotos: true
            }
        });

        console.log('Poste criado com sucesso:', novoPoste.id);
        res.status(201).json({
            success: true,
            message: 'Poste cadastrado com sucesso!',
            data: novoPoste
        });

    } catch (error) {
        console.error('Erro ao criar poste:', {
            message: error.message,
            code: error.code,
            stack: error.stack
        });

        if (req.files) {
            console.log('Limpando arquivos temporários...');
            await cleanUploads(req.files);
        }

        if (error.code === 'P2002') {
            return res.status(400).json({
                success: false,
                message: 'Número de identificação já existe',
                code: 'DUPLICATE_ENTRY'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Erro interno no servidor',
            code: 'INTERNAL_SERVER_ERROR',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// --- Rota para Atualizar Localização do Poste --- 
router.patch('/postes/:id/location', async (req, res) => {
    const { id } = req.params;
    const { latitude, longitude } = req.body;
    console.log(`Recebida requisição PATCH /api/postes/${id}/location`);
    console.log('Body:', req.body);

    try {
        // Validação básica
        if (latitude === undefined || longitude === undefined) {
            return res.status(400).json({ success: false, message: 'Latitude e longitude são obrigatórias.', code: 'MISSING_COORDINATES' });
        }

        const lat = parseFloat(latitude);
        const lng = parseFloat(longitude);

        if (isNaN(lat) || isNaN(lng)) {
            return res.status(400).json({ success: false, message: 'Latitude e longitude devem ser números válidos.', code: 'INVALID_COORDINATES_FORMAT' });
        }

        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            return res.status(400).json({ success: false, message: 'Valores de coordenadas fora da faixa permitida.', code: 'INVALID_COORDINATES_RANGE' });
        }

        const posteExistente = await prisma.postes.findUnique({ where: { id } });
        if (!posteExistente) {
            return res.status(404).json({ success: false, message: 'Poste não encontrado.', code: 'POST_NOT_FOUND' });
        }

        const posteAtualizado = await prisma.postes.update({
            where: { id },
            data: { latitude: lat, longitude: lng },
            select: { id: true, numeroIdentificacao: true, latitude: true, longitude: true, endereco: true, cidade: true }
        });

        console.log(`Localização do poste ${id} atualizada com sucesso.`);
        res.json({ success: true, message: 'Localização atualizada com sucesso', data: posteAtualizado });

    } catch (error) {
        console.error(`Erro ao atualizar localização do poste ${id}:`, error);
        if (error.code === 'P2025') { // Erro específico do Prisma para registro não encontrado na atualização
            return res.status(404).json({ success: false, message: 'Poste não encontrado.', code: 'POST_NOT_FOUND' });
        }
        res.status(500).json({
            success: false,
            message: 'Erro interno no servidor ao atualizar localização.',
            code: 'UPDATE_LOCATION_ERROR',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});


export default router;

