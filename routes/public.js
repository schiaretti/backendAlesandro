import express from 'express'
import { PrismaClient } from '@prisma/client'
import bcrypt, { hash } from 'bcrypt'
import jwt from 'jsonwebtoken'
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const prisma = new PrismaClient()
const router = express.Router()
const JWT_SECRET = process.env.JWT_SECRET

// Middleware de autenticação
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1]
    
    if (!token) return res.sendStatus(401)
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403)
        req.user = user
        next()
    })
}

// Configuração do Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = 'uploads/';
        // Cria o diretório se não existir
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});

// Filtro para aceitar apenas imagens
const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Tipo de arquivo não suportado. Apenas JPEG, JPG ou PNG são permitidos.'), false);
    }
};

// Crie a instância do multer
const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // Limite de 5MB
    }
});

// Rota de login (existente)
router.post('/login', async (req, res) => {
    try {
        const usuarioInfo = req.body
        const usuario = await prisma.usuarios.findUnique({where:{email: usuarioInfo.email}})

        if(!usuario){
            return res.status(404).json({message: 'Usuário não encontrado!'})
        }

        const isMatch = await bcrypt.compare(usuarioInfo.senha, usuario.senha)

        if(!isMatch){
            return res.status(400).json({message: 'Senha inválida!'})
        }

        const token = jwt.sign({id: usuario.id, nivel: usuario.nivel}, JWT_SECRET, {expiresIn: '1d'})
        res.status(201).json(token)
    } catch (error) {
        res.status(500).json({message: "Erro no servidor rota login!"})
    }
})

/*router.post('/postes', authenticateToken, upload.array('fotos'), async (req, res) => {
    try {
        const { body, files } = req;
        
        // 1. Verificação de fotos obrigatórias (forma segura)
       /* const fotosObrigatorias = ['PANORAMICA', 'LUMINARIA'];
        const tiposRecebidos = files?.map(file => {
            // Acessa o tipo de forma segura com fallback
            const tipo = body[`tipo_${file.fieldname}`] || body[`tipo_fotos`];
            return String(tipo).toUpperCase(); // Garante que é string e maiúsculo
        }) || [];*/
         // Modifique esta parte:
/*const tiposRecebidos = files?.map(file => {
    const tipo = body[`tipo_${file.fieldname}`] || body[`tipo_fotos`];
    return String(tipo)
      .toUpperCase()
      .trim() // Remove espaços e tabs
      .split(',')[0] // Pega apenas o primeiro tipo se houver vírgula
  }) || [];

        // Verifica fotos faltantes
        const faltantes = fotosObrigatorias.filter(tipo => 
            !tiposRecebidos.includes(tipo)
        );

        if (faltantes.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Fotos obrigatórias faltando: ${faltantes.join(', ')}`,
                code: 'MISSING_REQUIRED_PHOTOS',
                required: fotosObrigatorias,
                received: tiposRecebidos
            });
        }

        // 2. Criação do poste (com validação adicional)
        const posteData = {
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
            createdAt: new Date()
        };

        // Validação extra dos campos obrigatórios
        const requiredFields = ['coords', 'cidade', 'endereco', 'numero', 'cep'];
        const missingFields = requiredFields.filter(field => !body[field]);

        if (missingFields.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Campos obrigatórios faltando: ${missingFields.join(', ')}`,
                code: 'MISSING_REQUIRED_FIELDS'
            });
        }

        const novoPoste = await prisma.postes.create({
            data: posteData
        });

        // 3. Processamento das fotos (com tratamento de erro individual)
        if (files && files.length > 0) {
            await Promise.all(files.map(async (file) => {
                try {
                    const tipo = String(body[`tipo_${file.fieldname}`] || body[`tipo_fotos`] || 'OUTRA').toUpperCase();
                    const coords = body[`coords_${file.fieldname}`] || body.coords;
                    
                    await prisma.foto.create({
                        data: {
                            url: `/uploads/${file.filename}`,
                            tipo: tipo,
                            coords: coords,
                            posteId: novoPoste.id,
                            createdAt: new Date()
                        }
                    });
                } catch (fotoError) {
                    console.error(`Erro ao salvar foto ${file.originalname}:`, fotoError);
                    // Não interrompe o fluxo por erro em uma foto
                }
            }));
        }

        // 4. Retorna o poste com as fotos
        const posteCompleto = await prisma.postes.findUnique({
            where: { id: novoPoste.id },
            include: { fotos: true }
        });

        res.status(201).json({
            success: true,
            message: 'Poste cadastrado com sucesso',
            data: posteCompleto
        });

    } catch (error) {
        console.error('Erro no cadastro:', {
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

        // 4. Criação do poste (restante do seu código...)
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

// Rota para listar postes do usuário (mantido igual)
router.get('/postes', authenticateToken, async (req, res) => {
    try {
        const postes = await prisma.postes.findMany({
            where: {
                usuarioId: req.user.id
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        res.json(postes);
    } catch (error) {
        console.error('Erro ao buscar postes:', error);
        res.status(500).json({ 
            message: 'Erro ao buscar postes',
            error: error.message 
        });
    }
});
export default router