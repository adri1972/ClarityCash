/**
 * AUTH SERVICE — Gestión de Autenticación Centralizada
 * Proyecto: Clarity Cash Multi-User
 */

class AuthService {
    constructor() {
        this.currentUser = null;
        this.onUserChanged = null;
        this._initListener();
    }

    _initListener() {
        auth.onAuthStateChanged((user) => {
            this.currentUser = user;
            if (this.onUserChanged) {
                this.onUserChanged(user);
            }
        });
    }

    /**
     * Registro de nuevo usuario
     */
    async register(email, password) {
        try {
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            // Enviar verificación de email
            await userCredential.user.sendEmailVerification();
            return { user: userCredential.user, error: null };
        } catch (error) {
            console.error("Auth: Error en registro:", error);
            return { user: null, error: this._mapError(error) };
        }
    }

    /**
     * Inicio de sesión
     */
    async login(email, password) {
        try {
            const userCredential = await auth.signInWithEmailAndPassword(email, password);
            return { user: userCredential.user, error: null };
        } catch (error) {
            console.error("Auth: Error en login:", error);
            return { user: null, error: this._mapError(error) };
        }
    }

    /**
     * Cierre de sesión
     */
    async logout() {
        try {
            await auth.signOut();
            return { error: null };
        } catch (error) {
            console.error("Auth: Error en logout:", error);
            return { error: error.message };
        }
    }

    /**
     * Recuperar contraseña
     */
    async resetPassword(email) {
        try {
            await auth.sendPasswordResetEmail(email);
            return { success: true, error: null };
        } catch (error) {
            console.error("Auth: Error en reset:", error);
            return { success: false, error: this._mapError(error) };
        }
    }

    /**
     * Mapeo de errores de Firebase a mensajes amigables
     */
    _mapError(error) {
        switch (error.code) {
            case 'auth/email-already-in-use': return 'Este correo ya está registrado.';
            case 'auth/invalid-email': return 'El correo electrónico no es válido.';
            case 'auth/operation-not-allowed': return 'El registro por correo no está habilitado.';
            case 'auth/weak-password': return 'La contraseña es muy débil (mínimo 6 caracteres).';
            case 'auth/user-not-found': return 'No existe un usuario con este correo.';
            case 'auth/wrong-password': return 'Contraseña incorrecta.';
            case 'auth/too-many-requests': return 'Demasiados intentos. Intenta más tarde.';
            default: return error.message;
        }
    }
}

// Instancia global
window.authService = new AuthService();
