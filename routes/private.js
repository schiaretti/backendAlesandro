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
        const {
            tipoRelatorio = 'estatisticas',
            // Filtros básicos
            endereco, cidade, numero, cep,
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

        // Construção dinâmica do 'where'
        const where = {};
        
        // 1. Filtros básicos
        if (cidade) where.cidade = cidade;
        if (endereco) where.endereco = { contains: endereco, mode: 'insensitive' };
        if (numero) where.numero = numero;
        if (cep) where.cep = cep;

        // 2. Componentes elétricos
        if (transformador) where.transformador = transformador === "true";
        if (concentrador) where.concentrador = concentrador === "true";
        if (telecom) where.telecom = telecom === "true";
        if (medicao) where.medicao = medicao === "true";

        // 3. Iluminação
        if (tipoLampada) where.tipoLampada = tipoLampada;
        if (tipoReator) where.tipoReator = tipoReator;
        if (tipoComando) where.tipoComando = tipoComando;
        if (potenciaMin || potenciaMax) {
            where.potenciaLampada = {
                gte: potenciaMin ? +potenciaMin : undefined,
                lte: potenciaMax ? +potenciaMax : undefined
            };
        }

        // 4. Características físicas
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

        // 5. Rede elétrica
        if (tipoRede) where.tipoRede = tipoRede;
        if (tipoCabo) where.tipoCabo = tipoCabo;
        if (numeroFases) where.numeroFases = numeroFases;

        // 6. Infraestrutura
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

        // 7. Outros
        if (finalidadeInstalacao) where.finalidadeInstalacao = finalidadeInstalacao;
        if (especieArvore) where.especieArvore = especieArvore;
        if (distanciaEntrePostesMin || distanciaEntrePostesMax) {
            where.distanciaEntrePostes = {
                gte: distanciaEntrePostesMin ? +distanciaEntrePostesMin : undefined,
                lte: distanciaEntrePostesMax ? +distanciaEntrePostesMax : undefined
            };
        }

        // Campos a serem selecionados
        const selectFields = {
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
            longitude: true
        };

        // Configuração da consulta
        const queryOptions = {
            where,
            select: selectFields,
            orderBy: { numeroIdentificacao: 'asc' }
        };

        // Adiciona paginação apenas para relatórios detalhados
        if (tipoRelatorio === 'detalhado' || tipoRelatorio === 'por-rua') {
            queryOptions.skip = (page - 1) * per_page;
            queryOptions.take = +per_page;
        }

        // Executa a consulta
        const [postes, totalCount] = await Promise.all([
            prisma.postes.findMany(queryOptions),
            prisma.postes.count({ where })
        ]);

        // Funções auxiliares para estatísticas
        const calcularMedia = (campo) => {
            const valores = postes.filter(p => p[campo] !== null && p[campo] !== undefined)
                                .map(p => parseFloat(p[campo]));
            return valores.length > 0 ? (valores.reduce((a, b) => a + b, 0) / valores.length).toFixed(2) : 0;
        };

        const contarPorValor = (campo) => {
            const contagem = {};
            postes.forEach(p => {
                const valor = p[campo] || 'Não informado';
                contagem[valor] = (contagem[valor] || 0) + 1;
            });
            return Object.entries(contagem).map(([valor, count]) => ({ valor, count }));
        };

        // Gerar estatísticas
        const estatisticas = {
            total: totalCount,
            componentes: {
                transformador: await prisma.postes.count({ where: { ...where, transformador: true } }),
                concentrador: await prisma.postes.count({ where: { ...where, concentrador: true } }),
                telecom: await prisma.postes.count({ where: { ...where, telecom: true } }),
                medicao: await prisma.postes.count({ where: { ...where, medicao: true } }),
                tiposPoste: contarPorValor('estruturaposte')
            },
            estrutura: {
                alturaposteMedia: calcularMedia('alturaposte'),
                tiposBraco: contarPorValor('tipoBraco'),
                tamanhoBracoMedia: calcularMedia('tamanhoBraco'),
                pontosLuminicosMedia: calcularMedia('quantidadePontos')
            },
            iluminacao: {
                tiposLampada: contarPorValor('tipoLampada'),
                potenciaMedia: calcularMedia('potenciaLampada'),
                tiposReator: contarPorValor('tipoReator'),
                tiposComando: contarPorValor('tipoComando'),
                led: postes.filter(p => p.tipoLampada === 'LED').length,
                vaporSodio70: postes.filter(p => p.tipoLampada === 'Vapor de Sódio' && p.potenciaLampada === 70).length
            },
            redeEletrica: {
                tiposRede: contarPorValor('tipoRede'),
                tiposCabo: contarPorValor('tipoCabo'),
                distribuicaoFases: contarPorValor('numeroFases')
            },
            infraestrutura: {
                tiposVia: contarPorValor('tipoVia'),
                hierarquiaVias: contarPorValor('hierarquiaVia'),
                tiposPavimento: contarPorValor('tipoPavimento'),
                faixasMedia: calcularMedia('quantidadeFaixas'),
                tiposPasseio: contarPorValor('tipoPasseio'),
                comCanteiro: postes.filter(p => p.canteiroCentral).length,
                larguraCanteiroMedia: calcularMedia('larguraCanteiro')
            },
            outros: {
                finalidades: contarPorValor('finalidadeInstalacao'),
                especiesArvore: contarPorValor('especieArvore'),
                distanciaMedia: calcularMedia('distanciaEntrePostes'),
                coordenadas: {
                    comLatLong: postes.filter(p => p.latitude && p.longitude).length
                }
            }
        };

        // Resposta final
        res.json({
            success: true,
            data: tipoRelatorio === 'estatisticas' ? null : postes,
            meta: estatisticas,
            pagination: {
                page: +page,
                per_page: +per_page,
                total: totalCount,
                total_pages: Math.ceil(totalCount / per_page)
            }
        });

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