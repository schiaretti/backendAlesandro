const verificarAdmin = (req, res, next) => {
    // Verifica se o middleware 'auth' foi executado antes
    if (!req.usuario) {
        return res.status(401).json({
            success: false,
            message: 'Autenticação necessária',
            code: 'MISSING_AUTH'
        });
    }

    // Verifica explicitamente o nível de acesso
    if (req.usuario.nivel !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Acesso negado: apenas administradores',
            code: 'ADMIN_ACCESS_REQUIRED',
            details: `Nível do usuário: ${req.usuario.nivel || 'não definido'}` // Debug opcional
        });
    }

    next(); // Se todas as verificações passarem
};

export default verificarAdmin;