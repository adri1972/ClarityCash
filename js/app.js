// Imports removed for file:// compatibility
// Classes are now loaded globally via index.html

document.addEventListener('DOMContentLoaded', () => {
    // 1. Mostrar loading inicial si es necesario
    console.log('🚀 Clarity Cash: Initializing Multi-User Engine...');

    // 2. Setup Global UI (Instalar listeners UNA SOLA VEZ)
    // Inicializamos con un Store temporal para que UI funcione (Login)
    let store = new Store();
    let advisor = new FinancialAdvisor(store);
    let aiAdvisor = new AIAdvisor(store);
    const ui = new UIManager(store, advisor, aiAdvisor);
    window.ui = ui;
    window.store = store;

    // 3. Escuchar cambios de autenticación
    auth.onAuthStateChanged(async (user) => {
        if (!user) {
            console.log('👤 No session found. Redirecting to Login...');
            // Mostrar login (usando el Store temporal)
            ui.currentView = 'login';
            ui.render();
        } else {
            console.log('✅ User authenticated:', user.email);

            // Crear un Store definitivo para el usuario conectado
            store = new Store();
            window.store = store;

            // Actualizar dependencias de la UI (sin reinstanciar UIManager para no duplicar listeners)
            advisor = new FinancialAdvisor(store);
            aiAdvisor = new AIAdvisor(store);
            ui.store = store;
            ui.advisor = advisor;
            ui.aiAdvisor = aiAdvisor;

            try {
                // El Store ahora se inicializa desde Firestore
                await store.init(user.uid);

                // Renderizar Dashboard
                ui.currentView = 'dashboard';
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

