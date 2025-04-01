import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Middleware de autenticação JWT padrão
 * (Exportado como default para compatibilidade com seu código existente)
 */
const auth = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader?.split(' ')[1]; // Remove 'Bearer '

    if (!token) {
        return res.status(401).json({ 
            success: false,
            message: 'Token de acesso não fornecido',
            code: 'MISSING_TOKEN'
        });
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({
                success: false,
                message: 'Token inválido ou expirado',
                code: 'INVALID_TOKEN',
                details: process.env.NODE_ENV === 'development' ? err.message : undefined
            });
        }

        // Mantendo os nomes de campos que você já usa
        req.usuarioId = decoded.id;
        req.usuarioNivel = decoded.nivel;

        next();
    });
};

/**
 * Middleware de autorização por nível (opcional)
 * (Exportado como named export para uso avançado)
 */
export const authorizeByLevel = (niveisPermitidos) => {
    return (req, res, next) => {
        if (!niveisPermitidos.includes(req.usuarioNivel)) {
            return res.status(403).json({
                success: false,
                message: 'Acesso não autorizado para seu nível de usuário',
                code: 'UNAUTHORIZED_ACCESS'
            });
        }
        next();
    };
};

// Exportação padrão (main middleware)
export default auth;