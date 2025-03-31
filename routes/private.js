import express from 'express'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const router = express.Router()

router.post('/cadastro-usuarios', async (req, res) => {

    try {
        const usuarios = req.body

        const salt = await bcrypt.genSalt(10)
        const hashSenha = await bcrypt.hash(usuarios.senha, salt)

        const usuarioDb = await prisma.usuarios.create({
            data: {
                email: usuarios.email,
                nome: usuarios.nome,
                senha: hashSenha,
                nivel: usuarios.nivel
            }
        })
        res.status(201).json(usuarioDb)
    } catch (error) {
        res.status(500).json({message: "Erro no servidor rota cadastro-usuários!"})
    }
  
})

router.get('/listar-usuarios', async (req, res) => {
    try {

        const usuarios = await prisma.usuarios.findMany()

        res.status(200).json({ message: 'Usuários listados com sucesso!', usuarios })

    } catch (error) {
        res.status(500).json({ message: "Erro no servidor rota listar-usuários!" })
    }
})

export default router