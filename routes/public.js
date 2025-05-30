import express from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';


// Importa as funções necessárias do middleware de upload
// Certifique-se que o caminho para fileUpload.js está correto
import { handleUpload, cleanUploads } from '../middlewares/fileUpload.js';

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

// --- Rota para Criar Poste (com Armazenamento Local) --- 
router.post("/postes", handleUpload({ maxFiles: 10 }), async (req, res) => {
    console.log("Recebida requisição POST /api/postes (armazenamento local)");
    console.log("Body:", req.body);
    console.log("Files:", req.files ? `${req.files.length} arquivos recebidos` : "Nenhum arquivo recebido");

    try {
        const { body, files } = req;

        // 1. Validações (mantidas como antes)
        const requiredFields = ["cidade", "endereco", "numero", "usuarioId", "numeroIdentificacao", "coords"];
        const missingFields = requiredFields.filter(field => !body[field]);
        if (missingFields.length > 0) {
            console.warn("Campos obrigatórios faltando:", missingFields);
            if (files) await cleanUploads(files);
            return res.status(400).json({ success: false, message: `Campos obrigatórios faltando: ${missingFields.join(", ")}`, code: "MISSING_REQUIRED_FIELDS" });
        }
        if (!/^\d{5}-\d{1}$/.test(body.numeroIdentificacao)) {
            console.warn("Formato inválido para numeroIdentificacao:", body.numeroIdentificacao);
            if (files) await cleanUploads(files);
            return res.status(400).json({ success: false, message: "Formato do número do poste inválido. Use: XXXXX-X", code: "INVALID_POST_NUMBER_FORMAT" });
        }
        let latitude, longitude;
        try {
            const coordsParsed = JSON.parse(body.coords);
            if (!Array.isArray(coordsParsed) || coordsParsed.length !== 2) throw new Error("Formato inválido.");
            latitude = parseFloat(coordsParsed[0]);
            longitude = parseFloat(coordsParsed[1]);
            if (isNaN(latitude) || isNaN(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) throw new Error("Valores fora da faixa.");
        } catch (error) {
            console.warn("Erro ao validar coordenadas principais:", body.coords, error.message);
            if (files) await cleanUploads(files);
            return res.status(400).json({ success: false, message: `Coordenadas inválidas: ${error.message}`, code: "INVALID_COORDINATES" });
        }
        const TIPOS_FOTO = { PANORAMICA: "PANORAMICA", LUMINARIA: "LUMINARIA", ARVORE: "ARVORE" };
        const requiredPhotos = [TIPOS_FOTO.PANORAMICA, TIPOS_FOTO.LUMINARIA];
        const uploadedPhotoTypes = files?.map(f => f.tipo) || [];
        const missingRequiredPhotos = requiredPhotos.filter(type => !uploadedPhotoTypes.includes(type));
        if (missingRequiredPhotos.length > 0) {
            console.warn("Fotos obrigatórias faltando:", missingRequiredPhotos);
            if (files) await cleanUploads(files);
            return res.status(400).json({ success: false, message: `Fotos obrigatórias faltando: ${missingRequiredPhotos.join(", ")}`, code: "MISSING_REQUIRED_PHOTOS" });
        }
        const processArrayField = (field) => field ? (Array.isArray(field) ? field : [field]) : [];
        const especies = processArrayField(body.especies);
        const latitudesFotos = processArrayField(body.latitudes);
        const longitudesFotos = processArrayField(body.longitudes);
        const treePhotosIndices = files?.map((f, idx) => f.tipo === TIPOS_FOTO.ARVORE ? idx : -1).filter(idx => idx !== -1) || [];
        if (treePhotosIndices.length > 0 && treePhotosIndices.length !== especies.length) {
            console.warn("Inconsistência entre fotos de árvore e espécies:", { treePhotosCount: treePhotosIndices.length, especiesCount: especies.length });
            if (files) await cleanUploads(files);
            return res.status(400).json({ success: false, message: "Número de espécies não corresponde ao número de fotos de árvores.", code: "MISMATCHED_TREE_DATA" });
        }

        // 2. Criação do poste dentro de uma transação Prisma
        console.log("Iniciando transação Prisma para criar poste (armazenamento local)...");
        const poste = await prisma.$transaction(async (tx) => {

            // 2.1 Prepara os dados das fotos para salvar no DB
            const fotosParaCriar = files.map((file, index) => {
                console.log(`Preparando dados da foto local: ${file.filename}`);
                const fotoData = {
                    url: file.relativePath, // Salva o caminho relativo
                    tipo: file.tipo,
                    fotoLatitude: latitudesFotos[index] ? parseFloat(latitudesFotos[index]) : latitude,
                    fotoLongitude: longitudesFotos[index] ? parseFloat(longitudesFotos[index]) : longitude,

                };
                if (file.tipo === TIPOS_FOTO.ARVORE) {
                    const especieIndex = treePhotosIndices.indexOf(index);
                    if (especieIndex !== -1) fotoData.especieArvore = especies[especieIndex];
                }
                if (isNaN(fotoData.fotoLatitude) || isNaN(fotoData.fotoLongitude) || fotoData.fotoLatitude < -90 || fotoData.fotoLatitude > 90 || fotoData.fotoLongitude < -180 || fotoData.fotoLongitude > 180) {
                    console.warn(`Coordenadas inválidas para a foto ${file.filename}. Usando coordenadas do poste.`);
                    fotoData.fotoLatitude = latitude;
                    fotoData.fotoLongitude = longitude;
                }
                return fotoData;
            });
            console.log("Dados das fotos (locais) preparados para criação no DB:", fotosParaCriar);

            // 2.2 Cria o registro do poste no banco de dados
            console.log("Criando registro do poste no banco de dados...");
            const novoPoste = await tx.postes.create({
                data: {
                    // Campos principais e opcionais (mantidos como antes)
                    numeroIdentificacao: body.numeroIdentificacao,
                    latitude: latitude,
                    longitude: longitude,
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
                    canteiroCentral: body.canteiroCentral === "true",
                    larguraCanteiro: body.larguraCanteiro ? parseInt(body.larguraCanteiro) : null,
                    finalidadeInstalacao: body.finalidadeInstalacao || null,
                    isLastPost: body.isLastPost === "true",
                    distanciaEntrePostes: body.distanciaEntrePostes ? parseInt(body.distanciaEntrePostes) : null,

                    fotos: {
                        create: fotosParaCriar
                    }
                },
                include: {
                    fotos: true // Inclui as fotos criadas na resposta
                }
            });
            console.log("Registro do poste criado com sucesso no DB (local):", novoPoste.id);
            return novoPoste;
        }); // Fim da transação Prisma

        console.log("Poste criado com sucesso (local):", poste.id);
        res.status(201).json({
            success: true,
            message: "Poste cadastrado com sucesso (armazenamento local)!",
            data: poste
        });

    } catch (error) {
        console.error("--- ERRO AO CRIAR POSTE (LOCAL) ---");
        console.error("Timestamp:", new Date().toISOString());
        console.error("Mensagem:", error.message);
        console.error("Código Prisma:", error.code);
        console.error("Meta Prisma:", error.meta);
        console.error("Stack Trace:", error.stack);
        console.error("Request Body:", req.body);
        console.error("Request Files:", req.files?.map(f => ({ name: f.filename, type: f.tipo, size: f.size, path: f.path })));

        // Limpeza dos arquivos locais é crucial em caso de erro
        if (req.files) {
            console.log("Iniciando limpeza de arquivos locais devido a erro...");
            await cleanUploads(req.files).catch(cleanErr => {
                console.error("Erro durante a limpeza dos arquivos locais:", cleanErr);
            });
        }

        // Tratamento de erros específicos
        if (error.code === "P2002") {
            const target = error.meta?.target;
            let userMessage = "Erro de duplicidade ao salvar os dados.";
            if (target && typeof target === "string" && target.includes("numeroIdentificacao")) {
                userMessage = "Este número de identificação do poste já existe no sistema.";
            } else if (target && Array.isArray(target) && target.includes("numeroIdentificacao")) {
                userMessage = "Este número de identificação do poste já existe no sistema.";
            }
            // Retorna o erro 400 específico para duplicidade
            return res.status(400).json({ success: false, message: userMessage, code: "DUPLICATE_ENTRY" });
        } // <--- Fim do if (error.code === "P2002")

        // Erro genérico (fallback se não for P2002 ou outro erro tratado)
        console.error("--- ERRO DETALHADO ---");
        console.error("Tipo:", typeof error);
        console.error("Propriedades:", Object.getOwnPropertyNames(error));
        console.error("Mensagem completa:", error);

        res.status(500).json({ 
            success: false,
            message: "Erro interno no servidor ao processar o cadastro.",
            code: "INTERNAL_SERVER_ERROR",
            details: process.env.NODE_ENV === "development" ? {
                error: error.message,
                stack: error.stack
            } : undefined
        });
        // Não precisa de 'return' aqui, pois é a última instrução do catch

    } // <--- Fim do bloco catch
}); // <--- Fim da definição da rota router.post('/postes', ...)

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

