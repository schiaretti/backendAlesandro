import jwt from 'jsonwebtoken'; // Adicione esta linha no topo


const auth = (req, res, next) => {
    // Verifica múltiplos locais onde o token pode estar
    const token = req.headers['authorization']?.split(' ')[1] || 
                 req.headers['x-auth-token'] || 
                 req.cookies?.token;

    console.log('Token recebido:', token); // Debug adicional

    if (!token) {
        console.error('Token não encontrado em:', {
            headers: req.headers,
            cookies: req.cookies
        });
        return res.status(401).json({
            success: false,
            message: 'Autenticação necessária',
            code: 'MISSING_AUTH'
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.usuario = {
            id: decoded.id,
            nivel: decoded.nivel
        };
        console.log('Usuário autenticado:', req.usuario); // Debug
        next();
    } catch (error) {
        console.error('Token inválido:', error.message);
        return res.status(403).json({
            success: false,
            message: 'Token inválido ou expirado',
            code: 'INVALID_TOKEN'
        });
    }
};
export default auth