import express from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

// Middleware de autenticação (já ajustado anteriormente)
import auth from '../middlewares/auth.js';
import verificarAdmin from '../middlewares/verificarAdmin.js';

// Rota de CADASTRO (protegida para admin)
router.post('/cadastro-usuarios', auth, verificarAdmin, async (req, res) => {
    try {
        const { email, nome, senha, nivel } = req.body;

        if (!email || !nome || !senha || !nivel) {
            return res.status(400).json({
                success: false,
                message: 'Todos os campos são obrigatórios'
            });
        }

        // Verifica se o nível é válido (opcional)
        if (!['admin', 'usuario', 'cadastrador'].includes(nivel)) {
            return res.status(400).json({
                success: false,
                message: 'Nível de usuário inválido'
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
            message: 'Nível de usuário inválido. Use: admin, usuario ou cadastrador Erro no servidor!',
            code: 'USER_CREATION_ERROR'
        });
    }
});

// Rota de LISTAGEM (protegida para admin)
router.get('/listar-usuarios', auth, verificarAdmin, async (req, res) => {
    try {

        // Se houver o parâmetro ?count=true, retorna apenas a contagem
        if (req.query.count === 'true') {
            const totalUsuarios = await prisma.usuarios.count();
            return res.json({
                success: true,
                count: totalUsuarios
            });
        }

        const usuarios = await prisma.usuarios.findMany({
            select: {
                id: true,
                email: true,
                nome: true,
                nivel: true

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

// Rota para EDITAR usuário (protegida para admin)
router.put('/editar-usuario/:id', auth, verificarAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { email, nome, senha, nivel } = req.body;

        if (!email && !nome && !senha && !nivel) {
            return res.status(400).json({
                success: false,
                message: 'Pelo menos um campo deve ser fornecido para edição'
            });
        }

        const usuarioExistente = await prisma.usuarios.findUnique({ where: { id } });
        if (!usuarioExistente) {
            return res.status(404).json({
                success: false,
                message: 'Usuário não encontrado'
            });
        }

        // Validações
        const dadosAtualizacao = {};

        if (email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return res.status(400).json({
                    success: false,
                    message: 'Formato de e-mail inválido'
                });
            }
            if (email !== usuarioExistente.email) {
                const emailExistente = await prisma.usuarios.findUnique({ where: { email } });
                if (emailExistente) {
                    return res.status(400).json({
                        success: false,
                        message: 'Este e-mail já está em uso'
                    });
                }
            }
            dadosAtualizacao.email = email;
        }

        if (nome) dadosAtualizacao.nome = nome;

        if (nivel) {
            if (!['admin', 'usuario', 'cadastrador'].includes(nivel)) {
                return res.status(400).json({
                    success: false,
                    message: 'Nível de usuário inválido. Use: admin, usuario ou cadastrador'
                });
            }
            dadosAtualizacao.nivel = nivel;
        }

        if (senha) {
            const salt = await bcrypt.genSalt(10);
            dadosAtualizacao.senha = await bcrypt.hash(senha, salt);
        }

        const usuarioAtualizado = await prisma.usuarios.update({
            where: { id },
            data: dadosAtualizacao,
            select: {
                id: true,
                email: true,
                nome: true,
                nivel: true

            }
        });

        res.json({
            success: true,
            message: 'Usuário atualizado com sucesso',
            data: usuarioAtualizado
        });

    } catch (error) {
        console.error('Erro ao editar usuário:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao editar usuário',
            code: 'USER_UPDATE_ERROR',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Rota para DELETAR usuário (protegida para admin)
router.delete('/deletar-usuario/:id', auth, verificarAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // Verifica se o usuário existe
        const usuarioExistente = await prisma.usuarios.findUnique({
            where: { id }
        });

        if (!usuarioExistente) {
            return res.status(404).json({
                success: false,
                message: 'Usuário não encontrado'
            });
        }

        // Impede que um admin se delete (opcional)
        if (usuarioExistente.nivel === 'admin' && usuarioExistente.id === req.usuario.id) {
            return res.status(403).json({
                success: false,
                message: 'Você não pode deletar seu próprio usuário admin'
            });
        }

        // Deleta o usuário
        await prisma.usuarios.delete({
            where: { id }
        });

        res.json({
            success: true,
            message: 'Usuário deletado com sucesso'
        });

    } catch (error) {
        console.error('Erro ao deletar usuário:', error);

        // Tratamento especial para erro de chave estrangeira
        if (error.code === 'P2003') {
            return res.status(400).json({
                success: false,
                message: 'Não é possível deletar usuário com registros associados',
                code: 'USER_HAS_RELATIONS'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Erro ao deletar usuário',
            code: 'USER_DELETION_ERROR'
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
                    ...foto,
                    url: `${process.env.APP_URL || 'https://backendalesandro-production.up.railway.app'}${foto.url}`
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
                where: { ...where, [componente]: true } 
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