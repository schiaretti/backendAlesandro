import express from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

// Importa as funções necessárias do middleware de upload
// Certifique-se que o caminho para fileUpload.js está correto
import { handleUpload, cleanUploads } from '../middlewares/fileUpload.js';
import { Upload } from '@aws-sdk/lib-storage';

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

// --- Rota para Criar Poste (com Upload Local) --- 

router.post('/postes', handleUpload({ maxFiles: 10 }), async (req, res) => {
    console.log('Recebida requisição POST /api/postes');
    console.log('Body:', req.body);
    console.log('Files:', req.files ? `${req.files.length} arquivos recebidos` : 'Nenhum arquivo recebido');

    // Garantir que files seja um array vazio se não houver arquivos, para evitar erros no map
    const files = req.files || [];
    const fileUrls = files.map(f => f.url).filter(url => !!url); // Pega apenas URLs válidas

    try {
        const { body } = req;

        // 1. Validação de campos obrigatórios
        const requiredFields = ['cidade', 'endereco', 'numero', 'usuarioId', 'numeroIdentificacao', 'coords'];
        const missingFields = requiredFields.filter(field => !body[field]);

        if (missingFields.length > 0) {
            console.warn('Campos obrigatórios faltando:', missingFields);
            if (fileUrls.length > 0) await cleanUploads(fileUrls);
            return res.status(400).json({
                success: false,
                message: `Campos obrigatórios faltando: ${missingFields.join(', ')}`,
                code: 'MISSING_REQUIRED_FIELDS'
            });
        }

        // 2. Validação do formato do número de identificação
        if (!/^\d{5}-\d{1}$/.test(body.numeroIdentificacao)) {
            console.warn('Formato inválido para numeroIdentificacao:', body.numeroIdentificacao);
            if (fileUrls.length > 0) await cleanUploads(fileUrls);
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
            if (fileUrls.length > 0) await cleanUploads(fileUrls);
            return res.status(400).json({
                success: false,
                message: `Coordenadas inválidas: ${error.message}`,
                code: 'INVALID_COORDINATES'
            });
        }

        // 4. Validação das fotos obrigatórias
        const TIPOS_FOTO = { PANORAMICA: 'PANORAMICA', LUMINARIA: 'LUMINARIA', ARVORE: 'ARVORE' };
        const requiredPhotos = [TIPOS_FOTO.PANORAMICA, TIPOS_FOTO.LUMINARIA];
        const uploadedPhotoTypes = files.map(f => f.tipo) || [];
        const missingRequiredPhotos = requiredPhotos.filter(type => !uploadedPhotoTypes.includes(type));

        if (missingRequiredPhotos.length > 0) {
            console.warn('Fotos obrigatórias faltando:', missingRequiredPhotos);
            // A limpeza já estava correta aqui na versão anterior, mas garantimos consistência
            if (fileUrls.length > 0) await cleanUploads(fileUrls);
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
                // CORREÇÃO APLICADA AQUI: Usar file.url (a variável) em vez da string 'file.url'
                create: files.map(file => ({
                    url: file.url, // <-- CORRIGIDO
                    tipo: file.tipo,
                    fotoLatitude: latitude, // Considerar usar lat/lon da foto se disponível
                    fotoLongitude: longitude, // Considerar usar lat/lon da foto se disponível
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

        // CORREÇÃO APLICADA AQUI: Usar fileUrls (lista de URLs válidas)
        if (fileUrls.length > 0) {
            console.log('Limpando arquivos enviados ao Firebase devido a erro...');
            await cleanUploads(fileUrls);
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
router.patch('/api/postes/:id/location', async (req, res) => {
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

router.get('/relatorios/postes', async (req, res) => {
    try {
        // 1. OBTER TODOS OS PARÂMETROS DA REQUISIÇÃO
        const {
            // Tipo de relatório e fotos
            tipoRelatorio = 'estatisticas',
            incluirFotos = 'false',
            tipoFoto,

            // Filtros básicos
            endereco, cidade, numero, cep, localizacao,

            // Componentes elétricos
            transformador, concentrador, telecom, medicao,

            // Iluminação
            tipoLampada, potenciaMin, potenciaMax, tipoReator, tipoComando,

            // Características físicas
            alturaposteMin, alturaposteMax, estruturaposte, tipoBraco,
            tamanhoBracoMin, tamanhoBracoMax, quantidadePontosMin, quantidadePontosMax,

            // Rede elétrica
            tipoRede, tipoCabo, numeroFases,

            // Infraestrutura
            tipoVia, hierarquiaVia, tipoPavimento, quantidadeFaixasMin, quantidadeFaixasMax,
            tipoPasseio, canteiroCentral, larguraCanteiroMin, larguraCanteiroMax,

            // Outros
            finalidadeInstalacao, especieArvore, distanciaEntrePostesMin, distanciaEntrePostesMax,

            // Paginação
            page = 1,
            per_page = 20
        } = req.query;

        // 2. VALIDAÇÃO DO TIPO DE FOTO (se foi fornecido)
        if (incluirFotos === 'true' && tipoFoto && !['PANORAMICA', 'ARVORE', 'LUMINARIA', 'TELECOM', 'LAMPADA', 'OUTRO'].includes(tipoFoto)) {
            return res.status(400).json({
                success: false,
                error: "Tipo de foto inválido. Valores permitidos: PANORAMICA, ARVORE, LUMINARIA, TELECOM, LAMPADA, OUTRO"
            });
        }

        // 3. CONSTRUÇÃO DOS FILTROS (where)
        const where = {};

        // Filtros básicos
        if (cidade) where.cidade = cidade;
        if (endereco) where.endereco = { contains: endereco, mode: 'insensitive' };
        if (numero) where.numero = numero;
        if (cep) where.cep = cep;
        if (localizacao) where.localizacao = localizacao;

        // Componentes elétricos
        if (transformador) where.transformador = transformador === "true";
        if (medicao) where.medicao = medicao === "true";
        if (telecom) where.telecom = telecom === "true";
        if (concentrador) where.concentrador = concentrador === "true";

        // Iluminação
        if (tipoLampada) where.tipoLampada = tipoLampada;
        if (tipoReator) where.tipoReator = tipoReator;
        if (tipoComando) where.tipoComando = tipoComando;
        if (potenciaMin || potenciaMax) {
            where.potenciaLampada = {
                gte: potenciaMin ? +potenciaMin : undefined,
                lte: potenciaMax ? +potenciaMax : undefined
            };
        }

        // Características físicas
        if (estruturaposte) where.estruturaposte = estruturaposte;
        if (tipoBraco) where.tipoBraco = tipoBraco;
        if (alturaposteMin || alturaposteMax) {
            where.alturaposte = {
                gte: alturaposteMin ? +alturaposteMin : undefined,
                lte: alturaposteMax ? +alturaposteMax : undefined
            };
        }
        if (tamanhoBracoMin || tamanhoBracoMax) {
            where.tamanhoBraco = {
                gte: tamanhoBracoMin ? +tamanhoBracoMin : undefined,
                lte: tamanhoBracoMax ? +tamanhoBracoMax : undefined
            };
        }
        if (quantidadePontosMin || quantidadePontosMax) {
            where.quantidadePontos = {
                gte: quantidadePontosMin ? +quantidadePontosMin : undefined,
                lte: quantidadePontosMax ? +quantidadePontosMax : undefined
            };
        }

        // Rede elétrica
        if (tipoRede) where.tipoRede = tipoRede;
        if (tipoCabo) where.tipoCabo = tipoCabo;
        if (numeroFases) where.numeroFases = numeroFases;

        // Infraestrutura
        if (tipoVia) where.tipoVia = tipoVia;
        if (hierarquiaVia) where.hierarquiaVia = hierarquiaVia;
        if (tipoPavimento) where.tipoPavimento = tipoPavimento;
        if (tipoPasseio) where.tipoPasseio = tipoPasseio;
        if (canteiroCentral) where.canteiroCentral = canteiroCentral === "true";
        if (quantidadeFaixasMin || quantidadeFaixasMax) {
            where.quantidadeFaixas = {
                gte: quantidadeFaixasMin ? +quantidadeFaixasMin : undefined,
                lte: quantidadeFaixasMax ? +quantidadeFaixasMax : undefined
            };
        }
        if (larguraCanteiroMin || larguraCanteiroMax) {
            where.larguraCanteiro = {
                gte: larguraCanteiroMin ? +larguraCanteiroMin : undefined,
                lte: larguraCanteiroMax ? +larguraCanteiroMax : undefined
            };
        }

        // Outros filtros
        if (finalidadeInstalacao) where.finalidadeInstalacao = finalidadeInstalacao;
        if (especieArvore) where.especieArvore = especieArvore;
        if (distanciaEntrePostesMin || distanciaEntrePostesMax) {
            where.distanciaEntrePostes = {
                gte: distanciaEntrePostesMin ? +distanciaEntrePostesMin : undefined,
                lte: distanciaEntrePostesMax ? +distanciaEntrePostesMax : undefined
            };
        }

        // 4. CAMPOS A SEREM SELECIONADOS
        const selectFields = {
            id: true,
            numeroIdentificacao: true,
            cidade: true,
            endereco: true,
            numero: true,
            cep: true,
            localizacao: true,
            alturaposte: true,
            estruturaposte: true,
            tipoBraco: true,
            tamanhoBraco: true,
            quantidadePontos: true,
            transformador: true,
            concentrador: true,
            telecom: true,
            medicao: true,
            tipoLampada: true,
            potenciaLampada: true,
            tipoReator: true,
            tipoComando: true,
            tipoRede: true,
            tipoCabo: true,
            numeroFases: true,
            tipoVia: true,
            hierarquiaVia: true,
            tipoPavimento: true,
            quantidadeFaixas: true,
            tipoPasseio: true,
            finalidadeInstalacao: true,
            especieArvore: true,
            canteiroCentral: true,
            larguraCanteiro: true,
            distanciaEntrePostes: true,
            latitude: true,
            longitude: true,
            isLastPost: true,
            usuarioId: true,
            emFrente: true,
            poste: true
        };

        if (incluirFotos === 'true') {
            selectFields.fotos = {
                where: tipoFoto ? { tipo: tipoFoto } : undefined,
                select: {
                    id: true,
                    url: true,
                    tipo: true,
                    fotoLatitude: true,
                    fotoLongitude: true,
                    especieArvore: true,
                    createdAt: true
                },
                orderBy: { createdAt: 'desc' },
                take: 4
            };
        }

        // 5. CONFIGURAÇÃO DA CONSULTA
        const queryOptions = {
            where,
            select: selectFields,
            orderBy: { numeroIdentificacao: 'asc' }
        };

        // Adiciona paginação para relatórios detalhados ou com fotos
        if (tipoRelatorio === 'detalhado' || tipoRelatorio === 'por-rua' || incluirFotos === 'true') {
            queryOptions.skip = (page - 1) * per_page;
            queryOptions.take = +per_page;
        }

        // 6. EXECUTA A CONSULTA
        const [postes, totalCount] = await Promise.all([
            prisma.postes.findMany(queryOptions),
            prisma.postes.count({ where })
        ]);

        // 7. PROCESSAMENTO DOS RESULTADOS
        // Processa fotos se necessário
        let postesProcessados = postes;
        if (incluirFotos === 'true') {
            postesProcessados = postes.map(poste => ({
                ...poste,
                fotos: poste.fotos?.map(foto => ({
                    ...foto
                    // Mantém a URL original do Firebase sem modificações
                })) || []
            }));
        }

        // 8. GERAR ESTATÍSTICAS (APENAS NÚMEROS ABSOLUTOS)
        const contarPorValor = (campo) => {
            const contagem = {};
            postes.forEach(p => {
                const valor = p[campo] || 'Não informado';
                contagem[valor] = (contagem[valor] || 0) + 1;
            });
            return contagem;
        };

        const contarPorFaixa = (campo, faixas) => {
            const contagem = {};
            faixas.forEach(faixa => {
                contagem[`${faixa.min}-${faixa.max}`] = postes.filter(p =>
                    p[campo] >= faixa.min && p[campo] <= faixa.max
                ).length;
            });
            return contagem;
        };

        const contarComponentes = async (componente) => {
            const count = await prisma.postes.count({
                where: { ...where, [componente]: 'true' }
            });
            return count;
        };

        // Estatísticas de iluminação
        const tiposLampadaCount = contarPorValor('tipoLampada');
        const lampadas70w = postes.filter(p => p.potenciaLampada === 70).length;
        const lampadas100w = postes.filter(p => p.potenciaLampada === 100).length;
        const lampadas150w = postes.filter(p => p.potenciaLampada === 150).length;

        // Estatísticas de altura
        const faixasAltura = [
            { min: 0, max: 5 },
            { min: 5, max: 8 },
            { min: 8, max: 12 },
            { min: 12, max: 999 }
        ];
        const alturaPorFaixa = contarPorFaixa('alturaposte', faixasAltura);

        // 9. RESPOSTA FINAL
        const response = {
            success: true,
            data: tipoRelatorio === 'estatisticas' ? null : postesProcessados,
            meta: {
                total: totalCount,
                componentes: {
                    transformador: await contarComponentes('transformador'),
                    concentrador: await contarComponentes('concentrador'),
                    telecom: await contarComponentes('telecom'),
                    medicao: await contarComponentes('medicao'),
                    tiposPoste: contarPorValor('estruturaposte')
                },
                iluminacao: {
                    tiposLampada: tiposLampadaCount,
                    lampadas70w,
                    lampadas100w,
                    lampadas150w,
                    tiposReator: contarPorValor('tipoReator'),
                    tiposComando: contarPorValor('tipoComando')
                },
                estrutura: {
                    alturaPorFaixa,
                    tiposBraco: contarPorValor('tipoBraco'),
                    tamanhoBracoMedia: postes.reduce((sum, p) => sum + (p.tamanhoBraco || 0), 0) / postes.length,
                    quantidadePontosMedia: postes.reduce((sum, p) => sum + (p.quantidadePontos || 0), 0) / postes.length
                },
                redeEletrica: {
                    tiposRede: contarPorValor('tipoRede'),
                    tiposCabo: contarPorValor('tipoCabo'),
                    numeroFases: contarPorValor('numeroFases')
                },
                infraestrutura: {
                    tiposVia: contarPorValor('tipoVia'),
                    hierarquiaVias: contarPorValor('hierarquiaVia'),
                    tiposPavimento: contarPorValor('tipoPavimento'),
                    quantidadeFaixasMedia: postes.reduce((sum, p) => sum + (p.quantidadeFaixas || 0), 0) / postes.length,
                    tiposPasseio: contarPorValor('tipoPasseio'),
                    comCanteiro: postes.filter(p => p.canteiroCentral).length,
                    larguraCanteiroMedia: postes.reduce((sum, p) => sum + (p.larguraCanteiro || 0), 0) / postes.length
                },
                outros: {
                    finalidades: contarPorValor('finalidadeInstalacao'),
                    especiesArvore: contarPorValor('especieArvore'),
                    distanciaMedia: postes.reduce((sum, p) => sum + (p.distanciaEntrePostes || 0), 0) / postes.length,
                    comCoordenadas: postes.filter(p => p.latitude && p.longitude).length
                }
            },
            pagination: {
                page: +page,
                per_page: +per_page,
                total: totalCount,
                total_pages: Math.ceil(totalCount / per_page)
            }
        };

        // Configura cabeçalho de cache
        res.set('Cache-Control', 'public, max-age=300');

        res.json(response);

    } catch (error) {
        console.error('Erro no relatório:', error);
        res.status(500).json({
            success: false,
            error: "Erro ao gerar relatório",
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});



export default router;

