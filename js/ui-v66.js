// Chart.js is loaded globally in index.html

class UIManager {
    constructor(store, advisor, aiAdvisor) {
        this.store = store;
        this.advisor = advisor; // Instance of FinancialAdvisor
        this.aiAdvisor = aiAdvisor; // Instance of AIAdvisor (Gemini/ChatGPT)

        // Selectors
        this.container = document.getElementById('content-area');
        this.pageTitle = document.getElementById('page-title');
        this.navItems = document.querySelectorAll('.nav-item');

        // Bindings
        this.initEventListeners();
        this.currentChart = null;
        this.viewDate = new Date();

        // Friendly names for category groups
        this.groupLabels = {
            'INGRESOS': '💵 Ingresos',
            'NECESIDADES': '🏠 Lo Esencial',
            'VIVIENDA': '🏡 Casa y Servicios',
            'FINANCIERO': '💰 Ahorro y Deudas',
            'CRECIMIENTO': '📚 Educación',
            'ESTILO_DE_VIDA': '🎭 Gustos y Ocio',
            'OTROS': '📦 Otros'
        };

        // Smart Date: Jump to latest transaction date if current month is empty
        this.setSmartViewDate();
    }

    setSmartViewDate() {
        const txs = this.store.transactions;
        if (txs && txs.length > 0) {
            // Sort to find latest (desc)
            const sorted = [...txs].sort((a, b) => new Date(b.date) - new Date(a.date));
            const latest = sorted[0];

            // Parse explicitly: "2026-01-31" -> year 2026, month 0 (Jan)
            const parts = latest.date.split('-');
            const y = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10) - 1; // 0-indexed month

            // Set viewDate to this month/year
            this.viewDate = new Date(y, m, 1);
        } else {
            this.viewDate = new Date(); // Default safely to now
        }
    }

    changeMonth(delta) {
        this.viewDate.setMonth(this.viewDate.getMonth() + delta);
        this.render(); // Re-render current view (Dashboard)
    }

    formatCurrency(amount) {
        const currency = this.store.config.currency;
        const localeMap = { 'COP': 'es-CO', 'USD': 'en-US', 'EUR': 'es-ES' };

        return new Intl.NumberFormat(localeMap[currency] || 'en-US', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: currency === 'COP' ? 0 : 2,
            maximumFractionDigits: 2
        }).format(amount);
    }

    initEventListeners() {
        // Navigation
        this.navItems.forEach(btn => {
            btn.addEventListener('click', () => {
                const view = btn.dataset.view;
                this.navigate(view);

                // Close sidebar on mobile
                const sidebar = document.querySelector('.sidebar');
                const overlay = document.querySelector('.sidebar-overlay');
                if (sidebar) sidebar.classList.remove('open');
                if (overlay) overlay.classList.remove('active');
            });
        });

        // Modals - Universal Close Logic
        const addBtn = document.getElementById('add-transaction-btn');
        const txModal = document.getElementById('transaction-modal');

        if (addBtn && txModal) {
            addBtn.addEventListener('click', () => {
                this.populateSelects('GASTO');
                txModal.classList.remove('hidden');
            });
        }

        // Close any modal when clicking its close button or overlay
        document.addEventListener('click', (e) => {
            if (e.target.closest('.close-modal') || e.target.classList.contains('modal')) {
                const modal = e.target.closest('.modal') || e.target;
                if (modal) {
                    modal.classList.add('hidden');

                    // Reset Form if it's the transaction modal
                    if (modal.id === 'transaction-modal') {
                        const form = document.getElementById('transaction-form');
                        if (form) {
                            form.reset();
                            const hiddenId = form.querySelector('input[name="edit_tx_id"]');
                            if (hiddenId) hiddenId.value = '';

                            const btn = form.querySelector('button[type="submit"]');
                            if (btn) btn.innerHTML = '+ Agregar Movimiento';

                            const title = modal.querySelector('h3');
                            if (title) title.textContent = 'Nuevo Movimiento 💸';

                            // Reset visibility of category
                            const categoryGroup = form.querySelector('select[name="category_id"]').closest('.form-group');
                            if (categoryGroup) categoryGroup.style.display = 'block';
                        }
                    }
                }
            }
        });

        // Form Submit
        const form = document.getElementById('transaction-form');
        if (form) {
            // Add formatting to Amount input
            const amountInput = form.querySelector('input[name="amount"]');
            if (amountInput) {
                amountInput.type = 'text'; // Force text type for formatting
                amountInput.addEventListener('input', function (e) {
                    // Remove existing dots and non-digits
                    let value = this.value.replace(/[^0-9]/g, '');
                    // Add dots every 3 digits
                    this.value = value.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
                });
            }

            // Type Change Listener (Hide Category for Debt/Savings/Investment if needed, or auto-select)
            const typeInputs = form.querySelectorAll('input[name="type"]');
            const categoryGroup = form.querySelector('select[name="category_id"]').closest('.form-group');

            typeInputs.forEach(input => {
                input.addEventListener('change', () => {
                    const type = input.value;
                    this.populateSelects(type);
                    // Ensure visibility (as we now filter options instead of hiding)
                    const categoryGroup = form.querySelector('select[name="category_id"]').closest('.form-group');
                    if (categoryGroup) categoryGroup.style.display = 'block';
                });
            });

            form.addEventListener('submit', (e) => {
                e.preventDefault();
                try {
                    const formData = new FormData(form);
                    const data = Object.fromEntries(formData.entries());

                    // Clean amount (remove dots)
                    if (data.amount) {
                        data.amount = parseFloat(data.amount.replace(/\./g, ''));
                    }

                    if (isNaN(data.amount) || data.amount <= 0) {
                        alert('Por favor ingresa un monto válido.');
                        return;
                    }

                    // Fallback for missing category_id
                    // ... (keep fallback)
                    if (!data.category_id) {
                        // Simplify fallback logic or reuse existing...
                        if (data.type === 'PAGO_DEUDA') data.category_id = 'cat_7';
                        else if (data.type === 'AHORRO') data.category_id = 'cat_5';
                        else if (data.type === 'INVERSION') data.category_id = 'cat_6';
                        else data.category_id = 'cat_10';
                    }

                    const editId = formData.get('edit_tx_id');
                    if (editId) {
                        this.store.updateTransaction(editId, data);
                        alert('Movimiento actualizado correctamente.');
                    } else {
                        this.store.addTransaction(data);
                        // PROACTIVE AI: Trigger insight if it's an expense
                        if (data.type === 'GASTO') {
                            this.triggerSpendingInsight(data);
                        }
                    }

                    if (txModal) {
                        txModal.classList.add('hidden');
                    }
                    form.reset();
                    // Clear hidden input
                    const hiddenId = form.querySelector('input[name="edit_tx_id"]');
                    if (hiddenId) hiddenId.value = '';

                    // Reset button text
                    const btn = form.querySelector('button[type="submit"]');
                    if (btn) btn.innerHTML = '+ Agregar Movimiento';

                    categoryGroup.style.display = 'block'; // Reset visibility
                    this.render();
                } catch (err) {
                    console.error('Error saving transaction:', err);
                    alert('Hubo un error al guardar: ' + err.message + '\n\nRevisa la consola para más detalles.');
                }
            });
        }

        // OCR Logic - Receipt Scanning
        const scanBtn = document.getElementById('scan-btn');
        const fileInput = document.getElementById('receipt-upload');
        const loadingDiv = document.getElementById('scan-loading');
        const scanIcon = scanBtn ? scanBtn.querySelector('i') : null;

        if (scanBtn && fileInput) {
            scanBtn.addEventListener('click', () => fileInput.click());

            fileInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                // Validate image type strictly (Allow HEIC now)
                const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/bmp', 'image/heic', ''];
                // Some browsers report empty string for heic or non-standard types, so we check extension too
                const extension = file.name.split('.').pop().toLowerCase();
                const isHeic = file.type === 'image/heic' || extension === 'heic';

                if (!validTypes.includes(file.type) && !isHeic) {
                    alert('Formato de archivo no soportado (' + file.type + ').\nPor favor usa JPG, PNG, WebP o HEIC (iPhone).');
                    return;
                }

                // UI Loading State
                loadingDiv.style.display = 'block';
                loadingDiv.textContent = 'Procesando imagen...';
                scanBtn.style.opacity = '0.7';
                scanBtn.style.pointerEvents = 'none';
                if (window.feather) {
                    if (scanIcon) scanIcon.dataset.feather = 'loader';
                    window.feather.replace();
                }

                try {
                    let fileToProcess = file;

                    // Convert HEIC if needed
                    if (isHeic) {
                        loadingDiv.textContent = 'Intentando convertir HEIC (iPhone)...';
                        console.log('Detectado HEIC, iniciando conversión...');

                        if (typeof heic2any === 'undefined') {
                            throw new Error('Librería heic2any no cargada.');
                        }

                        const convertedBlob = await heic2any({
                            blob: file,
                            toType: "image/jpeg",
                            quality: 0.8
                        });

                        const finalBlob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
                        fileToProcess = new File([finalBlob], "converted.jpg", { type: "image/jpeg" });
                        console.log('Conversión HEIC exitosa.');
                    }

                    const reader = new FileReader();

                    reader.onload = async (event) => {
                        try {
                            const imageData = event.target.result;

                            if (typeof Tesseract === 'undefined') {
                                throw new Error('La librería Tesseract no se ha cargado. Revisa tu conexión a internet.');
                            }

                            console.log('Iniciando reconocimiento...');
                            const { data: { text } } = await Tesseract.recognize(
                                imageData,
                                'spa',
                                {
                                    logger: m => {
                                        if (m.status === 'recognizing text') {
                                            loadingDiv.textContent = `Leyendo texto... ${Math.round(m.progress * 100)}%`;
                                        } else if (m.status === 'loading tesseract core') {
                                            loadingDiv.textContent = 'Cargando motor OCR...';
                                        }
                                    }
                                }
                            );

                            console.log('Texto Recibo:', text);
                            this.processReceiptText(text);

                        } catch (err) {
                            console.error('Error OCR Logic:', err);
                            alert('No se pudo leer el texto del recibo.\n\nDetalle: ' + (err.message || err));
                        } finally {
                            loadingDiv.style.display = 'none';
                            loadingDiv.textContent = 'Leyendo recibo...';
                            scanBtn.style.opacity = '1';
                            scanBtn.style.pointerEvents = 'auto';
                            if (scanIcon) scanIcon.dataset.feather = 'camera';
                            if (window.feather) window.feather.replace();
                            fileInput.value = '';
                        }
                    };

                    reader.onerror = (err) => {
                        alert('Error al leer el archivo procesado: ' + err);
                        loadingDiv.style.display = 'none';
                        scanBtn.style.opacity = '1';
                        scanBtn.style.pointerEvents = 'auto';
                    };

                    reader.readAsDataURL(fileToProcess);

                } catch (conversionErr) {
                    console.error('Error preparación archivo:', conversionErr);
                    let msg = 'No se pudo procesar esta imagen HEIC (iPhone).\n';
                    if (conversionErr.toString().includes('ERR_LIBHEIF')) {
                        msg += 'El formato es demasiado nuevo o incompatible con el navegador.\n\nSOLUCIÓN RÁPIDA: Toma una captura de pantalla (screenshot) a la foto y sube esa captura (que será PNG), o guarda la foto como JPG.';
                    } else {
                        msg += 'Error: ' + conversionErr.message;
                    }
                    alert(msg);

                    loadingDiv.style.display = 'none';
                    scanBtn.style.opacity = '1';
                    scanBtn.style.pointerEvents = 'auto';
                    fileInput.value = '';
                }
            });
        }
    }

    processReceiptText(text) {
        const form = document.getElementById('transaction-form');
        let amountFound = 0;
        let dateFound = null;

        // Clean text slightly
        const cleanText = text.replace(/[$€£]/g, '');
        const lines = cleanText.split('\n');

        // 1. Try to find Total Amount
        const totalRegex = /total|pagar|venta|suma|neto|valor/i;

        for (let line of lines) {
            if (totalRegex.test(line)) {
                const cleanLine = line.replace(/\s+/g, '');
                // Match patterns like: 82,000.00 or 82.000,00 or 82000
                const matches = cleanLine.match(/[\d.,]+/g);

                if (matches) {
                    const validNums = matches.map(raw => {
                        let n = raw.replace(/[.,]$/, ''); // Clean trailing punctuation
                        let val = 0;

                        if (n.includes(',') && n.includes('.')) {
                            // Both present
                            if (n.indexOf(',') < n.indexOf('.')) {
                                // 1,000.00 (US/MX)
                                val = parseFloat(n.replace(/,/g, ''));
                            } else {
                                // 1.000,00 (CO/ES)
                                val = parseFloat(n.replace(/\./g, '').replace(/,/g, '.'));
                            }
                        } else if (n.includes(',')) {
                            // Only comma
                            const parts = n.split(',');
                            if (parts[parts.length - 1].length === 3) {
                                // 1,000 (US thousands)
                                val = parseFloat(n.replace(/,/g, ''));
                            } else {
                                // 10,00 (Decimal)
                                val = parseFloat(n.replace(/,/g, '.'));
                            }
                        } else if (n.includes('.')) {
                            // Only dot
                            const parts = n.split('.');
                            if (parts[parts.length - 1].length === 3) {
                                // 1.000 (CO thousands)
                                val = parseFloat(n.replace(/\./g, ''));
                            } else {
                                // 10.00 (Decimal)
                                val = parseFloat(n);
                            }
                        } else {
                            // Plain number
                            val = parseFloat(n);
                        }
                        return val;
                    }).filter(n => !isNaN(n));

                    if (validNums.length > 0) {
                        const maxOnLine = Math.max(...validNums);
                        // Filter out small IDs
                        if (maxOnLine > amountFound && maxOnLine > 100) {
                            amountFound = maxOnLine;
                        }
                    }
                }
            }
        }

        // Strategy B: Largest number in text (Backup)
        if (amountFound === 0) {
            let maxVal = 0;
            const fullNums = cleanText.match(/[\d.,]+/g);
            if (fullNums) {
                fullNums.forEach(raw => {
                    let n = raw.replace(/[.,]$/, '');
                    let val = parseFloat(n.replace(/,/g, '')); // Naive parse
                    // Filter years and small counts
                    if (val > 100 && val !== 2024 && val !== 2025 && val !== 2026 && val < 100000000) {
                        if (val > maxVal) maxVal = val;
                    }
                });
                if (maxVal > 0) amountFound = maxVal;
            }
        }

        // 2. Try to find Date
        // Supported variants: YYYY/MM/DD, DD/MM/YYYY, YYYY-MM-DD
        const dateRegex = /\b(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})\b|\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})\b/g;

        let bestDate = null;
        let bestScore = -9999;

        const parseDate = (y, m, d) => parseInt(`${y}${m.padStart(2, '0')}${d.padStart(2, '0')}`);

        lines.forEach(line => {
            const matches = [...line.matchAll(dateRegex)];
            if (matches.length > 0) {
                matches.forEach(match => {
                    let year, month, day;
                    if (match[1]) { // YYYY/MM/DD
                        year = match[1];
                        month = match[2];
                        day = match[3];
                    } else { // DD/MM/YYYY
                        day = match[4];
                        month = match[5];
                        year = match[6];
                    }

                    let score = 0;
                    const lineUpper = line.toUpperCase();

                    // CRITICAL: Filter out administrative dates
                    if (lineUpper.includes('VIGENCIA') ||
                        lineUpper.includes('RESOLUCION') ||
                        lineUpper.includes('RANGO') ||
                        lineUpper.includes('AUTORIZACION') ||
                        lineUpper.includes('VENCE')) {
                        score = -1000;
                    }
                    // CRITICAL: Boost actual transaction date
                    else if (lineUpper.includes('FECHA:') ||
                        lineUpper.includes('FECHA COMPRA') ||
                        lineUpper.includes('HORA')) {
                        score = 1000;
                    } else {
                        score = 10;
                    }

                    // Tie-breaker: Recency
                    const dateNum = parseDate(year, month, day);
                    const currentYear = new Date().getFullYear();

                    if (parseInt(year) < 2023 || parseInt(year) > currentYear + 1) {
                        score = -500;
                    }
                    score += (dateNum / 10000000000);

                    if (score > bestScore) {
                        bestScore = score;
                        bestDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                    }
                });
            }
        });

        if (bestDate && bestScore > -100) {
            dateFound = bestDate;
        }

        // 3. Fill Form
        let msg = 'Lectura completada.\n';

        if (amountFound > 0) {
            const amountInput = form.querySelector('input[name="amount"]');
            msg += `✓ Monto detectado: $${amountFound.toLocaleString('es-CO')}\n`;
            amountInput.value = amountFound.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
            amountInput.dispatchEvent(new Event('input'));
        } else {
            msg += '⚠️ No se detectó un monto claro.\n';
        }

        if (dateFound) {
            const dateInput = form.querySelector('input[name="date"]');
            if (dateInput) dateInput.value = dateFound;
            msg += `✓ Fecha: ${dateFound}\n`;
        } else {
            msg += '⚠️ No se detectó la fecha.\n';
        }

        alert(msg);
    }

    populateSelects(typeFilter = 'GASTO') {
        const catSelect = document.querySelector('select[name="category_id"]');
        const accSelect = document.querySelector('select[name="account_id"]');
        if (!catSelect || !accSelect) return;

        // Group Categories
        const categories = this.store.categories;

        // Filter categories based on the selected Transaction Type
        let filteredCats = categories;
        if (typeFilter) {
            if (typeFilter === 'INGRESO') {
                filteredCats = categories.filter(c => c.group === 'INGRESOS');
            } else if (typeFilter === 'AHORRO') {
                filteredCats = categories.filter(c => c.id === 'cat_5'); // Only Ahorro
            } else if (typeFilter === 'INVERSION') {
                filteredCats = categories.filter(c => c.id === 'cat_6'); // Only Inversion
            } else if (typeFilter === 'PAGO_DEUDA') {
                filteredCats = categories.filter(c => c.id === 'cat_7' || c.id === 'cat_fin_4'); // Debt + Credit Card
            } else { // GASTO
                // Show everything EXCEPT strict special types (Income, Savings, Inv, Debt)
                filteredCats = categories.filter(c =>
                    c.group !== 'INGRESOS' &&
                    c.id !== 'cat_5' &&
                    c.id !== 'cat_6' &&
                    c.id !== 'cat_7'
                );
            }
        }

        const groups = [...new Set(filteredCats.map(c => c.group))];

        let catHtml = '<option value="" disabled selected>Selecciona una categoría</option>';
        groups.forEach(group => {
            catHtml += `<optgroup label="${this.groupLabels[group] || group}">`;
            filteredCats.filter(c => c.group === group).forEach(c => {
                catHtml += `<option value="${c.id}">${c.name}</option>`;
            });
            catHtml += `</optgroup>`;
        });
        catSelect.innerHTML = catHtml;

        // Auto-select if only 1 option (e.g. Ahorro)
        if (filteredCats.length === 1) {
            catSelect.value = filteredCats[0].id;
        }

        // Accounts
        accSelect.innerHTML = this.store.accounts.map(a =>
            `<option value="${a.id}">${a.name} (${a.type})</option>`
        ).join('');
    }

    navigate(viewName) {
        this.navItems.forEach(n => n.classList.remove('active'));
        const target = document.querySelector(`.nav-item[data-view="${viewName}"]`);
        if (target) target.classList.add('active');
        this.currentView = viewName;
        this.render();
    }

    render() {
        if (!this.container) return;
        this.container.innerHTML = '';
        switch (this.currentView) {
            case 'dashboard': this.renderDashboard(); break;
            case 'transactions': this.renderTransactions(); break;
            case 'insights': this.renderInsightsPage(); break;
            case 'goals': this.renderGoals(); break;
            case 'settings': this.renderSettings(); break;
            default: this.renderDashboard();
        }
        this.updateUserProfileUI();
        if (window.feather) window.feather.replace();
    }

    updateUserProfileUI() {
        const userName = this.store.config.user_name || 'Mi Espacio';
        const nameEl = document.querySelector('.user-profile .name');
        const statusEl = document.querySelector('.user-profile .status');

        if (nameEl) nameEl.textContent = userName;

        // Update "Offline Mode" to something more friendly
        if (statusEl) {
            const hasKey = this.aiAdvisor && this.aiAdvisor.hasApiKey();
            statusEl.textContent = hasKey ? 'Conectado a IA 🟢' : 'Modo Seguro 🛡️';
            statusEl.style.color = hasKey ? '#4CAF50' : '#999';
        }
    }

    async performHardReset() {
        if (!confirm('⚠️ ¿Estás seguro?\n\nEsto borrará todos los datos temporales y recargará la aplicación. Tus transacciones NO se perderán (se guardan en otra base de datos), pero tendrás que volver a cargar el sitio.')) {
            return;
        }

        const btn = document.getElementById('danger-reset-btn');
        if (btn) {
            btn.innerHTML = '⏳ Borrando...';
            btn.disabled = true;
        }

        try {
            // 1. Unregister Service Workers
            if ('serviceWorker' in navigator) {
                const registrations = await navigator.serviceWorker.getRegistrations();
                for (let registration of registrations) {
                    await registration.unregister();
                }
            }

            // 2. Clear Caches
            if ('caches' in window) {
                const names = await caches.keys();
                for (let name of names) {
                    await caches.delete(name);
                }
            }

            // 3. Force Reload
            // Use a timestamp to bust browser cache
            window.location.href = window.location.pathname + '?reset=' + Date.now();

        } catch (error) {
            console.error('Reset failed:', error);
            alert('Error al reiniciar: ' + error.message);
            window.location.reload();
        }
    }


    renderDashboard() {
        this.pageTitle.textContent = 'Tu Panorama Financiero';


        // --- 0. Month Navigation & Header ---
        const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        const currentMonthName = monthNames[this.viewDate.getMonth()];
        const currentYear = this.viewDate.getFullYear();

        // Generate Recurring Items for this month (Fixed Expenses & Incomes)
        this.store.processFixedExpenses(this.viewDate.getMonth(), this.viewDate.getFullYear());

        // Calculate Totals for Selected Date
        const summary = this.store.getFinancialSummary(this.viewDate.getMonth(), this.viewDate.getFullYear());
        const categoryBreakdown = this.store.getCategoryBreakdown(this.viewDate.getMonth(), this.viewDate.getFullYear());

        // Control Visibility based on Data
        const plan = this.advisor.generateActionPlan(this.viewDate.getMonth(), this.viewDate.getFullYear());

        // --- Manage Quick Expense FAB state ---
        const hasTransactions = this.store.transactions && this.store.transactions.length > 0;
        const fab = document.getElementById('quick-expense-fab');
        const fabHint = document.getElementById('quick-expense-hint');
        if (fab) {
            if (hasTransactions) {
                fab.classList.remove('fab-pulse');
                if (fabHint) fabHint.style.opacity = '0'; // Hide hint if they already know how to use it
            } else {
                fab.classList.add('fab-pulse');
                if (fabHint) fabHint.style.opacity = '1';
            }
        }

        // --- CHECK: Is this a brand new user? ---
        const hasApiKey = this.aiAdvisor && this.aiAdvisor.hasApiKey && this.aiAdvisor.hasApiKey();

        // --- SECTION 0: WELCOME TIP (only if no transactions) ---
        let welcomeTipHTML = '';
        if (!hasTransactions) {
            welcomeTipHTML = `
                <div style="background: var(--bg-surface); border-radius: 24px; padding: 32px 24px; margin-bottom: 2rem; border: 1px solid var(--border-color); box-shadow: var(--shadow-lg); text-align: center;">
                    <img src="assets/logo.png" style="width: 64px; height: 64px; margin-bottom: 16px; border-radius: 16px;">
                    <h2 style="margin: 0 0 12px 0; font-size: 1.5rem; font-weight: 700; color: var(--text-main);">ClarityCash</h2>
                    <p style="color: var(--text-secondary); margin: 0 0 24px 0; font-size: 0.95rem; line-height: 1.6; max-width: 280px; margin-left: auto; margin-right: auto;">
                        Domina tus finanzas con inteligencia. Tu libertad financiera empieza con el primer registro.
                    </p>
                    
                    <button onclick="window.ui.openQuickExpense()" style="width:100%; max-width: 280px; padding:16px; background:linear-gradient(135deg, #FF4081, #E91E63); color:white; border:none; border-radius:14px; font-weight:700; font-size:1rem; cursor:pointer; margin-bottom:20px; box-shadow: 0 8px 20px rgba(233,30,99,0.25); transition: transform 0.2s;" onmousedown="this.style.transform='scale(0.97)'" onmouseup="this.style.transform='scale(1)'">
                        ⚡ Registrar mi primer gasto
                    </button>

                    <div style="display: flex; justify-content: center; gap: 16px; opacity: 0.7;">
                        <small style="display: flex; align-items: center; gap: 4px; color: var(--text-secondary);">
                            <i data-feather="camera" style="width:14px; height:14px;"></i> Escáner IA
                        </small>
                        <small style="display: flex; align-items: center; gap: 4px; color: var(--text-secondary);">
                            <i data-feather="lock" style="width:14px; height:14px;"></i> 100% Privado
                        </small>
                    </div>
                </div>
            `;
        }

        // --- AI TIP (if no API key and has transactions) ---
        let aiTipHTML = '';
        if (hasTransactions && !hasApiKey) {
            aiTipHTML = `
                <div style="background: linear-gradient(135deg, #0D47A1, #1976D2); border-radius: 12px; padding: 14px 18px; margin-bottom: 1rem; color: white; display: flex; align-items: center; gap: 12px; cursor: pointer;" onclick="window.ui.navigate('settings')">
                    <span style="font-size: 1.5rem;">🧠</span>
                    <div style="flex: 1;">
                        <strong style="font-size: 0.85rem;">Desbloquea tu Asesor IA</strong>
                        <p style="margin: 2px 0 0; font-size: 0.75rem; opacity: 0.85;">Conecta Gemini gratis para recibir consejos financieros personalizados → Toca aquí</p>
                    </div>
                    <span style="font-size: 1.2rem;">→</span>
                </div>
            `;
        }

        // --- SECTION 1: HERO (Diagnosis + Key Stats) ---
        const heroHTML = `
            ${welcomeTipHTML}
            ${aiTipHTML}
            <div class="dashboard-hero">
                <!-- Left: context/nav -->
                <div class="hero-header">
                    <div class="month-selector">
                        <button class="btn-icon" onclick="window.ui.changeMonth(-1)"><i data-feather="chevron-left"></i></button>
                        <h2>${currentMonthName} ${currentYear}</h2>
                        <button class="btn-icon" onclick="window.ui.changeMonth(1)"><i data-feather="chevron-right"></i></button>
                    </div>
                </div>

                <!-- Diagnosis Banner (Simplified) -->
                <div class="diagnosis-banner ${plan.status.toLowerCase()}" style="padding: 16px; border-radius: 20px; border: none; background: var(--bg-surface); box-shadow: var(--shadow-md); margin-bottom: 20px;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 12px;">
                        <div>
                            <span style="font-size:0.65rem; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; padding: 4px 8px; border-radius: 12px; display: inline-block; margin-bottom: 6px; ${hasApiKey ? 'background: linear-gradient(135deg, #7B1FA2, #E91E63); color: white;' : 'background: #f5f5f5; color: #999;'}">
                                ${hasApiKey ? '✨ IA Generativa (Real)' : '⚡ Diagnóstico Automático'}
                            </span>
                            <div id="ai-diagnosis-content">
                                <h3 style="margin:4px 0 0; font-size:1.1rem; color:var(--text-main); line-height: 1.4;">${plan.priority}</h3>
                            </div>
                            ${hasApiKey ? `<small id="ai-loading-indicator" style="display:none; color:#E91E63; font-size:0.7rem; margin-top:4px;">🧠 Pensando estrategia...</small>` : ''}
                        </div>
                        <div style="font-size:1.5rem;">${plan.status === 'CRITICAL' ? '🚨' : plan.status === 'WARNING' ? '⚠️' : '✅'}</div>
                    </div>

                    <!-- FINANCIAL HEALTH BAR (SEMAPHORE) -->
                    ${(() => {
                const totalIncome = summary.income > 0 ? summary.income : 1; // Avoid div by zero
                const totalExpense = summary.expenses;
                const ratio = (totalExpense / totalIncome) * 100;

                let color = '#4CAF50'; // Green (Safe)
                let healthText = 'Saludable';

                if (ratio > 100) { color = '#9C27B0'; healthText = 'Déficit (Peligro)'; } // Purple
                else if (ratio > 85) { color = '#F44336'; healthText = 'Crítico'; } // Red
                else if (ratio > 60) { color = '#FF9800'; healthText = 'Precaución'; } // Orange

                // Cap width at 100% for CSS
                const width = Math.min(ratio, 100);

                return `
                        <div style="margin-bottom: 16px;">
                            <div style="display:flex; justify-content:space-between; font-size:0.75rem; margin-bottom:6px; color:var(--text-secondary);">
                                <span>Gastado: ${Math.round(ratio)}%</span>
                                <span style="color:${color}; font-weight:700;">${healthText}</span>
                            </div>
                            <div style="height:10px; background:rgba(0,0,0,0.05); border-radius:10px; overflow:hidden;">
                                <div style="width:${width}%; background:${color}; height:100%; border-radius:10px; transition: width 1s ease-out;"></div>
                            </div>
                        </div>
                        `;
            })()}

                    <div class="diagnosis-balance" style="text-align: right;">
                         <small style="display:block; font-size:0.7rem; color:var(--text-secondary);">Disponible Real</small>
                         <span class="${summary.balance_net < 0 ? 'text-danger' : 'text-success'}" style="font-size:1.5rem; font-weight:800;">
                            ${summary.balance_net < 0 ? '-' : '+'}${this.formatCurrency(Math.abs(summary.balance_net))}
                         </span>
                    </div>
                </div>
            </div>
        `;

        // --- SECTION 2: METRICS ROW (with month-over-month comparison) ---
        const month = this.viewDate.getMonth();
        const year = this.viewDate.getFullYear();
        const prevMonth = month === 0 ? 11 : month - 1;
        const prevYear = month === 0 ? year - 1 : year;
        const prevSummary = this.store.getFinancialSummary(prevMonth, prevYear);

        const compareArrow = (current, previous) => {
            // NEW LOGIC: If previous is 0, we still want to show progress if current > 0
            let prevVal = previous === 0 ? 0 : previous;
            let pctChange = 0;

            if (prevVal === 0) {
                if (current > 0) pctChange = 100; // From 0 to something = 100% gain effectively for UI
                else return '<span style="font-size:0.65rem; color:#999;">= igual</span>';
            } else {
                pctChange = Math.round(((current - prevVal) / prevVal) * 100);
            }

            if (pctChange === 0) return '<span style="font-size:0.65rem; color:#999;">= igual</span>';

            const color = pctChange > 0 ? '#4CAF50' : '#F44336';
            const arrow = pctChange > 0 ? '↑' : '↓';
            // If it was 0 and now is X, we show "↑ 100%" or just "↑" to indicate "Good job starting"
            return `<span style="font-size:0.75rem; color:${color}; font-weight:700;">${arrow}${Math.abs(pctChange)}%</span>`;
        };

        const expenseArrow = (current, previous) => {
            // NEW LOGIC: If previous is 0, we still show the spending trend
            let prevVal = previous === 0 ? 0 : previous;
            let pctChange = 0;

            if (prevVal === 0) {
                if (current > 0) pctChange = 100; // Spending went up from 0
                else return '<span style="font-size:0.65rem; color:#999;">= igual</span>';
            } else {
                pctChange = Math.round(((current - prevVal) / prevVal) * 100);
            }

            if (pctChange === 0) return '<span style="font-size:0.65rem; color:#999;">= igual</span>';

            // For expenses: UP is BAD (red), DOWN is GOOD (green)
            const color = pctChange > 0 ? '#F44336' : '#4CAF50';
            const arrow = pctChange > 0 ? '↑' : '↓';
            return `<span style="font-size:0.75rem; color:${color}; font-weight:700;">${arrow}${Math.abs(pctChange)}%</span>`;
        };

        // STREAK: Calculate consecutive days logging transactions
        const streakCount = this.calculateStreak();
        const streakHTML = streakCount > 0 ? `
            <div style="text-align:center; margin-bottom: 8px;">
                <span style="background: linear-gradient(135deg, #FF9800, #F44336); color: white; padding: 4px 14px; border-radius: 20px; font-size: 0.75rem; font-weight: 600;">
                    🔥 Racha: ${streakCount} día${streakCount > 1 ? 's' : ''} registrando
                </span>
            </div>
        ` : '';

        // COFFEE EQUIVALENT
        const coffeePrice = 5000; // $5.000 COP aprox
        const coffees = Math.round(summary.expenses / coffeePrice);
        const coffeeText = summary.expenses > 0 ? `☕ ${coffees} cafés` : '';

        const metricsHTML = `
            ${streakHTML}
            <div class="metrics-row">
                <div class="metric-card">
                    <span class="label">Ingresos ${compareArrow(summary.income, prevSummary.income)}</span>
                    <span class="value income">+${this.formatCurrency(summary.income)}</span>
                </div>
                 <div class="metric-card">
                    <span class="label">Gastos ${expenseArrow(summary.expenses, prevSummary.expenses)}</span>
                    <span class="value expense">-${this.formatCurrency(summary.expenses)}</span>
                    ${coffeeText ? `<span style="font-size:0.75rem; color:#666; font-weight:500; margin-top:4px;">${coffeeText}</span>` : ''}
                </div>
                 <div class="metric-card">
                    <span class="label">Ahorro ${compareArrow(summary.savings, prevSummary.savings)}</span>
                    <span class="value savings">${this.formatCurrency(summary.savings)}</span>
                </div>
                 <div class="metric-card">
                    <span class="label">Deuda Pagada</span>
                    <span class="value debt">-${this.formatCurrency(summary.debt_payment)}</span>
                </div>
            </div>
        `;

        // --- SECTION 3: VISUALS (Charts) ---
        const chartsHTML = `
            <div class="charts-grid">
                <div class="chart-card main-chart">
                    <div class="card-header-clean">
                        <h4>Tendencia Semestral</h4>
                    </div>
                    <div class="chart-wrapper">
                        <canvas id="historyChart"></canvas>
                    </div>
                </div>
                <div class="chart-card secondary-chart">
                    <div class="card-header-clean">
                         <h4>Gastos por Categoría</h4>
                    </div>
                    <div class="chart-wrapper">
                         <canvas id="expensesChart"></canvas>
                    </div>
                </div>
            </div>
        `;

        // --- SECTION 4: DETAILS (Budget + Transactions) ---
        // New: Compact Budget (Only show what matters)
        const budgetStartHTML = this.renderBudgetCompact();

        const recentTxHTML = `
             <div class="details-card">
                <div class="card-header-clean">
                    <h4>Últimos Movimientos</h4>
                    <button class="btn-link" onclick="document.querySelector('[data-view=transactions]').click()">Ver todos</button>
                </div>
                <div class="transaction-list-compact">
                    ${this.renderRecentTransactionsHTML()}
                </div>
            </div>
        `;

        const detailsHTML = `
            <div class="details-grid">
                ${budgetStartHTML}
                ${recentTxHTML}
            </div>
        `;

        // --- COACHING NUDGES ---
        const nudgesHTML = this.generateCoachingNudges(summary);

        // LAYOUT ASSEMBLY
        this.container.innerHTML = `
            ${heroHTML}
            ${nudgesHTML}
            ${metricsHTML}
            ${chartsHTML}
            ${detailsHTML}
        `;

        // Render Charts
        this.renderChart(); // Doughnut
        this.renderHistoryChart(); // Bar Chart
        if (window.feather) window.feather.replace();

        // Trigger AI Insight if needed
        this.processAIAdvice(plan);

        // EXTRA: If API Key exists, fetch REAL diagnosis asynchronously
        if (hasApiKey) {
            this.fetchRealAIDiagnosis(plan);
        }
    }

    async fetchRealAIDiagnosis(plan) {
        const loading = document.getElementById('ai-loading-indicator');
        const contentDiv = document.getElementById('ai-diagnosis-content');

        if (!loading || !contentDiv || !this.aiAdvisor) return;

        // Check cache first to avoid API spam on every render
        const currentMonth = this.viewDate.getMonth();
        const currentYear = this.viewDate.getFullYear();
        const cached = this.aiAdvisor.getCachedResponse(currentMonth, currentYear);

        if (cached) {
            // Use cached if fresh (< 24h)
            contentDiv.innerHTML = `<p style="margin:4px 0 0; font-size:1rem; color:var(--text-main); white-space: pre-line;">${this.formatAIResponse(cached)}</p>`;
            return;
        }

        loading.style.display = 'block';

        try {
            // Prepare context for AI
            const context = {
                priority: plan.priority,
                status: plan.status,
                problem: plan.status, // Uses 'CRITICAL', 'WARNING', 'OK'
                full_context: `
                    - Balance Neto: ${plan.diagnosis.replace(/<[^>]*>?/gm, '')}
                    - Estado: ${plan.status}
                    - Resumen IA Local: ${plan.priority}
                `
            };

            const advice = await this.aiAdvisor.getConsultation(context);

            // Format and display
            if (advice) {
                // Cache it
                this.aiAdvisor.cacheResponse(currentMonth, currentYear, advice);
                contentDiv.innerHTML = `<p style="margin:4px 0 0; font-size:1rem; color:var(--text-main); white-space: pre-line;">${this.formatAIResponse(advice)}</p>`;
            }
        } catch (error) {
            console.error('AI Diagnosis failed - Switching to Local Fallback:', error);
            // FALLBACK TO LOCAL SMART ENGINE
            this.showFallbackDiagnosis(plan, contentDiv);
        } finally {
            loading.style.display = 'none';
        }
    }

    showFallbackDiagnosis(plan, container) {
        if (!container) return;

        // Local "Fake AI" Logic
        let insight = "Tu flujo de caja está equilibrado.";
        let strategy = "Mantén el ritmo actual.";
        let action = "Revisa tus metas de ahorro.";

        if (plan.status === 'CRITICAL') {
            insight = "⚠️ Estás gastando más de lo que ingresas. Esto es insostenible.";
            strategy = "Corte drástico de gastos no esenciales (hormiga).";
            action = "Audita tus suscripciones y cancela lo que no uses hoy.";
        } else if (plan.status === 'WARNING') {
            insight = "⚠️ Estás al límite. Cualquier imprevisto te endeudará.";
            strategy = "Prioriza crear un fondo de emergencia pequeño.";
            action = "Intenta ahorrar el 1% de todo lo que entre esta semana.";
        } else if (plan.status === 'SURPLUS') {
            insight = "✅ Tienes superávit. El dinero quieto pierde valor.";
            strategy = "No subas tu nivel de vida, sube tu inversión.";
            action = "Abre un CDT o cuenta de alto rendimiento con el excedente.";
        }

        const fallbackHTML = `
            <div style="border-left: 3px solid #ccc; padding-left: 10px; margin-top: 10px; color: #555;">
                <p style="margin:0 0 5px; font-weight:bold;">🤖 Modo Respaldo (Sin Conexión):</p>
                <p style="margin:0 0 5px;">• ${insight}</p>
                <p style="margin:0 0 5px;">• 💡 Estrategia: ${strategy}</p>
                <p style="margin:0;">• 👉 Acción: ${action}</p>
            </div>
        `;

        container.innerHTML = fallbackHTML;
    }

    formatAIResponse(text) {
        // Simple formatter to bold key terms or clean up markdown
        return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/- /g, '• ');
    }

    generateCoachingNudges(summary) {
        const nudges = [];
        const month = this.viewDate.getMonth();
        const year = this.viewDate.getFullYear();
        const dayOfMonth = new Date().getDate();
        const isCurrentMonth = (new Date().getMonth() === month && new Date().getFullYear() === year);

        const txs = this.store.transactions.filter(t => {
            const d = new Date(t.date);
            return d.getMonth() === month && d.getFullYear() === year;
        });

        const budgets = this.store.config.budgets || {};
        const breakdown = this.store.getCategoryBreakdown(month, year);

        // 1. SAVINGS NUDGE: Budget says save X but no savings this month
        const savingsBudget = budgets['cat_5'] || 0;
        if (savingsBudget > 0 && isCurrentMonth) {
            const savingsTxs = txs.filter(t => t.type === 'AHORRO' || t.category_id === 'cat_5');
            const totalSaved = savingsTxs.reduce((s, t) => s + t.amount, 0);
            if (totalSaved === 0) {
                nudges.push({
                    emoji: '🐷',
                    title: '¿Ya apartaste tu ahorro?',
                    msg: `Tu meta es ahorrar ${this.formatCurrency(savingsBudget)} este mes y aún no has registrado ningún ahorro.`,
                    action: 'Registra tu ahorro →',
                    onclick: "document.getElementById('add-transaction-btn').click()"
                });
            } else if (totalSaved < savingsBudget) {
                const pct = Math.round((totalSaved / savingsBudget) * 100);
                nudges.push({
                    emoji: '💪',
                    title: `Llevas ${pct}% de tu meta de ahorro`,
                    msg: `Has ahorrado ${this.formatCurrency(totalSaved)} de ${this.formatCurrency(savingsBudget)}. ¡Faltan ${this.formatCurrency(savingsBudget - totalSaved)}!`,
                    action: 'Registrar abono →',
                    onclick: "document.getElementById('add-transaction-btn').click()"
                });
            }
        }

        // 2. BUDGET EXCEEDED: Categories over budget
        const categories = this.store.categories;
        categories.forEach(c => {
            const limit = budgets[c.id] || 0;
            const spent = breakdown[c.name] || 0;
            if (limit > 0 && spent > limit) {
                const over = spent - limit;
                nudges.push({
                    emoji: '🚨',
                    title: `Te pasaste en ${c.name}`,
                    msg: `Gastaste ${this.formatCurrency(spent)} de ${this.formatCurrency(limit)} presupuestados. Exceso: ${this.formatCurrency(over)}.`,
                    action: 'Ver presupuestos →',
                    onclick: "document.querySelector('[data-view=settings]').click()"
                });
            }
        });

        // 3. NO TRANSACTIONS: Past the 5th and nothing logged
        if (isCurrentMonth && dayOfMonth > 5 && txs.length === 0) {
            nudges.push({
                emoji: '📝',
                title: '¿Llevas 5 días sin registrar nada?',
                msg: 'Para que la IA te ayude, necesita ver tus movimientos. Registra uno o escanea un recibo.',
                action: 'Agregar movimiento →',
                onclick: "document.getElementById('add-transaction-btn').click()"
            });
        }

        // 4. GOALS BEHIND: Goals not on track
        const goals = this.store.getGoals();
        goals.forEach(g => {
            if (g.deadline) {
                const deadline = new Date(g.deadline);
                const now = new Date();
                const monthsLeft = Math.max(1, (deadline.getFullYear() - now.getFullYear()) * 12 + (deadline.getMonth() - now.getMonth()));
                const remaining = g.target_amount - g.current_amount;
                if (remaining > 0 && monthsLeft <= 3) {
                    const perMonth = Math.ceil(remaining / monthsLeft);
                    nudges.push({
                        emoji: '⏰',
                        title: `Meta "${g.name}" necesita atención`,
                        msg: `Te faltan ${this.formatCurrency(remaining)} y quedan ${monthsLeft} mes(es). Necesitas ${this.formatCurrency(perMonth)}/mes.`,
                        action: 'Ver metas →',
                        onclick: "document.querySelector('[data-view=goals]').click()"
                    });
                }
            }
        });

        // 5. EXPENSES WITHOUT INCOME: Spending but forgot to log income
        if (isCurrentMonth && summary.expenses > 0 && summary.income === 0 && dayOfMonth > 3) {
            nudges.push({
                emoji: '💵',
                title: '¿Ya registraste tus ingresos?',
                msg: 'Tienes gastos registrados pero $0 en ingresos. Sin ingresos, el análisis sale incompleto.',
                action: 'Registrar ingreso →',
                onclick: "document.getElementById('add-transaction-btn').click()"
            });
        }

        // RENDER
        if (nudges.length === 0) return '';

        // Limit to 3 most important
        const topNudges = nudges.slice(0, 3);

        return `
            <div style="display: flex; gap: 10px; overflow-x: auto; padding: 4px 0 12px; margin-bottom: 0.5rem; -webkit-overflow-scrolling: touch;">
                ${topNudges.map(n => `
                    <div style="min-width: 260px; max-width: 300px; background: white; border-radius: 12px; padding: 14px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); border-left: 4px solid #FF9800; flex-shrink: 0;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                            <span style="font-size: 1.4rem;">${n.emoji}</span>
                            <strong style="font-size: 0.85rem; color: #333;">${n.title}</strong>
                        </div>
                        <p style="margin: 0 0 8px; font-size: 0.8rem; color: #666; line-height: 1.4;">${n.msg}</p>
                        <button onclick="${n.onclick}" style="background: none; border: none; color: #E91E63; font-size: 0.8rem; font-weight: 600; cursor: pointer; padding: 0;">
                            ${n.action}
                        </button>
                    </div>
                `).join('')}
            </div>
        `;
    }

    calculateStreak() {
        const txDates = new Set(
            this.store.transactions.map(t => {
                const d = new Date(t.date);
                return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
            })
        );

        let streak = 0;
        const today = new Date();

        // Check backwards from today
        for (let i = 0; i < 365; i++) {
            const checkDate = new Date(today);
            checkDate.setDate(today.getDate() - i);
            const key = `${checkDate.getFullYear()}-${checkDate.getMonth()}-${checkDate.getDate()}`;

            if (txDates.has(key)) {
                streak++;
            } else if (i === 0) {
                // Today has no transactions yet - that's OK, don't break streak
                continue;
            } else {
                break;
            }
        }
        return streak;
    }

    openQuickExpense() {
        // --- 1. Get Top Categories + Force Priority (Coffee/Food) ---
        const txs = this.store.transactions.filter(t => t.type === 'GASTO');
        const catCounts = {};
        txs.forEach(t => { catCounts[t.category_id] = (catCounts[t.category_id] || 0) + 1; });

        // Get historically top categories
        let topCats = Object.entries(catCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([id]) => this.store.categories.find(c => c.id === id))
            .filter(Boolean);

        // FORCE PRIORITY: Always include Food (cat_2) and Cravings/Coffee (cat_ant) at the start
        const priorityIds = ['cat_2', 'cat_ant'];
        priorityIds.reverse().forEach(pid => {
            // Remove if already in list to avoid duplicates
            topCats = topCats.filter(c => c.id !== pid);
            // Add to front
            const cat = this.store.categories.find(c => c.id === pid);
            if (cat) topCats.unshift(cat);
        });

        // Fallback if list is empty
        if (topCats.length === 0) {
            const defaultIds = ['cat_2', 'cat_ant', 'cat_3', 'cat_9'];
            defaultIds.forEach(id => {
                const cat = this.store.categories.find(c => c.id === id);
                if (cat) topCats.push(cat);
            });
        }

        // Limit to 8 total
        topCats = topCats.slice(0, 8);

        const catEmojis = {
            'cat_2': '🍔', 'cat_3': '🚗', 'cat_rest': '🍽️', 'cat_ant': '☕',
            'cat_9': '🎬', 'cat_gasolina': '⛽', 'cat_subs': '📱', 'cat_personal': '👕',
            'cat_deporte': '🏋️', 'cat_vicios': '🍺', 'cat_4': '💊',
            'cat_1': '🏠', 'cat_viv_luz': '💡', 'cat_viv_agua': '💧', 'cat_viv_gas': '🔥',
            'cat_viv_net': '📡', 'cat_viv_cel': '📱', 'cat_fin_4': '💳', 'cat_7': '📉',
            'cat_8': '📚', 'cat_10': '📦', 'cat_5': '🐷', 'cat_6': '📈'
        };

        // Create overlay
        const overlay = document.createElement('div');
        overlay.id = 'quick-expense-overlay';
        overlay.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); backdrop-filter:blur(4px); -webkit-backdrop-filter:blur(4px); z-index:10000; display:flex; align-items:flex-end; justify-content:center; animation: fadeIn 0.2s;';

        const overlayContent = `
            <div style="background:var(--bg-surface); border-radius: 32px 32px 0 0; padding: 32px 24px; width:100%; max-width:500px; box-shadow: 0 -10px 40px rgba(0,0,0,0.2); animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1); padding-bottom: max(32px, env(safe-area-inset-bottom));">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 24px;">
                    <h3 style="margin:0; font-size:1.25rem; font-weight:700; color:var(--text-main);">⚡ Gasto Rápido</h3>
                    <button id="close-quick-btn" style="background:rgba(0,0,0,0.05); border:none; width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center; cursor:pointer; color:var(--text-secondary); font-size: 1.2rem;">&times;</button>
                </div>
                
                <div style="position:relative; margin-bottom: 24px;">
                    <span style="position:absolute; left:20px; top:50%; transform:translateY(-50%); font-size:1.5rem; color: #E91E63; font-weight:700;">$</span>
                    <input id="quick-amount" type="number" inputmode="decimal" placeholder="0" 
                        style="width:100%; padding:20px 20px 20px 40px; font-size:2.5rem; font-weight:800; border:none; background:rgba(233, 30, 99, 0.05); border-radius:18px; text-align:center; box-sizing:border-box; outline:none; color:#E91E63;"
                        autofocus />
                </div>
                
                <p style="margin:0 0 12px; font-size:0.85rem; font-weight:600; color:var(--text-secondary); letter-spacing:0.02em; text-transform:uppercase;">¿En qué gastaste?</p>
                
                <div id="quick-cats-container" style="display:grid; grid-template-columns: repeat(2, 1fr); gap:10px; margin-bottom:32px;">
                    ${topCats.map((c, index) => `
                        <button class="quick-cat-btn" data-cat="${c.id}" 
                            style="padding:14px; border:1px solid var(--border-color); border-radius:16px; background:var(--bg-surface); color:var(--text-main); font-size:0.95rem; font-weight:600; cursor:pointer; transition:all 0.2s; display:flex; align-items:center; gap:10px; justify-content: flex-start; text-align: left;">
                            <span style="font-size:1.4rem; background:rgba(0,0,0,0.03); width: 40px; height: 40px; display:flex; align-items:center; justify-content:center; border-radius:12px;">${catEmojis[c.id] || '📌'}</span>
                            <span>${c.name}</span>
                        </button>
                    `).join('')}
                </div>
                
                <button id="quick-save-btn" style="width:100%; padding:18px; background:linear-gradient(135deg, #FF4081, #E91E63); color:white; border:none; border-radius:16px; font-size:1.1rem; font-weight:700; cursor:pointer; box-shadow: 0 8px 20px rgba(233,30,99,0.3); opacity: 0.5; pointer-events: none; transition: opacity 0.3s;">
                    Guardar Gasto
                </button>
            </div>
        `;

        overlay.innerHTML = overlayContent;
        document.body.appendChild(overlay);

        // --- Event Handlers ---
        const amountInput = document.getElementById('quick-amount');
        const saveBtn = document.getElementById('quick-save-btn');
        const closeBtn = document.getElementById('close-quick-btn');
        const catContainer = document.getElementById('quick-cats-container');
        let selectedCatId = null;

        // Auto-focus input
        setTimeout(() => amountInput.focus(), 100);

        // Close Logic
        const closeOverlay = () => {
            overlay.style.opacity = '0';
            setTimeout(() => overlay.remove(), 200);
        };
        closeBtn.addEventListener('click', closeOverlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) closeOverlay(); });

        // Category Selection Logic
        catContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.quick-cat-btn');
            if (!btn) return;

            // Update UI
            document.querySelectorAll('.quick-cat-btn').forEach(b => {
                b.style.background = 'var(--bg-surface)';
                b.style.borderColor = 'var(--border-color)';
                b.style.color = 'var(--text-main)';
                b.style.transform = 'scale(1)';
                b.style.boxShadow = 'none';
            });

            btn.style.background = '#FCE4EC';
            btn.style.borderColor = '#E91E63';
            btn.style.color = '#C2185B';
            btn.style.transform = 'scale(1.02)';
            btn.style.boxShadow = '0 4px 12px rgba(233,30,99,0.15)';

            selectedCatId = btn.dataset.cat;
            checkForm();
        });

        // Input Logic
        amountInput.addEventListener('input', checkForm);

        function checkForm() {
            const val = parseFloat(amountInput.value);
            if (val > 0 && selectedCatId) {
                saveBtn.style.opacity = '1';
                saveBtn.style.pointerEvents = 'auto';
            } else {
                saveBtn.style.opacity = '0.5';
                saveBtn.style.pointerEvents = 'none';
            }
        }

        // Save Logic
        saveBtn.addEventListener('click', () => {
            const amount = parseFloat(amountInput.value);
            const catId = selectedCatId;
            const catName = this.store.categories.find(c => c.id === catId)?.name || '';

            // Find accounting
            const accountId = this.store.accounts.find(a => a.type === 'EFECTIVO')?.id || this.store.accounts[0]?.id || 'acc_1';

            const txData = {
                type: 'GASTO',
                amount: amount,
                date: new Date().toISOString().split('T')[0],
                category_id: catId,
                account_id: accountId,
                note: `Gasto rápido: ${catName}`
            };

            this.store.addTransaction(txData);

            // PROACTIVE AI: Trigger insight
            setTimeout(() => this.triggerSpendingInsight(txData), 500);

            closeOverlay();

            // Success Feedback
            const toast = document.createElement('div');
            toast.style.cssText = 'position:fixed; top:20px; left:50%; transform:translateX(-50%); background:#2E7D32; color:white; padding:12px 24px; border-radius:30px; font-size:1rem; font-weight:600; z-index:10001; animation: slideDown 0.3s, fadeOut 0.3s 2.5s forwards; box-shadow: 0 4px 15px rgba(0,0,0,0.2); display: flex; align-items: center; gap: 8px;';
            toast.innerHTML = `✅ Gasto guardado: <b>${this.formatCurrency(amount)}</b>`;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);

            if (this.currentView === 'dashboard') this.renderDashboard();
        });
    }

    async processAIAdvice(plan) {
        if (!plan || !plan.adjustments) return;

        const aiItems = plan.adjustments
            .map((item, index) => ({ item, index }))
            .filter(({ item }) => typeof item === 'object' && item.type === 'AI_ANALYSIS_REQUIRED');

        if (aiItems.length === 0) return;

        // Cache key based on month/year
        const cacheKey = `cc_ai_v41_${this.viewDate.getFullYear()}_${this.viewDate.getMonth()}`;
        const cached = localStorage.getItem(cacheKey);

        for (const { item, index } of aiItems) {
            const element = document.getElementById(`ai-advice-tip-${index}`);
            if (!element) continue;

            // If we have cached advice, show it immediately (no API call!)
            if (cached) {
                element.style.background = 'white';
                element.style.border = 'none';
                element.classList.remove('ai-loading');
                element.innerHTML = `
                    <div style="display:flex; flex-direction:column; gap:4px;">
                        <div style="display:flex; gap:10px; align-items:flex-start;">
                            <span class="tip-bullet">✨</span>
                            <span class="tip-text" style="color: #333; line-height: 1.4;">
                                ${cached.replace(/\\n/g, '<br>')}
                            </span>
                        </div>
                        <div style="align-self: flex-end; margin-top: 5px;">
                           <button onclick="window.ui.forceRefreshAI()" style="background:none; border:none; color:#999; font-size:0.7rem; cursor:pointer; text-decoration:underline;">
                               🔄 Nueva Opinión
                           </button>
                        </div>
                    </div>
                `;
                continue;
            }

            try {
                await new Promise(r => setTimeout(r, 100));

                const adviceText = await this.aiAdvisor.getConsultation(item.context);

                // Save to cache so we don't call API again
                localStorage.setItem(cacheKey, adviceText);

                element.style.background = 'white';
                element.style.border = 'none';
                element.classList.remove('ai-loading');

                element.innerHTML = `
                    <div style="display:flex; flex-direction:column; gap:4px;">
                        <div style="display:flex; gap:10px; align-items:flex-start;">
                            <span class="tip-bullet">✨</span>
                            <span class="tip-text" style="color: #333; line-height: 1.4;">
                                ${adviceText.replace(/\n/g, '<br>')}
                            </span>
                        </div>
                        <div style="align-self: flex-end; margin-top: 5px;">
                           <button onclick="window.ui.forceRefreshAI()" style="background:none; border:none; color:#999; font-size:0.7rem; cursor:pointer; text-decoration:underline;">
                               🔄 Nueva Opinión
                           </button>
                        </div>
                    </div>
                `;

            } catch (err) {
                console.error("AI Advice Failed:", err);
                const msg = (err.message || '').toLowerCase();
                let coachFallback = item.fallback || "Mi consejo: Mantén tus gastos básicos bajo control hoy.";

                if (msg.includes('quota') || msg.includes('rate')) {
                    coachFallback = "🚀 Mi cerebro IA está descansando un momento, pero aquí va mi consejo: " + coachFallback;
                } else if (msg.includes('api key')) {
                    coachFallback = "🔑 Conecta tu API Key para darte consejos a otro nivel.";
                }

                element.style.background = '#F5F5F5';
                element.style.border = '1px dashed #DDD';
                element.classList.remove('ai-loading');

                element.innerHTML = `
                    <div style="display:flex; flex-direction:column; gap:4px;">
                        <div style="display:flex; gap:10px; align-items:flex-start;">
                            <span class="tip-bullet">💡</span>
                            <span class="tip-text" style="color: #666; line-height: 1.4; font-size: 0.85rem;">
                                ${coachFallback}
                            </span>
                        </div>
                        <div style="align-self: flex-end; margin-top: 5px;">
                           <button onclick="window.ui.forceRefreshAI()" style="background:none; border:none; color:#E91E63; font-size:0.7rem; cursor:pointer; text-decoration:underline;">
                                Reintentar
                           </button>
                        </div>
                    </div>
                `;
            }
        }
    }

    forceRefreshAI() {
        if (confirm('¿Quieres que la IA analice de nuevo tu situación?')) {
            const key = `cc_ai_v41_${this.viewDate.getFullYear()}_${this.viewDate.getMonth()}`;
            localStorage.removeItem(key);
            this.renderDashboard();
        }
    }

    renderBudgetCompact() {
        const breakdown = this.store.getCategoryBreakdown(this.viewDate.getMonth(), this.viewDate.getFullYear());
        const budgets = this.store.config.budgets || {}; // { catId: limit }
        const categories = this.store.categories;

        // 1. Map Data
        let items = categories.map(c => {
            const spent = breakdown[c.name] || 0;
            const limit = budgets[c.id] || 0;
            if (spent === 0 && limit === 0) return null; // Skip irrelevant

            const percent = limit > 0 ? (spent / limit) * 100 : 0;
            let status = 'OK';
            if (limit > 0 && percent > 100) status = 'OVER';
            else if (limit > 0 && percent > 85) status = 'WARN';

            return { ...c, spent, limit, percent, status };
        }).filter(i => i !== null);

        // 2. Sort by Severity (Over budget first, then high spending)
        items.sort((a, b) => {
            if (a.status === 'OVER' && b.status !== 'OVER') return -1;
            if (b.status === 'OVER' && a.status !== 'OVER') return 1;
            return b.percent - a.percent;
        });

        // 3. Limit to Top 5 + Aggregated "Others"
        const topItems = items.slice(0, 5);

        let html = `
            <div class="details-card">
                <div class="card-header-clean">
                    <h4>Seguimiento de Presupuesto</h4>
                    <button class="btn-link" onclick="document.querySelector('[data-view=settings]').click()">Configurar</button>
                </div>
                <div class="budget-list-compact">
        `;

        if (topItems.length === 0) {
            html += `<p class="empty-state">No hay gastos ni presupuestos activos este mes.</p>`;
        } else {
            topItems.forEach(item => {
                const barColor = item.status === 'OVER' ? '#D32F2F' : (item.status === 'WARN' ? '#FFA000' : '#388E3C');
                const width = Math.min(item.percent, 100);

                // Alert styles
                let rowStyle = '';
                let alertIcon = '';
                let overMsg = '';

                if (item.status === 'OVER') {
                    rowStyle = 'background: #FFEBEE; border-left: 4px solid #D32F2F; padding: 6px 8px; border-radius: 4px;';
                    alertIcon = '🚨 ';
                    overMsg = `<div style="color: #D32F2F; font-size: 0.75rem; font-weight: 600; margin-top: 4px;">¡Te pasaste por ${this.formatCurrency(item.spent - item.limit)}!</div>`;
                } else if (item.status === 'WARN') {
                    alertIcon = '⚠️ ';
                }

                html += `
                    <div class="budget-row" style="${rowStyle} margin-bottom: 0.8rem; position: relative;">
                        <div class="budget-info" style="display: flex; justify-content: space-between; margin-bottom: 0.3rem;">
                            <span class="cat-name" style="font-weight: 500; font-size: 0.9rem;">${alertIcon}${item.name}</span>
                            <span class="budget-vals text-muted" style="font-size: 0.8rem;">
                                ${this.formatCurrency(item.spent)} 
                                ${item.limit > 0 ? `/ <span style="font-weight:600;">${this.formatCurrency(item.limit)}</span>` : ''}
                            </span>
                        </div>
                        <div class="progress-track" style="height: 6px; background: #eee; border-radius: 3px; overflow: hidden;">
                             <div class="progress-fill" style="width: ${width}%; background: ${barColor}; height: 100%;"></div>
                        </div>
                        ${overMsg}
                    </div>
                `;
            });
        }

        html += `</div></div>`;
        return html;
    }

    renderHistoryChart() {
        const ctx = document.getElementById('historyChart');
        if (!ctx) return;

        const history = this.store.getHistorySummary(6); // Get last 6 months
        // history: [{label, income, expenses, balance}]

        // Reverse to show oldest -> newest
        const labels = history.map(h => h.label).reverse();
        const incomeData = history.map(h => h.income).reverse();
        const expenseData = history.map(h => h.expenses).reverse();

        if (this.currentHistoryChart) this.currentHistoryChart.destroy();

        this.currentHistoryChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Ingresos',
                        data: incomeData,
                        backgroundColor: '#4CAF50',
                        borderRadius: 4
                    },
                    {
                        label: 'Gastos',
                        data: expenseData,
                        backgroundColor: '#F44336',
                        borderRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, grid: { color: '#f0f0f0' } },
                    x: { grid: { display: false } }
                },
                plugins: {
                    legend: { position: 'bottom' }
                }
            }
        });
    }

    // --- PROACTIVE AI INSIGHTS ---
    // --- PROACTIVE AI INSIGHTS ---
    async triggerSpendingInsight(tx) {
        if (!tx || tx.type !== 'GASTO') return;

        // 1. Prepare Data
        const category = this.store.categories.find(c => c.id === tx.category_id);
        const catName = category ? category.name : 'esta categoría';
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();

        // Calculate totals locally first
        const monthlyTxs = this.store.transactions.filter(t => {
            const d = new Date(t.date);
            return d.getMonth() === currentMonth && d.getFullYear() === currentYear && t.type === 'GASTO';
        });

        const catTxs = monthlyTxs.filter(t => t.category_id === tx.category_id);
        const catTotal = catTxs.reduce((sum, t) => sum + t.amount, 0);
        const budgetLimit = this.store.config.budgets ? (this.store.config.budgets[tx.category_id] || 0) : 0;

        // 2. Rule-Based Triggers (The "Logic Defined")
        const totalExpense = monthlyTxs.reduce((sum, t) => sum + t.amount, 0);
        const catCount = catTxs.length;

        let trigger = null;
        let defaultMsg = '';
        let type = 'info';
        let icon = '💡';

        if (budgetLimit > 0 && catTotal > budgetLimit) {
            trigger = 'OVER_BUDGET';
            defaultMsg = `¡Ojo! Te pasaste del presupuesto de ${catName} por ${this.formatMoney(catTotal - budgetLimit)}`;
            type = 'danger';
            icon = '🚨';
        } else if (budgetLimit > 0 && catTotal > (budgetLimit * 0.8)) {
            trigger = 'NEAR_BUDGET';
            defaultMsg = `Cuidado, estás al 80% de tu límite para ${catName}`;
            type = 'warning';
            icon = '⚠️';
        } else if (catTotal > (totalExpense * 0.3) && totalExpense > 0) {
            trigger = 'HIGH_IMPACT';
            defaultMsg = `${catName} se está llevando el 30% de tus gastos este mes.`;
            type = 'warning';
            icon = '📊';
        } else if (category.id === 'cat_2' || category.id === 'cat_ant') { // Coffee or Antojo
            if (catCount > 10) {
                trigger = 'HIGH_FREQUENCY';
                defaultMsg = `Vas ${catCount} veces en ${catName} este mes. ¿Cocinamos más?`;
                type = 'info';
                icon = '🍳';
            }
        }

        // Special check for high single expense in Antojo
        if (!trigger && tx.amount > 50000 && category.id === 'cat_ant') {
            trigger = 'EXPENSIVE_IMPULSE';
            defaultMsg = `Un antojo de ${this.formatMoney(tx.amount)}... ¡Disfrútalo, pero con moderación!`;
            icon = '🍩';
        }

        // 3. EXECUTE: AI or Default
        if (trigger) {
            // A. AI IS ENABLED -> Get "Real" Insight
            if (this.aiAdvisor && this.aiAdvisor.hasApiKey()) {
                console.log(`🤖 Triggered '${trigger}'. Asking AI...`);
                this.showToast('🧠 Analizando...', 'thinking', '💭'); // Feedback

                // Pass the specific trigger context to AI
                const insight = await this.aiAdvisor.getInstantInsight(tx, {
                    catName,
                    catTotal,
                    budgetLimit,
                    isOverBudget: trigger === 'OVER_BUDGET',
                    triggerReason: trigger // Tell AI exactly why we are calling
                });

                if (insight) {
                    this.removeToast('thinking');
                    this.showToast(insight, 'ai-success', '✨');
                } else {
                    // Fallback if AI fails net check
                    this.removeToast('thinking');
                    this.showToast(defaultMsg, type, icon);
                }
            }
            // B. NO AI -> Use Default "Logic Defined" Message
            else {
                this.showToast(defaultMsg, type, icon);
            }
        }
    }

    showToast(text, type = 'info', icon = '💡') {
        // Remove existing toasts to avoid clutter
        const existing = document.querySelectorAll('.ai-toast');
        existing.forEach(e => e.remove());

        const toast = document.createElement('div');
        toast.className = 'ai-toast';

        let bg = 'white';
        let color = '#333';
        let border = '#eee';

        if (type === 'danger') { bg = '#FFEBEE'; color = '#D32F2F'; border = '#FFCDD2'; }
        if (type === 'warning') { bg = '#FFF3E0'; color = '#EF6C00'; border = '#FFE0B2'; }
        if (type === 'info') { bg = '#E3F2FD'; color = '#1565C0'; border = '#BBDEFB'; }

        toast.style.cssText = `
            position: fixed; 
            top: 80px; 
            left: 50%; 
            transform: translateX(-50%); 
            background: ${bg}; 
            color: ${color}; 
            border: 1px solid ${border};
            padding: 12px 20px; 
            border-radius: 50px; 
            box-shadow: 0 4px 15px rgba(0,0,0,0.1); 
            z-index: 10002; 
            display: flex; 
            align-items: center; 
            gap: 10px; 
            font-size: 0.9rem; 
            font-weight: 500; 
            animation: slideDown 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            max-width: 90%;
            width: max-content;
        `;

        toast.innerHTML = `<span style="font-size:1.2rem">${icon}</span> <span>${text}</span>`;

        document.body.appendChild(toast);

        // Auto remove
        setTimeout(() => {
            toast.style.animation = 'fadeOut 0.5s forwards';
            setTimeout(() => toast.remove(), 500);
        }, 4000);
    }

    renderGoalsWidget() {
        const goals = this.store.getGoals();
        if (goals.length === 0) return '';

        let html = `
            <div style="margin-bottom: 2rem;">
                <h3 style="margin-bottom: 1rem; display: flex; align-items: center; justify-content: space-between;">
                    <span>Mis Metas 🎯</span>
                    <button class="btn-text" onclick="document.querySelector('[data-view=goals]').click()" style="font-size: 0.8rem;">Ver todas</button>
                </h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem;">
        `;

        goals.slice(0, 3).forEach(g => {
            const percent = Math.min((g.current_amount / g.target_amount) * 100, 100);
            let color = '#2196F3';
            if (g.type === 'EMERGENCY') color = '#4CAF50';
            if (g.type === 'DEBT') color = '#F44336';
            if (g.type === 'PURCHASE') color = '#9C27B0';

            // --- SMART LOGIC ---
            let alertHtml = '';
            const today = new Date();
            const created = g.created_at ? new Date(g.created_at) : new Date(today.getFullYear(), 0, 1);
            const deadline = g.deadline ? new Date(g.deadline) : null;

            // 1. Inactivity Check
            let daysInactive = 0;
            if (g.recent_contributions && g.recent_contributions.length > 0) {
                const lastDate = new Date(g.recent_contributions[0].date); // sorted desc
                daysInactive = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));
            }

            // 2. Pace Check (On Track vs Behind)
            let paceStatus = '';
            let requiredMonthly = 0;

            if (deadline && percent < 100) {
                const totalDays = (deadline - created) / (1000 * 60 * 60 * 24);
                const passedDays = (today - created) / (1000 * 60 * 60 * 24);
                const expectedPct = (passedDays / totalDays) * 100;

                const monthsLeft = (deadline - today) / (1000 * 60 * 60 * 24 * 30);
                const remaining = g.target_amount - g.current_amount;

                if (monthsLeft > 0) {
                    requiredMonthly = remaining / monthsLeft;
                }

                if (passedDays > 0 && totalDays > 0) {
                    if (percent < (expectedPct * 0.8)) { // 20% buffer
                        paceStatus = 'BEHIND';
                    } else {
                        paceStatus = 'OK';
                    }
                }
            }

            // DETERMINE THE ALERT (Hierarchy of importance)
            // A. Finished
            if (percent >= 100) {
                alertHtml = `<div style="font-size: 0.75rem; color: #388E3C; margin-top: 5px;">🎉 ¡Completada! ¡Felicidades!</div>`;
            }
            // B. Almost (90%)
            else if (percent >= 90) {
                alertHtml = `<div style="font-size: 0.75rem; color: #1976D2; margin-top: 5px;">🚀 ¡Falta muy poco! Solo un empujón más.</div>`;
            }
            // C. Inactive (> 20 days)
            else if (daysInactive > 20) {
                alertHtml = `<div style="font-size: 0.75rem; color: #F57C00; margin-top: 5px;">💤 Llevas ${daysInactive} días sin abonar.</div>`;
            }
            // D. Behind Schedule
            else if (paceStatus === 'BEHIND') {
                alertHtml = `
                    <div style="font-size: 0.75rem; color: #D32F2F; margin-top: 5px;">
                        ⚠️ Vas atrasado. <b>Abona ${this.formatCurrency(requiredMonthly)}/mes</b> para llegar a tiempo.
                    </div>`;
            }
            // E. On Track
            else if (paceStatus === 'OK') {
                alertHtml = `<div style="font-size: 0.75rem; color: #388E3C; margin-top: 5px;">✅ Vas en línea. Sigue así.</div>`;
            }

            html += `
                <div class="card" style="padding: 1rem; border-left: 4px solid ${color};">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                        <strong style="font-size: 0.95rem;">${g.name}</strong>
                        <span style="font-size: 0.8rem; font-weight: 600; color: ${color};">${percent.toFixed(0)}%</span>
                    </div>
                    <div style="background: #eee; height: 6px; border-radius: 3px; overflow: hidden; margin-bottom: 0.5rem;">
                        <div style="width: ${percent}%; background: ${color}; height: 100%;"></div>
                    </div>
                    <div style="font-size: 0.8rem; color: #666; display: flex; justify-content: space-between;">
                        <span>${this.formatCurrency(g.current_amount)}</span>
                        <span>de ${this.formatCurrency(g.target_amount)}</span>
                    </div>
                    ${alertHtml}
                </div>
            `;
        });

        html += `</div></div>`;
        return html;
    }

    renderActionPlanHTML() {
        const plan = this.advisor.generateActionPlan(this.viewDate.getMonth(), this.viewDate.getFullYear());

        // Dynamic Styling based on Status
        let color = '#2E7D32'; // Green (OK)
        let bg = 'linear-gradient(135deg, #E8F5E9 0%, #FFFFFF 100%)';
        let icon = '📈';
        let accent = '#C8E6C9';

        if (plan.status === 'CRITICAL') {
            color = '#D32F2F'; // Red
            bg = 'linear-gradient(135deg, #FFEBEE 0%, #FFFFFF 100%)';
            icon = '🚨';
            accent = '#FFCDD2';
        } else if (plan.status === 'WARNING') {
            color = '#F57C00'; // Orange
            bg = 'linear-gradient(135deg, #FFF3E0 0%, #FFFFFF 100%)';
            icon = '⚠️';
            accent = '#FFE0B2';
        } else if (plan.status === 'ONBOARDING') {
            color = '#1976D2'; // Blue
            bg = 'linear-gradient(135deg, #E3F2FD 0%, #FFFFFF 100%)';
            icon = '👋';
            accent = '#BBDEFB';
        }

        const isDeepAnalysis = plan.diagnosis && plan.diagnosis.length > 5;

        return `
            <div class="card action-plan-card" style="margin-bottom: 2rem; border: 1px solid ${accent}; border-left: 6px solid ${color}; background: ${bg}; box-shadow: 0 4px 6px rgba(0,0,0,0.02);">
                
                <!-- HEADER -->
                <div class="card-header" style="margin-bottom: 1.5rem; border-bottom: 1px solid rgba(0,0,0,0.05); padding-bottom: 1rem;">
                    <div style="display: flex; align-items: center; gap: 0.8rem;">
                         <div style="font-size: 1.8rem;">${icon}</div>
                         <div>
                            <h4 style="color: ${color}; margin: 0; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 1px; font-weight: 700;">Diagnóstico Financiero (${this.viewDate.toLocaleString('es-CO', { month: 'long' })})</h4>
                            <h2 style="color: #2c3e50; margin: 0; font-size: 1.4rem; font-weight: 800;">${plan.priority}</h2>
                         </div>
                    </div>
                </div>
                
                <!-- CONTENT GRID -->
                <div style="display: grid; grid-template-columns: ${window.innerWidth < 768 || !isDeepAnalysis ? '1fr' : '1.2fr 1.8fr'}; gap: 2rem;">
                    
                    ${plan.status === 'ONBOARDING' ? `
                         <!-- ONBOARDING STATE -->
                         <div style="text-align: center; padding: 1rem;">
                            <p style="font-size: 1.1rem; color: #555; margin-bottom: 1.5rem;">${plan.adjustments[0]}</p>
                            <div style="display: flex; gap: 1rem; justify-content: center;">
                                <button class="btn btn-primary" onclick="document.querySelector('[data-view=transactions]').click()">Importar Extracto</button>
                                <button class="btn" style="background: white; border: 1px solid #ddd;" onclick="document.querySelector('[data-view=settings]').click()">Configurar Metas</button>
                            </div>
                         </div>
                    ` : `
                    
                    <!-- LEFT: THE WHY (Diagnosis) -->
                    <div style="display: flex; flex-direction: column;">
                        <h5 style="color: #555; font-size: 0.9rem; font-weight: 600; margin-bottom: 1rem;">🔎 ANÁLISIS DE CAUSA RAÍZ</h5>
                        <div style="background: rgba(255,255,255,0.7); padding: 1.5rem; border-radius: 12px; border: 1px solid rgba(0,0,0,0.05); flex: 1;">
                            <p style="font-size: 1.1rem; line-height: 1.6; color: #37474F; margin: 0;">
                                ${plan.diagnosis || "No hay suficientes datos para un diagnóstico profundo."}
                            </p>
                        </div>
                    </div>

                    <!-- RIGHT: THE HOW (Action Plan) -->
                    <div>
                        <h5 style="color: ${color}; font-size: 0.9rem; font-weight: 600; margin-bottom: 1rem;">🚀 PLAN DE ACCIÓN INMEDIATO</h5>
                        <div style="display: flex; flex-direction: column; gap: 0.8rem;">
                            ${plan.adjustments.map((step, index) => {
            if (typeof step === 'object' && step.type === 'AI_ANALYSIS_REQUIRED') {
                return `
                                        <div id="ai-advice-placeholder" style="background: #E3F2FD; padding: 1rem; border-radius: 10px; border: 1px dashed #2196F3; display: flex; gap: 1rem; align-items: center;">
                                            <div class="ai-spinner" style="font-size: 1.5rem;">🔮</div>
                                            <div style="color: #0D47A1; font-size: 0.95rem;">
                                                <b>Analizando tu caso...</b><br>
                                                <span style="font-size: 0.8rem; opacity: 0.8;">Tu Asesor IA está redactando una estrategia única para ti.</span>
                                            </div>
                                        </div>
                                    `;
            }
            return `
                                <div style="display: flex; gap: 1rem; align-items: flex-start; background: white; padding: 1rem; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                                    <div style="background: ${color}; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.8rem; flex-shrink: 0; margin-top: 2px;">${index + 1}</div>
                                    <div style="color: #444; font-size: 1rem; line-height: 1.4;">${step}</div>
                                </div>
                                `;
        }).join('')}
                        </div>
                    </div>
                    `}
                </div>
            </div>
        `;
    }

    renderRecentTransactionsHTML() {
        // Get last 5 transactions
        const txs = this.store.transactions
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 5);

        if (txs.length === 0) {
            return '<p class="text-secondary" style="text-align: center; padding: 1rem;">No hay transacciones recientes.</p>';
        }

        return txs.map(t => {
            const cat = this.store.categories.find(c => c.id === t.category_id) || { name: 'Otros', group: 'General' };
            const acc = this.store.accounts.find(a => a.id === t.account_id) || { name: 'Efectivo' };
            const isExpense = t.type === 'GASTO' || t.type === 'PAGO_DEUDA';
            const amountClass = isExpense ? 'negative' : 'positive';
            const sign = isExpense ? '-' : '+';

            // Icon mapping based on Category Name (Case insensitive partial match)
            let icon = 'shopping-bag'; // default
            const name = cat.name.toLowerCase();
            if (name.includes('aliment') || name.includes('mercado')) icon = 'shopping-cart';
            else if (name.includes('salud') || name.includes('medic')) icon = 'heart';
            else if (name.includes('deporte') || name.includes('gym')) icon = 'activity';
            else if (name.includes('transporte') || name.includes('uber') || name.includes('bus')) icon = 'truck';
            else if (name.includes('vivienda') || name.includes('hogar') || name.includes('servicios')) icon = 'home';
            else if (name.includes('ingreso') || name.includes('nomina') || name.includes('honorarios')) icon = 'briefcase';
            else if (name.includes('restaurante') || name.includes('ocio')) icon = 'coffee';
            else if (name.includes('alcohol') || name.includes('tabaco')) icon = 'wind';
            else if (name.includes('ropa') || name.includes('cuidado') || name.includes('cosmetico')) icon = 'smile';

            return `
                <div class="transaction-item">
                    <div class="tx-left">
                        <div class="tx-icon-wrapper">
                            <i data-feather="${icon}"></i>
                        </div>
                        <div class="tx-info">
                            <div class="tx-title">${t.note || cat.name}</div>
                            <div class="tx-meta">
                                <span>${cat.name}</span>
                                <span>•</span>
                                <span>${new Date(t.date).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}</span>
                            </div>
                        </div>
                    </div>
                    <div class="tx-right">
                        <span class="tx-amount ${amountClass}">${sign} ${this.formatCurrency(t.amount)}</span>
                        <div class="tx-account">${acc.name}</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    renderChart() {
        const ctx = document.getElementById('expensesChart');
        if (!ctx) return;

        // Filter by View Date
        const breakdown = this.store.getCategoryBreakdown(this.viewDate.getMonth(), this.viewDate.getFullYear());
        const labels = Object.keys(breakdown);
        const data = Object.values(breakdown);

        if (this.currentChart) this.currentChart.destroy();

        if (data.length === 0) {
            ctx.parentNode.innerHTML += '<p class="text-secondary" style="text-align:center;">Sin datos de gastos.</p>';
            return;
        }

        if (typeof Chart !== 'undefined') {
            const total = data.reduce((sum, val) => sum + val, 0);

            this.currentChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: labels,
                    datasets: [{
                        data: data,
                        backgroundColor: ['#E91E63', '#9C27B0', '#2196F3', '#00BCD4', '#4CAF50', '#FFC107', '#FF5722', '#795548', '#607D8B'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'right',
                            labels: {
                                generateLabels: (chart) => {
                                    const dataset = chart.data.datasets[0];
                                    return chart.data.labels.map((label, i) => {
                                        const value = dataset.data[i];
                                        const pct = total > 0 ? Math.round((value / total) * 100) : 0;
                                        return {
                                            text: `${label} (${pct}%)`,
                                            fillStyle: dataset.backgroundColor[i],
                                            strokeStyle: 'transparent',
                                            hidden: false,
                                            index: i
                                        };
                                    });
                                },
                                font: { size: 11 },
                                padding: 8
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: (context) => {
                                    const value = context.raw;
                                    const pct = total > 0 ? Math.round((value / total) * 100) : 0;
                                    return ` $${value.toLocaleString('es-CO')} (${pct}%)`;
                                }
                            }
                        }
                    }
                }
            });
        } else {
            ctx.parentNode.innerHTML += '<p class="text-danger">Error: No se pudo cargar el gráfico (Chart.js no disponible via CDN).</p>';
        }
    }

    renderTransactions() {
        this.pageTitle.textContent = 'Mis Movimientos';
        // Ensure we use the getter to retrieve sorted transactions
        const txs = this.store.getAllTransactions ? this.store.getAllTransactions() : this.store.data.transactions;
        const categories = this.store.data.categories || [];

        let html = `
            <div style="display: flex; justify-content: flex-end; gap: 1rem; margin-bottom: 1rem;">
                <button id="btn-reset-data" class="btn" style="background: #ff5252; color: white; display: flex; align-items: center; gap: 0.5rem;">
                    <i data-feather="trash-2"></i> Iniciar de Cero
                </button>
                
                <input type="file" id="import-file" accept=".csv,.txt,.pdf,.jpg,.jpeg,.png" style="display: none;" />
                <button class="btn" style="background: #2E7D32; color: white; display: flex; align-items: center; gap: 0.5rem;" onclick="document.getElementById('import-file').click()">
                    <i data-feather="camera"></i> Escanear / Importar
                </button>
            </div>

            <div class="card">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="text-align: left; border-bottom: 1px solid #eee;">
                            <th style="padding: 1rem;">Fecha</th>
                            <th style="padding: 1rem;">Categoría</th>
                            <th style="padding: 1rem;">Monto</th>
                            <th style="padding: 1rem;">Nota</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        if (txs.length === 0) {
            html += `<tr><td colspan="4" style="padding: 0; border: none;">
                <div style="text-align: center; padding: 3rem 1.5rem;">
                    <div style="font-size: 3rem; margin-bottom: 12px;">📝</div>
                    <h3 style="margin: 0 0 8px; color: #333;">Tu historial está vacío</h3>
                    <p style="color: #888; margin: 0 0 16px; font-size: 0.9rem; line-height: 1.5;">Tienes 3 formas de agregar movimientos:</p>
                    <div style="display: flex; flex-direction: column; gap: 8px; max-width: 280px; margin: 0 auto; text-align: left;">
                        <div style="display: flex; align-items: center; gap: 8px; color: #555; font-size: 0.85rem;">
                            <span style="font-size: 1.2rem;">📷</span> <strong>Escanear</strong> un recibo con la cámara
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px; color: #555; font-size: 0.85rem;">
                            <span style="font-size: 1.2rem;">📄</span> <strong>Importar</strong> un extracto bancario (PDF/CSV)
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px; color: #555; font-size: 0.85rem;">
                            <span style="font-size: 1.2rem;">✍️</span> <strong>Manual:</strong> toca "+ Nuevo Movimiento" arriba
                        </div>
                    </div>
                </div>
            </td></tr>`;
        } else {
            txs.forEach(t => {
                const currentCatId = t.category_id;

                // Build Category Options
                let catOptions = '';
                categories.forEach(c => {
                    const selected = c.id === currentCatId ? 'selected' : '';
                    catOptions += `<option value="${c.id}" ${selected}>${c.name}</option>`;
                });

                html += `
                    <tr style="border-bottom: 1px solid #f5f5f5;">
                        <td style="padding: 1rem;">${t.date}</td>
                        <td style="padding: 1rem;">
                            <select onchange="window.ui.updateTransactionCategory('${t.id}', this.value)" style="padding: 0.4rem; border-radius: 6px; border: 1px solid #ddd; width: 100%;">
                                ${catOptions}
                            </select>
                        </td>
                        <td style="padding: 1rem; font-weight: 600; color: ${t.type === 'INGRESO' ? '#2E7D32' : '#333'};">
                            ${this.formatCurrency(t.amount)}
                        </td>
                        <td style="padding: 1rem; color: #666; font-size: 0.9rem;">${t.note || t.type}</td>
                        <td style="padding: 1rem; text-align: right;">
                             <button class="btn-text edit-tx-btn" data-id="${t.id}" style="color: #2196F3; margin-right: 0.5rem;" title="Editar">
                                <i data-feather="edit-2" style="width:16px;"></i>
                             </button>
                             <button class="btn-text delete-tx-btn" data-id="${t.id}" style="color: #999;" title="Borrar">
                                <i data-feather="trash-2" style="width:16px;"></i>
                             </button>
                        </td>
                    </tr>
                `;
            });
        }

        html += `</tbody></table></div>`;
        this.container.innerHTML = html;
        if (window.feather) window.feather.replace();

        // Delete Logic
        document.querySelectorAll('.delete-tx-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (confirm('¿Eliminar este movimiento permanentemente?')) {
                    const id = e.target.closest('button').dataset.id;
                    this.store.deleteTransaction(id);
                    this.renderTransactions();
                }
            });
        });

        // Edit Logic
        document.querySelectorAll('.edit-tx-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.closest('button').dataset.id;
                this.openEditTransactionModal(id);
            });
        });

        // Attach Listeners
        const fileInput = document.getElementById('import-file');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => this.handleFileImport(e));
        }

        const resetBtn = document.getElementById('btn-reset-data');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                const choice = confirm("⚠️ ¿Quieres borrar TODO y empezar de cero?\n\n• OK = Borrar TODO (movimientos, presupuestos, gastos fijos, metas)\n• Cancelar = No borrar nada");

                if (choice) {
                    // Double confirm for full reset
                    if (confirm("🚨 ÚLTIMA CONFIRMACIÓN\n\nEsto borrará:\n✖ Todos los movimientos\n✖ Presupuestos\n✖ Gastos fijos\n✖ Ingresos recurrentes\n✖ Metas\n✖ Caché de IA\n\n(Tu API Key se conservará)\n\n¿Continuar?")) {
                        // Save API key before wiping
                        const apiKey = this.store.config.gemini_api_key || '';
                        const provider = this.store.config.ai_provider || 'gemini';

                        // Nuclear reset
                        localStorage.clear();

                        // Restore API key
                        if (apiKey) {
                            const freshStore = { config: { gemini_api_key: apiKey, ai_provider: provider } };
                            localStorage.setItem('clarity_cash_data', JSON.stringify(freshStore));
                        }

                        alert("✅ Todo limpio. La app se recargará ahora.");
                        location.reload();
                    }
                }
            });
        }
    }

    openEditTransactionModal(id) {
        const tx = this.store.data.transactions.find(t => t.id === id);
        if (!tx) return;

        const modal = document.getElementById('transaction-modal');
        if (!modal) return;

        modal.classList.remove('hidden');

        // Change Title
        const title = modal.querySelector('h3');
        if (title) title.textContent = 'Editar Movimiento ✏️';

        // Populate Form
        const form = document.getElementById('transaction-form');

        // Remove previous hidden ID if any
        let hiddenId = form.querySelector('input[name="edit_tx_id"]');
        if (!hiddenId) {
            hiddenId = document.createElement('input');
            hiddenId.type = 'hidden';
            hiddenId.name = 'edit_tx_id';
            form.appendChild(hiddenId);
        }
        hiddenId.value = tx.id;

        // Populate fields
        form.querySelector('[name="type"]').value = tx.type;
        form.querySelector('[name="amount"]').value = tx.amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        form.querySelector('[name="date"]').value = tx.date;
        form.querySelector('[name="account_id"]').value = tx.account_id;
        form.querySelector('[name="note"]').value = tx.note || '';

        // Trigger updates for dynamic category select
        const typeSelect = form.querySelector('[name="type"]');
        typeSelect.dispatchEvent(new Event('change'));

        // Set Category
        setTimeout(() => {
            form.querySelector('[name="category_id"]').value = tx.category_id;
        }, 50); // Small delay to let toggleTransactionType run

        // Change submit text
        const btn = form.querySelector('button[type="submit"]');
        btn.innerHTML = '💾 Guardar Cambios';
    }

    async updateTransactionCategory(id, newCatId) {
        const tx = this.store.data.transactions.find(t => t.id === id);
        if (tx) {
            console.log(`Updating transaction ${id} category to ${newCatId}`);

            // Auto-detect correct type for this category
            // This fixes imports where expenses might be misclassified as income
            const newCat = this.store.categories.find(c => c.id === newCatId);
            let newType = tx.type;

            if (newCat) {
                if (newCat.group === 'INGRESOS') newType = 'INGRESO';
                else if (newCat.id === 'cat_5') newType = 'AHORRO';
                else if (newCat.id === 'cat_6') newType = 'INVERSION';
                else if (newCat.id === 'cat_7' || newCat.id === 'cat_fin_4') newType = 'PAGO_DEUDA';
                else newType = 'GASTO'; // Default to GASTO for Needs, Lifestyle, etc.
            }

            const updates = { category_id: newCatId };
            // Only update type if it actually changed, to trigger balance updates
            if (newType !== tx.type) {
                updates.type = newType;
                console.log(`🔄 Auto-correcting type: ${tx.type} -> ${newType}`);
            }

            this.store.updateTransaction(id, updates);
            this.render(); // Re-render table to show new color (Green/Red)

            // Visual feedback
            const toast = document.createElement('div');
            toast.textContent = "Categoría guardada ✅";
            toast.style.position = 'fixed';
            toast.style.bottom = '20px';
            toast.style.right = '20px';
            toast.style.background = '#2E7D32';
            toast.style.color = '#fff';
            toast.style.padding = '12px 24px';
            toast.style.borderRadius = '30px';
            toast.style.zIndex = '1000';
            toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
            toast.style.fontWeight = '500';
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 2000);
        } else {
            console.error(`Transaction ${id} not found! Likely duplicate ID issue from old import.`);
            alert('Error: No se encontró la transacción. Por favor borra los datos y vuelve a importar el extracto para corregir los IDs.');
        }
    }

    openScanConfirmation(data) {
        // Open Modal
        const txModal = document.getElementById('transaction-modal');
        const form = document.getElementById('transaction-form');
        this.populateSelects('GASTO'); // Assume Gasto for receipt
        txModal.classList.remove('hidden');

        // Reset previous form data
        form.reset();

        // 1. DATE
        if (data.date) {
            form.querySelector('input[name="date"]').value = data.date;
        } else {
            form.querySelector('input[name="date"]').value = new Date().toISOString().split('T')[0];
        }

        // 2. AMOUNT
        if (data.amount) {
            // SANITY CHECK: If amount > 5.000.000, probably a barcode or NIT
            if (data.amount > 5000000) {
                alert(`⚠️ ATENCIÓN: Detecté un monto inusualmente alto ($${new Intl.NumberFormat('es-CO').format(data.amount)}).\n\nProbablemente leí un código de barras, teléfono o NIT por error. Por favor verifica antes de guardar.`);
                // Don't autofill insane amount to prevent accidental saving
                form.querySelector('input[name="amount"]').value = '';
                form.querySelector('input[name="amount"]').placeholder = 'Ingresa el valor real';
                // Focus on amount for correction
                setTimeout(() => form.querySelector('input[name="amount"]').focus(), 500);
            } else {
                // Normal Format (COP style: 1.000)
                const fmt = new Intl.NumberFormat('es-CO').format(data.amount);
                form.querySelector('input[name="amount"]').value = fmt;
            }
        }

        // 3. CATEGORY (Smart Match)
        if (data.category) {
            const search = data.category.toLowerCase();
            const cat = this.store.categories.find(c =>
                c.name.toLowerCase().includes(search) ||
                c.group.toLowerCase().includes(search)
            );
            if (cat) {
                form.querySelector('select[name="category_id"]').value = cat.id;
            }
        }

        // 4. NOTE (Merchant + Items)
        let note = '';
        if (data.merchant) note += `[${data.merchant}] `;
        if (data.note) note += data.note;
        form.querySelector('input[name="note"]').value = note;

        // Visual Feedback
        const title = txModal.querySelector('h3');
        const originalTitle = title.textContent;
        title.innerHTML = '🧾 Recibo Escaneado <span style="font-size:0.6em;color:#2E7D32;">(Verifica los datos)</span>';

        // Restore title on close? Not strictly necessary as it resets next open
    }

    async handleFileImport(event) {
        const file = event.target.files[0];
        if (!file) return;

        // IMAGE Handling (Receipt Scanning)
        if (file.type.startsWith('image/')) {
            // Visual Loading Indicator
            const loading = document.createElement('div');
            loading.innerHTML = '📷 <b>Analizando recibo con IA...</b><br><span style="font-size:0.8em">Consultando a tu asistente inteligente...</span>';
            loading.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.85);color:white;padding:25px;border-radius:12px;z-index:9999;text-align:center;box-shadow:0 4px 15px rgba(0,0,0,0.3);';
            document.body.appendChild(loading);

            const reader = new FileReader();
            reader.readAsDataURL(file); // Base64
            reader.onload = async () => {
                try {
                    const base64 = reader.result.split(',')[1];
                    // Call Gemini Vision
                    const data = await this.aiAdvisor.scanReceipt(base64);
                    loading.remove();
                    this.openScanConfirmation(data);
                } catch (err) {
                    loading.remove();
                    console.error(err);
                    alert('❌ Error analizando recibo:\n' + err.message + '\n\nAsegúrate de tener luz y que la imagen sea clara.');
                }
            };
            return;
        }

        // PDF Handling
        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
            this.parsePDF(file);
            return;
        }

        // CSV/Text Handling
        const reader = new FileReader();
        reader.onload = (e) => this.parseCSV(e.target.result);
        reader.readAsText(file);
    }

    async parsePDF(file) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const typedarea = new Uint8Array(arrayBuffer);

            // Use loadingTask to handle passwords
            const loadingTask = pdfjsLib.getDocument({ data: typedarea });

            loadingTask.onPassword = (updatePassword, reason) => {
                let reasonText = "";
                if (reason === 1) reasonText = " (Contraseña incorrecta)";

                const password = prompt(`🔒 Este extracto está protegido${reasonText}.\n\nPor seguridad, los bancos suelen poner tu cédula o una clave.\n\nIngrésala aquí para leer el archivo:`);

                if (password) {
                    updatePassword(password);
                } else {
                    // User cancelled
                    loadingTask.destroy();
                }
            };

            const pdf = await loadingTask.promise;
            let fullText = '';

            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(item => item.str).join('  ');
                fullText += pageText + '\n';
            }

            // HYBRID INTELLIGENCE: Single Page PDF Receipt -> Try AI First
            if (pdf.numPages === 1 && fullText.length < 3000) {
                // Show AI Loading
                const loading = document.createElement('div');
                loading.id = 'ai-pdf-loading';
                loading.innerHTML = '🤖 <b>Analizando PDF con IA...</b><br><span style="font-size:0.8em">Descifrando datos del documento...</span>';
                loading.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.85);color:white;padding:25px;border-radius:12px;z-index:9999;text-align:center;box-shadow:0 4px 15px rgba(0,0,0,0.3);';
                document.body.appendChild(loading);

                // Convert to Base64 for Gemini
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = async () => {
                    try {
                        const base64 = reader.result.split(',')[1];
                        const data = await this.aiAdvisor.scanReceipt(base64, 'application/pdf');

                        if (document.getElementById('ai-pdf-loading')) document.getElementById('ai-pdf-loading').remove();
                        this.openScanConfirmation(data);
                    } catch (err) {
                        console.warn("AI PDF Scan failed, fallback to local regex:", err);
                        if (document.getElementById('ai-pdf-loading')) document.getElementById('ai-pdf-loading').remove();

                        // Fallback to local regex (Extracto Bancario logic)
                        this.processExtractedText(fullText);
                    }
                };
                return;
            }

            this.processExtractedText(fullText);
        } catch (err) {
            console.error("PDF Error:", err);

            // Specific handling for Password Exception (name can vary by version)
            if (err.name === 'PasswordException' || err.message.toLowerCase().includes('password')) {
                alert("❌ No se pudo abrir el PDF: Se requiere contraseña correcta.");
            } else {
                alert(`❌ Error técnico leyendo el PDF: "${err.message}"\n\nIntenta abrir el PDF en tu navegador para verificar que funciona.`);
            }
        }
    }

    parseCSV(text) {
        this.processExtractedText(text);
    }

    processExtractedText(text) {
        // AI Logic: Global Column Extraction (Robust to PDF Layouts)

        // 1. DATES: Find all valid transaction dates
        // Formats: "20 ENE 2026", "20/01/2026", "20-Ene-26", "20Ene2026"
        // Improved Regex: Matches DD then Month then Year
        const dateRegex = /\b(\d{1,2})[\/\-\.\s]?(ENE|JAN|FEB|MAR|ABR|APR|MAY|JUN|JUL|AGO|AUG|SEP|OCT|NOV|DIC|DEC)[A-Za-z]*[\/\-\.\s]?(\d{2,4})\b|\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})\b/gi;

        const allDates = [...text.matchAll(dateRegex)].map(m => m[0]);

        // 2. AMOUNTS: Find all strictly formatted money values
        // Must have at least one separator (. or ,) to avoid picking up Years (2025) or IDs (89012)
        // Or be preceded by $ symbol.
        // Rejects: "2025", "1", "30"
        // Accepts: "1.000", "1,000", "1.250,50", "$ 5000", "$5000"
        const amountRegex = /(?:\$ ?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{0,2})?)|(?:\b\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{0,2})?\b)|(?:\b\d{1,3}[.,]\d{2}\b)/g;

        // We also want to capture simple high numbers if they are clearly cost? No, risky.
        // Let's stick to formatted amounts OR $ prefixed.

        const allAmountsRaw = [...text.matchAll(amountRegex)].map(m => m[0]);

        // Filter Amounts: Remove likely false positives (Years like 2024, 2025, 2026 often appear in headers)
        // If a number is exactly a recent year (2020-2030) and has no decimals, skip it.
        const validAmounts = allAmountsRaw.filter(a => {
            const val = parseFloat(a.replace(/[^0-9]/g, ''));
            // Filter Year-like integers if they don't have currency symbol
            if (!a.includes('$') && val >= 2000 && val <= 2030 && !a.includes(',') && !a.includes('.')) return false;
            return true;
        });

        if (allDates.length === 0 || validAmounts.length === 0) {
            alert(`❌ No encontramos fechas o montos claros.\n\nTexto muestra: "${text.substring(0, 100)}..."`);
            return;
        }

        // 3. BLOCK LOGIC (Context-Aware)

        let sampleDesc = "";
        let debugBlock = ""; // For user feedback

        const dateMatches = [...text.matchAll(dateRegex)];
        const rawEntries = [];

        for (let i = 0; i < dateMatches.length; i++) {
            const currentMatch = dateMatches[i];
            const nextMatch = dateMatches[i + 1];

            const startIdx = currentMatch.index;
            // Cap block length to avoid capturing unrelated junk
            const endIdx = nextMatch ? nextMatch.index : Math.min(text.length, startIdx + 400);

            // Extract the "Block" for this transaction
            const block = text.substring(startIdx, endIdx);
            if (i === 0) debugBlock = block.substring(0, 100); // Capture sample for debugging

            const dateStr = currentMatch[0];

            // Find Amount in this block
            const amountMatches = block.match(amountRegex);
            let amountStr = null;
            let desc = "";

            if (amountMatches) {
                // Filter valid amounts (money)
                const validBlockAmounts = amountMatches.filter(a => {
                    const val = parseFloat(a.replace(/[^0-9]/g, ''));
                    // Ignore years (2025) unless they have currency symbol
                    if (!a.includes('$') && val >= 2000 && val <= 2030 && !a.includes(',') && !a.includes('.')) return false;
                    return true;
                });

                if (validBlockAmounts.length > 0) {
                    amountStr = validBlockAmounts[0];

                    // STRATEGY A: Description matches text *between* Date and Amount
                    // STRATEGY B: Description matches text *after* Amount

                    const dateIdxInBlock = block.indexOf(dateStr);
                    const amountIdxInBlock = block.indexOf(amountStr);

                    // 1. Try Between
                    if (amountIdxInBlock > dateIdxInBlock) {
                        const between = block.substring(dateIdxInBlock + dateStr.length, amountIdxInBlock).trim();
                        // If 'between' is substantial (e.g. > 3 chars and contains letters), use it.
                        if (between.length > 3 && /[a-zA-Z]/.test(between)) {
                            desc = between;
                        } else {
                            // 2. Try After (Date ... Amount ... Description)
                            // This handles columns like: DATE | AMOUNT | DESC
                            const after = block.substring(amountIdxInBlock + amountStr.length).trim();
                            desc = after;
                        }
                    } else {
                        // Amount is BEFORE Date? Unusual but possible in some layouts.
                        // Try remaining text.
                        desc = block.replace(dateStr, '').replace(amountStr, '');
                    }

                    // CLEANUP DESCRIPTION
                    // 1. Remove Newlines & Punctuation
                    desc = desc.replace(/[\r\n]+/g, ' ')
                        .replace(/[\*\-\_\$]/g, ' ') // Keep dots/commas as they might be part of merchant names? No, usually valid to remove in statements.
                        .replace(/[0-9]{4,}/g, '') // Remove long numbers (IDs)
                        .replace(/\s+/g, ' ').trim();

                    // 2. Remove the Amount itself if it leaked into Description (e.g. "ZONA PAGO 400 000")
                    // We try to match "400 000" or "400.000" somewhat loosely
                    let rawAmountNums = amountStr.replace(/[^0-9]/g, ''); // "400000"

                    // Try to remove exact sequence
                    if (rawAmountNums.length >= 4) {
                        // Loose regex: digit, optional char, digit...
                        // This is hard. Let's just remove the exact string `amountStr` and variations
                        desc = desc.replace(amountStr, '').trim();
                        // Also remove "400 000" style
                        // If we really want to fix "436 438", we need a fuzzy match?
                        // Let's just remove any sequence of digits that looks like the amount
                    }

                    // 3. Simple cleanup
                    if (desc.length < 3) desc = "Movimiento Bancario";
                }
            }

            if (amountStr) {
                if (i === 0) sampleDesc = desc;
                rawEntries.push({
                    dateStr: dateStr,
                    amountStr: amountStr,
                    desc: desc
                });
            }
        }

        // ... (Date Filtering Code remains same) ...

        // 4. FIND MAX DATE & FILTER OLD ONES
        // First, parse all dates to objects
        const parsedEntries = rawEntries.map(e => {
            let processedDate = e.dateStr.toUpperCase();
            // Simple clean, keep letters/nums

            let finalDateStr = '';
            let finalDateObj = null;

            // Regex for cleaned date (Day Month Year)
            // Matches "30ENE2026" or "30 ENE 2026" or "30/ENE/2026"
            const dateMatch = processedDate.match(/(\d{1,2})[\/\-\.\s]?([A-Z]{3,})[\/\-\.\s]?(\d{2,4})/);

            if (dateMatch) {
                const day = dateMatch[1].padStart(2, '0');
                const mStr = dateMatch[2].substring(0, 3);
                let yStr = dateMatch[3];
                if (yStr.length === 2) yStr = '20' + yStr;

                const months = { 'ENE': '01', 'JAN': '01', 'FEB': '02', 'MAR': '03', 'ABR': '04', 'APR': '04', 'MAY': '05', 'JUN': '06', 'JUL': '07', 'AGO': '08', 'AUG': '08', 'SEP': '09', 'OCT': '10', 'NOV': '11', 'DIC': '12', 'DEC': '12' };

                if (months[mStr]) {
                    finalDateStr = `${yStr}-${months[mStr]}-${day}`;
                    finalDateObj = new Date(finalDateStr);
                }
            } else if (e.dateStr.includes('/')) {
                const dParts = e.dateStr.split('/');
                if (dParts.length === 3) {
                    // Check if part 0 is year or day
                    if (dParts[0].length === 4) {
                        finalDateStr = `${dParts[0]}-${dParts[1].padStart(2, '0')}-${dParts[2].padStart(2, '0')}`;
                    } else {
                        finalDateStr = `${dParts[2]}-${dParts[1].padStart(2, '0')}-${dParts[0].padStart(2, '0')}`;
                    }
                    if (finalDateStr.length === 10) finalDateObj = new Date(finalDateStr);
                }
            }

            return { ...e, dateObj: finalDateObj, dateIso: finalDateStr };
        }).filter(e => e.dateObj && !isNaN(e.dateObj));

        if (parsedEntries.length === 0) {
            alert("❌ No pudimos procesar fechas válidas.");
            return;
        }

        const maxTime = Math.max(...parsedEntries.map(e => e.dateObj.getTime()));
        const maxDate = new Date(maxTime);

        // STRICT FILTER: Only allow transactions within 45 days of the latest date
        // This removes "Movimientos meses anteriores" (Installment history) often present in statements
        // Assumes a standard 30-day billing cycle + 15 days buffer
        const CUTOFF_DAYS = 45;

        // UNIQUE SET for Deduplication
        const uniqueSignatures = new Set();

        const validEntries = parsedEntries.filter(e => {
            // 1. Date Filter (Relative to the LATEST date in the doc, not today)
            const diffTime = (maxDate - e.dateObj); // Positive result
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            // Reject future dates (parsing errors) or too old (historical context)
            if (diffDays < -5) return false; // Date is > 5 days ahead of max? Fishy.
            if (diffDays > CUTOFF_DAYS) return false;

            // 2. Amount Filter (Noise Reduction)
            let aVal = parseFloat(e.amountStr.replace(/[^0-9\.,]/g, '').replace(/\./g, '').replace(',', '.'));
            if (isNaN(aVal)) return false;

            if (aVal < 50) return false; // Too small noise
            if (aVal > 2000 && aVal < 2035 && Number.isInteger(aVal)) return false; // Likely a Year (2025)

            // 3. Deduplication (Weak)
            // Signature: Date + Amount + ShortDesc
            // This allows "Uber $10" and "Rappi $10" on same day, but filters exact duplicates (shadow text)
            const cleanDescSnippet = e.desc.substring(0, 5).replace(/[^a-zA-Z]/g, '');
            const sig = `${e.dateIso}|${Math.round(aVal)}|${cleanDescSnippet}`;

            if (uniqueSignatures.has(sig)) return false;
            uniqueSignatures.add(sig);

            return true;
        });

        let imported = 0;
        validEntries.forEach(entry => {
            // PARSE AMOUNT
            let aStr = entry.amountStr.replace('$', '').replace(/\s/g, '').trim();
            let amount = 0;
            const commas = (aStr.match(/,/g) || []).length;
            const dots = (aStr.match(/\./g) || []).length;
            if (dots > 0 && commas > 0) {
                if (aStr.lastIndexOf(',') > aStr.lastIndexOf('.')) { // 1.000,00
                    amount = parseFloat(aStr.replace(/\./g, '').replace(',', '.'));
                } else { // 1,000.00
                    amount = parseFloat(aStr.replace(/,/g, ''));
                }
            } else if (dots > 0) {
                amount = parseFloat(aStr.replace(/\./g, ''));
            } else if (commas > 0) {
                if (aStr.match(/,\d{2}$/)) {
                    amount = parseFloat(aStr.replace(',', '.'));
                } else {
                    amount = parseFloat(aStr.replace(/,/g, ''));
                }
            } else {
                amount = parseFloat(aStr);
            }
            if (isNaN(amount) || amount === 0) return;

            // CLEANUP DESCRIPTION
            // Remove common noise
            let cleanDesc = entry.desc.replace(/[\r\n]+/g, ' ')
                .replace(/[\*\-\_\$]/g, ' ')
                .replace(/[0-9]{5,}/g, '') // Remove long IDs
                .replace(/\b(GASTO|COMPRA|PAGO|ABONO)\b/gi, '') // Remove generic words
                .replace(/\s+/g, ' ').trim();

            if (cleanDesc.length < 3) cleanDesc = "Movimiento Bancario";

            // 5. Predict Category
            const catId = this.predictCategory(cleanDesc);
            let type = 'GASTO';
            if (entry.desc.toUpperCase().includes('PAGO') || entry.desc.toUpperCase().includes('ABONO')) type = 'PAGO_DEUDA';

            this.store.addTransaction({
                type: type, // Default
                amount: Math.abs(amount),
                date: entry.dateIso,
                category_id: catId,
                account_id: 'acc_2',
                note: cleanDesc.substring(0, 50)
            });
            imported++;
        });

        if (imported > 0) {
            alert(`✅ Éxito IA: Se importaron ${imported} movimientos de tu extracto.\n\nMuestra:\nFecha: ${validEntries[0].dateStr}\nDesc: "${validEntries[0].desc}"\nMonto: ${validEntries[0].amountStr}\n\nRevisa la tabla Historial.`);
            this.render();
        } else {

            alert("⚠️ No se pudieron confirmar transacciones válidas.");
        }
    }

    predictCategory(desc) {
        const d = desc.toLowerCase();

        // 0. Financiero (Intereses / Manejo)
        if (d.includes('interes') || d.includes('manejo') || d.includes('cuota admin') || d.includes('gmf') || d.includes('4x1000') || d.includes('gravamen') || d.includes('seguro de vida') || d.includes('comision')) return 'cat_fin_int';

        // 1. Ocio / Subs
        if (d.includes('netflix') || d.includes('spotify') || d.includes('youtube') || d.includes('apple') || d.includes('hbo') || d.includes('disney')) return 'cat_subs';
        if (d.includes('cine') || d.includes('entradas') || d.includes('bar') || d.includes('discoteca') || d.includes('teatro')) return 'cat_9';

        // 2. Comida / Restaurantes / Mercado
        if (d.includes('rappi') || d.includes('uber eats') || d.includes('domicilio') || d.includes('ifood') || d.includes('pizza') || d.includes('burger')) return 'cat_rest';
        if (d.includes('exito') || d.includes('jumbo') || d.includes('carulla') || d.includes('d1') || d.includes('ara') || d.includes('mercado') || d.includes('olimpica')) return 'cat_2';
        if (d.includes('restaurante') || d.includes('wok') || d.includes('crepes') || d.includes('el corral') || d.includes('mcdonalds') || d.includes('kfc')) return 'cat_rest';
        if (d.includes('starbucks') || d.includes('tostao') || d.includes('juan valdez') || d.includes('oma') || d.includes('cafe')) return 'cat_ant';

        // 2.5 Vicios (Alcohol / Tabaco)
        if (d.includes('licor') || d.includes('cerveza') || d.includes('vino') || d.includes('aguardiente') || d.includes('ron') || d.includes('cigarrillo') || d.includes('tabaco') || d.includes('vape') || d.includes('iqos') || d.includes('coltabaco') || d.includes('dislicores')) return 'cat_vicios';

        // 2.6 Ropa / Cuidado Personal
        if (d.includes('zara') || d.includes('h&m') || d.includes('bershka') || d.includes('pull&bear') || d.includes('stradivarius') || d.includes('koaj') || d.includes('arturo calle') || d.includes('studio f') || d.includes('ela') || d.includes('mattelsa') || d.includes('falabella') || d.includes('adidas') || d.includes('nike')) return 'cat_personal';
        if (d.includes('peluqueria') || d.includes('barberia') || d.includes('spa') || d.includes('uñas') || d.includes('nails') || d.includes('cosmetico') || d.includes('maquillaje') || d.includes('cromantic') || d.includes('blind') || d.includes('sephora') || d.includes('fedco')) return 'cat_personal';

        // 2.7 Deporte / Gym
        if (d.includes('smartfit') || d.includes('bodytech') || d.includes('stark') || d.includes('gym') || d.includes('gimnasio') || d.includes('crossfit') || d.includes('fitness') || d.includes('cancha') || d.includes('entrenamiento') || d.includes('decathlon') || d.includes('sport')) return 'cat_deporte';

        // 3. Transporte
        if (d.includes('uber') || d.includes('didi') || d.includes('cabify') || d.includes('taxi') || d.includes('peaje') || d.includes('gasolina') || d.includes('terpel') || d.includes('primax') || d.includes('parqueadero')) return 'cat_3';

        // 4. Servicios / Vivienda
        if (d.includes('codensa') || d.includes('enel') || d.includes('acueducto') || d.includes('gas') || d.includes('administracion') || d.includes('arriendo') || d.includes('claro') || d.includes('movistar') || d.includes('tigo') || d.includes('etb')) return 'cat_1';

        // 5. Salud
        if (d.includes('farma') || d.includes('cruz verde') || d.includes('medicina') || d.includes('doctor') || d.includes('eps') || d.includes('colsanitas')) return 'cat_4';

        // Default
        return 'cat_10'; // Otros
    }

    renderInsightsPage() {
        this.pageTitle.textContent = 'Análisis de tus Finanzas 🔍';

        // 1. CHART SECTION
        let html = `
            <div class="card" style="margin-bottom: 2rem;">
                <h3>Evolución Financiera (6 Meses) 📈</h3>
                <div style="height: 300px; position: relative;">
                    <canvas id="trendChart"></canvas>
                </div>
            </div>
            
            <div style="max-width: 800px; margin: 0 auto;">
                <h3 style="margin-bottom: 1rem;">Diagnóstico Mensual 🩺</h3>
        `;

        const insights = this.advisor.analyze(this.viewDate.getMonth(), this.viewDate.getFullYear());

        if (insights.length === 0) {
            html += `
                <div style="text-align: center; padding: 2rem 1.5rem;">
                    <div style="font-size: 2.5rem; margin-bottom: 10px;">🔍</div>
                    <h3 style="margin: 0 0 8px; color: #333;">Aún no hay suficientes datos</h3>
                    <p style="color: #888; margin: 0; font-size: 0.9rem; line-height: 1.5;">Registra al menos <strong>5 movimientos</strong> (ingresos y gastos) para que la IA pueda analizar tus patrones financieros y darte un diagnóstico completo.</p>
                </div>
            `;
        } else {
            insights.forEach(i => {
                try {
                    const potentialHtml = i.savingsPotential
                        ? `<div class="insight-potential">Potencial ahorro: ${this.formatCurrency(i.savingsPotential)}/mes</div>`
                        : '';

                    // Map advisor type to severity (advisor returns: critical, warning, info)
                    const severityMap = { 'critical': 'HIGH', 'warning': 'MEDIUM', 'info': 'LOW' };
                    const severity = severityMap[i.type] || i.severity || 'INFO';

                    // Color mapping
                    const colors = {
                        'HIGH': '#F44336',
                        'MEDIUM': '#FF9800',
                        'LOW': '#4CAF50',
                        'INFO': '#2196F3'
                    };
                    const color = colors[severity] || '#666';

                    // Icon mapping
                    const icons = {
                        'HIGH': 'alert-circle',
                        'MEDIUM': 'alert-triangle',
                        'LOW': 'check-circle',
                        'INFO': 'info'
                    };
                    const icon = icons[severity] || 'info';

                    // Use message or description (advisor uses 'message')
                    const desc = i.description || i.message || '';
                    const rec = i.recommendation || '';

                    html += `
                        <div class="insight-card severity-${severity.toLowerCase()}">
                            <div class="insight-header">
                                <span class="insight-title" style="color:${color}; display:flex; align-items:center; gap:0.5rem;">
                                    <i data-feather="${icon}"></i> ${i.title || 'Insight'}
                                </span>
                                <span class="badge" style="background:${color}20; color:${color}">${i.type || ''}</span>
                            </div>
                            <p class="insight-desc">${desc}</p>
                            ${potentialHtml}
                            ${rec ? `<div class="insight-action">
                                 💡 <strong>Recomendación:</strong> ${rec}
                            </div>` : ''}
                        </div>
                    `;
                } catch (err) {
                    console.error('Error rendering insight:', err, i);
                }
            });
        }

        html += '</div>'; // Close max-width container

        // --- AI ADVISOR SECTION (Gemini / ChatGPT) ---
        const hasKey = this.aiAdvisor && this.aiAdvisor.hasApiKey();
        const cached = hasKey ? this.aiAdvisor.getCachedResponse(this.viewDate.getMonth(), this.viewDate.getFullYear()) : null;
        const providerName = this.aiAdvisor ? (this.aiAdvisor.getProvider() === 'openai' ? 'ChatGPT' : 'Gemini') : 'IA';

        html += `
            <div class="card" style="margin-top: 2rem; border: 2px solid ${hasKey ? '#E91E63' : '#ddd'}; border-radius: 12px;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem;">
                    <h3 style="margin: 0;">🧠 Asesor IA Personal</h3>
                    ${hasKey ? `<span class="badge" style="background: #E8F5E9; color: #2E7D32; font-size: 0.75rem;">${providerName} Activo ✓</span>` : ''}
                </div>
        `;

        if (!hasKey) {
            html += `
                <div style="text-align: center; padding: 1.5rem; background: #f8f9fa; border-radius: 8px;">
                    <p style="font-size: 2rem; margin-bottom: 0.5rem;">🤖</p>
                    <p style="color: #555; margin-bottom: 1rem;">Conecta tu cuenta de <strong>Google Gemini</strong> (gratis) o <strong>ChatGPT</strong> para recibir consejos personalizados con IA real.</p>
                    <button class="btn btn-primary" onclick="document.querySelector('[data-view=settings]').click()" style="margin-bottom: 0.5rem;">
                        ⚙️ Configurar API Key
                    </button>
                    <p style="font-size: 0.8rem; color: #999; margin-top: 0.5rem;">Tus datos se envían directo a la IA desde tu celular. No pasan por ningún servidor.</p>
                </div>
            `;
        } else if (cached) {
            html += `
                <div id="ai-response" style="white-space: pre-line; line-height: 1.7; font-size: 0.95rem; color: #444;">
                    ${cached}
                </div>
                <div style="margin-top: 1rem; display: flex; gap: 0.5rem; justify-content: flex-end;">
                    <span style="font-size: 0.75rem; color: #999; align-self: center;">Consultado reciente</span>
                    <button id="ai-refresh-btn" class="btn btn-primary" style="font-size: 0.85rem; padding: 0.4rem 1rem;">
                        🔄 Actualizar Consejo
                    </button>
                </div>
            `;
        } else {
            html += `
                <div id="ai-response" style="text-align: center; padding: 1rem;">
                    <p style="color: #666;">¿Listo para recibir tu consejo financiero personalizado?</p>
                </div>
                <div style="text-align: center;">
                    <button id="ai-ask-btn" class="btn btn-primary" style="padding: 0.6rem 2rem; font-size: 1rem;">
                        🧠 Consultar ${providerName}
                    </button>
                </div>
            `;
        }

        html += '</div>'; // Close AI card

        this.container.innerHTML = html;
        if (window.feather) window.feather.replace();

        // Bind AI buttons
        const askBtn = document.getElementById('ai-ask-btn');
        const refreshBtn = document.getElementById('ai-refresh-btn');

        const handleAIRequest = async () => {
            const responseDiv = document.getElementById('ai-response');
            const btn = askBtn || refreshBtn;
            if (btn) { btn.disabled = true; btn.textContent = '⏳ Analizando...'; }
            if (responseDiv) {
                responseDiv.innerHTML = `
                    <div style="text-align: center; padding: 2rem;">
                        <div style="display: inline-block; width: 30px; height: 30px; border: 3px solid #ddd; border-top-color: #E91E63; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                        <p style="color: #999; margin-top: 1rem;">La IA está analizando tus finanzas...</p>
                    </div>
                `;
            }

            try {
                const advice = await this.aiAdvisor.getAdvice(this.viewDate.getMonth(), this.viewDate.getFullYear());
                if (responseDiv) {
                    responseDiv.style.textAlign = 'left';
                    responseDiv.innerHTML = advice;
                }
                if (btn) { btn.textContent = '✅ Listo'; }
            } catch (err) {
                const messages = {
                    'NO_KEY': '⚙️ Configura tu API Key en Configuración.',
                    'INVALID_KEY': '❌ API Key inválida. Revísala en Configuración.',
                    'RATE_LIMIT': '⏳ Muchas consultas. Espera unos minutos.',
                    'NETWORK_ERROR': '📡 Sin conexión a internet.',
                    'EMPTY_RESPONSE': '🤷 La IA no pudo generar una respuesta. Intenta de nuevo.',
                    'API_ERROR': '⚠️ Error del servicio de IA. Intenta más tarde.'
                };
                if (responseDiv) {
                    responseDiv.innerHTML = `<p style="color: #F44336; text-align: center;">${messages[err.message] || 'Error desconocido'}</p>`;
                }
                if (btn) { btn.disabled = false; btn.textContent = '🔄 Reintentar'; }
            }
        };

        if (askBtn) askBtn.addEventListener('click', handleAIRequest);
        if (refreshBtn) refreshBtn.addEventListener('click', handleAIRequest);

        // Render Chart
        this.renderTrendChart();
    }

    renderTrendChart() {
        const ctx = document.getElementById('trendChart');
        if (!ctx) return;

        // Get last 6 months data
        const labels = [];
        const incomeData = [];
        const expenseData = [];
        const savingsData = [];

        const today = new Date();
        for (let i = 5; i >= 0; i--) {
            const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
            const monthName = d.toLocaleDateString('es-CO', { month: 'short' });
            labels.push(monthName);

            const summary = this.store.getFinancialSummary(d.getMonth(), d.getFullYear());
            incomeData.push(summary.income);
            expenseData.push(summary.expenses + summary.debt_payment); // Expenses + Debt as "Outflow"
            savingsData.push(summary.savings + summary.investment); // Wealth building
        }

        new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Ingresos',
                        data: incomeData,
                        borderColor: '#2E7D32', // Green
                        backgroundColor: '#2E7D32',
                        tension: 0.4
                    },
                    {
                        label: 'Gastos + Deuda',
                        data: expenseData,
                        borderColor: '#F44336', // Red
                        backgroundColor: '#F44336',
                        tension: 0.4
                    },
                    {
                        label: 'Ahorro + Inversión',
                        data: savingsData,
                        borderColor: '#2196F3', // Blue
                        backgroundColor: '#2196F3',
                        tension: 0.4,
                        borderDash: [5, 5]
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: '#f0f0f0' }
                    },
                    x: {
                        grid: { display: false }
                    }
                }
            }
        });
    }

    renderSettings() {
        this.pageTitle.textContent = 'Configuración ⚙️';
        const conf = this.store.config;

        // Filter categories for Budget
        const categories = this.store.categories.filter(c =>
            ['VIVIENDA', 'NECESIDADES', 'ESTILO_DE_VIDA', 'CRECIMIENTO', 'FINANCIERO', 'OTROS'].includes(c.group)
        );

        const budgets = conf.budgets || {};

        let budgetInputs = '';
        categories.forEach(c => {
            const limit = budgets[c.id] || 0;
            budgetInputs += `
                <div class="form-group" style="margin-bottom: 0.8rem; display: flex; align-items: center; justify-content: space-between;">
                    <label style="margin: 0; flex: 1;">${c.name} <span class="text-secondary" style="font-size: 0.8rem;">(${c.group})</span></label>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <span style="color: #666;">$</span>
                        <input type="text" inputmode="numeric" name="budget_${c.id}" 
                               value="${limit > 0 ? new Intl.NumberFormat('es-CO').format(limit) : ''}" 
                               placeholder="0"
                               style="width: 120px; text-align: right;"
                               onfocus="if(this.value==='0')this.value=''"
                               onblur="var n=parseInt(this.value.replace(/\\D/g,''))||0; this.value=n>0?new Intl.NumberFormat('es-CO').format(n):''">
                    </div>
                </div>
            `;
        });

        this.container.innerHTML = `
            <div class="settings-layout" style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; align-items: start;">
                <!-- Column 1: Profile -->
                <div class="card">
                    <h3>Perfil Financiero</h3>
                    <form id="settings-form">
                        <div class="form-group">
                            <label>Nombre de Usuario</label>
                            <input type="text" name="user_name" value="${conf.user_name || 'Mi Espacio'}">
                        </div>
                        <div class="form-group">
                            <label>Ingreso Mensual Objetivo</label>
                            <input type="text" inputmode="numeric" name="monthly_income_target" 
                                   value="${conf.monthly_income_target ? new Intl.NumberFormat('es-CO').format(conf.monthly_income_target) : ''}"
                                   placeholder="0"
                                   onfocus="if(this.value==='0')this.value=''"
                                   onblur="var n=parseInt(this.value.replace(/\\D/g,''))||0; this.value=n>0?new Intl.NumberFormat('es-CO').format(n):''">
                        </div>

                        <div class="form-group">
                            <label style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.8rem;">
                                <span>Perfil de Gasto</span>
                                <button type="button" id="profile-info-btn" class="btn-text" style="font-size: 0.8rem;">
                                    <i data-feather="help-circle"></i> Ver Guía
                                </button>
                            </label>
                            <select name="spending_profile">
                                <option value="CONSERVADOR" ${conf.spending_profile === 'CONSERVADOR' ? 'selected' : ''}>Conservador (Estricto)</option>
                                <option value="BALANCEADO" ${conf.spending_profile === 'BALANCEADO' ? 'selected' : ''}>Balanceado</option>
                                <option value="FLEXIBLE" ${conf.spending_profile === 'FLEXIBLE' ? 'selected' : ''}>Flexible</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label>Moneda Preferida</label>
                            <select name="currency">
                                <option value="COP" ${conf.currency === 'COP' ? 'selected' : ''}>COP ($)</option>
                                <option value="USD" ${conf.currency === 'USD' ? 'selected' : ''}>USD ($)</option>
                                <option value="EUR" ${conf.currency === 'EUR' ? 'selected' : ''}>EUR (€)</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                                <input type="checkbox" name="has_debts" ${conf.has_debts ? 'checked' : ''} style="width: auto;"
                                       onchange="document.getElementById('debt-amount-group').style.display = this.checked ? 'block' : 'none'">
                                <span>Tengo deudas activas</span>
                            </label>
                        </div>

                        <div class="form-group" id="debt-amount-group" style="display: ${conf.has_debts ? 'block' : 'none'}; margin-left: 1.5rem;">
                            <label>Monto Total de Deuda</label>
                            <input type="text" name="total_debt" 
                                   value="${new Intl.NumberFormat('es-CO').format(conf.total_debt || 0)}"
                                   oninput="this.value = this.value.replace(/[^0-9]/g, '').replace(/\\B(?=(\\d{3})+(?!\\d))/g, '.')">
                        </div>

                        <button type="submit" class="btn btn-primary" style="width: 100%;">Guardar Perfil</button>
                    </form>
                    

                </div>

                <!-- Column 2: Fixed Expenses & Recurring Incomes -->
                <div>
                     <!-- RECURRING INCOMES -->
                    <div class="card" style="margin-bottom: 2rem;">
                        <h3>Ingresos Recurrentes 💵</h3>
                        <p class="text-secondary" style="font-size: 0.9rem; margin-bottom: 1rem;">
                            Salarios, honorarios o ingresos que recibes automáticamente.
                        </p>
                        
                        <div id="recurring-incomes-list" style="margin-bottom: 1.5rem;">
                            ${this.renderRecurringIncomesList()}
                        </div>

                        <form id="recurring-income-form" style="background: #f0fdf4; padding: 1rem; border-radius: 8px; border: 1px solid #dcfce7;">
                            <h4 style="margin: 0 0 0.5rem 0; font-size: 0.95rem; color: #166534;">Nuevo Ingreso</h4>
                            <div class="form-group" style="margin-bottom: 0.5rem;">
                                <input type="text" name="name" placeholder="Nombre (ej. Nómina)" required style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 6px;">
                            </div>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-bottom: 0.5rem;">
                                <input type="text" name="amount" placeholder="Monto ($)" required
                                       oninput="this.value = this.value.replace(/[^0-9]/g, '').replace(/\\B(?=(\\d{3})+(?!\\d))/g, '.')"
                                       style="padding: 8px; border: 1px solid #ddd; border-radius: 6px;">
                                <input type="number" name="day" placeholder="Día (1-31)" min="1" max="31" value="1" required 
                                       style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 6px;">
                            </div>
                            <button type="submit" class="btn btn-primary" style="width: 100%; background: #2E7D32;">+ Agregar Ingreso</button>
                        </form>
                    </div>

                    <!-- FIXED EXPENSES -->
                    <div class="card" style="margin-bottom: 2rem;">
                        <h3>Gastos Fijos Recurrentes 📅</h3>
                        <p class="text-secondary" style="font-size: 0.9rem; margin-bottom: 1rem;">
                            Estos gastos se generarán automáticamente cada mes.
                        </p>
                        
                        <div id="fixed-expenses-list" style="margin-bottom: 1.5rem;">
                            ${this.renderFixedExpensesList()}
                        </div>

                        <form id="fixed-expense-form" style="background: #f9fafb; padding: 1rem; border-radius: 8px; border: 1px solid #eee;">
                            <h4 style="margin: 0 0 0.5rem 0; font-size: 0.95rem;">Nuevo Gasto Fijo</h4>
                            <div class="form-group" style="margin-bottom: 0.5rem;">
                                <input type="text" name="name" placeholder="Nombre (ej. Arriendo)" required style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 6px;">
                            </div>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-bottom: 0.5rem;">
                                <input type="text" name="amount" placeholder="Monto ($)" required
                                       oninput="this.value = this.value.replace(/[^0-9]/g, '').replace(/\\B(?=(\\d{3})+(?!\\d))/g, '.')"
                                       style="padding: 8px; border: 1px solid #ddd; border-radius: 6px;">
                                <select name="category_id" required style="padding: 8px; border: 1px solid #ddd; border-radius: 6px;">
                                    <option value="" disabled selected>Categoría</option>
                                    ${categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
                                </select>
                            </div>
                            <div style="display: flex; gap: 0.5rem;">
                                <input type="number" name="day" placeholder="Día (1-31)" min="1" max="31" value="1" required 
                                       style="width: 80px; padding: 8px; border: 1px solid #ddd; border-radius: 6px;">
                                <button type="submit" class="btn btn-primary" style="flex: 1;">+ Agregar</button>
                            </div>
                        </form>
                    </div>       
                </div>
                
                <!-- Column 3: Budgets -->
                <div>
                     <div class="card">
                         <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                            <h3 style="margin: 0;">Metas Mensuales 🎯</h3>
                            <button type="button" id="auto-budget-btn" class="btn-text" 
                                    style="font-size: 0.8rem; color: var(--primary-color); font-weight: 600; background: #fce4ec; padding: 4px 10px; border-radius: 15px;">
                                ✨ Sugerir
                            </button>
                         </div>
                     <p class="text-secondary" style="font-size: 0.9rem; margin-bottom: 1.5rem;">
                        Define cuánto quieres gastar máximo por categoría. Usa "Sugerir" para calcularlo basado en tu ingreso y perfil.
                     </p>
                     <form id="budget-form">
                        ${budgetInputs}
                        <button type="submit" class="btn btn-secondary" style="width: 100%; margin-top: 1rem;">Guardar Presupuestos</button>
                     </form>
                </div>

                <!-- AI CONFIGURATION CARD - MODERN -->
                <div class="card" style="margin-top: 2rem; border: none; border-radius: 20px; background: linear-gradient(145deg, #ffffff, #f5f5f5); box-shadow: 0 10px 30px rgba(0,0,0,0.05);">
                    <div style="background: linear-gradient(135deg, #6C5DD3, #8B5CF6); padding: 24px; border-radius: 18px; color: white; margin-bottom: 20px; position: relative; overflow: hidden;">
                        <div style="position: absolute; top: -20px; right: -20px; font-size: 100px; opacity: 0.1;">🤖</div>
                        <h3 style="margin: 0 0 8px 0; display: flex; align-items: center; gap: 10px; font-size: 1.4rem;">
                            <span>🧠</span> Conectar Inteligencia
                        </h3>
                        <p style="margin: 0; font-size: 0.95rem; opacity: 0.9;">
                            Vincula tu cuenta para que la IA actúe como tu asesor financiero personal. Totalmente privado y seguro.
                        </p>
                    </div>

                    <form id="ai-config-form">
                        <div style="margin-bottom: 20px;">
                            <label style="font-weight: 600; font-size: 0.9rem; color: #444; margin-bottom: 8px; display: block;">Elige tu Asistente</label>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                                <label style="cursor: pointer; position: relative;">
                                    <input type="radio" name="ai_provider" value="gemini" ${(conf.ai_provider || 'gemini') === 'gemini' ? 'checked' : ''} style="position: absolute; opacity: 0;" onchange="window.ui.toggleAiProvider(this.value)">
                                    <div style="border: 2px solid ${conf.ai_provider === 'gemini' || !conf.ai_provider ? '#6C5DD3' : '#eee'}; background: ${conf.ai_provider === 'gemini' || !conf.ai_provider ? '#f0ebff' : '#fff'}; border-radius: 12px; padding: 12px; text-align: center; transition: all 0.2s;">
                                        <div style="font-size: 1.5rem; margin-bottom: 4px;">✨</div>
                                        <div style="font-weight: 700; color: #333;">Gemini</div>
                                        <div style="font-size: 0.75rem; color: #2E7D32; font-weight: 600;">Recomendado (Gratis)</div>
                                    </div>
                                </label>
                                <label style="cursor: pointer; position: relative;">
                                    <input type="radio" name="ai_provider" value="openai" ${conf.ai_provider === 'openai' ? 'checked' : ''} style="position: absolute; opacity: 0;" onchange="window.ui.toggleAiProvider(this.value)">
                                    <div style="border: 2px solid ${conf.ai_provider === 'openai' ? '#10a37f' : '#eee'}; background: ${conf.ai_provider === 'openai' ? '#e6fffa' : '#fff'}; border-radius: 12px; padding: 12px; text-align: center; transition: all 0.2s;">
                                        <div style="font-size: 1.5rem; margin-bottom: 4px;">🧠</div>
                                        <div style="font-weight: 700; color: #333;">ChatGPT</div>
                                        <div style="font-size: 0.75rem; color: #666;">(Requiere Saldo API)</div>
                                    </div>
                                </label>
                            </div>
                        </div>

                        <!-- GEMINI SECTION -->
                        <div id="gemini-key-group" style="display: ${(conf.ai_provider || 'gemini') === 'gemini' ? 'block' : 'none'};">
                            <div style="background: #e1f5fe; border-left: 4px solid #039be5; padding: 12px 16px; border-radius: 8px; margin-bottom: 16px;">
                                <h4 style="margin: 0 0 4px 0; color: #0277bd; font-size: 0.95rem;">Cómo conectar Gemini (1 minuto):</h4>
                                <ol style="margin: 0; padding-left: 20px; font-size: 0.85rem; color: #0277bd; line-height: 1.6;">
                                    <li>Toca el botón de abajo para ir a Google.</li>
                                    <li>Crea una llave nueva ("Create API Key").</li>
                                    <li>Copia esa llave y pégala aquí abajo. ¡Listo!</li>
                                </ol>
                                <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" 
                                   style="display: inline-block; margin-top: 10px; background: #0288d1; color: white; text-decoration: none; padding: 8px 16px; border-radius: 20px; font-size: 0.85rem; font-weight: 600; box-shadow: 0 2px 5px rgba(2,136,209,0.3);">
                                    🔑 Obtener Llave Gratis
                                </a>
                            </div>
                            
                            <div class="form-group" style="position: relative;">
                                <label style="font-weight: 600; font-size: 0.9rem; color: #555;">Pegar Llave de Acceso (API Key)</label>
                                <input type="password" name="gemini_api_key" 
                                       value="${conf.gemini_api_key || ''}" 
                                       placeholder="Pega aquí tu llave (empieza por AIzaSy...)"
                                       style="width: 100%; padding: 14px; border: 2px solid #ddd; border-radius: 12px; font-family: monospace; font-size: 1rem; transition: border-color 0.3s;"
                                       onfocus="this.style.borderColor='#6C5DD3'"
                                       onblur="this.style.borderColor='#ddd'">
                                <span style="position: absolute; right: 14px; top: 38px; cursor: pointer; opacity: 0.5;" onclick="const i=this.previousElementSibling; i.type=i.type==='password'?'text':'password'">👁️</span>
                            </div>
                        </div>

                        <!-- OPENAI SECTION -->
                        <div id="openai-key-group" style="display: ${conf.ai_provider === 'openai' ? 'block' : 'none'};">
                            <div style="background: #f0fdf4; border-left: 4px solid #16a34a; padding: 12px 16px; border-radius: 8px; margin-bottom: 16px;">
                                <h4 style="margin: 0 0 4px 0; color: #15803d; font-size: 0.95rem;">Conectar ChatGPT</h4>
                                <p style="margin: 0; font-size: 0.85rem; color: #166534;">
                                    Necesitas una llave de OpenAI Platform con créditos.
                                </p>
                                <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener" 
                                   style="display: inline-block; margin-top: 10px; background: #16a34a; color: white; text-decoration: none; padding: 8px 16px; border-radius: 20px; font-size: 0.85rem; font-weight: 600;">
                                    🔑 Ir a OpenAI
                                </a>
                            </div>

                            <div class="form-group">
                                <label>Pegar API Key de OpenAI</label>
                                <input type="password" name="openai_api_key" 
                                       value="${conf.openai_api_key || ''}" 
                                       placeholder="sk-..."
                                       style="width: 100%; padding: 14px; border: 2px solid #ddd; border-radius: 12px; font-family: monospace;">
                            </div>
                        </div>

                        <div style="display: flex; gap: 12px; margin-top: 24px;">
                            <button type="button" class="btn" style="flex: 1; background: #f5f5f5; color: #444;" onclick="window.ui.testAiConnection()">
                                ⚡ Probar Conexión
                            </button>
                            <button type="submit" class="btn btn-primary" style="flex: 2; background: linear-gradient(135deg, #6C5DD3, #8B5CF6); font-size: 1rem;">
                                💾 Guardar y Conectar
                            </button>
                        </div>
                        <div id="connection-result" style="text-align: center; margin-top: 16px; font-weight: 600; min-height: 24px;"></div>
                    </form>
                </div>

                <!-- Version & Updates & Danger Zone -->
                <div style="margin-top: 3rem; text-align: center;">
                    <button id="force-update-env-btn" class="btn-text" style="color: #666; font-size: 0.85rem;">
                        Versión v65 • Buscar Actualizaciones
                    </button>
                    
                    <details style="margin-top: 1rem;">
                        <summary style="cursor: pointer; color: #999; font-size: 0.8rem;">Opciones Avanzadas (Danger Zone)</summary>
                        <div style="padding: 1rem; border: 1px solid #fecaca; background: #fef2f2; border-radius: 10px; margin-top: 0.5rem; text-align: left;">
                             <p style="color: #991b1b; font-size: 0.85rem; margin-bottom: 10px;"><b>Reinicio de Fábrica:</b> Borra caché y recarga la app. Úsalo si algo no funciona.</p>
                             <button id="danger-reset-btn" onclick="window.ui.performHardReset()" 
                                style="width: 100%; padding: 10px; background: #dc2626; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer;">
                                💣 Borrar Caché y Reiniciar
                            </button>
                        </div>
                    </details>
                </div>
            </div>
            
            <!-- End of Grid Layout -->
            </div>
            
        `;

        // Handle Force Update Logic
        setTimeout(() => {
            const forceBtn = document.getElementById('force-update-env-btn');
            if (forceBtn) {
                forceBtn.addEventListener('click', async () => {
                    if (confirm('¿Actualizar a la última versión? Esto recargará la aplicación.')) {
                        forceBtn.innerHTML = '⌛ Actualizando...';
                        forceBtn.disabled = true;

                        try {
                            // 1. Unregister Service Workers
                            if ('serviceWorker' in navigator) {
                                const regs = await navigator.serviceWorker.getRegistrations();
                                for (let r of regs) await r.unregister();
                            }

                            // 2. Clear Caches
                            const keys = await caches.keys();
                            for (let k of keys) await caches.delete(k);

                            // 3. Force Network Reload with Timestamp (The Nuclear Option)
                            // This guarantees we get the fresh index.html
                            console.log('Forcing nuclear reload...');
                            window.location.href = window.location.pathname + '?update=' + Date.now();

                        } catch (e) {
                            console.error(e);
                            window.location.reload();
                        }
                    }
                });
            }
        }, 1000);

        // Handle Profile Form
        const settingsForm = document.getElementById('settings-form');
        if (settingsForm) {
            settingsForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                const rawIncome = formData.get('monthly_income_target').toString().replace(/\./g, '');
                const rawDebt = formData.get('total_debt') ? formData.get('total_debt').toString().replace(/\./g, '') : '0';

                this.store.updateConfig({
                    monthly_income_target: parseFloat(rawIncome) || 0,
                    user_name: formData.get('user_name'),
                    spending_profile: formData.get('spending_profile'),
                    currency: formData.get('currency') || 'COP',
                    has_debts: formData.get('has_debts') === 'on',
                    total_debt: parseFloat(rawDebt) || 0
                });
                alert('Perfil guardado correctamente.');
                this.render(); // Re-render to update the "Auto" logic with new profile
            });
        }

        // Handle Profile Guide Button
        const guideBtn = document.getElementById('profile-info-btn');
        if (guideBtn) {
            guideBtn.addEventListener('click', () => {
                alert(`📚 GUÍA DE PERFILES:

🛡️ CONSERVADOR (Modo Guerra/Ahorro)
- Prioridad: Ahorrar y Pagar Deudas.
- Sacrificio: Ocio y Gastos Hormiga se reducen al mínimo.
- Recomendado si: Tienes deudas o quieres comprar casa pronto.

⚖️ BALANCEADO (Regla 50/30/20)
- Prioridad: Equilibrio.
- Distribución: 50% Necesidades, 30% Gustos, 20% Ahorro.
- Recomendado si: Tienes finanzas sanas y quieres mantenerlas.

🚀 FLEXIBLE (Modo Disfrute)
- Prioridad: Calidad de Vida hoy.
- Riesgo: Menor capacidad de ahorro ante imprevistos.
- Recomendado si: Tienes altos ingresos y ya cubriste tus bases.`);
            });
        }

        // Handle AI Provider Toggle
        const providerSelect = document.getElementById('ai-provider-select');
        if (providerSelect) {
            providerSelect.addEventListener('change', () => {
                const isGemini = providerSelect.value === 'gemini';
                document.getElementById('gemini-key-group').style.display = isGemini ? 'block' : 'none';
                document.getElementById('openai-key-group').style.display = isGemini ? 'none' : 'block';
            });
        }

        // Handle AI Config Form
        const aiForm = document.getElementById('ai-config-form');
        if (aiForm) {
            aiForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                this.store.updateConfig({
                    ai_provider: formData.get('ai_provider') || 'gemini',
                    gemini_api_key: formData.get('gemini_api_key') || '',
                    openai_api_key: formData.get('openai_api_key') || ''
                });
                alert('✅ Configuración de IA guardada.');
                this.render();
            });
        }

        // Handle Auto-Suggest Button
        const autoBtn = document.getElementById('auto-budget-btn');
        if (autoBtn) {
            autoBtn.addEventListener('click', () => {
                const income = this.store.config.monthly_income_target || 0;
                const profile = this.store.config.spending_profile || 'BALANCEADO';

                if (income <= 0) {
                    alert('⚠️ Primero define y guarda un "Ingreso Mensual Objetivo" mayor a 0 en la columna izquierda.');
                    return;
                }

                // 1. Strict Profile Logic (The "Should Be")
                // We define exactly how the Pie must be sliced for each profile.
                // No looking at history. Pure theory from the profile.

                const distributions = {
                    'CONSERVADOR': {
                        // Total: 100%
                        // High Savings/Debt Payoff (30%), Low Wants (10%)
                        'cat_1': 0.25, // Vivienda
                        'cat_2': 0.15, // Alimentación
                        'cat_3': 0.05, // Transporte
                        'cat_gasolina': 0.05,
                        'cat_4': 0.05, // Salud
                        'cat_8': 0.05, // Educación
                        'cat_9': 0.05, // Ocio (Strict)
                        'cat_personal': 0.05, // Ropa/Cuidado (Basic)
                        'cat_deporte': 0.00, // Deporte (Optional in crisis)
                        'cat_vicios': 0.00, // Vicios (None)
                        'cat_10': 0.05, // Otros
                        // Financiero (30% combined)
                        'cat_5': 0.10, // Ahorro
                        'cat_6': 0.00, // Inversion (Feature safety first)
                        'cat_7': 0.10, // Deuda
                        'cat_fin_4': 0.05, // Tarjeta
                        'cat_fin_5': 0.05  // Renting
                    },
                    'BALANCEADO': {
                        // Rule 50/30/20
                        // Needs (50%)
                        'cat_1': 0.20,
                        'cat_2': 0.15,
                        'cat_3': 0.05,
                        'cat_gasolina': 0.05,
                        'cat_4': 0.05,
                        // Wants (30%)
                        'cat_9': 0.10, // Ocio
                        'cat_personal': 0.05, // Ropa
                        'cat_deporte': 0.03, // Deporte (Healthy)
                        'cat_vicios': 0.02, // Vicios (Low)
                        'cat_8': 0.05, // Educación (Counts as self-investment/want sometimes, or need)
                        'cat_10': 0.08,
                        // Savings/Debt (20%)
                        'cat_5': 0.05,
                        'cat_6': 0.05,
                        'cat_7': 0.05,
                        'cat_fin_4': 0.025,
                        'cat_fin_5': 0.025
                    },
                    'FLEXIBLE': {
                        // High Wants (40%+), Low Savings
                        'cat_1': 0.25,
                        'cat_2': 0.10,
                        'cat_3': 0.05,
                        'cat_gasolina': 0.05,
                        'cat_4': 0.05,
                        // Wants
                        'cat_9': 0.10, // Ocio HIGH
                        'cat_personal': 0.10, // Ropa High
                        'cat_deporte': 0.05, // Deporte (Good)
                        'cat_vicios': 0.05, // Vicios Allowed
                        'cat_8': 0.05,
                        'cat_10': 0.10,
                        // Savings (Min 10%)
                        'cat_5': 0.02,
                        'cat_6': 0.00,
                        'cat_7': 0.04,
                        'cat_fin_4': 0.02,
                        'cat_fin_5': 0.02
                    }
                };

                const weights = distributions[profile] || distributions['BALANCEADO'];
                let appliedCount = 0;

                const allCats = this.store.categories;

                // Calculate minimum floor per category from fixed expenses
                const fixedFloor = {};
                const fixedExpenses = this.store.config.fixed_expenses || [];
                fixedExpenses.forEach(fe => {
                    if (fe.category_id && fe.amount) {
                        fixedFloor[fe.category_id] = (fixedFloor[fe.category_id] || 0) + fe.amount;
                    }
                });

                allCats.forEach(cat => {
                    const input = document.querySelector(`input[name="budget_${cat.id}"]`);
                    if (input) {
                        // Calculate strict limit based on income %
                        const pct = weights[cat.id] || 0.01; // Default 1% if missed
                        let strictLimit = Math.floor(income * pct);

                        // Use fixed expense as floor — never suggest a budget lower than known fixed costs
                        const floor = fixedFloor[cat.id] || 0;
                        if (floor > strictLimit) {
                            strictLimit = floor;
                        }

                        // Rounding for cleaner numbers (nearest 5.000)
                        strictLimit = Math.ceil(strictLimit / 5000) * 5000;

                        if (strictLimit > 0) {
                            input.value = strictLimit.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
                            input.style.backgroundColor = '#e8f5e9';
                            setTimeout(() => input.style.backgroundColor = '#fff', 1500);
                            appliedCount++;
                        }
                    }
                });

                if (appliedCount > 0) {
                    alert(`✅ Presupuestos sugeridos por perfil "${profile}".\n\n💡 Los gastos fijos que ya definiste se usaron como piso mínimo. La app NUNCA te sugerirá un presupuesto menor a lo que ya sabes que pagas.`);
                } else {
                    alert("No pudimos generar sugerencias. Verifica tu Ingreso Objetivo.");
                }
            });
        }

        // Handle Budget Form
        const budgetForm = document.getElementById('budget-form');
        if (budgetForm) {
            budgetForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                const newBudgets = {};

                // Calculate fixed expense floor per category
                const fixedFloor = {};
                const fixedExpenses = this.store.config.fixed_expenses || [];
                fixedExpenses.forEach(fe => {
                    if (fe.category_id && fe.amount) {
                        fixedFloor[fe.category_id] = (fixedFloor[fe.category_id] || 0) + fe.amount;
                    }
                });

                let warnings = [];

                // Parse form data: name="budget_cat_id" -> value="100.000"
                for (let [key, value] of formData.entries()) {
                    if (key.startsWith('budget_')) {
                        const catId = key.replace('budget_', '');
                        const rawVal = value.toString().replace(/\./g, '');
                        let val = parseFloat(rawVal);
                        if (val > 0) {
                            // Check if budget is less than known fixed expenses
                            const floor = fixedFloor[catId] || 0;
                            if (floor > 0 && val < floor) {
                                const cat = this.store.categories.find(c => c.id === catId);
                                const catName = cat ? cat.name : catId;
                                warnings.push(`"${catName}": Tu gasto fijo es $${floor.toLocaleString('es-CO')} pero pusiste $${val.toLocaleString('es-CO')}. Se ajustó al mínimo.`);
                                val = floor;
                            }
                            newBudgets[catId] = val;
                        }
                    }
                }

                // Update only budgets in config (keep others)
                this.store.updateConfig({ budgets: newBudgets });

                if (warnings.length > 0) {
                    alert(`⚠️ Se ajustaron presupuestos:\n\n${warnings.join('\n\n')}\n\n💡 No puedes poner un presupuesto menor a tus gastos fijos conocidos.`);
                } else {
                    alert('✅ Metas de presupuesto actualizadas.');
                }
                this.render();
            });
        }

        // Profile Info Modal Trigger
        const profileBtn = document.getElementById('profile-info-btn');
        if (profileBtn) {
            profileBtn.addEventListener('click', () => {
                document.getElementById('profile-modal').classList.remove('hidden');
            });
        }

        // Handle Fixed Expense Adding / Updating
        const fixedExpForm = document.getElementById('fixed-expense-form');
        if (fixedExpForm) {
            fixedExpForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                const rawAmount = formData.get('amount').toString().replace(/\./g, '');
                const editId = formData.get('edit_id');

                const expenseData = {
                    name: formData.get('name'),
                    amount: parseFloat(rawAmount),
                    category_id: formData.get('category_id'),
                    day: parseInt(formData.get('day')) || 1
                };

                if (editId) {
                    this.store.updateFixedExpense(editId, expenseData);
                    alert('Gasto fijo actualizado.');
                } else {
                    this.store.addFixedExpense(expenseData);
                    alert('Gasto fijo agregado.');
                }
                this.render(); // Refresh to show in list/reset form
            });
        }

        // Handle Recurring Income Adding / Updating
        const recIncForm = document.getElementById('recurring-income-form');
        if (recIncForm) {
            recIncForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                const rawAmount = formData.get('amount').toString().replace(/\./g, '');
                const editId = formData.get('edit_id');

                const incomeData = {
                    name: formData.get('name'),
                    amount: parseFloat(rawAmount),
                    day: parseInt(formData.get('day')) || 1,
                    category_id: 'cat_salario' // Fixed for now or selectable? Let's assume Salary/Income
                };

                if (editId) {
                    this.store.updateRecurringIncome(editId, incomeData);
                    alert('Ingreso recurrente actualizado.');
                } else {
                    this.store.addRecurringIncome(incomeData);
                    alert('Ingreso recurrente agregado.');
                }
                this.render();
            });
        }

        // Handle Edit Logic (Fixed Exp)
        document.querySelectorAll('.edit-fixed-exp').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.closest('button').dataset.id;
                const exp = this.store.config.fixed_expenses.find(x => x.id === id);
                if (!exp) return;

                const form = document.getElementById('fixed-expense-form');
                form.querySelector('[name="name"]').value = exp.name;
                form.querySelector('[name="amount"]').value = exp.amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
                form.querySelector('[name="category_id"]').value = exp.category_id;
                form.querySelector('[name="day"]').value = exp.day;

                let hiddenInput = form.querySelector('[name="edit_id"]');
                if (!hiddenInput) {
                    hiddenInput = document.createElement('input');
                    hiddenInput.type = 'hidden';
                    hiddenInput.name = 'edit_id';
                    form.appendChild(hiddenInput);
                }
                hiddenInput.value = exp.id;

                form.querySelector('button[type="submit"]').textContent = '💾 Guardar Cambios';
                form.querySelector('h4').textContent = 'Editar Gasto Fijo ✏️';
                form.scrollIntoView({ behavior: 'smooth' });
            });
        });

        // Handle Edit Logic (Recurring Income)
        document.querySelectorAll('.edit-rec-inc').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.closest('button').dataset.id;
                const inc = this.store.config.recurring_incomes.find(x => x.id === id);
                if (!inc) return;

                const form = document.getElementById('recurring-income-form');
                form.querySelector('[name="name"]').value = inc.name;
                form.querySelector('[name="amount"]').value = inc.amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
                form.querySelector('[name="day"]').value = inc.day;

                let hiddenInput = form.querySelector('[name="edit_id"]');
                if (!hiddenInput) {
                    hiddenInput = document.createElement('input');
                    hiddenInput.type = 'hidden';
                    hiddenInput.name = 'edit_id';
                    form.appendChild(hiddenInput);
                }
                hiddenInput.value = inc.id;

                form.querySelector('button[type="submit"]').textContent = '💾 Guardar Cambios';
                form.querySelector('h4').textContent = 'Editar Ingreso ✏️';
                form.scrollIntoView({ behavior: 'smooth' });
            });
        });

        // Handle Fixed Expense Deletion
        document.querySelectorAll('.delete-fixed-exp').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (confirm('¿Dejar de generar este gasto fijo?')) {
                    const id = e.target.closest('button').dataset.id;
                    this.store.deleteFixedExpense(id);
                    this.render();
                }
            });
        });

        // Handle Recurring Income Deletion
        document.querySelectorAll('.delete-rec-inc').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (confirm('¿Dejar de generar este ingreso recurrente?')) {
                    const id = e.target.closest('button').dataset.id;
                    this.store.deleteRecurringIncome(id);
                    this.render();
                }
            });
        });
    }

    renderFixedExpensesList() {
        const list = this.store.config.fixed_expenses || [];
        if (list.length === 0) return '<p class="text-secondary" style="font-size: 0.85rem;">No tienes gastos fijos configurados.</p>';

        return list.map(fe => {
            const cat = this.store.categories.find(c => c.id === fe.category_id) || { name: '?' };
            return `
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eee; padding: 0.6rem 0;">
                    <div>
                        <div style="font-weight: 600; font-size: 0.95rem;">${fe.name}</div>
                        <div style="font-size: 0.85rem; color: #666;">
                           Día ${fe.day} • ${cat.name} • ${this.formatCurrency(fe.amount)}
                        </div>
                    </div>
                    <div style="display: flex; gap: 0.5rem;">
                        <button class="btn-text edit-fixed-exp" data-id="${fe.id}" style="color: #2196F3;" title="Editar">
                            <i data-feather="edit-2" style="width:18px;"></i>
                        </button>
                        <button class="btn-text delete-fixed-exp" data-id="${fe.id}" style="color: #999;" title="Borrar">
                            <i data-feather="trash-2" style="width:18px;"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    renderRecurringIncomesList() {
        const list = this.store.config.recurring_incomes || [];
        if (list.length === 0) return '<p class="text-secondary" style="font-size: 0.85rem;">No tienes ingresos recurrentes configurados.</p>';

        return list.map(ri => {
            return `
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eee; padding: 0.6rem 0;">
                    <div>
                        <div style="font-weight: 600; font-size: 0.95rem;">${ri.name}</div>
                        <div style="font-size: 0.85rem; color: #666;">
                           Día ${ri.day} • Ingreso • ${this.formatCurrency(ri.amount)}
                        </div>
                    </div>
                    <div style="display: flex; gap: 0.5rem;">
                        <button class="btn-text edit-rec-inc" data-id="${ri.id}" style="color: #2196F3;" title="Editar">
                            <i data-feather="edit-2" style="width:18px;"></i>
                        </button>
                        <button class="btn-text delete-rec-inc" data-id="${ri.id}" style="color: #999;" title="Borrar">
                            <i data-feather="trash-2" style="width:18px;"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    renderGoals() {
        this.pageTitle.textContent = 'Metas Financieras 🎯';
        // Use the getter that calculates real progress from transactions
        const goals = this.store.getGoals();

        let html = `
            <div style="margin-bottom: 2rem; display: flex; justify-content: flex-end;">
                <button class="btn btn-primary" id="add-goal-btn">
                    <i data-feather="plus"></i> Nueva Meta
                </button>
            </div>
        `;

        // Calculate Plan / Projection info per goal could happen here

        if (goals.length === 0) {
            html += `
                <div style="text-align: center; padding: 3rem 1.5rem;">
                    <div style="font-size: 3rem; margin-bottom: 12px;">🎯</div>
                    <h3 style="margin: 0 0 8px; color: #333;">Dale un propósito a tu dinero</h3>
                    <p style="color: #888; margin: 0 0 20px; font-size: 0.9rem; line-height: 1.5;">Las metas te ayudan a ahorrar con dirección.<br>Por ejemplo:</p>
                    <div style="display: flex; flex-direction: column; gap: 8px; max-width: 280px; margin: 0 auto 20px; text-align: left;">
                        <div style="display: flex; align-items: center; gap: 8px; color: #555; font-size: 0.85rem;">
                            <span style="font-size: 1.2rem;">🛡️</span> Fondo de emergencia (3 meses de gastos)
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px; color: #555; font-size: 0.85rem;">
                            <span style="font-size: 1.2rem;">✈️</span> Vacaciones soñadas
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px; color: #555; font-size: 0.85rem;">
                            <span style="font-size: 1.2rem;">💳</span> Pagar una deuda específica
                        </div>
                    </div>
                    <button class="btn btn-primary" onclick="document.getElementById('add-goal-btn').click()" style="padding: 10px 24px; font-size: 0.95rem;">
                        ✨ Crear mi primera meta
                    </button>
                </div>
            `;
        } else {
            html += `<div class="stats-grid" style="grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));">`;

            goals.forEach(g => {
                const percent = Math.min((g.current_amount / g.target_amount) * 100, 100);
                const remaining = g.target_amount - g.current_amount;

                let icon = 'target';
                let color = '#2196F3';
                if (g.type === 'EMERGENCY') { icon = 'shield'; color = '#4CAF50'; }
                if (g.type === 'DEBT') { icon = 'trending-down'; color = '#F44336'; } // Red for Debt
                if (g.type === 'PURCHASE') { icon = 'gift'; color = '#9C27B0'; }

                // Recent contributions
                const lastContrib = g.recent_contributions && g.recent_contributions.length > 0
                    ? `<div style="font-size: 0.75rem; color: #666; margin-top: 0.5rem;">
                        Último abono: ${this.formatCurrency(g.recent_contributions[0].amount)} (${new Date(g.recent_contributions[0].date).toLocaleDateString()})
                       </div>`
                    : '<div style="font-size: 0.75rem; color: #ccc; margin-top: 0.5rem;">Sin abonos recientes</div>';

                html += `
                    <div class="card" style="border-top: 4px solid ${color}; display: flex; flex-direction: column;">
                        <div class="card-header">
                            <div class="card-title" style="display:flex; justify-content:space-between; width:100%">
                                <span>${g.name}</span>
                                <button class="btn-text delete-goal" data-id="${g.id}" style="color: #999; padding:0;"><i data-feather="trash-2" style="width:14px;"></i></button>
                            </div>
                            <div class="card-icon" style="background:${color}20; color:${color}"><i data-feather="${icon}"></i></div>
                        </div>
                        
                        <div class="card-value" style="font-size: 1.5rem;">${this.formatCurrency(g.current_amount)}</div>
                        <div class="text-secondary" style="font-size: 0.85rem; margin-bottom: 0.5rem;">
                            de ${this.formatCurrency(g.target_amount)}
                        </div>
                        
                        <div style="background: #eee; height: 8px; border-radius: 4px; overflow: hidden; margin-bottom: 0.5rem;">
                            <div style="width: ${percent}%; background: ${color}; height: 100%;"></div>
                        </div>
                        
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                            <span class="badge" style="background:${color}15; color:${color}">${percent.toFixed(0)}% Completado</span>
                        </div>

                        ${lastContrib}

                        <button class="btn btn-secondary add-fund-btn" data-id="${g.id}" data-type="${g.type}" 
                                style="width: 100%; margin-top: auto; border: 1px solid ${color}; color: ${color}; background: #fff;">
                            + Abonar a Meta
                        </button>
                    </div>
                `;
            });
            html += `</div>`;
        }

        this.container.innerHTML = html;

        // Add Goal Handler
        const addBtn = document.getElementById('add-goal-btn');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                const type = prompt("Tipo de Meta:\n1. Fondo de Emergencia\n2. Pago de Deuda\n3. Ahorro Específico\n\n(1-3):");
                if (!type) return;

                let typeKey = 'PURCHASE';
                let nameDefault = 'Nueva Meta';
                if (type === '1') { typeKey = 'EMERGENCY'; nameDefault = 'Fondo de Emergencia'; }
                else if (type === '2') { typeKey = 'DEBT'; nameDefault = 'Salir de Deudas'; }
                else if (type === '3') { typeKey = 'PURCHASE'; nameDefault = 'Viaje soñado'; }
                else return;

                const name = prompt("Nombre de la meta:", nameDefault) || nameDefault;
                const targetStr = prompt("Monto objetivo ($):");
                if (!targetStr) return;
                const target = parseFloat(targetStr.replace(/\./g, ''));

                this.store.addGoal({
                    type: typeKey,
                    name: name,
                    target_amount: target,
                    current_amount: 0 // Always starts at 0, adds via transactions
                });
                this.render();
            });
        }

        // Add Fund Handler (Creates REAL transaction)
        document.querySelectorAll('.add-fund-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.dataset.id;
                const type = e.target.dataset.type;

                const amountStr = prompt("Monto a abonar hoy ($):");
                if (!amountStr) return;
                const amount = parseFloat(amountStr.replace(/\./g, ''));
                if (isNaN(amount) || amount <= 0) return;

                const accounts = this.store.accounts;
                const accNames = accounts.map((a, i) => `${i + 1}. ${a.name} ($${a.current_balance})`).join('\n');
                const accIndex = prompt(`¿De qué cuenta sale el dinero?\n${accNames}`);
                if (!accIndex) return;
                const account = accounts[parseInt(accIndex) - 1];
                if (!account) return;

                // Auto-categorize
                // Payment of Debt -> Spending/Flow Out -> Type: PAGO_DEUDA
                // Savings -> Transfer to "Savings" (conceptually) -> Type: AHORRO
                let txType = 'AHORRO';
                let catId = 'cat_5'; // Ahorro default
                let note = 'Abono a meta';

                if (type === 'DEBT') {
                    txType = 'PAGO_DEUDA';
                    catId = 'cat_7'; // Deuda default
                    note = 'Pago abono a deuda';
                }

                this.store.addTransaction({
                    type: txType,
                    amount: amount,
                    date: new Date().toISOString().split('T')[0],
                    category_id: catId,
                    account_id: account.id,
                    goal_id: id,
                    note: note
                });

                alert('✅ Abono registrado correctamente como movimiento.');
                this.render();
            });
        });

        // Delete Handler
        document.querySelectorAll('.delete-goal').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (confirm('¿Borrar esta meta? Los movimientos históricos NO se borrarán.')) {
                    const id = e.target.closest('button').dataset.id;
                    this.store.deleteGoal(id);
                    this.render();
                }
            });
        });
    }

    renderBudgetProgress() {
        const budgets = this.store.config.budgets || {};
        if (Object.keys(budgets).length === 0) return '';

        // Safely get category breakdown
        let breakdown = {};
        try {
            breakdown = this.store.getCategoryBreakdown();
        } catch (e) { console.error('Error fetching breakdown', e); return ''; }

        let html = `
            <div class="card" style="grid-column: 1 / -1;">
                <div class="card-header">
                     <h3>Seguimiento de Presupuesto Mensual 🔍</h3>
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem;">
        `;

        Object.keys(budgets).forEach(catId => {
            const limit = budgets[catId];
            const cat = this.store.categories.find(c => c.id === catId);

            // Skip invalid categories or zero limits
            if (!cat || limit <= 0) return;

            const spent = breakdown[cat.name] || 0;
            const percent = (spent / limit) * 100;
            const remaining = limit - spent;
            const exceeded = spent - limit;

            // Directive Color Logic
            let color = '#4CAF50'; // Green: On Track
            let statusText = '✅ En orden';

            if (percent >= 80 && percent <= 100) {
                color = '#FF9800'; // Orange: Warning
                statusText = '⚠️ Cuidado (80% usado)';
            } else if (percent > 100) {
                color = '#F44336'; // Red: Action Needed
                statusText = `🚨 Excedido en ${this.formatCurrency(exceeded)}`;
            }

            html += `
                <div class="budget-item" style="border-left: 3px solid ${color}; padding-left: 10px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.9rem;">
                        <strong>${cat.name}</strong>
                        <span style="font-weight:600; color:${color}">${statusText}</span>
                    </div>
                    
                    <div style="display: flex; justify-content: space-between; font-size: 0.8rem; color: #666; margin-bottom: 4px;">
                        <span>Gastado: ${this.formatCurrency(spent)}</span>
                        <span>Meta: ${this.formatCurrency(limit)}</span>
                    </div>

                    <div style="background: #eee; height: 10px; border-radius: 5px; overflow: hidden;">
                        <div style="width: ${Math.min(percent, 100)}%; background: ${color}; height: 100%; transition: width 0.5s;"></div>
                    </div>
                    
                    ${percent > 100 ?
                    `<div style="font-size: 0.75rem; color: #D32F2F; margin-top: 5px; background: #FFEBEE; padding: 4px; border-radius: 4px;">
                            💡 Acción: Reduce ${this.formatCurrency(exceeded)} en otros gastos para compensar.
                        </div>`
                    : ''}
                </div>
            `;
        });

        html += `</div></div>`;
        return html;
    }
    toggleAiProvider(val) {
        document.getElementById('gemini-key-group').style.display = (val === 'gemini') ? 'block' : 'none';
        document.getElementById('openai-key-group').style.display = (val === 'openai') ? 'block' : 'none';

        const res = document.getElementById('connection-result');
        if (res) res.innerHTML = ''; // Clear status
    }

    async testAiConnection() {
        // Find inputs directly based on active provider
        const providerSelect = document.getElementById('ai-provider-select');
        const provider = providerSelect ? providerSelect.value : 'gemini';
        let apiKeyInput;

        if (provider === 'gemini') apiKeyInput = document.querySelector('input[name="gemini_api_key"]');
        else apiKeyInput = document.querySelector('input[name="openai_api_key"]');

        const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
        const statusEl = document.getElementById('connection-result');

        if (!apiKey) {
            statusEl.innerHTML = '<span style="color:#d32f2f;">❌ Falta la API Key</span>';
            return;
        }

        statusEl.innerHTML = '<span style="color:#1976d2;">⏳ Probando conexión...</span>';

        // Save original config to restore if needed
        if (!this.store.config) this.store.config = {};
        const originalConfig = { ...this.store.config };

        // 1. Temporarily update config in memory
        this.store.config.ai_provider = provider;
        if (provider === 'gemini') this.store.config.gemini_api_key = apiKey;
        else this.store.config.openai_api_key = apiKey;

        // 2. Re-init Advisor with this new temporary config
        // Pass the STORE (not config) as expected by AIAdvisor constructor
        this.aiAdvisor = new AIAdvisor(this.store);

        try {
            await this.aiAdvisor.checkConnection(apiKey);

            // Success! Save for real.
            this.store.saveSettings(this.store.config);
            statusEl.innerHTML = '<span style="color:#2e7d32; font-weight:bold;">✅ ¡Conexión Exitosa! Guardado.</span>';
            setTimeout(() => { if (statusEl) statusEl.innerHTML = '<span style="color:#2e7d32;">✅ Configuración lista</span>'; }, 2000);

        } catch (error) {
            console.error(error);
            let msg = 'Error de conexión';

            if (error.message.includes('429')) msg = '❌ Cuota o Velocidad excedida (Espera un momento)';
            else if (error.message.includes('401') || error.message.includes('403') || error.message.includes('INVALID_KEY')) msg = '❌ API Key inválida o rechazada';
            else if (error.message.includes('RATE_LIMIT')) msg = '❌ Demasiadas peticiones (429)';
            else msg = `❌ Error: ${error.message}`;

            if (statusEl) statusEl.innerHTML = `<span style="color:#d32f2f; font-weight:bold;">${msg}</span>`;

            // Revert config on error to avoid breaking app state with bad key
            this.store.config = originalConfig;
            this.aiAdvisor = new AIAdvisor(this.store.config);
        }
    }
}
