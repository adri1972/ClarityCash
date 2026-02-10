// Imports removed for file:// compatibility
// Classes are now loaded globally via index.html

document.addEventListener('DOMContentLoaded', () => {
    // Initialize Core Modules
    const store = new Store();
    const advisor = new FinancialAdvisor(store);
    const ui = new UIManager(store, advisor);
    window.ui = ui; // Global access for inline events

    // Initial Render
    ui.render();

    // Feather Icons
    if (window.feather) {
        feather.replace();
    }
});
