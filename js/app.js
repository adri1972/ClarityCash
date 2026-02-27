// Imports removed for file:// compatibility
// Classes are now loaded globally via index.html

document.addEventListener('DOMContentLoaded', () => {
    // 1. Mostrar loading inicial si es necesario
    console.log('🚀 Clarity Cash: Initializing Multi-User Engine...');

    // 2. Escuchar cambios de autenticación
    auth.onAuthStateChanged(async (user) => {
        if (!user) {
            console.log('👤 No session found. Redirecting to Login...');
            // Inicializar UI mínima para renderizar el Login
            const store = new Store();
            const advisor = new FinancialAdvisor(store);
            const aiAdvisor = new AIAdvisor(store);
            const ui = new UIManager(store, advisor, aiAdvisor);
            window.ui = ui;
            ui.renderLogin(); // Forzar vista de login
        } else {
            console.log('✅ User authenticated:', user.email);

            // 3. Inicializar Store con el UID del usuario
            const store = new Store();
            window.store = store; // Global access

            try {
                // El Store ahora se inicializa desde Firestore
                await store.init(user.uid);

                // 4. Inicializar Módulos con el Store ya cargado
                const advisor = new FinancialAdvisor(store);
                const aiAdvisor = new AIAdvisor(store);
                const ui = new UIManager(store, advisor, aiAdvisor);
                window.ui = ui;

                // 5. Renderizar Dashboard
                ui.render();

                // Feather Icons
                if (window.feather) {
                    feather.replace();
                }
            } catch (error) {
                console.error('Fatal Error during Store Init:', error);
                alert('Error al sincronizar tus datos. Por favor recarga la página.');
            }
        }
    });
});

