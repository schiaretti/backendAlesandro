import express from 'express'
import { PrismaClient } from '@prisma/client'
import bcrypt, { hash } from 'bcrypt'
import jwt from 'jsonwebtoken'


const prisma = new PrismaClient()
const router = express.Router()
const JWT_SECRET = process.env.JWT_SECRET


// Rota de login 
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




export default router