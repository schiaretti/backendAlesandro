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

/*router.get('/relatorios/postes', async (req, res) => {
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
            finalidadeInstalacao, especieArvore, distanciaEntrePostesMin, distanciaEntrePostesMax
        } = req.query;

        // Construção dinâmica do 'where' com mapeamento dos valores do frontend
        const where = {};

        // 1. Filtros básicos
        if (cidade) where.cidade = cidade;
        if (endereco) where.endereco = { contains: endereco, mode: 'insensitive' };
        if (numero) where.numero = numero;
        if (cep) where.cep = cep;

        // 2. Componentes elétricos - mapeando "Sim"/"Não" para boolean
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

        // Busca os postes com os filtros aplicados
        const postes = await prisma.postes.findMany({
            where,
            select: {
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
            },
            orderBy: { numeroIdentificacao: 'asc' }
        });

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

        // Gerar estatísticas compatíveis com o frontend
        const estatisticas = {
            total: postes.length,
            componentes: {
                transformador: postes.filter(p => p.transformador).length,
                concentrador: postes.filter(p => p.concentrador).length,
                telecom: postes.filter(p => p.telecom).length,
                medicao: postes.filter(p => p.medicao).length,
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
                led: postes.filter(p => p.tipoLampada === 'LED').length
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

        // Resposta final adaptada para o frontend
        res.json({
            success: true,
            data: tipoRelatorio === 'detalhado' ? postes : null,
            meta: estatisticas
        });

    } catch (error) {
        console.error('Erro no relatório:', error);
        res.status(500).json({ 
            success: false, 
            error: "Erro ao gerar relatório",
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});*/

router.get('/relatorios/postes', async (req, res) => {
    try {
        const {
            tipoRelatorio = 'estatisticas',
            // Filtros básicos
            endereco, cidade, numero, cep,
            // Componentes elétricos
            transformador, concentrador, telecom, medicao,
            // Iluminação
            tipoLampada, potenciaLampada,
            tipoReator, tipoComando,
            // Características físicas
            alturaposte,
            estruturaposte, tipoBraco,
            tamanhoBraco,
            quantidadePontos,
            // Rede elétrica
            tipoRede, tipoCabo, numeroFases,
            // Infraestrutura
            tipoVia, hierarquiaVia, tipoPavimento, quantidadeFaixas,
            tipoPasseio, canteiroCentral, larguraCanteiro,
            // Outros
            finalidadeInstalacao, especieArvore, distanciaEntrePostes
        } = req.query;

        // Construção do filtro WHERE
        const where = {};

        // 1. Filtros básicos (texto)
        if (cidade) where.cidade = cidade;
        if (endereco) where.endereco = { contains: endereco, mode: 'insensitive' };
        if (numero) where.numero = numero;
        if (cep) where.cep = cep;

        // 2. Componentes elétricos (boolean)
        if (transformador) where.transformador = transformador === "true";
        if (concentrador) where.concentrador = concentrador === "true";
        if (telecom) where.telecom = telecom === "true";
        if (medicao) where.medicao = medicao === "true";

        // 3. Iluminação (valores exatos)
        if (tipoLampada) where.tipoLampada = tipoLampada;
        if (potenciaLampada) where.potenciaLampada = Number(potenciaLampada);
        if (tipoReator) where.tipoReator = tipoReator;
        if (tipoComando) where.tipoComando = tipoComando;

        // 4. Características físicas (valores exatos)
        if (alturaposte) where.alturaposte = Number(alturaposte);
        if (estruturaposte) where.estruturaposte = estruturaposte;
        if (tipoBraco) where.tipoBraco = tipoBraco;
        if (tamanhoBraco) where.tamanhoBraco = Number(tamanhoBraco);
        if (quantidadePontos) where.quantidadePontos = Number(quantidadePontos);

        // 5. Rede elétrica
        if (tipoRede) where.tipoRede = tipoRede;
        if (tipoCabo) where.tipoCabo = tipoCabo;
        if (numeroFases) where.numeroFases = numeroFases;

        // 6. Infraestrutura
        if (tipoVia) where.tipoVia = tipoVia;
        if (hierarquiaVia) where.hierarquiaVia = hierarquiaVia;
        if (tipoPavimento) where.tipoPavimento = tipoPavimento;
        if (quantidadeFaixas) where.quantidadeFaixas = Number(quantidadeFaixas);
        if (tipoPasseio) where.tipoPasseio = tipoPasseio;
        if (canteiroCentral) where.canteiroCentral = canteiroCentral === "true";
        if (larguraCanteiro) where.larguraCanteiro = Number(larguraCanteiro);

        // 7. Outros
        if (finalidadeInstalacao) where.finalidadeInstalacao = finalidadeInstalacao;
        if (especieArvore) where.especieArvore = especieArvore;
        if (distanciaEntrePostes) where.distanciaEntrePostes = Number(distanciaEntrePostes);

        // Busca os postes com filtros
        const postes = await prisma.postes.findMany({
            where,
            orderBy: { numeroIdentificacao: 'asc' }
        });

        // Função auxiliar para contar valores brutos
        const groupCount = (data, field) => {
            const counts = {};
            data.forEach(item => {
                const value = item[field] !== null && item[field] !== undefined 
                    ? item[field] 
                    : 'Não informado';
                counts[value] = (counts[value] || 0) + 1;
            });
            return Object.entries(counts).map(([valor, quantidade]) => ({
                valor,
                quantidade
            }));
        };

        // Função auxiliar para calcular média
        const calcularMedia = (campo) => {
            const valores = postes
                .filter(p => p[campo] !== null && p[campo] !== undefined)
                .map(p => Number(p[campo]));
            return valores.length > 0 
                ? (valores.reduce((a, b) => a + b, 0) / valores.length).toFixed(2)
                : null;
        };

        // Estatísticas com valores brutos
        const estatisticas = {
            total: postes.length,
            componentes: {
                transformador: postes.filter(p => p.transformador).length,
                concentrador: postes.filter(p => p.concentrador).length,
                telecom: postes.filter(p => p.telecom).length,
                medicao: postes.filter(p => p.medicao).length,
                estrutura: groupCount(postes, 'estruturaposte')
            },
            iluminacao: {
                tiposLampada: groupCount(postes, 'tipoLampada'),
                potencias: groupCount(postes, 'potenciaLampada'),
                tiposReator: groupCount(postes, 'tipoReator'),
                tiposComando: groupCount(postes, 'tipoComando')
            },
            estrutura: {
                alturas: groupCount(postes, 'alturaposte'),
                tiposBraco: groupCount(postes, 'tipoBraco'),
                tamanhosBraco: groupCount(postes, 'tamanhoBraco'),
                quantidadePontos: groupCount(postes, 'quantidadePontos')
            },
            redeEletrica: {
                tiposRede: groupCount(postes, 'tipoRede'),
                tiposCabo: groupCount(postes, 'tipoCabo'),
                numeroFases: groupCount(postes, 'numeroFases')
            },
            infraestrutura: {
                tiposVia: groupCount(postes, 'tipoVia'),
                hierarquiaVias: groupCount(postes, 'hierarquiaVia'),
                tiposPavimento: groupCount(postes, 'tipoPavimento'),
                quantidadeFaixas: groupCount(postes, 'quantidadeFaixas'),
                tiposPasseio: groupCount(postes, 'tipoPasseio'),
                comCanteiro: postes.filter(p => p.canteiroCentral).length,
                larguraCanteiroMedia: calcularMedia('larguraCanteiro')
            },
            outros: {
                finalidades: groupCount(postes, 'finalidadeInstalacao'),
                especiesArvore: groupCount(postes, 'especieArvore'),
                distanciaMedia: calcularMedia('distanciaEntrePostes'),
                coordenadas: {
                    comLatLong: postes.filter(p => p.latitude && p.longitude).length
                }
            }
        };

        res.json({
            success: true,
            data: tipoRelatorio === 'detalhado' ? postes : null,
            estatisticas: tipoRelatorio === 'estatisticas' ? estatisticas : null,
            filtrosAplicados: req.query
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