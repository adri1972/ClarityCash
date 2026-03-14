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

        this.monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

        this._monthPromptShownFor = null;

        // Smart Date: Jump to latest transaction date if current month is empty
        this.setSmartViewDate();
    }

    setSmartViewDate() {
        const now = new Date();
        this.viewDate = new Date(now.getFullYear(), now.getMonth(), 1);
        console.log('📅 Date Initialized to current month:', this.viewDate.toLocaleDateString());
    }

    async changeMonth(delta) {
        this.viewDate.setMonth(this.viewDate.getMonth() + delta);
        await this.render(); // Re-render current view (Dashboard)
    }

    formatNumberWithDots(amount) {
        if (amount === undefined || amount === null) return '0';
        // Handle both numbers and strings (stripping non-digits if string)
        const num = typeof amount === 'number' ? amount : parseFloat(amount.toString().replace(/\D/g, '')) || 0;
        return Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }

    formatCurrencyInput(input) {
        if (!input) return;
        let cursorStart = input.selectionStart;
        let oldLength = input.value.length;

        let val = input.value.replace(/[^0-9]/g, '');
        let formatted = val.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

        input.value = formatted;

        let newLength = formatted.length;
        let newCursorPos = cursorStart + (newLength - oldLength);

        if (newCursorPos < 0) newCursorPos = 0;

        try {
            input.setSelectionRange(newCursorPos, newCursorPos);
        } catch (e) { }
    }

    formatCurrency(amount) {
        const currency = this.store.config.currency || 'COP';

        // For COP, we force dots as group separator as requested by USER
        if (currency === 'COP') {
            return '$' + this.formatNumberWithDots(amount);
        }

        const localeMap = { 'USD': 'en-US', 'EUR': 'es-ES' };
        return new Intl.NumberFormat(localeMap[currency] || 'en-US', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 2,
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
            addBtn.addEventListener('click', (e) => {
                // Prevent opening if we are not logged in
                if (typeof auth === 'undefined' || !auth.currentUser) {
                    e.preventDefault();
                    return;
                }
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
                            if (btn) btn.innerHTML = '+ Agregar Gasto';

                            const title = modal.querySelector('h3');
                            if (title) title.textContent = 'Nuevo Gasto 💸';

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
                    window.ui.formatCurrencyInput(this);
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
                console.log('📝 Transaction Form Submitted');
                try {
                    const formData = new FormData(form);
                    const data = Object.fromEntries(formData.entries());

                    // Clean amount (remove dots)
                    if (data.amount) {
                        data.amount = parseFloat(data.amount.toString().replace(/\./g, ''));
                    }
                    console.log('Processed Data:', data);

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

                    // --- BLOQUEO DE NEGATIVOS ---
                    /*
                    if (data.type === 'GASTO' || data.type === 'AHORRO' || data.type === 'INVERSION') {
                        const account = this.store.accounts.find(a => a.id === data.account_id);
                        if (account && (account.current_balance - data.amount < 0) && account.type !== 'CREDITO') {
                            // Intervene!
                            this.showNegativeBalanceIntervention(data, account, editId, form, txModal, categoryGroup);
                            return; // Stop execution
                        }
                    }
                    */

                    if (editId) {
                        this.store.updateTransaction(editId, data);
                        alert('Movimiento actualizado correctamente.');
                    } else {
                        const newTx = this.store.addTransaction(data);
                        // PROACTIVE AI: Trigger insight if it's an expense
                        if (data.type === 'GASTO') {
                            // Clear specialized advice cache to force update on dashboard
                            const currentMonth = this.viewDate.getMonth();
                            const currentYear = this.viewDate.getFullYear();
                            const cacheKey = `cc_ai_v65_${currentYear}_${currentMonth}_gemini`;
                            localStorage.removeItem(cacheKey);

                            this.triggerSpendingInsight(newTx || data);
                            this.checkAndPromptOverspend(newTx || data);
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
                    if (btn) btn.innerHTML = '+ Agregar Gasto';

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

                            if (!this.aiAdvisor || !this.aiAdvisor.hasApiKey()) {
                                throw new Error('Debes configurar una API Key en Ajustes (Gemini u OpenAI) para usar el Escáner IA.');
                            }

                            loadingDiv.textContent = 'Analizando recibo con IA...';
                            const base64Data = imageData.split(',')[1];
                            const mimeType = fileToProcess.type || 'image/jpeg';

                            const extractedData = await this.aiAdvisor.scanReceipt(base64Data, mimeType);
                            console.log('AI Receipt Data:', extractedData);

                            const form = document.getElementById('transaction-form');
                            if (!form) return;

                            if (extractedData.amount) {
                                document.getElementById('amount').value = this.formatNumberWithDots(extractedData.amount);
                            }
                            if (extractedData.merchant) {
                                let noteStr = extractedData.merchant;
                                if (extractedData.note && extractedData.note !== "null" && extractedData.note !== null) {
                                    noteStr += ` - ${extractedData.note}`;
                                }
                                document.getElementById('note').value = noteStr.substring(0, 50);
                            }

                            if (extractedData.category && extractedData.category !== "null" && extractedData.category !== null) {
                                const matchedCat = this.store.categories.find(c => c.name.toLowerCase().includes(extractedData.category.toLowerCase()));
                                if (matchedCat) {
                                    document.getElementById('category_id').value = matchedCat.id;
                                    const catText = document.getElementById('category_text');
                                    if (catText) catText.textContent = matchedCat.name;
                                }
                            }

                            // GASTO by default
                            const typeRadio = document.querySelector('input[name="type"][value="GASTO"]');
                            if (typeRadio) typeRadio.checked = true;
                            form.dispatchEvent(new Event('change', { bubbles: true }));

                            setTimeout(() => {
                                alert('✨ Recibo procesado por IA.\n\nVerifica que el monto y la categoría sean correctos antes de guardar.');
                            }, 300);

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
            msg += `✓ Monto detectado: $${this.formatNumberWithDots(amountFound)}\\n`;
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

        // Force uppercase for robust comparison
        const fType = (typeFilter || 'GASTO').toUpperCase();

        // Ensure we have categories, fallback to defaults if needed
        let categories = this.store.categories;
        if (!categories || categories.length === 0) {
            console.warn('⚠️ Store categories empty. Using defaults.');
            categories = typeof DEFAULT_DATA !== 'undefined' ? DEFAULT_DATA.categories : [];
        }

        // Filter categories based on the selected Transaction Type
        let filteredCats = categories;
        if (fType === 'INGRESO') {
            filteredCats = categories.filter(c => (c.group || '').toUpperCase() === 'INGRESOS');
        } else if (fType === 'AHORRO') {
            filteredCats = categories.filter(c => c.id === 'cat_5');
        } else if (fType === 'INVERSION') {
            filteredCats = categories.filter(c => c.id === 'cat_6');
        } else if (fType === 'PAGO_DEUDA') {
            filteredCats = categories.filter(c => c.id === 'cat_7' || c.id === 'cat_fin_4');
        } else {
            // GASTO or OTHERS
            filteredCats = categories.filter(c => {
                const g = (c.group || '').toUpperCase();
                return g !== 'INGRESOS' &&
                    c.id !== 'cat_5' &&
                    c.id !== 'cat_6' &&
                    c.id !== 'cat_7';
            });
        }

        // FINAL FALLBACK: If filtering resulted in empty list, show at least "Otros"
        if (filteredCats.length === 0 && categories.length > 0) {
            console.warn('⚠️ Filtering resulted in zero categories for type:', fType);
            filteredCats = categories.slice(0, 10); // Show some categories anyway
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

        if (filteredCats.length === 1) {
            catSelect.value = filteredCats[0].id;
        }

        // Accounts Population
        accSelect.innerHTML = this.store.accounts.map(a =>
            `<option value="${a.id}">${a.name} (${a.type})</option>`
        ).join('');
    }

    async navigate(viewName) {
        this.navItems.forEach(item => item.classList.remove('active'));
        const target = document.querySelector(`.nav-item[data-view="${viewName}"]`);
        if (target) target.classList.add('active');
        this.currentView = viewName;
        await this.render();
    }

    async render() {
        if (!this.container) return;

        // Reset legacy handlers to avoid conflicts between views
        this.container.onclick = null;
        this.container.onsubmit = null;

        this.container.innerHTML = '';
        console.log('🎨 Rendering View:', this.currentView);

        const user = auth.currentUser;
        if (!user) {
            // Si no hay usuario, forzamos login o registro
            document.body.classList.add('no-auth'); // Clase para ocultar sidebar y otros elementos
            this.toggleAuthElements(false);
            if (this.currentView === 'register') this.renderRegister();
            else this.renderLogin();
            return;
        }

        document.body.classList.remove('no-auth');

        // 🚀 VERIFICACIÓN DE SUSCRIPCIÓN (Desactivado temporalmente)
        /*
        const sub = this.store.config.subscription;
        if (sub && sub.plan === 'trial' && sub.status === 'active') {
            const now = new Date();
            const trialEnd = new Date(sub.trialEnd);

            if (now > trialEnd) {
                console.log('🛑 Trial Expired. Blocking access.');
                if (this.currentView !== 'upgrade') {
                    this.currentView = 'upgrade';
                    this.renderUpgradeScreen();
                    return;
                }
            }
        }
        */

        this.toggleAuthElements(this.currentView !== 'upgrade');

        // Protagonismo del botón "Nuevo Gasto"
        const addBtn = document.getElementById('add-transaction-btn');
        if (addBtn) {
            if (this.currentView === 'settings') {
                addBtn.classList.add('btn-shrunk');
            } else {
                addBtn.classList.remove('btn-shrunk');
            }
        }

        if (this.currentView === 'upgrade') {
            this.renderUpgradeScreen();
            return;
        }

        try {
            switch (this.currentView) {
                case 'dashboard': await this.renderDashboard(); break;
                case 'transactions': this.renderTransactions(); break;
                case 'insights': this.renderInsightsPage(); break;
                case 'goals': this.renderGoals(); break;
                case 'settings': await this.renderSettings(); break;
                case 'strategy': this.renderStrategyReport(); break;
                case 'upgrade': this.renderUpgradeScreen(); break;
                default: await this.renderDashboard();
            }
        } catch (err) {
            console.error('❌ Render Error:', err);
            this.container.innerHTML = `<div style="padding:2rem; color:red;">Error al cargar la vista: ${err.message}</div>`;
        }

        this.updateUserProfileUI();
        if (window.feather) window.feather.replace();

        // 🛡️ Trigger Privacy Check after rendering
        this.checkPrivacyConsent();
    }


    checkPrivacyConsent() {
        if (this.store.config.ai_terms_accepted) return;
        if (document.getElementById('privacy-modal-overlay')) return;

        // Custom Modal without a close button (Blocking)
        const modal = document.createElement('div');
        modal.id = 'privacy-modal-overlay';
        modal.className = 'modal';
        modal.style.zIndex = '99999'; // Very high
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px; padding: 30px 20px;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <span style="font-size: 3rem;">🛡️</span>
                    <h2 style="margin: 10px 0 5px 0; color:var(--text-primary);">Aviso de Privacidad y Seguridad</h2>
                    <p style="color:var(--text-secondary); font-size: 0.9rem; margin:0;">Clarity Cash + IA Premium</p>
                </div>
                
                <div style="font-size: 0.85rem; line-height: 1.6; color: var(--text-secondary); max-height: 50vh; overflow-y: auto; padding-right: 10px; text-align: left;">
                    <h4 style="color:#1e293b; margin-top:0;">1. Procesamiento Profesional de Datos</h4>
                    <p>Clarity Cash utiliza la API de Google Gemini en su nivel empresarial (Pay-as-you-go). Esto garantiza que tus datos financieros y consultas no se utilizan para entrenar modelos de Inteligencia Artificial públicos. Tus movimientos son estrictamente confidenciales y procesados en un entorno seguro.</p>
                    
                    <h4 style="color:#1e293b;">2. Seguridad de la Información</h4>
                    <ul style="padding-left: 20px; margin-bottom: 10px;">
                        <li><b>Cifrado:</b> Toda comunicación entre la aplicación y el motor de análisis financiero está cifrada bajo protocolos de seguridad industrial.</li>
                        <li><b>Anonimización:</b> Clarity Cash está diseñada para analizar comportamientos numéricos. Recomendamos no ingresar nombres reales, números de tarjeta o claves bancarias en las descripciones de los movimientos.</li>
                    </ul>
                    
                    <h4 style="color:#1e293b;">3. Naturaleza del Asesoramiento</h4>
                    <p>Los análisis y sugerencias proporcionados por la IA de Clarity Cash tienen un propósito informativo y educativo para la gestión de presupuestos. No constituyen asesoría financiera legalmente vinculante ni reemplazan el juicio de un profesional contable o financiero titulado.</p>
                    
                    <h4 style="color:#1e293b;">4. Control de Usuario</h4>
                    <p>Tú mantienes el control total sobre tus datos. Puedes eliminar tu historial de análisis en cualquier momento desde los ajustes de la aplicación.</p>
                </div>
                
                <div style="margin-top: 25px;">
                    <button id="btn-accept-privacy" style="width: 100%; padding: 14px; background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; border-radius: 12px; font-weight: 700; font-size: 1rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px; transition: transform 0.2s;">
                        <span>Entendido y Acepto</span> <i data-feather="check-circle" style="width:18px;height:18px;"></i>
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        if (window.feather) window.feather.replace();

        modal.querySelector('#btn-accept-privacy').addEventListener('click', () => {
            if (this.store && this.store.config) {
                this.store.config.ai_terms_accepted = true;
                if (typeof this.store.updateConfig === 'function') {
                    this.store.updateConfig(this.store.config);
                }
            }
            if (document.body.contains(modal)) {
                document.body.removeChild(modal);
            }
        });
    }

    updateUserProfileUI() {
        const user = auth.currentUser;
        const nameEl = document.querySelector('.user-profile .name');
        const statusEl = document.querySelector('.user-profile .status');
        const avatarEl = document.querySelector('.user-profile .avatar');

        if (user) {
            if (nameEl) nameEl.textContent = user.email.split('@')[0];
            if (statusEl) {
                statusEl.innerHTML = `${user.emailVerified ? 'Cuenta Verificada ✅' : 'Sin verificar ✉️'} <br>
                <button onclick="window.authService.logout()" style="background:none; border:none; color:var(--danger-color); font-size:0.75rem; text-decoration:underline; cursor:pointer; padding:0; margin-top:4px;">Cerrar Sesión</button>`;
            }
            if (avatarEl) avatarEl.textContent = user.email[0].toUpperCase();
        } else {
            if (nameEl) nameEl.textContent = 'Sin Sesión';
            if (statusEl) statusEl.textContent = 'Inicia sesión';
        }
    }

    renderUpgradeScreen() {
        this.pageTitle.textContent = 'Trial Terminado';
        this.container.innerHTML = `
            <div style="max-width: 500px; margin: 40px auto; padding: 40px 30px; background: white; border-radius: 24px; box-shadow: var(--shadow-lg); text-align: center;">
                <div style="font-size: 4rem; margin-bottom: 20px;">⌛</div>
                <h2 style="margin-bottom: 12px; font-size: 1.8rem; font-weight: 800; color: var(--text-main);">Tu periodo de prueba ha terminado</h2>
                <p style="color: var(--text-secondary); font-size: 1rem; line-height: 1.6; margin-bottom: 30px;">
                    Han pasado los 7 días de acceso gratuito. Esperamos que <b>ClarityCash</b> te haya ayudado a ver tus finanzas con más claridad.
                </p>

                <div style="background: #F8F9FA; border-radius: 16px; padding: 20px; margin-bottom: 30px; text-align: left;">
                    <h4 style="margin: 0 0 12px 0; color: var(--primary-color);">¿Qué incluye el Plan Premium?</h4>
                    <ul style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; font-size: 0.9rem;">
                        <li style="display: flex; align-items: center; gap: 10px;">
                            <span style="color: #2E7D32;">✔</span> Asesor IA personalizada ilimitada
                        </li>
                        <li style="display: flex; align-items: center; gap: 10px;">
                            <span style="color: #2E7D32;">✔</span> Escáner de recibos por IA
                        </li>
                        <li style="display: flex; align-items: center; gap: 10px;">
                            <span style="color: #2E7D32;">✔</span> Sincronización en la nube multi-dispositivo
                        </li>
                        <li style="display: flex; align-items: center; gap: 10px;">
                            <span style="color: #2E7D32;">✔</span> Reportes semanales de estrategia
                        </li>
                    </ul>
                </div>

                <button class="btn btn-primary" style="width: 100%; padding: 18px; border-radius: 14px; font-size: 1.1rem; font-weight: 700; margin-bottom: 15px;" onclick="alert('Funcionalidad de pago no integrada aún. ¡Gracias por el interés!')">
                    Activar Premium ✨
                </button>
                
                <p style="font-size: 0.85rem; color: var(--text-muted);">
                    Sin compromisos, cancela cuando quieras.
                </p>
            </div>
        `;
    }

    /**
     * Hides or shows UI elements based on auth state (Redundant with CSS but for security/cache reasons)
     */
    toggleAuthElements(isAuth) {
        const selectors = [
            { s: '.sidebar', d: 'flex' },
            { s: '.sidebar-overlay', d: 'block' },
            { s: '#quick-expense-container', d: 'flex' },
            { s: '#quick-expense-fab', d: 'flex' },
            { s: '.top-bar .actions', d: 'flex' },
            { s: '.top-bar .actions', d: 'flex' }
        ];

        selectors.forEach(item => {
            const el = document.querySelector(item.s);
            if (el) {
                if (isAuth) {
                    el.style.removeProperty('display'); // Clear inline to let CSS or defaults take over
                    // Only force inline display for elements that need it, let CSS handle sidebar & overlay
                    if (item.s !== '.sidebar-overlay' && item.s !== '.sidebar') {
                        el.style.display = item.d;
                    }
                } else {
                    el.style.setProperty('display', 'none', 'important');
                }
            }
        });

        // Specific fix for "Nuevo Gasto" button if targeted directly
        const addBtn = document.getElementById('add-transaction-btn');
        if (addBtn) {
            if (isAuth) {
                addBtn.style.display = 'inline-flex';
                addBtn.style.removeProperty('display');
            } else {
                addBtn.style.setProperty('display', 'none', 'important');
            }
        }
    }

    // --- VISTAS DE AUTENTICACIÓN ---

    renderLogin() {
        this.pageTitle.textContent = ''; // Limpiamos el título superior para centrar la atención en la tarjeta
        this.container.innerHTML = `
            <div style="max-width:400px; margin: 60px auto; padding: 40px 30px; background: white; border-radius: 24px; box-shadow: var(--shadow-lg); text-align: center;">
                <img src="assets/logo.png" style="width:64px; margin-bottom:12px;">
                <h1 style="font-size: 2.2rem; font-weight: 800; color: #0f172a; margin: 0 0 4px 0; letter-spacing: -0.03em; line-height: 1.1;">Clarity Cash</h1>
                <p style="color:#64748b; font-size:1rem; font-weight:400; margin-bottom:35px;">Entiende tu dinero. Decide mejor.</p>
                
                <h2 style="margin-bottom:25px; font-weight:800; color:var(--text-main); font-size:1.5rem;">Iniciar sesión</h2>
                
                <form id="login-form" style="text-align: left;">
                    <div style="margin-bottom:15px;">
                        <label style="display:block; font-size:0.85rem; font-weight:600; margin-bottom:6px; color:var(--text-secondary);">Email</label>
                        <input type="email" name="email" required placeholder="tu@email.com" style="width:100%; padding:14px; border:1.5px solid #e2e8f0; border-radius:12px; font-size:1rem; outline:none;" onfocus="this.style.borderColor='var(--primary-color)'" onblur="this.style.borderColor='#e2e8f0'">
                    </div>
                    <div style="margin-bottom:20px;">
                        <label style="display:block; font-size:0.85rem; font-weight:600; margin-bottom:6px; color:var(--text-secondary);">Contraseña</label>
                        <input type="password" name="password" required placeholder="••••••••" style="width:100%; padding:14px; border:1.5px solid #e2e8f0; border-radius:12px; font-size:1rem; outline:none;" onfocus="this.style.borderColor='var(--primary-color)'" onblur="this.style.borderColor='#e2e8f0'">
                    </div>
                    <div id="login-error" style="color:#C62828; font-size:0.8rem; margin-bottom:15px; display:none; background:#FFEBEE; padding:10px; border-radius:8px;"></div>
                    
                    <button type="submit" class="btn btn-primary" style="width:100%; padding:16px; border-radius:14px; font-weight:700; font-size:1rem; box-shadow: 0 4px 12px rgba(128,0,64,0.2);">Iniciar sesión</button>
                </form>

                <div style="margin-top:30px;">
                    <p style="font-size:0.9rem; color:#64748b;">
                        ¿No tienes cuenta? <a href="#" onclick="window.ui.navigate('register')" style="color:var(--primary-color); font-weight:700; text-decoration:none;">Regístrate</a>
                    </p>
                    <p style="margin-top:15px; font-size:0.8rem;">
                        <a href="#" onclick="window.ui.showResetPassword()" style="color:#94a3b8; text-decoration:none;">Olvidé mi contraseña</a>
                    </p>
                </div>
            </div>
        `;

        const form = document.getElementById('login-form');
        form.onsubmit = async (e) => {
            e.preventDefault();
            const btn = form.querySelector('button');
            const errBox = document.getElementById('login-error');
            btn.disabled = true;
            btn.textContent = 'Verificando...';
            errBox.style.display = 'none';

            const { user, error } = await window.authService.login(form.email.value, form.password.value);
            if (error) {
                errBox.textContent = error;
                errBox.style.display = 'block';
                btn.disabled = false;
                btn.textContent = 'Iniciar sesión';
            } else {
                // Al loguear, app.js recibirá el onAuthStateChanged y re-renderizará
            }
        };
    }

    renderRegister() {
        this.pageTitle.textContent = 'Crear Cuenta';
        this.container.innerHTML = `
            <div style="max-width:400px; margin: 40px auto; padding: 30px; background: white; border-radius: 20px; box-shadow: var(--shadow-lg); text-align: center;">
                <h2 style="margin-bottom:8px;">Únete a ClarityCash</h2>
                <p style="color:#666; font-size:0.9rem; margin-bottom:25px;">Tus finanzas seguras y en la nube.</p>
                
                <form id="register-form" style="text-align: left;">
                    <div style="margin-bottom:15px;">
                        <label style="display:block; font-size:0.85rem; font-weight:600; margin-bottom:5px;">Email</label>
                        <input type="email" name="email" required placeholder="tu@email.com" style="width:100%; padding:12px; border:1.5px solid #eee; border-radius:12px;">
                    </div>
                    <div style="margin-bottom:15px;">
                        <label style="display:block; font-size:0.85rem; font-weight:600; margin-bottom:5px;">Contraseña</label>
                        <input type="password" name="password" required minlength="6" placeholder="Mínimo 6 caracteres" style="width:100%; padding:12px; border:1.5px solid #eee; border-radius:12px;">
                    </div>
                    <div id="register-error" style="color:#C62828; font-size:0.8rem; margin-bottom:15px; display:none;"></div>
                    
                    <button type="submit" class="btn btn-primary" style="width:100%; padding:14px; border-radius:12px; font-weight:700;">Crear Cuenta</button>
                    <p style="font-size:0.7rem; color:#999; margin-top:10px; line-height:1.3;">Al registrarte, aceptas que tus datos financieros sean procesados de forma privada por Clarity Cash IA.</p>
                </form>

                <p style="margin-top:25px; font-size:0.85rem; color:#666;">
                    ¿Ya tienes cuenta? <a href="#" onclick="window.ui.navigate('login')" style="color:var(--primary-color); font-weight:700;">Inicia Sesión</a>
                </p>
            </div>
        `;

        const form = document.getElementById('register-form');
        form.onsubmit = async (e) => {
            e.preventDefault();
            const btn = form.querySelector('button');
            const errBox = document.getElementById('register-error');
            btn.disabled = true;
            btn.textContent = 'Creando...';
            errBox.style.display = 'none';

            const { user, error } = await window.authService.register(form.email.value, form.password.value);
            if (error) {
                errBox.textContent = error;
                errBox.style.display = 'block';
                btn.disabled = false;
                btn.textContent = 'Crear Cuenta';
            } else {
                alert('¡Cuenta creada! Te hemos enviado un link de verificación a tu correo.');
            }
        };
    }

    async showResetPassword() {
        const email = prompt('Introduce tu correo para enviarte el link de recuperación:');
        if (!email) return;
        const { success, error } = await window.authService.resetPassword(email);
        if (success) alert('Link enviado. Revisa tu bandeja de entrada.');
        else alert('Error: ' + error);
    }

    async performHardReset() {
        if (!confirm('⚠️ ¿Estás seguro?\n\nEsto borrará todos los datos temporales y recargará la aplicación. Tus transacciones NO se perderán, pero forzarás una descarga limpia del código.')) {
            return;
        }

        try {
            if ('serviceWorker' in navigator) {
                const regs = await navigator.serviceWorker.getRegistrations();
                for (let r of regs) await r.unregister();
            }
            if ('caches' in window) {
                const names = await caches.keys();
                for (let n of names) await caches.delete(n);
            }
            localStorage.removeItem('cc_app_version');
            window.location.reload(true);
        } catch (e) {
            console.error('Reset failed:', e);
            window.location.reload(true);
        }
    }

    updateBudgetTotal() {
        const incomeInput = document.querySelector('input[name="monthly_income_target"]');
        const incomeVal = incomeInput ? incomeInput.value.replace(/\D/g, '') : '0';
        const income = parseFloat(incomeVal) || 0;

        const inputs = document.querySelectorAll('input[name^="budget_"]');
        let total = 0;
        inputs.forEach(input => {
            total += parseFloat(input.value.replace(/\D/g, '') || '0');
        });

        const summary = document.getElementById('budget-summary-pill');
        if (summary) {
            const diff = income - total;
            let helperText = '';
            let actionBtns = '';

            if (diff > 10) {
                helperText = `Faltan $${this.formatNumberWithDots(diff)}`;
                actionBtns = `
                    <button type="button" onclick="window.ui.openRebalancePicker(${diff})" 
                            style="background: #0ea5e9; color: white; border: none; padding: 6px 14px; border-radius: 20px; font-size: 0.8rem; cursor: pointer; font-weight: 700;">
                        🎯 Ajustar Diferencia
                    </button>
                `;
            } else if (diff < -10) {
                helperText = `Excedido $${this.formatNumberWithDots(Math.abs(diff))}`;
            } else {
                helperText = `✓ Coherente`;
            }

            summary.innerHTML = `
                <div style="display: flex; gap: 10px; font-size: 0.85rem; align-items: center; flex-wrap: wrap; width: 100%; margin-top: 10px;">
                    <div style="flex: 1; min-width: 200px; display: flex; gap: 10px;">
                        <span style="color: #666; background: #fff; border: 1px solid #ddd; padding: 4px 10px; border-radius: 8px;"><b>Suma:</b> $${this.formatNumberWithDots(total)}</span>
                        <span style="background: ${diff === 0 ? '#dcfce7' : (diff > 0 ? '#e0f2fe' : '#fee2e2')}; 
                                    color: ${diff === 0 ? '#166534' : (diff > 0 ? '#0288d1' : '#dc2626')}; 
                                    padding: 4px 10px; border-radius: 8px; border: 1px solid currentColor; font-weight: 700;">
                            ${helperText}
                        </span>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        ${actionBtns}
                    </div>
                </div>
            `;
        }
    }

    smartRebalance(catId, maxAmount) {
        const cat = this.store.categories.find(c => c.id === catId);
        const name = cat ? cat.name : catId;

        const amountStr = prompt(`¿Cuánto separar para ${name}?\n(Faltan por asignar: $${this.formatNumberWithDots(maxAmount)})`, maxAmount);
        if (amountStr === null) return; // Cancelled

        let amount = parseFloat(amountStr.replace(/\D/g, ''));
        if (isNaN(amount) || amount <= 0) return;

        if (amount > maxAmount) amount = maxAmount;

        const input = document.querySelector(`input[name="budget_${catId}"]`);
        if (input) {
            const current = parseFloat(input.value.replace(/\D/g, '') || '0');
            const newVal = current + amount;
            input.value = this.formatNumberWithDots(newVal);
            input.style.backgroundColor = '#dcfce7';
            setTimeout(() => input.style.backgroundColor = '#fff', 1000);

            // Re-calculate the overall total
            this.updateBudgetTotal();

            // Check if there is still money left to automatically keep the picker open
            const incomeInput = document.querySelector('input[name="monthly_income_target"]');
            const incomeVal = incomeInput ? incomeInput.value.replace(/\D/g, '') : '0';
            const income = parseFloat(incomeVal) || 0;

            let total = 0;
            document.querySelectorAll('input[name^="budget_"]').forEach(inp => {
                total += parseFloat(inp.value.replace(/\D/g, '') || '0');
            });

            const diff = income - total;
            if (diff > 10) {
                // Keep picker open with new remaining amount!
                this.openRebalancePicker(diff);
            }
        }
    }

    openRebalancePicker(amount) {
        const summary = document.getElementById('budget-summary-pill');
        if (!summary) return;

        const categories = this.store.categories.filter(c =>
            ['VIVIENDA', 'NECESIDADES', 'ESTILO_DE_VIDA', 'CRECIMIENTO', 'FINANCIERO', 'OTROS'].includes(c.group)
        );

        let optionsHtml = categories.map(c => `
            <button type="button" onclick="window.ui.smartRebalance('${c.id}', ${amount})" 
                    style="background: white; border: 1px solid #ddd; padding: 5px 10px; border-radius: 8px; font-size: 0.75rem; cursor: pointer; text-align: left;">
                ${c.name}
            </button>
        `).join('');

        summary.innerHTML = `
            <div style="width: 100%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <b style="font-size: 0.85rem; color: #be185d;">🎯 ¿Dónde ponemos los $${this.formatNumberWithDots(amount)} que faltan?</b>
                    <button type="button" onclick="window.ui.updateBudgetTotal()" style="background:none; border:none; color:#666; cursor:pointer;">✖</button>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px;">
                    ${optionsHtml}
                </div>
            </div>
        `;
    }

    getDistributions() {
        return {
            'CONSERVADOR': {
                'cat_1': 0.20, 'cat_2': 0.10, 'cat_3': 0.04, 'cat_gasolina': 0.03,
                'cat_4': 0.05, 'cat_8': 0.05, 'cat_9': 0.02, 'cat_personal': 0.02,
                'cat_10': 0.03, 'cat_5': 0.20, 'cat_6': 0.05, 'cat_7': 0.10,
                'cat_fin_4': 0.02, 'cat_fin_5': 0.01, 'cat_rest': 0.02,
                'cat_viv_servicios': 0.02, 'cat_viv_gas': 0.005,
                'cat_viv_net': 0.01, 'cat_viv_cel': 0.005, 'cat_viv_man': 0.01
            },
            'BALANCEADO': {
                'cat_1': 0.20, 'cat_2': 0.12, 'cat_3': 0.05, 'cat_gasolina': 0.04,
                'cat_4': 0.05, 'cat_9': 0.05, 'cat_personal': 0.04, 'cat_deporte': 0.03,
                'cat_vicios': 0.01, 'cat_8': 0.05, 'cat_10': 0.04, 'cat_5': 0.08,
                'cat_6': 0.05, 'cat_7': 0.05, 'cat_fin_4': 0.02, 'cat_fin_5': 0.02,
                'cat_rest': 0.04, 'cat_viv_servicios': 0.02,
                'cat_viv_net': 0.02, 'cat_viv_cel': 0.01, 'cat_viv_man': 0.01
            },
            'FLEXIBLE': {
                'cat_1': 0.25, 'cat_2': 0.10, 'cat_3': 0.05, 'cat_gasolina': 0.05,
                'cat_4': 0.05, 'cat_9': 0.10, 'cat_personal': 0.06, 'cat_deporte': 0.05,
                'cat_vicios': 0.04, 'cat_8': 0.05, 'cat_10': 0.05, 'cat_5': 0.02,
                'cat_6': 0.01, 'cat_7': 0.02, 'cat_fin_4': 0.01, 'cat_fin_5': 0.01,
                'cat_rest': 0.06, 'cat_viv_servicios': 0.02
            }
        };
    }

    updateProfileInfo(profileName) {
        const dists = this.getDistributions();
        const weights = dists[profileName];
        if (!weights) return;

        // Group weights
        const groups = {
            'Ahorro/Inv.': (weights['cat_5'] || 0) + (weights['cat_6'] || 0),
            'Vivienda/Serv.': (weights['cat_1'] || 0) + (weights['cat_viv_servicios'] || 0) + (weights['cat_viv_gas'] || 0) + (weights['cat_viv_net'] || 0) + (weights['cat_viv_cel'] || 0),
            'Necesidades': (weights['cat_2'] || 0) + (weights['cat_3'] || 0) + (weights['cat_gasolina'] || 0) + (weights['cat_4'] || 0) + (weights['cat_8'] || 0),
            'Deudas/Financ.': (weights['cat_7'] || 0) + (weights['cat_fin_4'] || 0),
            'Estilo de Vida': (weights['cat_9'] || 0) + (weights['cat_rest'] || 0) + (weights['cat_personal'] || 0),
            'Otros': (weights['cat_10'] || 0)
        };

        const infoEl = document.getElementById('profile-specs');
        if (infoEl) {
            infoEl.innerHTML = `
                <div style="background: #fdf2f8; border: 1px solid #fbcfe8; border-radius: 12px; padding: 12px; margin-top: 10px;">
                    <h4 style="margin: 0 0 8px 0; font-size: 0.8rem; color: #be185d;">Distribución Ideal (${profileName}):</h4>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 0.72rem;">
                        ${Object.entries(groups).map(([name, val]) => `
                            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #eee; padding-bottom: 2px;">
                                <span style="color: #666;">${name}:</span>
                                <b style="color: #333;">${Math.round(val * 100)}%</b>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
    }

    showProfileHelp() {
        const html = `
            <div style="font-size: 0.95rem; line-height: 1.6; color: #475569;">
                <div style="margin-bottom: 20px; border-left: 4px solid #10b981; padding-left: 15px;">
                    <h4 style="margin: 0 0 5px 0; color: #065f46;">🛡️ Conservador</h4>
                    <p style="margin: 0;"><b>Enfoque:</b> Seguridad y deuda. Destina un 20% al ahorro y restringe el ocio al 2%. Ideal para crear fondo de emergencia.</p>
                </div>
                <div style="margin-bottom: 20px; border-left: 4px solid #3b82f6; padding-left: 15px;">
                    <h4 style="margin: 0 0 5px 0; color: #1e40af;">⚖️ Balanceado</h4>
                    <p style="margin: 0;"><b>Enfoque:</b> Equilibrio 50/30/20 adaptado. Ahorra 8% y permite un 5% de disfrute. Recomendado para estabilidad financiera diaria.</p>
                </div>
                <div style="margin-bottom: 10px; border-left: 4px solid #8b5cf6; padding-left: 15px;">
                    <h4 style="margin: 0 0 5px 0; color: #5b21b6;">🚀 Flexible</h4>
                    <p style="margin: 0;"><b>Enfoque:</b> Experiencias hoy. Prioriza el estilo de vida (10%) y reduce el ahorro al mínimo (2%). Úsalo si ya tienes base financiera sólida.</p>
                </div>
            </div>
        `;
        this.showModal('Estrategias de Gasto', html);
    }

    getGuideHTML(hasTransactions) {
        // Condition: No existe ingreso registrado Y no existen movimientos
        const income = this.store.config.monthly_income_target;
        const hasIncome = income !== undefined && income !== null && income !== "" && income > 0;
        const needsGuide = !hasIncome && !hasTransactions;

        if (!needsGuide && this.guideStep !== 4) {
            this.guideStep = 0; // reset
            return '';
        }

        if (this.guideStep === undefined) this.guideStep = 0;

        let content = '';

        if (this.guideStep === 0) {
            content = `
                <h2 style="margin: 0 0 12px 0; font-size: 1.5rem; font-weight: 800; color: var(--text-main);">👋 Empecemos</h2>
                <p style="color: var(--text-secondary); margin-bottom: 20px; font-size: 0.95rem; line-height: 1.5;">Para ayudarte a tomar mejores decisiones, necesito 3 datos básicos. No te tomará más de 2 minutos.</p>
                <button onclick="window.ui.guideStep = 1; window.ui.render()" class="btn btn-primary" style="width: 100%; border-radius: 12px; padding: 14px; font-weight: 700;">👉 Empezar ahora</button>
            `;
        } else if (this.guideStep === 1) {
            content = `
                <h2 style="margin: 0 0 12px 0; font-size: 1.25rem; font-weight: 800; color: var(--text-main);">Paso 1 de 3</h2>
                <p style="color: var(--text-secondary); margin-bottom: 15px; font-size: 0.95rem;">¿Cuánto ganas al mes?</p>
                <input type="text" id="guide-income" placeholder="$0" inputmode="numeric" style="width:100%; padding:12px; border-radius:12px; border: 1px solid var(--border-color); margin-bottom: 15px; font-size: 1.1rem; text-align:center;" oninput="window.ui.formatCurrencyInput(this)">
                <button onclick="window.ui.saveGuideStep(1)" class="btn btn-primary" style="width: 100%; border-radius: 12px; padding: 14px; font-weight: 700;">Siguiente 👉</button>
            `;
        } else if (this.guideStep === 2) {
            content = `
                <h2 style="margin: 0 0 12px 0; font-size: 1.25rem; font-weight: 800; color: var(--text-main);">Paso 2 de 3</h2>
                <p style="color: var(--text-secondary); margin-bottom: 10px; font-size: 0.95rem;">¿Cuál es tu compromiso fijo más importante?</p>
                <select id="guide-fixed-type" style="width:100%; padding:12px; border-radius:12px; border: 1px solid var(--border-color); margin-bottom: 10px; font-size: 1rem;" onchange="document.getElementById('guide-fixed-other-container').style.display = (this.value === 'cat_10' || this.value === 'cat_fin_5') ? 'block' : 'none'">
                    <option value="">Selecciona una categoría...</option>
                    ${this.store.categories
                    .filter(c => c.group !== 'INGRESOS' && c.id !== 'cat_fin_4' && c.id !== 'cat_7')
                    .map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
                </select>
                <div id="guide-fixed-other-container" style="display:none; margin-bottom:10px;">
                    <input type="text" id="guide-fixed-other-name" placeholder="Escribe el nombre personalizado" style="width:100%; padding:12px; border-radius:12px; border: 1px solid var(--border-color); font-size: 0.95rem;">
                </div>
                <p style="color: var(--text-secondary); margin-bottom: 10px; font-size: 0.95rem;">Monto aproximado:</p>
                <input type="text" id="guide-fixed-amount" placeholder="$0" inputmode="numeric" style="width:100%; padding:12px; border-radius:12px; border: 1px solid var(--border-color); margin-bottom: 15px; font-size: 1.1rem; text-align:center;" oninput="window.ui.formatCurrencyInput(this)">
                <button onclick="window.ui.saveGuideStep(2)" class="btn btn-primary" style="width: 100%; border-radius: 12px; padding: 14px; font-weight: 700;">Siguiente 👉</button>
            `;
        } else if (this.guideStep === 3) {
            content = `
                <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--text-main); margin-bottom: 8px;">Obligaciones externas</h3>
                <p style="color: var(--text-secondary); margin-bottom: 15px; font-size: 0.95rem;">¿Tienes actualmente <b>créditos o deudas con saldo pendiente</b> (Hipotecas, préstamos)? <span style="display:block; font-size:0.8rem; margin-top:5px; color:#64748b;">(Si es Renting o una cuota de servicio, vuelve al paso anterior y agrégalo como Gasto Fijo).</span></p>
                
                <div style="display:flex; justify-content:center; gap:10px; margin-bottom:15px;" id="guide-debt-options">
                    <button class="btn" style="flex:1; background:#f1f5f9; color:#1e293b; border-radius:12px; padding:12px; border:2px solid transparent;" onclick="this.style.borderColor='var(--primary-color)'; this.nextElementSibling.style.borderColor='transparent'; document.getElementById('guide-debt-amount-container').style.display='block'; window.guideHasDebt=true;">Sí tengo</button>
                    <button class="btn" style="flex:1; background:#f1f5f9; color:#1e293b; border-radius:12px; padding:12px; border:2px solid transparent;" onclick="this.style.borderColor='var(--primary-color)'; this.previousElementSibling.style.borderColor='transparent'; document.getElementById('guide-debt-amount-container').style.display='none'; window.guideHasDebt=false;">No tengo</button>
                </div>
                
                <div id="guide-debt-amount-container" style="display:none;">
                    <p style="color: var(--text-secondary); margin-bottom: 10px; font-size: 0.95rem;">¿Cuánto sumas al mes en cuotas de deudas?</p>
                    <input type="text" id="guide-debt-amount" placeholder="Ej: $500.000" inputmode="numeric" style="width:100%; padding:12px; border-radius:12px; border: 1px solid var(--border-color); margin-bottom: 15px; font-size: 1.1rem; text-align:center;" oninput="window.ui.formatCurrencyInput(this)">
                    <p style="font-size: 0.75rem; color: #64748b; margin-top: -10px; margin-bottom: 15px; text-align: center;">(Suma de cuotas de créditos, hipotecas, etc.)</p>
                </div>

                <button onclick="window.ui.saveGuideStep(3)" class="btn btn-primary" style="width: 100%; border-radius: 12px; padding: 14px; font-weight: 700;">Ver mi diagnóstico ✨</button>
            `;
        } else if (this.guideStep === 4) {
            // Use _guideData if available, otherwise fallback to store config
            const income = (this._guideData && this._guideData.monthly_income_target) || (this.store.config && this.store.config.monthly_income_target) || 0;
            const fixedExpenseArray = (this._guideData && this._guideData.fixed_expenses) || (this.store.config && this.store.config.fixed_expenses) || [];
            const fixedExpense = fixedExpenseArray.reduce((sum, item) => sum + (item.amount || 0), 0);
            const loanAmount = (this._guideData && this._guideData.loan) ? (this._guideData.loan.monthly_payment || 0) : 0;
            const totalDebt = (this._guideData && this._guideData.total_debt) !== undefined ? this._guideData.total_debt : (this.store.config && this.store.config.total_debt) || 0;

            const totalCommitment = fixedExpense + loanAmount;
            const fixedRate = income > 0 ? (totalCommitment / income) : 0;
            const freeCash = income - totalCommitment;

            const formattedIncome = this.formatCurrency(income);
            const formattedFixedCommit = this.formatCurrency(totalCommitment);
            const formattedDebt = this.formatCurrency(totalDebt);
            const formattedFree = this.formatCurrency(Math.max(0, freeCash));

            let diagnosisTitle = "Análisis Inicial";
            let diagnosisColor = "#1e293b";
            let diagnosisIcon = "📊";
            let diagnosisText = "";

            if (fixedRate > 0.6) {
                diagnosisTitle = "Atención: Compromisos Elevados";
                diagnosisColor = "var(--danger-color)";
                diagnosisIcon = "⚠️";
                diagnosisText = `Tus compromisos fijos consumen el <b>${Math.round(fixedRate * 100)}%</b> de tus ingresos ($${this.formatNumberWithDots(totalCommitment)}). Esto deja poco margen de maniobra.`;
            } else if (fixedRate > 0.3) {
                diagnosisTitle = "Panorama Estable";
                diagnosisColor = "#0369a1";
                diagnosisIcon = "✅";
                diagnosisText = `Tus compromisos fijos representan el <b>${Math.round(fixedRate * 100)}%</b> de tus ingresos. Es un nivel saludable, pero podemos optimizar.`;
            } else {
                diagnosisTitle = "Excelente Capacidad";
                diagnosisColor = "var(--success-color)";
                diagnosisIcon = "🌟";
                diagnosisText = `Solo el <b>${Math.round(fixedRate * 100)}%</b> de tus ingresos se va en compromisos fijos. Tienes una gran oportunidad para crecer.`;
            }

            let debtAdvice = "";
            if (loanAmount > 0) {
                const loanName = (this._guideData && this._guideData.loan) ? this._guideData.loan.name : 'Tu obligación';
                debtAdvice = `<p style="margin: 10px 0 0 0; font-size: 0.9rem; opacity: 0.9;">Tu cuota de <b>${loanName}</b> por <b>${this.formatCurrency(loanAmount)}</b> ha sido integrada a tus compromisos fijos.</p>`;
            } else {
                debtAdvice = `<p style="margin: 10px 0 0 0; font-size: 0.9rem; opacity: 0.9;">¡Sin deudas activas! Estás en la posición ideal para construir patrimonio.</p>`;
            }

            content = `
                <div style="text-align: left;">
                    <h2 style="margin: 0 0 4px 0; font-size: 1.5rem; font-weight: 800; color: var(--text-main);">Tu Micro-Diagnóstico</h2>
                    <p style="color: var(--text-secondary); margin-bottom: 20px; font-size: 0.9rem;">Analizando tu base de ${formattedIncome}</p>
                    
                    <div style="background: ${diagnosisColor}10; border: 1px solid ${diagnosisColor}30; padding: 20px; border-radius: 20px; margin-bottom: 20px;">
                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                            <span style="font-size: 1.5rem;">${diagnosisIcon}</span>
                            <h3 style="margin: 0; font-size: 1.1rem; font-weight: 700; color: ${diagnosisColor};">${diagnosisTitle}</h3>
                        </div>
                        <p style="margin: 0; font-size: 0.95rem; color: #334155; line-height: 1.5;">
                            ${diagnosisText}
                        </p>
                        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px dashed ${diagnosisColor}40; color: ${diagnosisColor};">
                            ${debtAdvice}
                        </div>
                    </div>

                    <div style="background: #f8fafc; padding: 15px; border-radius: 12px; font-size: 0.85rem; color: #64748b; margin-bottom: 25px; border-left: 4px solid var(--primary-color);">
                        <b>Nota de tu asesor:</b> Tienes <b>${formattedFree}</b> disponibles cada mes para gastos variables, ahorro e inversión.
                    </div>

                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        <button onclick="window.ui.finishGuide('budget')" class="btn btn-primary" style="width: 100%; border-radius: 12px; padding: 14px; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 8px;">
                            <span>Crear mi presupuesto</span>
                            <i data-feather="arrow-right" style="width:18px; height:18px;"></i>
                        </button>
                        <button onclick="window.ui.finishGuide('expense')" class="btn btn-text" style="width: 100%; border-radius: 12px; padding: 14px; font-weight: 600; color: var(--text-secondary); border: 1px solid #e2e8f0;">
                            Prefiero registrar gastos primero
                        </button>
                    </div>
                </div>
            `;
        }

        // Return blank if completed
        if (this.guideStep === -1) {
            return '';
        }

        return `
            <div id="smart-guide-overlay" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.6); z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 20px; backdrop-filter: blur(4px);">
                <div id="smart-guide-card" style="background: white; border-radius: 24px; padding: 32px 24px; width: 100%; max-width: 400px; border: 1px solid #e1e7ef; box-shadow: 0 20px 40px rgba(0,0,0,0.2); text-align: center; position: relative; overflow: hidden; animation: modalIn 0.3s ease-out;">
                    <div style="position: absolute; top: -20px; right: -20px; width: 100px; height: 100px; background: linear-gradient(135deg, var(--primary-light), white); border-radius: 50%; opacity: 0.5;"></div>
                    <div style="position: relative; z-index: 1;">
                        ${content}
                    </div>
                </div>
            </div>
            <style>
                @keyframes modalIn {
                    from { opacity: 0; transform: scale(0.95) translateY(10px); }
                    to { opacity: 1; transform: scale(1) translateY(0); }
                }
            </style>
        `;
    }

    async saveGuideStep(step) {
        this._guideData = this._guideData || {};
        if (step === 1) {
            const val = document.getElementById('guide-income').value.replace(/\D/g, '');
            const amount = parseFloat(val) || 0;
            if (amount <= 0) { alert("Por favor ingresa un monto válido. Estoy aprendiendo de ti."); return; }
            this._guideData.monthly_income_target = amount;
            this.guideStep = 2;
            this.render();
        } else if (step === 2) {
            const val = document.getElementById('guide-fixed-amount').value.replace(/\D/g, '');
            const amount = parseFloat(val) || 0;
            if (amount > 0) {
                const catId = document.getElementById('guide-fixed-type').value;
                let catName = document.querySelector(`#guide-fixed-type option[value="${catId}"]`).text;
                if (catId === 'cat_10' || catId === 'cat_fin_5') {
                    const otherName = document.getElementById('guide-fixed-other-name').value;
                    if (otherName) catName = otherName;
                }
                this._guideData.fixed_expenses = [{ id: 'fix_' + Date.now(), name: catName, amount, category_id: catId }];
                this._guideData.cat_name = catName; // Store it for stage 3 naming
            }
            window.guideHasDebt = null; // reset
            this.guideStep = 3;
            this.render();
        } else if (step === 3) {
            if (window.guideHasDebt === undefined || window.guideHasDebt === null) {
                alert("Por favor selecciona una opción."); return;
            }
            if (window.guideHasDebt) {
                const val = document.getElementById('guide-debt-amount').value.replace(/\D/g, '');
                const monthlyPayment = parseFloat(val) || 0;

                // En el onboarding, solo capturamos la cuota mensual
                this._guideData.total_debt = 0;
                const loanName = 'Mi Préstamo / Deuda';

                this._guideData.loan = {
                    id: 'loan_' + Date.now(),
                    name: loanName,
                    monthly_payment: monthlyPayment,
                    payment_day: '',
                    total_balance: 0, // No inventamos el saldo si el usuario no lo dio
                    created_at: new Date().toISOString()
                };
            } else {
                this._guideData.total_debt = 0;
            }

            // Save to DB
            const fixed = this.store.config.fixed_expenses || [];
            if (this._guideData.fixed_expenses) {
                fixed.push(...this._guideData.fixed_expenses);
            }

            const loans = this.store.config.loans || [];
            if (this._guideData.loan) {
                loans.push(this._guideData.loan);
            }

            const btn = document.querySelector('#smart-guide-card button');
            if (btn) { btn.disabled = true; btn.innerHTML = 'Guardando...'; }

            await this.store.updateConfig({
                monthly_income_target: this._guideData.monthly_income_target,
                fixed_expenses: fixed,
                loans: loans
            });

            this.guideStep = 4;
            this.render();
        }
    }

    finishGuide(action) {
        this.guideStep = -1;
        this.render(); // This removes the modal

        setTimeout(() => {
            if (action === 'budget') {
                const navBtn = document.querySelector('[data-view="settings"]');
                if (navBtn) navBtn.click();
            } else if (action === 'expense') {
                const txModal = document.getElementById('transaction-modal');
                if (txModal) {
                    this.populateSelects('GASTO');
                    txModal.classList.remove('hidden');
                }
            }
        }, 300);
    }

    async renderDashboard() {

        this.pageTitle.textContent = 'Mi Dinero';


        // --- 0. Month Navigation & Header ---
        const currentMonthName = this.monthNames[this.viewDate.getMonth()];
        const currentYear = this.viewDate.getFullYear();

        // --- CONTINUITY LOGIC: Load or copy Monthly Plan ---
        let currentPlan = await this.store.getSavedMonthPlan(currentYear, this.viewDate.getMonth());

        if (!currentPlan) {
            // Find previous month plan as template
            let prevM = this.viewDate.getMonth() - 1;
            let prevY = currentYear;
            if (prevM < 0) { prevM = 11; prevY--; }

            const prevPlan = await this.store.getSavedMonthPlan(prevY, prevM);
            const templateData = {
                monthly_income_target: prevPlan ? (prevPlan.monthly_income_target || 0) : (this.store.config.monthly_income_target || 0),
                loans: prevPlan ? (prevPlan.loans || []) : (this.store.config.loans || [])
            };

            // Only show prompt if we are in dashboard view and it's a "fresh" month entry
            // BUG FIX: Only show prompt for CURRENT or FUTURE months
            const nowForModal = new Date();
            const isPast = (currentYear < nowForModal.getFullYear()) || (currentYear === nowForModal.getFullYear() && this.viewDate.getMonth() < nowForModal.getMonth());

            if (!isPast && this._monthPromptShownFor !== `${currentYear}-${this.viewDate.getMonth()}`) {
                this.showNewMonthModal(templateData, currentYear, this.viewDate.getMonth());
                this._monthPromptShownFor = `${currentYear}-${this.viewDate.getMonth()}`;
            }

            currentPlan = templateData;
        }

        // --- NEW: Sync Logic for brand new months or stale plans ---
        // If the plan has 0 income but the global config has income, we treat the plan as uninitialized
        if ((!currentPlan.monthly_income_target || currentPlan.monthly_income_target == 0) && (this.store.config.monthly_income_target > 0)) {
            currentPlan.monthly_income_target = this.store.config.monthly_income_target;
            currentPlan.loans = this.store.config.loans || [];
        }

        // Generate Recurring Items for this month (Fixed Expenses & Incomes)
        await this.store.processFixedExpenses(this.viewDate.getMonth(), this.viewDate.getFullYear());

        // Calculate Totals for Selected Date
        const summary = this.store.getFinancialSummary(this.viewDate.getMonth(), this.viewDate.getFullYear());
        const categoryBreakdown = this.store.getCategoryBreakdown(this.viewDate.getMonth(), this.viewDate.getFullYear());

        // Control Visibility based on Data
        const plan = this.advisor.generateActionPlan(this.viewDate.getMonth(), this.viewDate.getFullYear());

        const hasTransactions = this.store.transactions && this.store.transactions.length > 0;

        // --- CHECK: Is this a brand new user? ---
        const hasApiKey = this.aiAdvisor && this.aiAdvisor.hasApiKey && this.aiAdvisor.hasApiKey();

        // --- SECTION 0: WELCOME TIP (Modo Guía Inteligente) ---
        let welcomeTipHTML = this.getGuideHTML(hasTransactions);

        // --- AI TIP REMOVED ---
        let aiTipHTML = '';

        // MODELO EDUCATIVO COHERENTE
        const monthlyIncome = parseFloat(currentPlan.monthly_income_target.toString().replace(/\D/g, '')) || 0;
        const loansList = currentPlan.loans || [];
        const totalLoanPayments = loansList.reduce((sum, l) => {
            const mPay = l.monthly_payment || 0;
            const val = typeof mPay === 'string' ? parseFloat(mPay.replace(/\D/g, '')) : Number(mPay);
            return sum + (val || 0);
        }, 0);

        // Identificar cuánto se ha pagado ya de esas deudas en transacciones reales
        const currentMonthTxs = (this.store.transactions || []).filter(t => {
            const d = new Date(t.date);
            return d.getMonth() === this.viewDate.getMonth() && d.getFullYear() === this.viewDate.getFullYear();
        });
        const registeredLoanPayments = currentMonthTxs.filter(t =>
            t.category_id === 'cat_7' || t.type === 'PAGO_DEUDA' || t.type === 'PAGO_TARJETA'
        ).reduce((sum, t) => sum + t.amount, 0);

        // El presupuesto base es el ingreso total (Base configurada + Extras registrados)
        const disposableToOrganize = summary.income;

        // "Usado" total = (Todos los gastos/ahorros/inversiones registrados)
        const summaryTotalRegistered = (summary.expenses || 0) + (summary.savings || 0) + (summary.investment || 0) + (summary.debt_payment || 0);

        // El excedente de deuda es lo que esperamos pagar pero aún no hemos registrado
        const pendingLoanPayments = Math.max(0, totalLoanPayments - registeredLoanPayments);

        // Novedad: Identificar gastos fijos proyectados vs pagados por categoría
        const fixedExpensesList = this.store.config.fixed_expenses || [];
        const fixedExpensesByCat = {};
        let totalFixedExpensesAmount = 0;

        fixedExpensesList.forEach(fe => {
            const amount = parseFloat(fe.amount) || 0;
            fixedExpensesByCat[fe.category_id] = (fixedExpensesByCat[fe.category_id] || 0) + amount;
            totalFixedExpensesAmount += amount;
        });

        let pendingFixedExpenses = 0;
        for (const catId in fixedExpensesByCat) {
            const floor = fixedExpensesByCat[catId];
            const spentInCat = currentMonthTxs.filter(t => t.category_id === catId && t.type === 'GASTO').reduce((s, t) => s + t.amount, 0);
            pendingFixedExpenses += Math.max(0, floor - spentInCat);
        }

        const used = summaryTotalRegistered + pendingLoanPayments + pendingFixedExpenses;

        // Disponible restante
        const available = disposableToOrganize - used;

        const ratio = disposableToOrganize > 0 ? (used / disposableToOrganize) : 0;

        let statusText = "Dentro del presupuesto";
        let statusColor = "#2E7D32";
        let statusBg = "#E8F5E9";

        if (ratio > 1.0) {
            statusText = "Presupuesto superado";
            statusColor = "#D32F2F";
            statusBg = "#FFEBEE";
        } else if (ratio >= 0.8) {
            statusText = "Cerca del límite";
            statusColor = "#E65100";
            statusBg = "#FFF3E0";
        }

        const now = new Date();
        const isCurrentMonth = this.viewDate.getMonth() === now.getMonth() && this.viewDate.getFullYear() === now.getFullYear();
        
        // BUG FIX: Filter transactions strictly for the selected month context
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const txsThisWeek = (this.store.transactions || []).filter(t => {
            const d = new Date(t.date);
            // Si estamos en el mes actual, mostramos racha real de la semana.
            // Si estamos en un mes pasado, esta sección de racha no debería mostrarse o basarse en ese contexto.
            return isCurrentMonth && d >= oneWeekAgo;
        });
        // currentMonthTxs already declared above

        let miniGuideText = "Tu disciplina está construyendo claridad financiera.";
        if (txsThisWeek.length === 0) {
            miniGuideText = "Cuando registres tus gastos diarios, podré darte recomendaciones más precisas.";
        } else if (currentMonthTxs.length <= 5) {
            miniGuideText = "Vas bien. Entre más constante seas, más claro será tu panorama.";
        }

        const heroHTML = `
            ${welcomeTipHTML}
            <div class="dashboard-hero" style="background: white; border-radius: 24px; padding: 24px; border: 1px solid var(--border-color); box-shadow: var(--shadow-sm); margin-bottom: 2rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <button class="btn-icon" onclick="window.ui.changeMonth(-1)" style="background: #f8f9fa;"><i data-feather="chevron-left"></i></button>
                        <h2 style="margin: 0; font-size: 1.25rem; font-weight: 700; color: var(--text-main);">${currentMonthName} ${currentYear}</h2>
                        <button class="btn-icon" onclick="window.ui.changeMonth(1)" style="background: #f8f9fa;"><i data-feather="chevron-right"></i></button>
                    </div>
                </div>

                <div style="background: #fcfcfc; border-radius: 20px; padding: 20px; border: 1px solid #f0f0f0;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px;">
                        <div>
                            <span style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">Estado de tu organización</span>
                            <div style="margin-top: 4px;">
                                <span style="display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 700; color: ${statusColor}; background: ${statusBg};">
                                    ${statusText}
                                </span>
                            </div>
                            <div style="margin-top: 8px; font-size: 0.9rem; color: var(--text-main); font-weight: 500;">
                                ${ratio > 1.0 ? 'Has excedido tu capacidad de planeación.' : (ratio >= 0.8 ? 'Estás muy cerca de agotar lo planeado.' : 'Mantienes un margen saludable.')}
                            </div>
                            <div style="margin-top: 6px; font-size: 0.85rem; color: var(--text-secondary);">
                                ${miniGuideText}
                            </div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 1rem; color: #64748b; text-transform: uppercase; font-weight: 800; letter-spacing: 0.05em; margin-bottom: 2px;">Disponible</div>
                            <div style="font-size: 2.2rem; font-weight: 900; color: #0f172a; letter-spacing: -0.02em; line-height: 1;">
                                ${this.formatCurrency(available)}
                            </div>
                            <div style="font-size: 0.85rem; color: #64748b; margin-top: 8px;">
                                de un presupuesto de <b>${this.formatCurrency(disposableToOrganize)}</b>
                            </div>
                            ${totalLoanPayments > 0 || totalFixedExpensesAmount > 0 ? `
                            <div style="font-size: 0.75rem; color: #3b82f6; margin-top: 6px; font-weight: 600;">
                                Incluye ${[
                    totalLoanPayments > 0 ? this.formatCurrency(totalLoanPayments) + ' en cuotas' : null,
                    totalFixedExpensesAmount > 0 ? this.formatCurrency(totalFixedExpensesAmount) + ' en fijos' : null
                ].filter(Boolean).join(' y ')}
                            </div>` : ''}
                        </div>
                    </div>

                    <div style="height: 12px; background: #f0f0f0; border-radius: 6px; overflow: hidden; margin-bottom: 12px;">
                        <div style="width: ${Math.min(ratio * 100, 100)}%; background: ${statusColor}; height: 100%; border-radius: 6px; transition: width 0.5s ease; position: relative;">
                             ${(totalLoanPayments + totalFixedExpensesAmount) > 0 ? `<div style="position: absolute; left: 0; top: 0; bottom: 0; width: ${Math.min(((totalLoanPayments + totalFixedExpensesAmount) / disposableToOrganize) * 100, 100)}%; background: rgba(0,0,0,0.1); border-right: 1px solid rgba(255,255,255,0.3);"></div>` : ''}
                        </div>
                    </div>

                    <div style="display: flex; justify-content: space-between; font-size: 0.85rem; color: var(--text-secondary);">
                        <span>Comprometido: <b>${this.formatCurrency(used)}</b></span>
                        <span style="text-align: right;">Meta Ingreso: <b>${this.formatCurrency(disposableToOrganize)}</b></span>
                    </div>
                </div>
                
                <div style="margin-top: 16px; text-align: center;">
                    <button onclick="window.ui.openQuickExpense()" style="width: 100%; max-width: 320px; padding: 14px; background: var(--text-main); color: white; border: none; border-radius: 12px; font-weight: 700; font-size: 1rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: all 0.2s; margin: 0 auto; box-shadow: var(--shadow-md);" onmousedown="this.style.transform='scale(0.97)';" onmouseup="this.style.transform='scale(1)';">
                        <i data-feather="zap" style="width: 20px; height: 20px;"></i> Agregar Gasto Rápido
                    </button>
                    <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 8px;">Ideal para cafés, taxis y el día a día en 5 segundos</p>
                </div>

            </div>
        `;

        // --- SECTION 4: DETAILS (Transactions) ---
        const recentTxHTML = `
             <div class="details-card">
                <div class="card-header-clean">
                    <h4>Últimos Movimientos</h4>
                    <button class="btn-link" onclick="document.querySelector('[data-view=transactions]').click()">Ver todos</button>
                </div>
                <div class="transaction-list-compact">
                    ${this.renderRecentTransactionsHTML(3, this.viewDate.getMonth(), this.viewDate.getFullYear())}
                </div>
            </div>
        `;

        const detailsHTML = `
            <div class="details-grid">
                ${recentTxHTML}
            </div>
        `;

        // LAYOUT ASSEMBLY
        this.container.innerHTML = `
            ${heroHTML}
            ${detailsHTML}
        `;
        if (window.feather) window.feather.replace();

        // Trigger AI Insight if needed (for budget advice cards only)
        this.processAIAdvice(plan);
        // NOTE: AI analysis is now triggered exclusively by new expenses to optimize token consumption.
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

        // Change the badge to reflect offline mode so it doesn't contradict
        const badge = document.getElementById('ai-status-badge');
        if (badge) {
            badge.innerText = '🤖 Modo Respaldo (Sin Conexión)';
            badge.style.background = '#e2e8f0';
            badge.style.color = '#475569';
        }

        // Local Math-based logic (Cleaned up to sound professional, not "bobada")
        let insight = "Los gastos se encuetran dentro de los márgenes previstos.";
        let strategy = "Prioridad: Completar el registro de transacciones pendientes.";
        let action = "Monitorear la categoría con mayor gasto este mes.";

        if (plan.status === 'CRITICAL') {
            insight = "Déficit Detectado: La tasa de gasto actual supera los ingresos registrados.";
            strategy = "Detener gastos no esenciales (Micro-transacciones y Ocio).";
            action = "Revisar suscripciones activas y cancelar las innecesarias urgentemente.";
        } else if (plan.status === 'WARNING') {
            insight = "Margen Riesgoso: Acercándose al límite del presupuesto mensual.";
            strategy = "Congelar grandes adquisiciones hasta el próximo corte.";
            action = "Priorizar liquidez para asegurar el pago de gastos fijos.";
        } else if (plan.status === 'SURPLUS') {
            insight = "Superávit de Liquidez: Disponibilidad de capital sin asignar.";
            strategy = "Evitar la inflación del estilo de vida con los excedentes.";
            action = "Asignar el dinero flotante a fondos de ahorro o deudas anticipadas.";
        }

        const fallbackHTML = `
            <div style="border-left: 3px solid #64748b; padding-left: 12px; margin-top: 8px; color: #334155; font-size: 0.9rem; line-height: 1.5;">
                <div style="margin-bottom: 6px;"><strong>Análisis:</strong> ${insight}</div>
                <div style="margin-bottom: 6px;"><strong>Estrategia:</strong> ${strategy}</div>
                <div><strong>Acción:</strong> ${action}</div>
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
        const isCurrentMonth = (new Date().getMonth() === month && new Date().getFullYear() === year);

        // Si no estamos en el mes actual, no molestar con estas alertas de acción inmediata
        if (!isCurrentMonth) return '';

        const txs = this.store.transactions.filter(t => {
            const d = new Date(t.date);
            return d.getMonth() === month && d.getFullYear() === year;
        });

        const incomeTxs = txs.filter(t => t.type === 'INGRESO');
        const savingsTxs = txs.filter(t => t.type === 'AHORRO' || t.category_id === 'cat_5');

        const totalIncome = incomeTxs.reduce((s, t) => s + t.amount, 0);
        const totalSaved = savingsTxs.reduce((s, t) => s + t.amount, 0);

        const configuredIncome = parseFloat((this.store.config.monthly_income_target || '0').toString().replace(/\D/g, ''));
        const effectiveIncome = totalIncome > 0 ? totalIncome : configuredIncome;

        if (effectiveIncome === 0) {
            nudges.push({
                emoji: '💵',
                title: 'Faltan tus ingresos',
                msg: 'Registra tu ingreso para comenzar tu análisis financiero.',
                action: 'Registrar ingreso →',
                onclick: "document.getElementById('add-transaction-btn').click()"
            });
        } else if (totalSaved === 0) {
            nudges.push({
                emoji: '🐷',
                title: 'Protege tu dinero',
                msg: 'Aparta tu ahorro primero para proteger tu dinero.',
                action: 'Registra tu ahorro →',
                onclick: "document.getElementById('add-transaction-btn').click()"
            });
        } else {
            nudges.push({
                emoji: '✅',
                title: 'Todo en orden',
                msg: 'Tu análisis financiero está listo.',
                action: 'Ver detalle →',
                onclick: "window.scrollBy({ top: 300, behavior: 'smooth' })"
            });
        }

        const n = nudges[0];
        return `
            <div style="margin-bottom: 1.5rem;">
                <div style="background: white; border-radius: 12px; padding: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); border-left: 4px solid #FF9800; display: flex; flex-direction: column; gap: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 1.4rem;">${n.emoji}</span>
                        <strong style="font-size: 0.95rem; color: #333;">${n.title}</strong>
                    </div>
                    <p style="margin: 0; font-size: 0.85rem; color: #666; line-height: 1.4;">${n.msg}</p>
                    <button onclick="${n.onclick}" style="background: none; border: none; color: var(--primary-color); font-size: 0.85rem; font-weight: 700; cursor: pointer; padding: 0; text-align: left; width: max-content; margin-top: 4px;">
                        ${n.action}
                    </button>
                </div>
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
        if (!auth.currentUser) {
            this.navigate('login');
            return;
        }
        // Safety check to prevent ghost overlays from piling up
        const existing = document.getElementById('quick-expense-overlay');
        if (existing) {
            existing.remove();
            console.log("Deleted ghost overlay");
        }

        // --- 1. Get Top Categories + Force Priority (Coffee/Food) ---
        const txs = this.store.transactions.filter(t => t.type === 'GASTO');
        const catCounts = {};
        txs.forEach(t => { catCounts[t.category_id] = (catCounts[t.category_id] || 0) + 1; });

        // STRICT WHITELIST: Only spontaneous, fungible, on-the-go expenses
        const spontaneousAllowedIds = [
            'cat_2', // Alimentación
            'cat_3', // Transporte
            'cat_gasolina', // Gasolina
            'cat_4', // Salud (Farmacia etc)
            'cat_9', // Ocio
            'cat_rest', // Restaurantes / Domicilios
            'cat_personal', // Ropa / Cuidado Personal
            'cat_vicios', // Alcohol / Tabaco
            'cat_ant', // Café / Snacks
            'cat_10' // Otros/Imprevistos
        ];

        // Get historically top categories that are ONLY in the whitelist
        let topCats = Object.entries(catCounts)
            .sort((a, b) => b[1] - a[1])
            .filter(([id]) => spontaneousAllowedIds.includes(id)) // Apply Whitelist
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

        // FALLBACK & PADDING: Ensure we always show at least 6 buttons
        const defaultPadIds = ['cat_2', 'cat_ant', 'cat_3', 'cat_9', 'cat_rest', 'cat_10', 'cat_personal'];

        if (topCats.length < 6) {
            defaultPadIds.forEach(padId => {
                if (topCats.length >= 6) return; // Stop when we reach 6

                // If it's not already in the list, add it
                if (!topCats.find(c => c.id === padId)) {
                    const cat = this.store.categories.find(c => c.id === padId);
                    if (cat) topCats.push(cat);
                }
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
                <div style="display:flex; gap:10px;">
                    <!-- Guía removed from here -->
                    <button id="close-quick-btn" style="background:rgba(0,0,0,0.05); border:none; width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center; cursor:pointer; color:var(--text-secondary); font-size: 1.2rem;">&times;</button>
                </div>
            </div>
                
                <div style="position:relative; margin-bottom: 24px;">
                    <span style="position:absolute; left:20px; top:50%; transform:translateY(-50%); font-size:1.5rem; color: var(--text-main); font-weight:700;">$</span>
                    <input id="quick-amount" type="text" inputmode="numeric" placeholder="0" 
                        style="width:100%; padding:20px 20px 20px 40px; font-size:2.5rem; font-weight:800; border:none; background:var(--bg-body); border-radius:18px; text-align:center; box-sizing:border-box; outline:none; color:var(--text-main);"
                        oninput="window.ui.formatCurrencyInput(this)"
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
                
                <div style="margin-bottom: 24px;">
                    <p style="margin:0 0 8px; font-size:0.85rem; font-weight:600; color:var(--text-secondary); text-transform:uppercase;">💳 Pago desde</p>
                    <select id="quick-account-select" style="width:100%; padding:14px; border:1px solid var(--border-color); border-radius:16px; background:var(--bg-surface); font-size:1rem; font-weight:500; font-family: inherit; outline:none; color:var(--text-main); cursor:pointer;">
                        ${this.store.accounts.map(a => {
            const isTC = a.type === 'CREDITO';
            const label = isTC ? 'Saldo de tarjeta' : 'Saldo';
            return `<option value="${a.id}">${a.name} (${label}: ${this.formatCurrency(a.current_balance)})</option>`;
        }).join('')}
                    </select>
                </div>
                
                <button id="quick-save-btn" style="width:100%; padding:18px; background:var(--text-main); color:white; border:none; border-radius:16px; font-size:1.1rem; font-weight:700; cursor:pointer; box-shadow: var(--shadow-md); opacity: 0.5; pointer-events: none; transition: opacity 0.3s;">
                    Guardar Gasto
                </button>
            </div>
        `;

        overlay.innerHTML = overlayContent;
        document.body.appendChild(overlay);

        // --- Event Handlers ---
        // Scoped to the current overlay to prevent ghost DOM selection
        const amountInput = overlay.querySelector('#quick-amount');
        const saveBtn = overlay.querySelector('#quick-save-btn');
        const closeBtn = overlay.querySelector('#close-quick-btn');
        const catContainer = overlay.querySelector('#quick-cats-container');
        let selectedCatId = null;

        // Auto-focus input
        setTimeout(() => amountInput.focus(), 100);

        // Close logic
        const closeOverlay = () => {
            overlay.style.opacity = '0';
            setTimeout(() => document.body.removeChild(overlay), 200);
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
            btn.style.borderColor = 'var(--primary-color)';
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
                saveBtn.disabled = false;
                saveBtn.style.opacity = '1';
                saveBtn.style.pointerEvents = 'auto';
            } else {
                saveBtn.disabled = true;
                saveBtn.style.opacity = '0.5';
                saveBtn.style.pointerEvents = 'none';
            }
        }

        // Save Logic
        saveBtn.addEventListener('click', () => {
            const amountStr = amountInput.value.replace(/\./g, '');
            const amount = parseFloat(amountStr);
            const catId = selectedCatId;
            const catName = this.store.categories.find(c => c.id === catId)?.name || '';

            // Find accounting (Updated to use dropdown)
            const acctSelect = overlay.querySelector('#quick-account-select');
            const accountId = acctSelect ? acctSelect.value : (this.store.accounts.find(a => a.type === 'EFECTIVO')?.id || this.store.accounts[0]?.id || 'acc_1');

            const txData = {
                type: 'GASTO',
                amount: amount,
                date: new Date().toISOString().split('T')[0],
                category_id: catId,
                account_id: accountId,
                note: `Gasto rápido: ${catName}`
            };

            // --- BLOQUEO DE NEGATIVOS (QUICK EXPENSE) ---
            /*
            const account = this.store.accounts.find(a => a.id === accountId);
            if (account && (account.current_balance - amount < 0) && account.type !== 'CREDITO') {
                closeOverlay(); // Close quick overlay first
                this.showNegativeBalanceIntervention(txData, account, null, null, null, null);
                return; // Stop execution
            }
            */

            const newTx = this.store.addTransaction(txData);

            // Clear specialized advice cache
            const m = new Date().getMonth();
            const y = new Date().getFullYear();
            const cacheKey = `cc_ai_v65_${y}_${m}_gemini`;
            localStorage.removeItem(cacheKey);

            // PROACTIVE AI: Trigger insight & Overspend Check
            setTimeout(() => this.triggerSpendingInsight(newTx || txData), 500);
            setTimeout(() => this.checkAndPromptOverspend(newTx || txData), 600);

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

            // No cached response and AI must NOT run automatically.
            // Show local fallback message — AI only runs when a new expense is registered.
            const coachFallback = item.fallback || "Registra un gasto para que la IA actualice su diagnóstico automáticamente.";

            element.style.background = '#F5F5F5';
            element.style.border = '1px dashed #DDD';
            element.classList.remove('ai-loading');

            element.innerHTML = `
                <div style="display:flex; gap:10px; align-items:flex-start;">
                    <span class="tip-bullet">💡</span>
                    <span class="tip-text" style="color: #666; line-height: 1.4; font-size: 0.85rem;">
                        ${coachFallback}
                    </span>
                </div>
            `;
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

        // 1. GASTOS FIJOS INDIVIDUALES
        const fixedExpenses = this.store.config.fixed_expenses || [];
        const loansList = this.store.config.loans || [];
        const groupLabels = {
            'FIXED': '📌 Gastos Fijos (Compromisos)',
            'AHORRO': '💰 Prioridad de Ahorro',
            'NECESIDADES': '🍎 Necesidades Básicas',
            'VIVIENDA': '🏠 Hogar y Servicios',
            'FINANCIERO': '🏦 Obligaciones Financieras',
            'CRECIMIENTO': '📚 Educación y Desarrollo',
            'ESTILO_DE_VIDA': '✨ Estilo de Vida',
            'OTROS': '📦 Otros Gastos'
        };

        const groupData = {};
        Object.keys(groupLabels).forEach(key => {
            groupData[key] = { label: groupLabels[key], items: [], hasOver: false, maxPercent: 0 };
        });

        const month = this.viewDate.getMonth();
        const year = this.viewDate.getFullYear();
        const monthlyTx = this.store.transactions.filter(t => {
            if (!t.date) return false;
            const parts = t.date.split('-');
            return parseInt(parts[0]) === year && (parseInt(parts[1]) - 1) === month;
        });

        // 1. GASTOS FIJOS INDIVIDUALES (Desde config.fixed_expenses)
        const addedCategories = new Set();
        fixedExpenses.forEach(fe => {
            const cat = categories.find(c => c.id === fe.category_id);
            const catName = cat ? cat.name : '';
            // Buscar gasto específico de este fijo (automático) o caer en el default
            const feTx = monthlyTx.filter(t => t.is_auto_fixed && t.category_id === fe.category_id && (t.fixed_id === fe.id || (t.description && t.description.includes(fe.name))));
            let spent = feTx.length > 0 ? feTx.reduce((s, t) => s + t.amount, 0) : (breakdown[fe.name] || 0);

            // Si no hay transacciones automáticas e históricamente usaba el nombre de la categoría y solo hay 1 fijo en ella
            if (spent === 0 && fixedExpenses.filter(f => f.category_id === fe.category_id).length === 1) {
                spent = breakdown[catName] || 0;
            }
            const limit = fe.amount || 0;
            const percent = limit > 0 ? (spent / limit) * 100 : (spent > 0 ? 150 : 0);

            let status = 'OK';
            if (limit > 0 && percent > 100) status = 'OVER';
            else if (limit > 0 && percent > 85) status = 'WARN';

            groupData['FIXED'].items.push({
                name: fe.name,
                spent,
                limit,
                percent,
                status
            });
            if (status.startsWith('OVER')) groupData['FIXED'].hasOver = true;
            if (percent > groupData['FIXED'].maxPercent) groupData['FIXED'].maxPercent = percent;
            if (fe.category_id) addedCategories.add(fe.category_id);
        });

        // 2. PRÉSTAMOS / DEUDAS (Desde config.loans)
        loansList.forEach(loan => {
            const spent = breakdown[loan.name] || 0;
            const limit = loan.monthly_payment || 0;
            const percent = limit > 0 ? (spent / limit) * 100 : (spent > 0 ? 150 : 0);

            let status = 'OK';
            if (limit > 0 && percent > 100) status = 'OVER';

            groupData['FINANCIERO'].items.push({
                name: loan.name,
                spent,
                limit,
                percent,
                status
            });
            if (status.startsWith('OVER')) groupData['FINANCIERO'].hasOver = true;
            if (loan.category_id) addedCategories.add(loan.category_id);

            // Si el nombre del crédito coincide con una categoría o pertenece a gastos financieros genéricos, agreguémoslo al set para evitar duplis.
            const possibleCat = categories.find(c =>
                c.name.toLowerCase() === loan.name.toLowerCase() ||
                (c.group === 'FINANCIERO' && (categories.filter(x => x.group === 'FINANCIERO').length === 1 || c.name.toLowerCase().includes('deud') || c.name.toLowerCase().includes('créd')))
            );
            if (possibleCat) addedCategories.add(possibleCat.id);
        });

        // 3. OTRAS CATEGORÍAS (Variables o no definidas en fijos)
        categories.forEach(c => {
            if (c.id === 'cat_fin_4' || c.group === 'INGRESOS') return;
            if (addedCategories.has(c.id)) return;

            const spent = breakdown[c.name] || 0;
            const limit = budgets[c.id] || 0;
            if (spent === 0 && limit === 0) return;

            const percent = limit > 0 ? (spent / limit) * 100 : (spent > 0 ? 150 : 0);
            let status = 'OK';
            if (limit <= 0 && spent > 0) status = 'OVER_UNBUDGETED';
            else if (limit > 0 && percent > 100) status = 'OVER';
            else if (limit > 0 && percent > 85) status = 'WARN';

            const key = c.id === 'cat_5' ? 'AHORRO' : (c.group || 'OTROS');
            if (!groupData[key]) groupData[key] = { label: c.group || 'Otros', items: [], hasOver: false, maxPercent: 0 };

            groupData[key].items.push({
                name: c.name,
                spent,
                limit,
                percent,
                status
            });
            if (status.startsWith('OVER')) groupData[key].hasOver = true;
            if (percent > groupData[key].maxPercent) groupData[key].maxPercent = percent;
        });

        const sortedGroups = Object.keys(groupData)
            .filter(key => groupData[key].items.length > 0)
            .sort((a, b) => {
                const order = ['NECESIDADES', 'ESTILO_DE_VIDA', 'VIVIENDA', 'CRECIMIENTO', 'OTROS', 'AHORRO', 'FINANCIERO', 'FIXED'];
                return order.indexOf(a) - order.indexOf(b);
            });

        let html = `
            <div class="details-card" style="height: auto; overflow: visible;">
                <div class="card-header-clean">
                    <h4>Seguimiento de Presupuesto 📊</h4>
                </div>
                <div class="budget-list-compact" style="overflow: visible;">
        `;

        if (sortedGroups.length === 0) {
            html += `<p class="empty-state">No hay gastos ni presupuestos activos este mes.</p>`;
        } else {
            const renderRow = (item) => {
                const cat = categories.find(c => c.name === item.name || (this.store.config.category_names && this.store.config.category_names[c.id] === item.name));
                const catId = cat ? cat.id : null;
                const type = (this.store.config.category_types && this.store.config.category_types[catId]) || 'VARIABLE';

                if (type === 'FIXED') {
                    const isPaid = item.spent >= item.limit && item.limit > 0;
                    return `
                        <div style="background: white; border-radius: 12px; padding: 12px; border: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 8px;">
                            <div style="flex: 1;">
                                <div style="font-size: 0.9rem; font-weight: 700; color: #1e293b;">${item.name}</div>
                                <div style="font-size: 0.75rem; color: #64748b;">Monto: ${this.formatCurrency(item.limit)}</div>
                            </div>
                            <div>
                                ${isPaid ? `
                                    <div style="background: #dcfce7; color: #166534; padding: 4px 10px; border-radius: 20px; font-size: 0.7rem; font-weight: 800; display: flex; align-items: center; gap: 4px;">
                                        PAGADO
                                    </div>
                                ` : `
                                    <button onclick="window.ui.confirmFixedPayment('${catId}', ${item.limit}, '${item.name}')" style="background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; padding: 6px 12px; border-radius: 20px; font-size: 0.7rem; font-weight: 800; cursor: pointer; transition: all 0.2s;">
                                        💰 PAGAR
                                    </button>
                                `}
                            </div>
                        </div>
                    `;
                }

                const barColor = (item.status === 'OVER' || item.status === 'OVER_UNBUDGETED') ? '#ef4444' : (item.status === 'WARN' ? '#f59e0b' : '#10b981');
                const width = Math.min(item.percent, 100);
                const isOver = item.status === 'OVER' || item.status === 'OVER_UNBUDGETED';

                return `
                    <div class="budget-row" style="margin-bottom: 0.8rem; padding: 4px 0; border-bottom: 1px solid #f1f5f9;">
                        <div style="margin-bottom: 0.3rem; display: flex; justify-content: space-between;">
                            <span style="font-weight: 600; font-size: 0.85rem; color: #1e293b;">${item.name}</span>
                            <span style="font-size: 0.75rem; font-weight: 700; color: ${barColor};">${Math.round(item.percent)}%</span>
                        </div>
                        <div style="font-size: 0.75rem; color: #64748b; margin-bottom: 6px;">
                            ${this.formatCurrency(item.spent)} / <span style="font-weight: 600;">${item.limit > 0 ? this.formatCurrency(item.limit) : 'Sin Pres.'}</span>
                        </div>
                        <div style="height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden;">
                            <div style="width: ${width}%; height: 100%; background: ${barColor}; border-radius: 4px; transition: width 0.3s ease;"></div>
                        </div>
                        ${isOver ? `<div style="color: #dc2626; font-size: 0.7rem; font-weight: 600; margin-top: 4px;">Excedido por ${this.formatCurrency(Math.max(0, item.spent - item.limit))}</div>` : ''}
                    </div>
                `;
            };

            sortedGroups.forEach(key => {
                const group = groupData[key];
                html += `
                    <details ${group.hasOver ? 'open' : ''} style="margin-bottom: 1.25rem; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; overflow: visible;">
                        <summary style="padding: 12px 16px; font-weight: 700; font-size: 0.9rem; color: ${group.hasOver ? '#b91c1c' : '#475569'}; cursor: pointer; display: flex; align-items: center; justify-content: space-between; list-style: none;">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <span style="transition: transform 0.2s;">▶</span>
                                ${group.label}
                            </div>
                            ${group.hasOver ? '<span style="background:#fee2e2; color:#ef4444; font-size:0.65rem; padding:2px 8px; border-radius:10px;">EXCEDIDO</span>' : ''}
                        </summary>
                        <div style="padding: 10px 16px; background: #fff; overflow: visible;">
                            ${group.items.map(i => renderRow(i)).join('')}
                        </div>
                    </details>
                `;
            });
        }

        html += `</div></div>`;
        return html;
    }

    renderHistoryChart() {
        const ctx = document.getElementById('historyChart');
        if (!ctx) return;

        const rawHistory = this.store.getHistorySummary(6).reverse(); // Oldest first

        let firstActiveIdx = -1;
        for (let i = 0; i < rawHistory.length; i++) {
            if (rawHistory[i].income > 0 || rawHistory[i].expenses > 0) {
                firstActiveIdx = i;
                break;
            }
        }

        // If no active data found at all, just show the last month (current month)
        let filteredHistory = rawHistory;
        if (firstActiveIdx === -1) {
            filteredHistory = [rawHistory[rawHistory.length - 1]];
        } else {
            // Include everything from the first active month onwards
            filteredHistory = rawHistory.slice(firstActiveIdx);
        }

        const labels = filteredHistory.map(h => h.label);
        const incomeData = filteredHistory.map(h => h.income);
        const expenseData = filteredHistory.map(h => h.expenses);

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
    checkAndPromptOverspend(txData) {
        if (txData.type !== 'GASTO') return;

        const catId = txData.category_id;
        const budget = parseFloat(this.store.config.budgets[catId]) || 0;
        if (budget <= 0) return; // No budget to exceed

        // Calculate total spent in this month
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

        const spent = this.store.transactions
            .filter(t => t.category_id === catId && t.type === 'GASTO' && t.date >= startOfMonth && t.date <= endOfMonth)
            .reduce((sum, t) => sum + parseFloat(t.amount), 0);

        if (spent > budget) {
            const excess = spent - budget;

            // El usuario SIEMPRE decide el rebalanceo — nada es automático
            this.showOverspendRebalanceModal(catId, excess);
        }
    }

    showOverspendRebalanceModal(overspentCatId, excessParam) {
        const cat = this.store.categories.find(c => c.id === overspentCatId);
        const name = cat ? cat.name : 'la categoría';

        // IDENTIFY FIXED EXPENSES TO EXCLUDE THEM
        const fixedFloor = {};
        (this.store.config.fixed_expenses || []).forEach(fe => {
            if (fe.category_id && fe.amount) fixedFloor[fe.category_id] = (fixedFloor[fe.category_id] || 0) + fe.amount;
        });

        // JERARQUÍA DE SACRIFICIO ESTRICTA: Solo se puede robar de estas 3 categorías, EN ESTE ORDEN.
        const SACRIFICE_ORDER = ['cat_9', 'cat_vicios', 'cat_ant']; // Ocio → Alcohol/Tabaco → Café/Snacks

        // Find categories with surplus
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

        const surplusCats = [];
        SACRIFICE_ORDER.forEach(catId => {
            if (catId === overspentCatId) return; // Don't suggest taking from the same overspent category
            const c = this.store.categories.find(cat => cat.id === catId);
            if (!c) return;

            const b = parseFloat(this.store.config.budgets?.[catId]) || 0;
            if (b > 0) {
                const s = this.store.transactions
                    .filter(t => t.category_id === catId && t.type === 'GASTO' && t.date >= startOfMonth && t.date <= endOfMonth)
                    .reduce((sum, t) => sum + parseFloat(t.amount), 0);
                if (b - s > 0) surplusCats.push({ id: catId, name: c.name, surplus: b - s });
            }
        });

        let optionsHtml = '';
        if (surplusCats.length === 0) {
            optionsHtml = `
                <div style="background: #FFF3E0; border: 1px solid #FFCC80; padding: 15px; border-radius: 12px; text-align: center;">
                    <p style="margin: 0 0 5px 0; font-size: 0.95rem; color: #E65100; font-weight: 700;">⚠️ Sin margen de maniobra</p>
                    <p style="margin: 0 0 14px 0; font-size: 0.85rem; color: #555; line-height: 1.5;">
                        No queda saldo en Ocio, Alcohol ni Café. El déficit de <b>$${this.formatNumberWithDots(excessParam)}</b> en <b>${name}</b> queda registrado. Necesitas ajustar tu presupuesto para el mes que viene.
                    </p>
                    <div style="display:flex; gap:8px; justify-content:center;">
                        <button type="button" onclick="document.body.removeChild(this.closest('.modal')); document.querySelector('[data-view=settings]').click()" 
                            style="background:var(--primary-color); color:white; border:none; padding:10px 16px; border-radius:20px; font-weight:700; font-size:0.85rem; cursor:pointer;">
                            Ajustar Presupuesto
                        </button>
                        <button type="button" onclick="document.body.removeChild(this.closest('.modal'))" 
                            style="background:none; border:2px solid #FFCC80; color:#E65100; padding:10px 16px; border-radius:20px; font-weight:600; font-size:0.85rem; cursor:pointer;">
                            Entendido, seguir
                        </button>
                    </div>
                </div>
            `;
        } else {
            // Already sorted by SACRIFICE_ORDER — no re-sort needed
            optionsHtml = surplusCats.map(c => `
                <button type="button" onclick="window.ui.executeRebalance('${c.id}', '${overspentCatId}', ${excessParam})" 
                        style="background: white; border: 1px solid #ddd; padding: 10px; border-radius: 8px; font-size: 0.85rem; cursor: pointer; text-align: left; width: 100%; display: flex; justify-content: space-between; margin-bottom: 8px; transition: transform 0.2s;"
                        onmousedown="this.style.transform='scale(0.98)'" onmouseup="this.style.transform='scale(1)'">
                    <span>${c.name}</span>
                    <span style="color: #4CAF50; font-weight: bold;">Sobra: $${this.formatNumberWithDots(c.surplus)}</span>
                </button>
            `).join('');
        }

        const modalHtml = `
            <div style="text-align: center; margin-bottom: 15px;">
                <span style="font-size: 3rem;">⚠️</span>
                <p style="font-weight: 600; font-size: 1.1rem; margin-top: 10px; color: #D32F2F;">¡Presupuesto superado!</p>
                
                <div style="background: #FFF3E0; border-left: 4px solid #FF9800; padding: 12px; text-align: left; margin: 15px 0; border-radius: 4px;">
                    <p style="font-weight: bold; margin: 0 0 5px 0; font-size: 0.9rem; color: #E65100;">Análisis de IA:</p>
                    <p id="overbudget-ai-text" style="margin: 0; color: #444; font-size: 0.9rem; line-height: 1.4;">
                        <span style="color: #888; display: flex; align-items: center; gap: 8px;">
                            <i style="animation: spin 1s linear infinite;" class="fas fa-circle-notch"></i> Evaluando impacto de este gasto...
                        </span>
                    </p>
                </div>
                
                <p style="color: #555; font-size: 0.9rem; margin-bottom: 15px;">¿De qué categoría podemos sacar dinero sobrante para cubrir el exceso de <b>$${this.formatNumberWithDots(excessParam)}</b>?</p>
            </div>
            <div style="max-height: 250px; overflow-y: auto;">
                ${optionsHtml}
            </div>
            ${surplusCats.length > 0 ? `
            <div style="margin-top: 15px; text-align: center;">
                <button type="button" onclick="document.body.removeChild(this.closest('.modal'))" 
                    style="background: none; border: none; color: #999; font-size:0.8rem; text-decoration: underline; cursor: pointer;">
                    Omitir por ahora
                </button>
            </div>` : ''}
        `;

        this.showModal('Rebalanceo Inteligente', modalHtml);

        // Fetch AI dynamic message
        this.fetchOverbudgetAIInfo(name, excessParam, surplusCats);
    }

    async fetchOverbudgetAIInfo(catName, excessAmount, surplusCats) {
        const textElement = document.getElementById('overbudget-ai-text');
        if (!textElement) return;

        try {
            const aiText = await this.aiAdvisor.getOverbudgetInsight(catName, excessAmount, surplusCats);
            if (aiText && document.getElementById('overbudget-ai-text')) {
                // Limpiar comillas extra que a veces devuelve el modelo
                const clean = aiText.replace(/^"+|"+$/g, '').trim();
                document.getElementById('overbudget-ai-text').textContent = clean;
            }
        } catch (error) {
            console.error("Failed fetching dynamic AI overbudget alert", error);
            if (document.getElementById('overbudget-ai-text')) {
                document.getElementById('overbudget-ai-text').textContent = `Te has pasado $${excessAmount.toLocaleString()} en ${catName}. Sin fuentes de sacrificio disponibles por ahora.`;
            }
        }
    }

    // --- BLOQUEO DE NEGATIVOS Y RESOLUCIÓN ---
    showNegativeBalanceIntervention(txData, account, editId, form, txModal, categoryGroup) {
        // Encontrar cuenta de crédito como fallback
        const creditAccount = this.store.accounts.find(a => a.type === 'CREDITO');

        const modalHtml = `
            <div style="text-align: center; margin-bottom: 20px;">
                <span style="font-size: 3rem;">🛑</span>
                <p style="font-weight: 700; font-size: 1.2rem; margin-top: 10px; color: #D32F2F;">¡ALERTA DE DESCUADRE!</p>
                <div style="background: #FAFAFA; border-left: 4px solid #D32F2F; padding: 15px; text-align: left; margin: 15px 0; border-radius: 4px;">
                    <p style="font-weight: bold; margin: 0 0 5px 0; font-size: 0.95rem;">Análisis de IA:</p>
                    <p id="negative-balance-ai-text" style="margin: 0; color: #444; font-size: 0.9rem; line-height: 1.4;">
                        <span style="color: #888; display: flex; align-items: center; gap: 8px;">
                            <i style="animation: spin 1s linear infinite;" class="fas fa-circle-notch"></i> Evaluando impacto de este gasto...
                        </span>
                    </p>
                </div>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 20px;">
                ${creditAccount ? `
                    <button type="button" onclick="window.ui.resolveNegativeBalance('DEBT', ${JSON.stringify(txData).replace(/"/g, '&quot;')}, '${creditAccount.id}', ${editId ? `'${editId}'` : 'null'})"
                            style="background: var(--primary-light); border: 1px solid var(--primary-color); color: var(--primary-dark); padding: 14px; border-radius: 12px; font-weight: 600; font-size: 0.95rem; cursor: pointer; text-align: left; display: flex; align-items: center; justify-content: space-between; transition: all 0.2s;"
                            onmouseover="this.style.background='#F8BBD0'" onmouseout="this.style.background='#FCE4EC'">
                        <span>💳 Saldo de tarjeta. Pago con ${creditAccount.name}</span>
                        <span>→</span>
                    </button>
                ` : `
                    <div style="background: #FFE0B2; padding: 10px; border-radius: 8px; font-size: 0.85rem; color: #E65100;">
                        No tienes una Tarjeta de Crédito configurada para asumir este gasto como saldo en tarjeta.
                    </div>
                `}
                
                <button type="button" onclick="window.ui.resolveNegativeBalance('ERROR', null, null, null)"
                        style="background: #FFF; border: 1px solid #DDD; color: #555; padding: 14px; border-radius: 12px; font-weight: 600; font-size: 0.95rem; cursor: pointer; text-align: left; display: flex; align-items: center; justify-content: space-between; transition: all 0.2s;"
                        onmouseover="this.style.background='#F5F5F5'" onmouseout="this.style.background='#FFF'">
                    <span>❌ Fue un error. Déjame corregirlo</span>
                    <span>→</span>
                </button>
            </div>
        `;

        // Guardamos las referencias de Form por si fue un error y el usuario corrige
        this._pendingTxForm = form;
        this._pendingTxModal = txModal;
        this._pendingTxCatGroup = categoryGroup;

        this.showModal('Intervención IA', modalHtml);

        // Call AI dynamically
        this.fetchNegativeBalanceAIInfo(txData, account);
    }

    async fetchNegativeBalanceAIInfo(txData, account) {
        const textElement = document.getElementById('negative-balance-ai-text');
        if (!textElement) return;

        try {
            const aiText = await this.aiAdvisor.getNegativeBalanceInsight(txData, account, this.store.categories);
            if (aiText && document.getElementById('negative-balance-ai-text')) {
                // Limpiar comillas extra que devuelve el modelo
                const clean = aiText.replace(/^"+|"+$/g, '').trim();
                document.getElementById('negative-balance-ai-text').textContent = clean;
            }
        } catch (error) {
            console.error("Failed fetching dynamic AI negative balance alert", error);
            if (document.getElementById('negative-balance-ai-text')) {
                document.getElementById('negative-balance-ai-text').textContent =
                    `Estás intentando registrar $${this.formatNumberWithDots(txData.amount)} desde ${account.name}, pero esa cuenta solo tiene $${this.formatNumberWithDots(account.current_balance)}. Los activos NO pueden ser negativos.`;
            }
        }
    }

    resolveNegativeBalance(action, txData, fallbackAccountId, editId) {
        // Cerrar el modal de Intervención IA (div.modal dinámico)
        const modals = document.querySelectorAll('.modal:not(#transaction-modal):not(#guide-modal)');
        modals.forEach(m => {
            if (!m.classList.contains('hidden') && document.body.contains(m)) {
                document.body.removeChild(m);
            }
        });

        if (action === 'ERROR') {
            // Reabrir el formulario de transacción para que el usuario corrija
            const txModal = document.getElementById('transaction-modal');
            if (txModal) {
                txModal.classList.remove('hidden');
                if (txData) {
                    const form = txModal.querySelector('#transaction-form');
                    if (form) {
                        if (txData.amount) {
                            const amtInput = form.querySelector('[name="amount"]');
                            if (amtInput) amtInput.value = txData.amount;
                        }
                        if (txData.type) {
                            const radio = form.querySelector(`[name="type"][value="${txData.type}"]`);
                            if (radio) { radio.checked = true; this.populateSelects(txData.type); }
                        }
                    }
                }
            }
            return;
        }

        if (action === 'DEBT' && txData && fallbackAccountId) {
            // Usuario decidió registrar como deuda en tarjeta de crédito
            txData.account_id = fallbackAccountId;

            let newTx = null;
            if (editId) {
                this.store.updateTransaction(editId, txData);
            } else {
                newTx = this.store.addTransaction(txData);

                // Clear specialized advice cache
                const m = new Date().getMonth();
                const y = new Date().getFullYear();
                const cacheKey = `cc_ai_v65_${y}_${m}_gemini`;
                localStorage.removeItem(cacheKey);

                // Solo análisis IA — el usuario ya tomó su decisión financiera
                // NO llamar checkAndPromptOverspend para no abrir otro modal encima
                if (txData.type === 'GASTO') {
                    this.triggerSpendingInsight(newTx || txData);
                }
            }

            // Limpiar form
            if (this._pendingTxForm) {
                this._pendingTxForm.reset();
                const hiddenId = this._pendingTxForm.querySelector('input[name="edit_tx_id"]');
                if (hiddenId) hiddenId.value = '';
                const btn = this._pendingTxForm.querySelector('button[type="submit"]');
                if (btn) btn.innerHTML = '+ Agregar Movimiento';
                if (this._pendingTxCatGroup) this._pendingTxCatGroup.style.display = 'block';
            }
            if (this._pendingTxModal) {
                this._pendingTxModal.classList.add('hidden');
            }

            this.render();

            // Registrar incidente semanal
            this.trackWeeklyEvent('intervention', {
                account: (this.store.accounts.find(a => a.id === fallbackAccountId))?.name || 'cuenta',
                amount: txData.amount
            });

            // Toast 1: Confirmación
            const toast = document.createElement('div');
            toast.style.cssText = 'position:fixed; top:20px; left:50%; transform:translateX(-50%); background:#2E7D32; color:white; padding:12px 24px; border-radius:30px; font-size:1rem; font-weight:600; z-index:10001; animation: slideDown 0.3s, fadeOut 0.3s 2.5s forwards; box-shadow: 0 4px 15px rgba(0,0,0,0.2); display: flex; align-items: center; gap: 8px;';
            toast.innerHTML = `✅ Registrado en Saldo de Tarjeta de Crédito.`;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);

            // Toast 2: Inteligencia de Costo (2.8s después)
            setTimeout(() => {
                const BANK_RATES = [
                    { keywords: ['nu', 'nubank'], rate: 1.51, label: 'Nu' },
                    { keywords: ['bancolombia', 'nequi'], rate: 2.32, label: 'Bancolombia' },
                    { keywords: ['davivienda'], rate: 2.43, label: 'Davivienda' },
                    { keywords: ['bogotá', 'bogota'], rate: 2.21, label: 'Banco de Bogotá' },
                    { keywords: ['bbva'], rate: 2.18, label: 'BBVA' },
                    { keywords: ['occidente'], rate: 2.25, label: 'Banco de Occidente' },
                    { keywords: ['popular'], rate: 2.19, label: 'Banco Popular' },
                    { keywords: ['colpatria', 'scotiabank'], rate: 2.52, label: 'Scotiabank Colpatria' },
                    { keywords: ['falabella', 'cmr'], rate: 2.93, label: 'Falabella' },
                    { keywords: ['éxito', 'exito', 'alkosto'], rate: 2.86, label: 'Éxito/Alkosto' },
                    { keywords: ['itaú', 'itau'], rate: 2.28, label: 'Itaú' },
                    { keywords: ['av villas', 'avvillas'], rate: 2.30, label: 'AV Villas' },
                    { keywords: ['caja social'], rate: 2.15, label: 'Caja Social' },
                ];
                const creditAcct = this.store.accounts.find(a => a.id === fallbackAccountId);
                const acctNameLower = (creditAcct?.name || '').toLowerCase();
                let matchedRate = null, matchedLabel = null;
                for (const bank of BANK_RATES) {
                    if (bank.keywords.some(kw => acctNameLower.includes(kw))) {
                        matchedRate = bank.rate; matchedLabel = bank.label; break;
                    }
                }
                const interestToast = document.createElement('div');
                interestToast.className = 'ai-toast';
                interestToast.style.cssText = 'position:fixed; top:80px; left:50%; transform:translateX(-50%); background:#FFF3E0; color:#E65100; border:1px solid #FFE0B2; padding:14px 20px; border-radius:16px; box-shadow:0 4px 20px rgba(0,0,0,0.12); z-index:10001; max-width:320px; font-size:0.9rem; line-height:1.5; text-align:center;';
                const interestMsg = matchedRate
                    ? `${matchedLabel} cobra aprox. <b>${matchedRate}% mensual</b> en esta tarjeta. Si no pagas a tiempo, este gasto te costará ~<b>${this.formatCurrency(Math.round(txData.amount * (matchedRate / 100)))}</b> en intereses. ¿Priorizamos el pago?`
                    : `Las tarjetas de crédito cobran entre <b>1.5% y 3% mensual</b> en intereses. ¿Quieres priorizar el pago de esta deuda el próximo mes?`;
                interestToast.innerHTML = `
                    <div style="font-weight:700; margin-bottom:6px;">💳 Inteligencia de Costo</div>
                    ${interestMsg}
                    <div style="display:flex; gap:8px; justify-content:center; margin-top:10px;">
                        <button onclick="this.closest('.ai-toast').remove(); window.ui.navigate('settings')" style="background:#E65100; color:white; border:none; padding:7px 14px; border-radius:20px; font-weight:600; font-size:0.8rem; cursor:pointer;">Sí, priorizar</button>
                        <button onclick="this.closest('.ai-toast').remove()" style="background:none; border:1px solid #FFCC80; color:#E65100; padding:7px 14px; border-radius:20px; font-weight:600; font-size:0.8rem; cursor:pointer;">Ahora no</button>
                    </div>
                `;
                document.body.appendChild(interestToast);
                setTimeout(() => interestToast?.remove(), 12000);
            }, 2800);

            // Limpiar referencias
            this._pendingTxForm = null;
            this._pendingTxModal = null;
            this._pendingTxCatGroup = null;
        }
    }

    executeRebalance(fromCatId, toCatId, amount) {
        const fromBudget = parseFloat(this.store.config.budgets[fromCatId]) || 0;
        const toBudget = parseFloat(this.store.config.budgets[toCatId]) || 0;

        let transferAmt = amount;
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
        const fromSpent = this.store.transactions
            .filter(t => t.category_id === fromCatId && t.type === 'GASTO' && t.date >= startOfMonth && t.date <= endOfMonth)
            .reduce((sum, t) => sum + parseFloat(t.amount), 0);

        const surplus = fromBudget - fromSpent;
        if (transferAmt > surplus) transferAmt = surplus;

        this.store.config.budgets[fromCatId] = fromBudget - transferAmt;
        this.store.config.budgets[toCatId] = toBudget + transferAmt;
        this.store.updateConfig(this.store.config);

        // Close modal gracefully
        const modals = document.querySelectorAll('.modal');
        modals.forEach(m => {
            if (!m.classList.contains('hidden')) {
                if (document.body.contains(m)) document.body.removeChild(m);
            }
        });

        const toast = document.createElement('div');
        toast.style.cssText = 'position:fixed; top:20px; left:50%; transform:translateX(-50%); background:#2E7D32; color:white; padding:12px 24px; border-radius:30px; font-size:0.9rem; font-weight:600; z-index:10001; animation: slideDown 0.3s, fadeOut 0.3s 2.5s forwards; box-shadow: 0 4px 15px rgba(0,0,0,0.2);';
        toast.innerHTML = `✅ Transferencia exitosa: $${this.formatNumberWithDots(transferAmt)} movidos.`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);

        // Track event para la asesoría Semanal
        const fromCat = this.store.categories.find(c => c.id === fromCatId);
        const toCat = this.store.categories.find(c => c.id === toCatId);
        this.trackWeeklyEvent('rebalance', {
            fromCat: fromCat?.name || fromCatId,
            toCat: toCat?.name || toCatId,
            fromCatId, toCatId,
            amount: transferAmt
        });

        this.render();
    }

    // ─── Helper: registrar eventos semanales en localStorage ───────────────
    trackWeeklyEvent(type, data) {
        const d = new Date();
        const y = d.getFullYear();
        const start = new Date(y, 0, 1);
        const week = Math.ceil(((d - start) / 86400000 + start.getDay() + 1) / 7);
        const weekKey = `${y}-W${String(week).padStart(2, '0')}`;

        let events = { week: weekKey, rebalances: [], interventions: [] };
        try {
            const raw = localStorage.getItem('cc_weekly_events');
            if (raw) {
                const parsed = JSON.parse(raw);
                // Si cambió la semana, reset
                events = parsed.week === weekKey ? parsed : events;
            }
        } catch (e) { }

        if (type === 'rebalance') events.rebalances.push({ ...data, ts: Date.now() });
        if (type === 'intervention') events.interventions.push({ ...data, ts: Date.now() });

        localStorage.setItem('cc_weekly_events', JSON.stringify(events));
    }

    async triggerSpendingInsight(tx) {
        if (!tx) return;

        // Auto-Trigger relies on AI Advisor being present
        if (!this.aiAdvisor) {
            return;
        }

        console.log(`🤖 Auto-analizando movimiento: $${tx.amount}...`);

        try {
            const insightJson = await this.aiAdvisor.analyzeTransaction(tx);

            // Renderiza siempre si hay respuesta, independientemente de si es alerta o no.
            // Si no es alerta, es nivel bajito, pero el asesor está confirmando que el gasto está bien.
            if (insightJson && insightJson.analisis_cfo) {
                let icon = '💡';
                let type = 'info';

                if (insightJson.nivel_riesgo >= 4) {
                    icon = '🚨';
                    type = 'danger';
                } else if (insightJson.nivel_riesgo === 3) {
                    icon = '⚠️';
                    type = 'warning';
                } else if (insightJson.nivel_riesgo <= 2) {
                    icon = '✅';
                    type = 'success';
                }

                // Show the advisor text cleanly formatted
                this.showToast(insightJson.analisis_cfo, type, icon);

                // === GUARDAR EN CACÍE DEL DASHBOARD (sin costo extra) ===
                localStorage.setItem('cc_last_ai_insight', JSON.stringify({
                    text: insightJson.analisis_cfo,
                    risk: insightJson.nivel_riesgo,
                    type: type,
                    icon: icon,
                    ts: Date.now() // timestamp para mostrar "Hace X min"
                }));
            }
        } catch (err) {
            console.error("AI Insight Pipeline Error:", err);
            // Mostrar error crudo para Safari Debugging
            this.showToast(`🐝 Error iOS: ${err.message || 'Promesa Fallida'}`, 'danger', '🐝');
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
            z-index: 2147483647; 
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

    renderRecentTransactionsHTML(limit = 5, month = null, year = null) {
        let txs = this.store.transactions;
        
        // BUG FIX: Filter by month/year if provided
        if (month !== null && year !== null) {
            txs = txs.filter(t => {
                const parts = t.date.split('-');
                return parseInt(parts[0]) === year && (parseInt(parts[1]) - 1) === month;
            });
        }

        txs = txs.sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, limit);

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
        const breakdownUnfiltered = this.store.getCategoryBreakdown(this.viewDate.getMonth(), this.viewDate.getFullYear());

        const rawTotal = Object.values(breakdownUnfiltered).reduce((sum, val) => sum + val, 0);

        // Strip values that are too small (<2%) to avoid cluttering the pie chart
        const labelsToData = Object.entries(breakdownUnfiltered).filter(([_, val]) => {
            if (val <= 0) return false;
            const pct = rawTotal > 0 ? (val / rawTotal) * 100 : 0;
            return pct >= 2;
        });

        // Remove fixed truncation so full labels show. Since legend is now at bottom, they will fit.
        const labels = labelsToData.map(([k, _]) => k);
        const data = labelsToData.map(([_, v]) => v);

        if (this.currentChart) this.currentChart.destroy();

        if (data.length === 0) {
            ctx.parentNode.innerHTML += '<p class="text-secondary" style="text-align:center;">Sin datos representativos de gastos.</p>';
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
                        backgroundColor: ['var(--primary-color)', '#9C27B0', '#2196F3', '#00BCD4', '#10B981', '#F59E0B', '#EF4444', '#795548', '#64748B'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                generateLabels: (chart) => {
                                    const dataset = chart.data.datasets[0];
                                    return chart.data.labels.map((label, i) => {
                                        const value = dataset.data[i];
                                        const pct = total > 0 ? Math.round((value / total) * 100) : 0;
                                        const pctText = `${pct}%`;
                                        return {
                                            text: `${label} (${pctText})`,
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
                                    const pctText = pct > 0 ? `${pct}%` : '<1%';
                                    return ` ${this.formatCurrency(value)} (${pctText})`;
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
        
        const currentMonth = this.viewDate.getMonth();
        const currentYear = this.viewDate.getFullYear();
        const currentMonthName = this.monthNames[currentMonth];

        let rawTxs = this.store.getAllTransactions ? this.store.getAllTransactions() : (this.store.data.transactions || []);
        
        // Filter transactions for the selected month to keep consistency with dashboard
        const filteredTxs = rawTxs.filter(t => {
            if (!t.date) return false;
            const parts = t.date.split('-');
            if (parts.length < 2) return false;
            return parseInt(parts[0], 10) === currentYear && (parseInt(parts[1], 10) - 1) === currentMonth;
        });

        const txs = [...filteredTxs].sort((a, b) => new Date(b.date) - new Date(a.date));
        const categories = this.store.data.categories || [];

        let html = `
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: 2rem; flex-wrap: wrap;">
                <div style="display: flex; align-items: center; gap: 12px; background: white; padding: 10px 16px; border-radius: 12px; border: 1px solid var(--border-color); box-shadow: var(--shadow-sm);">
                    <button class="btn-icon" onclick="window.ui.changeMonth(-1)" style="background: #f8f9fa;"><i data-feather="chevron-left"></i></button>
                    <h3 style="margin: 0; font-size: 1.1rem; font-weight: 700; color: var(--text-main); min-width: 140px; text-align: center;">${currentMonthName} ${currentYear}</h3>
                    <button class="btn-icon" onclick="window.ui.changeMonth(1)" style="background: #f8f9fa;"><i data-feather="chevron-right"></i></button>
                </div>

                <div style="display: flex; gap: 0.5rem;">
                    <button id="btn-reset-data" class="btn" style="background: #FFF5F5; color: #E53935; border: 1px solid #FFCDD2; display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; padding: 8px 12px;">
                        <i data-feather="trash-2" style="width: 14px;"></i> Iniciar de Cero
                    </button>
                    
                    <input type="file" id="import-file" accept=".csv,.txt,.pdf,.jpg,.jpeg,.png" style="display: none;" />
                    <button class="btn" style="background: #E8F5E9; color: #2E7D32; border: 1px solid #C8E6C9; display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; padding: 8px 12px;" onclick="document.getElementById('import-file').click()">
                        <i data-feather="upload-cloud" style="width: 14px;"></i> Importar / Escanear
                    </button>
                </div>
            </div>

            <div class="card" style="padding: 0; overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; min-width: 600px;">
                    <thead>
                        <tr style="text-align: left; border-bottom: 1px solid #eee; background: #fafafa;">
                            <th style="padding: 1.25rem 1rem; font-size: 0.85rem; color: #64748b; font-weight: 600;">Fecha</th>
                            <th style="padding: 1.25rem 1rem; font-size: 0.85rem; color: #64748b; font-weight: 600;">Categoría</th>
                            <th style="padding: 1.25rem 1rem; font-size: 0.85rem; color: #64748b; font-weight: 600;">Monto</th>
                            <th style="padding: 1.25rem 1rem; font-size: 0.85rem; color: #64748b; font-weight: 600;">Nota</th>
                            <th style="padding: 1.25rem 1rem; font-size: 0.85rem; color: #64748b; font-weight: 600;"></th>
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
                            <span style="font-size: 1.2rem;">✍️</span> <strong>Manual:</strong> toca "+ Nuevo Gasto" arriba
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
            btn.addEventListener('click', async (e) => {
                if (confirm('¿Eliminar este movimiento permanentemente?')) {
                    const id = e.target.closest('button').dataset.id;
                    await this.store.deleteTransaction(id);
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
            resetBtn.addEventListener('click', async () => {
                const choice = confirm("⚠️ ¿Quieres borrar TODO y empezar de cero?\n\n• OK = Borrar TODO (movimientos, presupuestos, gastos fijos, metas)\n• Cancelar = No borrar nada");

                if (choice) {
                    // Double confirm for full reset
                    if (confirm("🚨 ÚLTIMA CONFIRMACIÓN\n\nEsto borrará:\n✖ Todos los movimientos\n✖ Presupuestos\n✖ Gastos fijos\n✖ Ingresos recurrentes\n✖ Metas\n✖ Caché de IA\n\n(Tu API Key se conservará)\n\n¿Continuar?")) {
                        resetBtn.disabled = true;
                        resetBtn.innerHTML = '🕒 Limpiando todo...';
                        try {
                            await this.store.nuclearReset();
                            alert("✅ Todo limpio. La app se recargará ahora.");
                            location.reload();
                        } catch (e) {
                            alert("Error al limpiar los datos. Intenta de nuevo.");
                            resetBtn.disabled = false;
                            resetBtn.innerHTML = '<i data-feather="trash-2"></i> Iniciar de Cero';
                            if (window.feather) window.feather.replace();
                        }
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

        // Trigger updates for dynamic category/target select
        this.populateSelects(tx.type);
        form.querySelector('[name="category_id"]').value = tx.category_id;

        if (tx.target_account_id && form.querySelector('[name="target_account_id"]')) {
            form.querySelector('[name="target_account_id"]').value = tx.target_account_id;
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.innerHTML = 'Actualizar Movimiento';
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
            alert('Error: Movimiento no encontrado.');
        }
    }

    openScanConfirmation(data) {
        const txModal = document.getElementById('transaction-modal');
        const form = document.getElementById('transaction-form');
        txModal.classList.remove('hidden');

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
                alert(`⚠️ ATENCIÓN: Detecté un monto inusualmente alto ($${this.formatNumberWithDots(data.amount)}).\n\nProbablemente leí un código de barras, teléfono o NIT por error. Por favor verifica antes de guardar.`);
                form.querySelector('input[name="amount"]').value = '';
                form.querySelector('input[name="amount"]').placeholder = 'Ingresa el valor real';
                setTimeout(() => form.querySelector('input[name="amount"]').focus(), 500);
            } else {
                const fmt = this.formatNumberWithDots(data.amount);
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
        title.innerHTML = '🧾 Recibo Escaneado <span style="font-size:0.6em;color:#2E7D32;">(Verifica los datos)</span>';
    }

    openUserGuide() {
        // Create Guide Modal Overlay
        const overlay = document.createElement('div');
        overlay.id = 'guide-overlay';
        overlay.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.8); z-index:11000; display:flex; align-items:center; justify-content:center; padding:20px; animation: fadeIn 0.2s;';

        const modal = document.createElement('div');
        modal.style.cssText = 'background:var(--bg-surface); width:100%; max-width:600px; max-height:85vh; border-radius:24px; overflow-y:auto; position:relative; box-shadow:0 20px 50px rgba(0,0,0,0.5); animation: slideUp 0.3s;';

        modal.innerHTML = `
        <div style="padding:24px 24px 0;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h2 style="margin:0; font-size:1.5rem;">📘 Guía Rápida</h2>
                <button id="close-guide" style="font-size:1.5rem; background:none; border:none; cursor:pointer; color:var(--text-secondary);">&times;</button>
            </div>
            <p style="color:var(--text-secondary); margin-top:5px;">Domina ClarityCash en 3 minutos.</p>
        </div>
        
        <div style="padding:20px 24px;">
            <div style="margin-bottom:25px;">
                <h3 style="font-size:1.1rem; color:var(--primary-color); margin-bottom:10px;">🤖 1. Inteligencia Artificial</h3>
                <p style="font-size:0.95rem; line-height:1.5; color:var(--text-main);">
                    <b>¿Cómo funciona?</b> La IA analiza tus gastos mes a mes. Para que funcione, necesitas ir a <b>Configuración (⚙️)</b> y obtener tu "Llave Gratis".<br><br>
                    <b>Análisis Mensual:</b> Ve a la pestaña "Análisis" ⚡. Ahí verás diagnósticos, alertas de fugas y consejos personalizados.
                </p>
            </div>

            <div style="margin-bottom:25px;">
                <h3 style="font-size:1.1rem; color:#4CAF50; margin-bottom:10px;">💰 2. Presupuestos</h3>
                <p style="font-size:0.95rem; line-height:1.5; color:var(--text-main);">
                    Define límites para categorías clave (como "Restaurantes" o "Ropa") en Configuración. La barra de progreso se pondrá roja si te excedes.
                </p>
            </div>

            <div style="margin-bottom:25px;">
                <h3 style="font-size:1.1rem; color:#2196F3; margin-bottom:10px;">📸 3. Escaneo de Recibos</h3>
                <p style="font-size:0.95rem; line-height:1.5; color:var(--text-main);">
                    Al crear un movimiento, usa el botón <b>"📷 Escanear"</b>. Sube una foto de tu factura y la app extraerá el total, el comercio y la categoría automáticamente.
                </p>
            </div>

            <div style="margin-bottom:10px;">
                <h3 style="font-size:1.1rem; color:#FF9800; margin-bottom:10px;">⚡ 4. Gasto Rápido</h3>
                <p style="font-size:0.95rem; line-height:1.5; color:var(--text-main);">
                    Usa el botón flotante del rayo para anotar gastos en segundos. La IA aprende tus categorías frecuentes (como Café o Gasolina) y las pone primero.
                </p>
            </div>
        </div>

        <div style="padding:20px; background:rgba(0,0,0,0.03); text-align:center; border-radius: 0 0 24px 24px;">
            <button id="close-guide-btn-main" style="background:#212121; color:white; border:none; padding:12px 30px; border-radius:12px; font-weight:bold; font-size:1rem; cursor:pointer;">¡Entendido!</button>
        </div>
    `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const closeFn = () => document.body.removeChild(overlay);
        overlay.querySelector('#close-guide').onclick = closeFn;
        overlay.querySelector('#close-guide-btn-main').onclick = closeFn;
        overlay.onclick = (e) => { if (e.target === overlay) closeFn(); };
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

        // 3.5 Deuda (Specific keywords to avoid capturing generic "Credito" in income names)
        if (d.includes('pago credito') || d.includes('cuota credito') || d.includes('abono credito') || d.includes('cobro credito')) return 'cat_7';
        if (d.includes('tarjeta') || d.includes('visa') || d.includes('mastercard') || d.includes('credisit') || d.includes('pago t.c')) return 'cat_fin_4';

        // 4. Servicios / Vivienda
        if (d.includes('codensa') || d.includes('enel') || d.includes('acueducto') || d.includes('luz') || d.includes('agua') || d.includes('publicos')) return 'cat_viv_servicios';
        if (d.includes('gas') || d.includes('alcantarillado')) return 'cat_viv_servicios';
        if (d.includes('administracion') || d.includes('arriendo')) return 'cat_1';
        if (d.includes('claro') || d.includes('movistar') || d.includes('tigo') || d.includes('etb')) return 'cat_viv_net';

        // 5. Salud
        if (d.includes('farma') || d.includes('cruz verde') || d.includes('medicina') || d.includes('doctor') || d.includes('eps') || d.includes('colsanitas')) return 'cat_4';

        // Default
        return 'cat_10'; // Otros
    }

    renderInsightsPage() {
        this.pageTitle.textContent = 'Mi Mes 🔍';

        // METRICS ROW
        const month = this.viewDate.getMonth();
        const year = this.viewDate.getFullYear();
        const prevMonth = month === 0 ? 11 : month - 1;
        const prevYear = month === 0 ? year - 1 : year;
        const summary = this.store.getFinancialSummary(month, year);
        const prevSummary = this.store.getFinancialSummary(prevMonth, prevYear);

        // --- 📊 MOVEMENTS COUNTER FOR ANALYSIS ---
        const startOfMonth = new Date(year, month, 1).toISOString();
        const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59).toISOString();
        const monthlyTransactions = this.store.transactions.filter(t => t.date >= startOfMonth && t.date <= endOfMonth);
        const movementsCount = monthlyTransactions.length;
        const incomeCount = monthlyTransactions.filter(t => t.type === 'INGRESO').length;
        const expenseCount = monthlyTransactions.filter(t => t.type === 'GASTO').length;

        // --- 💰 BALANCE DEL MES ---
        let balanceMessage = "";
        let balanceColor = "#64748b";

        if (summary.income === 0) {
            balanceMessage = "Configura tu ingreso mensual en el Centro Financiero para ver tu análisis.";
            balanceColor = "#ef4444";
        } else if (summary.expenses > summary.income) {
            balanceMessage = "Estás gastando más de lo que ganas este mes.";
            balanceColor = "#ef4444";
        } else {
            balanceMessage = "Vas dentro de tu plan financiero.";
            balanceColor = "#10b981";
        }

        const compareArrow = (current, previous) => {
            let prevVal = previous === 0 ? 0 : previous;
            let pctChange = 0;
            if (prevVal === 0) {
                if (current > 0) pctChange = 100;
                else return '<span style="font-size:0.65rem; color:#999;">= igual</span>';
            } else {
                pctChange = Math.round(((current - prevVal) / prevVal) * 100);
            }
            if (pctChange === 0) return '<span style="font-size:0.65rem; color:#999;">= igual</span>';
            const color = pctChange > 0 ? '#4CAF50' : '#F44336';
            const arrow = pctChange > 0 ? '↑' : '↓';
            return `<span style="font-size:0.75rem; color:${color}; font-weight:700;">${arrow}${Math.abs(pctChange)}%</span>`;
        };

        const expenseArrow = (current, previous) => {
            let prevVal = previous === 0 ? 0 : previous;
            let pctChange = 0;
            if (prevVal === 0) {
                if (current > 0) pctChange = 100;
                else return '<span style="font-size:0.65rem; color:#999;">= igual</span>';
            } else {
                pctChange = Math.round(((current - prevVal) / prevVal) * 100);
            }
            if (pctChange === 0) return '<span style="font-size:0.65rem; color:#999;">= igual</span>';
            const color = pctChange > 0 ? '#F44336' : '#4CAF50';
            const arrow = pctChange > 0 ? '↑' : '↓';
            return `<span style="font-size:0.75rem; color:${color}; font-weight:700;">${arrow}${Math.abs(pctChange)}%</span>`;
        };

        const streakCount = this.calculateStreak();
        const streakHTML = streakCount > 0 ? `
            <div style="text-align:center; margin-bottom: 8px;">
                <span style="background: linear-gradient(135deg, #FF9800, #F44336); color: white; padding: 4px 14px; border-radius: 20px; font-size: 0.75rem; font-weight: 600;">
                    🔥 Racha: ${streakCount} día${streakCount > 1 ? 's' : ''} registrando
                </span>
            </div>
        ` : '';

        const coffeeText = ''; // Temporarily hidden per user request to avoid metrics confusion

        const metricsHTML = `
            ${streakHTML}
            <div class="metrics-row" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin-bottom: 20px;">
                <div class="metric-card">
                    <span class="label">Ingresos ${compareArrow(summary.income, prevSummary.income)}</span>
                    <span class="value income">+${this.formatCurrency(summary.income)}</span>
                </div>
                 <div class="metric-card">
                    <span class="label">Gastos ${expenseArrow(summary.expenses, prevSummary.expenses)}</span>
                    <span class="value expense">-${this.formatCurrency(summary.expenses)}</span>
                </div>
                 <div class="metric-card">
                    <span class="label">Ahorro ${compareArrow(summary.savings, prevSummary.savings)}</span>
                    <span class="value savings">${this.formatCurrency(summary.savings)}</span>
                </div>
                 <div class="metric-card">
                    <span class="label">Deuda Pagada</span>
                    <span class="value debt">-${this.formatCurrency(summary.debt_payment)}</span>
                </div>
                <div class="metric-card" style="border-top: 3px solid ${balanceColor};">
                    <span class="label">Balance del mes</span>
                    <span class="value" style="color: ${balanceColor}; font-size: 0.8rem; margin-top: 5px; line-height: 1.2;">${balanceMessage}</span>
                </div>
            </div>
        `;

        const nudgesHTML = this.generateCoachingNudges(summary);

        // RECOMENDACION DEL MES (Reglas Simples)
        let recomendacionMes = "";
        let recBoxColor = "#E8F5E9";
        let recTextColor = "#2E7D32";

        const getCatName = (id) => {
            const c = this.store.categories.find(cat => cat.id === id);
            return c ? c.name : 'tu mayor gasto';
        };

        const expensesByCategory = {};
        const monthlyTx = this.store.transactions.filter(t => {
            const parts = t.date.split('-');
            return parseInt(parts[0]) === year && (parseInt(parts[1]) - 1) === month && t.type === 'GASTO';
        });
        monthlyTx.forEach(t => {
            expensesByCategory[t.category_id] = (expensesByCategory[t.category_id] || 0) + t.amount;
        });

        if (summary.expenses > summary.income && summary.income > 0) {
            const budgets = this.store.config.budgets || {};
            let maxDevCat = null;
            let maxDevVal = 0;

            Object.keys(expensesByCategory).forEach(catId => {
                const spent = expensesByCategory[catId] || 0;
                const limit = budgets[catId] || 0;
                if (limit > 0 && spent > limit) {
                    const dev = spent - limit;
                    if (dev > maxDevVal) {
                        maxDevVal = dev;
                        maxDevCat = catId;
                    }
                }
            });

            const catName = maxDevCat ? getCatName(maxDevCat) : "una categoría excesiva";
            const valForm = maxDevVal > 0 ? this.formatCurrency(maxDevVal) : this.formatCurrency(summary.expenses - summary.income);

            recomendacionMes = `Este mes estás gastando más de lo que ingresas. Si reduces al menos ${valForm} en ${catName}, puedes recuperar equilibrio.`;
            recBoxColor = "#FFEBEE";
            recTextColor = "#D32F2F";
        } else {
            const budgets = this.store.config.budgets || {};
            let catExcedida = null;
            Object.keys(expensesByCategory).forEach(catId => {
                const spent = expensesByCategory[catId] || 0;
                const limit = budgets[catId] || 0;
                if (limit > 0 && spent > limit && !catExcedida) {
                    catExcedida = catId;
                }
            });

            if (catExcedida) {
                const catName = getCatName(catExcedida);
                recomendacionMes = `Este mes estás gastando más de lo planeado en ${catName}. Ajustar un 10-15% te ayudará a mantener el control.`;
                recBoxColor = "#FFF3E0";
                recTextColor = "#E65100";
            } else {
                recomendacionMes = `Este mes estás dentro de tu presupuesto. Mantén este ritmo y considera aumentar tu ahorro.`;
            }
        }

        const recomendacionHtml = `
            <div style="background: ${recBoxColor}; color: ${recTextColor}; padding: 16px; border-radius: 12px; margin-top: 2.5rem; margin-bottom: 2rem; border-left: 6px solid ${recTextColor};">
                <h4 style="margin: 0 0 8px 0; font-size: 1rem; display: flex; align-items: center; gap: 6px;">
                    <i data-feather="compass" style="width: 18px; height: 18px;"></i> Recomendación del mes
                </h4>
                <p style="margin: 0; font-size: 0.95rem; line-height: 1.5;">${recomendacionMes}</p>
            </div>
        `;

        // 1. CHART SECTION
        let html = `
            ${nudgesHTML}
            ${metricsHTML}
            <div style="margin-bottom: 2rem; display: block;">
                ${(() => {
                try {
                    return this.renderBudgetCompact();
                } catch (e) {
                    console.error('Budget Compact Error:', e);
                    return '<div style="padding:1rem; color:#999; border:1px solid #ddd; border-radius:8px;">No se pudo cargar el resumen del presupuesto.</div>';
                }
            })()}
            </div>
            
            <div style="margin-top: 3rem; margin-bottom: 3rem; display: block;">
                ${recomendacionHtml}
            </div>

            <div class="charts-grid" style="margin-bottom: 4rem; display: grid;">
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
            
            <div style="max-width: 800px; margin: 0 auto;">
                <h3 style="margin-bottom: 1rem;">Diagnóstico Mensual 🩺</h3>
        `;
        const insights = this.advisor.analyze(this.viewDate.getMonth(), this.viewDate.getFullYear());

        if (movementsCount < 5) {
            const progressPct = (movementsCount / 5) * 100;
            const step1Done = incomeCount >= 1;
            const step2Done = expenseCount >= 2;
            const step3Active = movementsCount >= 5;

            html += `
                <div style="background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 1.5rem; margin-top: 1rem;">
                    <div style="margin-bottom: 1.5rem;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <span style="font-size: 0.85rem; font-weight: 700; color: #1e293b;">Progreso de análisis: ${movementsCount}/5 movimientos</span>
                            <span style="font-size: 0.8rem; color: #64748b;">${Math.round(progressPct)}%</span>
                        </div>
                        <div style="width: 100%; height: 8px; background: #f1f5f9; border-radius: 4px; overflow: hidden;">
                            <div style="width: ${progressPct}%; height: 100%; background: linear-gradient(90deg, #3b82f6, #2dd4bf); transition: width 0.5s ease;"></div>
                        </div>
                    </div>

                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        <div style="display: flex; align-items: center; gap: 12px; opacity: ${step1Done ? '1' : '0.5'}">
                            <div style="width: 20px; height: 20px; border-radius: 50%; background: ${step1Done ? '#10b981' : '#e2e8f0'}; color: white; display: flex; align-items: center; justify-content: center; font-size: 0.65rem;">
                                ${step1Done ? '✓' : '1'}
                            </div>
                            <span style="font-size: 0.85rem; color: ${step1Done ? '#0f172a' : '#64748b'}; font-weight: ${step1Done ? '600' : '400'}">Paso 1: Registra tu primer ingreso</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 12px; opacity: ${step2Done ? '1' : '0.5'}">
                            <div style="width: 20px; height: 20px; border-radius: 50%; background: ${step2Done ? '#10b981' : '#e2e8f0'}; color: white; display: flex; align-items: center; justify-content: center; font-size: 0.65rem;">
                                ${step2Done ? '✓' : '2'}
                            </div>
                            <span style="font-size: 0.85rem; color: ${step2Done ? '#0f172a' : '#64748b'}; font-weight: ${step2Done ? '600' : '400'}">Paso 2: Registra al menos 2 gastos</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 12px; opacity: ${step3Active ? '1' : '0.3'}">
                            <div style="width: 20px; height: 20px; border-radius: 50%; background: ${step3Active ? '#3b82f6' : '#e2e8f0'}; color: white; display: flex; align-items: center; justify-content: center; font-size: 0.65rem;">
                                ${step3Active ? '🚀' : '3'}
                            </div>
                            <span style="font-size: 0.85rem; color: ${step3Active ? '#0f172a' : '#64748b'}; font-weight: ${step3Active ? '600' : '400'}">Paso 3: Recibe tu diagnóstico mensual</span>
                        </div>
                    </div>
                </div>
            `;
        } else {
            if (insights.length === 0) {
                html += `
                    <div style="text-align: center; padding: 2rem 1.5rem; background: #f8fafc; border-radius: 16px; border: 1px dashed #cbd5e1;">
                        <div style="font-size: 2rem; margin-bottom: 10px;">✨</div>
                        <h4 style="margin: 0 0 8px; color: #1e293b;">¡Todo bajo control!</h4>
                        <p style="color: #64748b; margin: 0; font-size: 0.85rem; line-height: 1.5;">No hemos detectado fugas críticas en tus patrones de este mes. Sigue registrando para un análisis más profundo.</p>
                    </div>
                `;
            } else {
                const renderInsightHtml = (i) => {
                    try {
                        const potentialHtml = i.savingsPotential
                            ? `<div class="insight-potential">Potencial ahorro: ${this.formatCurrency(i.savingsPotential)}/mes</div>`
                            : '';
                        const severityMap = { 'critical': 'HIGH', 'warning': 'MEDIUM', 'info': 'LOW' };
                        const severity = severityMap[i.type] || i.severity || 'INFO';
                        const colors = { 'HIGH': '#F44336', 'MEDIUM': '#FF9800', 'LOW': '#4CAF50', 'INFO': '#2196F3' };
                        const color = colors[severity] || '#666';
                        const icons = { 'HIGH': 'alert-circle', 'MEDIUM': 'alert-triangle', 'LOW': 'check-circle', 'INFO': 'info' };
                        const icon = icons[severity] || 'info';
                        const badgeLabels = { 'critical': 'CRÍTICO', 'warning': 'ALERTA', 'info': 'INFO' };
                        const badgeLabel = badgeLabels[i.type] || ''; // Si no está mapeado, no mostrar texto técnico
                        const desc = i.description || i.message || '';
                        const rec = i.recommendation || '';

                        return `
                        <div class="insight-card severity-${severity.toLowerCase()}">
                            <div class="insight-header">
                                <span class="insight-title" style="color:${color}; display:flex; align-items:center; gap:0.5rem;">
                                    <i data-feather="${icon}"></i> ${i.title || 'Insight'}
                                </span>
                                <span class="badge" style="background:${color}20; color:${color}; font-size:0.65rem; padding:2px 8px; border-radius:20px; font-weight:700;">${badgeLabel}</span>
                            </div>
                            <p class="insight-desc">${desc}</p>
                            ${potentialHtml}
                            ${rec ? `<div class="insight-action">💡 <strong>Recomendación:</strong> ${rec}</div>` : ''}
                        </div>`;
                    } catch (err) {
                        console.error('Error rendering insight:', err, i);
                        return '';
                    }
                };

                let criticalCount = 0;
                const visibleHtml = [];
                const hiddenHtml = [];

                insights.forEach(i => {
                    if (i.type === 'critical') {
                        if (criticalCount < 2) {
                            visibleHtml.push(renderInsightHtml(i));
                        } else {
                            hiddenHtml.push(renderInsightHtml(i));
                        }
                        criticalCount++;
                    } else {
                        visibleHtml.push(renderInsightHtml(i)); // warnings/infos are visible
                    }
                });

                html += visibleHtml.join('');

                if (hiddenHtml.length > 0) {
                    html += `
                        <details style="margin-top: 1rem; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; padding: 0.5rem;">
                            <summary style="padding: 12px 16px; font-weight: 600; font-size: 0.9rem; color: #475569; cursor: pointer; display: flex; align-items: center; justify-content: space-between; list-style: none;">
                                Ver ${hiddenHtml.length} alertas adicionales 👇
                            </summary>
                            <div style="padding: 1rem 0;">
                                ${hiddenHtml.join('')}
                            </div>
                        </details>
                    `;
                }
            }
        }

        html += '</div>'; // Close max-width container

        // --- AI ADVISOR SECTION (Gemini / ChatGPT) ---
        const cached = this.aiAdvisor ? this.aiAdvisor.getCachedResponse(this.viewDate.getMonth(), this.viewDate.getFullYear()) : null;

        html += `
            <div class="card" style="margin-top: 2rem; border: 2px solid var(--primary-color); border-radius: 12px;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem;">
                    <h3 style="margin: 0;">🧠 Asesor IA Personal</h3>
                    <span class="badge" style="background: #E8F5E9; color: #2E7D32; font-size: 0.75rem;">Activo ✓</span>
                </div>
        `;

        if (cached) {
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
            const aiDisabled = movementsCount < 5;
            html += `
                <div id="ai-response" style="text-align: center; padding: 1rem;">
                    <p style="color: #666; font-weight: 500;">Tu asesor personal está listo para analizar tu mes.</p>
                </div>
                <div style="text-align: center;">
                    <button id="ai-ask-btn" class="btn btn-primary" ${aiDisabled ? 'disabled' : ''} style="padding: 0.6rem 2rem; font-size: 1rem; background: ${aiDisabled ? 'var(--text-muted)' : 'var(--primary-color)'}; color: white; border: none; font-weight: 600; box-shadow: ${aiDisabled ? 'none' : 'var(--shadow-primary)'}; cursor: ${aiDisabled ? 'not-allowed' : 'pointer'};">
                        🧠 Explícame cómo mejorar este mes
                    </button>
                    ${aiDisabled ? `<p style="font-size: 0.75rem; color: #64748b; margin-top: 8px;">Disponible cuando registres al menos 5 movimientos.</p>` : ''}
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
                        <div style="display: inline-block; width: 30px; height: 30px; border: 3px solid #ddd; border-top-color: var(--primary-color); border-radius: 50%; animation: spin 1s linear infinite;"></div>
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
                console.error('AI Request Error:', err);
                const messages = {
                    'NO_KEY': '⚙️ Configura tu API Key en Configuración.',
                    'INVALID_KEY': '❌ API Key inválida. revísala.',
                    'RATE_LIMIT': '⏳ Muchas consultas seguidas. Por favor, espera 60 segundos antes de intentar de nuevo.',
                    'NETWORK_ERROR': '📡 Sin conexión a internet.',
                    'EMPTY_RESPONSE': '🤷 La IA no pudo generar una respuesta. Intenta de nuevo.',
                    'API_ERROR': '⚠️ Error del servicio de IA (Google/OpenAI). Intenta más tarde.'
                };
                if (responseDiv) {
                    responseDiv.innerHTML = `<div style="background:#fff5f5; border:1px solid #feb2b2; padding:1.5rem; border-radius:8px; color: #c53030; text-align: center;">
                        <p style="font-weight:bold; margin-bottom:0.5rem;">No pudimos consultar a la IA</p>
                        <p style="font-size:0.9rem;">${messages[err.message] || 'Error inesperado: ' + err.message}</p>
                    </div>`;
                }
                if (btn) { btn.disabled = false; btn.textContent = '🔄 Reintentar'; }
            }
        };

        if (askBtn) askBtn.addEventListener('click', handleAIRequest);
        if (refreshBtn) refreshBtn.addEventListener('click', handleAIRequest);

        // Render Charts
        this.renderChart(); // Doughnut
        this.renderHistoryChart(); // Bar Chart
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
                    legend: { position: 'bottom' },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                return ` ${context.dataset.label}: ${this.formatCurrency(context.raw)}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: '#f0f0f0' },
                        ticks: {
                            callback: (value) => {
                                if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
                                if (value >= 1000) return (value / 1000).toFixed(0) + 'k';
                                return value;
                            }
                        }
                    },
                    x: {
                        grid: { display: false }
                    }
                }
            }
        });
    }

    // revealDeveloperMenu removed

    async testListModels() {
        if (!this.aiAdvisor || !this.aiAdvisor.hasApiKey()) {
            alert("No hay API Key configurada.");
            return;
        }
        try {
            const apiKey = this.aiAdvisor.getApiKey();
            const btn = document.getElementById('btn-list-models');
            if (btn) btn.textContent = 'Consultando...';

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
            const data = await response.json();

            if (btn) btn.textContent = '🔍 DIAGNÓSTICO IA: Listar Modelos';

            if (data.error) {
                alert("Error ListModels: " + data.error.message);
                return;
            }

            const models = data.models.map(m => m.name.replace('models/', '')).join('\\n');
            alert(`Modelos Permitidos para esta Key:\\n\\n${models}`);
        } catch (e) {
            alert("Excepción: " + e.message);
            const btn = document.getElementById('btn-list-models');
            if (btn) btn.textContent = '🔍 DIAGNÓSTICO IA: Listar Modelos';
        }
    }

    toggleSection(sectionId) {
        this.expandedSection = this.expandedSection === sectionId ? null : sectionId;
        this.render();
    }

    async renderSettings() {
        this.pageTitle.textContent = 'Mi Plan';

        // --- LAYER: Inject CSS for the Type Selector (Segmented Control) ---
        if (!document.getElementById('selector-type-styles')) {
            const style = document.createElement('style');
            style.id = 'selector-type-styles';
            style.textContent = `
                .type-segmented-control input[type="radio"]:checked + .opt-label {
                    background: white !important;
                    color: #1e293b !important;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.08) !important;
                    transform: scale(1.02);
                }
                .type-segmented-control input[type="radio"]:not(:checked) + .opt-label {
                    background: transparent !important;
                    color: #64748b !important;
                    box-shadow: none !important;
                    opacity: 0.7;
                }
                .type-segmented-control .opt-label:hover {
                    opacity: 1;
                    background: rgba(255,255,255,0.4);
                }
            `;
            document.head.appendChild(style);
        }

        // LOADING SHIELD: If store not initialized, show spinner and wait
        // This prevents the form from rendering with empty budgets before Firestore loads
        if (!this.store.initialized) {
            this.container.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:60vh; gap:16px;">
                    <div style="width:40px; height:40px; border:4px solid #e2e8f0; border-top-color:var(--primary-color); border-radius:50%; animation:spin 0.8s linear infinite;"></div>
                    <p style="color:var(--text-secondary); font-weight:600;">Cargando datos desde la nube…</p>
                    <p style="color:#94a3b8; font-size:0.8rem;">Por favor espera antes de editar tu presupuesto.</p>
                </div>
            `;
            // Wait up to 8 seconds for initialization
            await new Promise(resolve => {
                let elapsed = 0;
                const check = setInterval(() => {
                    elapsed += 200;
                    if (this.store.initialized || elapsed >= 8000) {
                        clearInterval(check);
                        resolve();
                    }
                }, 200);
            });
            // If still not initialized after 8s, show error
            if (!this.store.initialized) {
                this.container.innerHTML = `
                    <div style="padding:2rem; text-align:center; color:#ef4444;">
                        <p style="font-size:1.2rem;">⚠️ No se pudo cargar la configuración</p>
                        <p style="color:#64748b;">Recarga la página e intenta de nuevo.</p>
                    </div>
                `;
                return;
            }
        }

        const conf = this.store.config;
        if (this.expandedSection === undefined) this.expandedSection = 'perfil';
        const expanded = this.expandedSection;

        // Filter categories for Budget
        const categories = this.store.categories.filter(c =>
            ['VIVIENDA', 'NECESIDADES', 'ESTILO_DE_VIDA', 'CRECIMIENTO', 'FINANCIERO', 'OTROS'].includes(c.group) &&
            c.id !== 'cat_fin_4'
        );

        const budgets = conf.budgets || {};
        const fixedFloor = {};
        const fixedNames = {};
        (conf.fixed_expenses || []).forEach(fe => {
            if (fe.category_id && fe.amount) {
                fixedFloor[fe.category_id] = (fixedFloor[fe.category_id] || 0) + fe.amount;
                // If only one expense in category, suggest its name
                if (!fixedNames[fe.category_id]) fixedNames[fe.category_id] = (fe.name || fe.title);
                else fixedNames[fe.category_id] = 'Varios';
            }
        });

        // Sumar préstamos al piso fijo de la categoría de Deuda (cat_7)
        const loanPaymentsSum = (conf.loans || []).reduce((sum, l) => {
            const mPay = l.monthly_payment || 0;
            const val = typeof mPay === 'string' ? parseFloat(mPay.replace(/\D/g, '')) : Number(mPay);
            return sum + (val || 0);
        }, 0);
        if (loanPaymentsSum > 0) {
            fixedFloor['cat_7'] = (fixedFloor['cat_7'] || 0) + loanPaymentsSum;
            if (!fixedNames['cat_7']) fixedNames['cat_7'] = 'Deuda/Créditos';
        }

        const fixedCats = categories.filter(c => (fixedFloor[c.id] || 0) > 0);
        const savingCat = categories.find(c => c.id === 'cat_5');
        const groups = {
            'VIVIENDA': 'Vivienda y Servicios 🏠',
            'NECESIDADES': 'Necesidades y Transporte 🛒',
            'ESTILO_DE_VIDA': 'Estilo de Vida y Ocio 🍿',
            'FINANCIERO': 'Finanzas y Deuda 💳',
            'CRECIMIENTO': 'Crecimiento y Educación 📚',
            'OTROS': 'Otros Gastos 🌀'
        };

        const renderRow = (c, isFixed = false, isSaving = false) => {
            const limit = budgets[c.id] || 0;
            const floor = fixedFloor[c.id] || 0;
            const displayVal = this.formatNumberWithDots(limit || floor);

            const customNames = conf.category_names || {};
            const displayName = customNames[c.id] || fixedNames[c.id] || c.name;
            
            // NEW: Get category type (Fixed vs Variable)
            const catTypes = conf.category_types || {};
            const currentType = catTypes[c.id] || (isFixed ? 'FIXED' : 'VARIABLE');

            let rowBg = 'white';
            let borderStyle = '1px solid #edf2f7';

            if (isFixed) {
                rowBg = '#f8fafc';
                borderStyle = '1px solid #e2e8f0; border-left: 4px solid #3b82f6;';
            } else if (isSaving) {
                rowBg = '#f0fdf4';
                borderStyle = '1px solid #dcfce7; border-left: 4px solid #10b981;';
            }

            return `
                <div class="form-group" style="margin-bottom: 0.8rem; display: flex; flex-direction: column; gap: 0.8rem; padding: 12px; border-radius: 14px; background: ${rowBg}; border: ${borderStyle};">
                    <div style="display: flex; align-items: center; gap: 0.8rem;">
                        <div style="flex: 1; display:flex; flex-direction:column; gap:2px;">
                            <input type="text" name="cat_name_${c.id}" value="${displayName}" 
                                   style="border: 1px solid transparent; background:transparent; font-weight:700; font-size:0.95rem; color:var(--text-main); padding:2px 5px; width:100%; outline:none; border-radius:4px;" 
                                   placeholder="Concepto..."
                                   onfocus="this.style.border='1px solid #3b82f6'; this.style.background='#fff';"
                                   onblur="this.style.border='1px solid transparent'; this.style.background='transparent';">
                            <div style="font-size:0.7rem; color:#94a3b8; font-weight:600; padding: 0 5px;">${displayName !== c.name ? c.name : ''}</div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 0.3rem;">
                             <div style="position:relative; display:flex; align-items:center;">
                                <span style="position:absolute; left:10px; color:#94a3b8; font-size:0.8rem; font-weight:700;">$</span>
                                <input type="text" inputmode="numeric" name="budget_${c.id}" value="${limit > 0 ? this.formatNumberWithDots(limit) : ''}" 
                                       placeholder="${floor > 0 ? this.formatNumberWithDots(floor) : '0'}"
                                       style="width: 120px; text-align: right; border: 1px solid #cbd5e1; background: #fff; border-radius: 10px; padding: 8px 12px 8px 25px; font-weight: 800; font-size: 0.95rem; color: #1e293b;"
                                       oninput="window.ui.formatCurrencyInput(this); window.ui.updateBudgetTotal();"
                                       onfocus="this.style.borderColor='var(--primary-color)';"
                                       onblur="this.style.borderColor='#cbd5e1';">
                             </div>
                         </div>
                    </div>
                    
                    <div class="type-segmented-control" style="display: flex; background: #f1f5f9; padding: 4px; border-radius: 10px; gap: 4px;">
                        <label style="flex: 1; margin: 0; cursor: pointer;">
                            <input type="radio" name="cat_type_${c.id}" value="FIXED" ${currentType === 'FIXED' ? 'checked' : ''} style="display: none;">
                            <div class="opt-label" style="text-align: center; padding: 6px; border-radius: 8px; font-size: 0.75rem; font-weight: 700; transition: all 0.2s;">
                                📅 Pago Fijo
                            </div>
                        </label>
                        <label style="flex: 1; margin: 0; cursor: pointer;">
                            <input type="radio" name="cat_type_${c.id}" value="VARIABLE" ${currentType === 'VARIABLE' ? 'checked' : ''} style="display: none;">
                            <div class="opt-label" style="text-align: center; padding: 6px; border-radius: 8px; font-size: 0.75rem; font-weight: 700; transition: all 0.2s;">
                                📊 Presupuesto Variable
                            </div>
                        </label>
                    </div>
                </div>
            `;
        };

        const user = auth.currentUser;
        const userEmail = user && user.email ? user.email.toLowerCase() : '';
        const isAdmin = userEmail === 'robledo.adriana27@gmail.com' || (user && user.uid === 'u7xLwG9m5ePzrXqYt');

        const sections = [
            {
                id: 'perfil', title: 'Perfil y Estrategia', icon: '👤', content: `
                    <p style="font-size: 0.85rem; color: #64748b; margin-top: -5px; margin-bottom: 15px;">Tu ingreso y perfil determinan tu distribución ideal.</p>
                    <div class="form-group"><label>Nombre</label><input type="text" name="user_name" value="${conf.user_name || ''}"></div>
                    <div class="form-group"><label>Ingreso Mensual</label><input type="text" inputmode="numeric" name="monthly_income_target" value="${this.formatNumberWithDots(conf.monthly_income_target || 0)}" oninput="window.ui.formatCurrencyInput(this)"></div>
                    <div class="form-group">
                         <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                             <label style="margin: 0;">Perfil de Gasto</label>
                             <button type="button" onclick="window.ui.showProfileHelp()" style="background: none; border: none; color: #3b82f6; font-size: 0.75rem; cursor: pointer; text-decoration: underline; font-weight: 600; padding: 0;">
                                 ¿Qué perfil elegir?
                             </button>
                         </div>
                         <select name="spending_profile" onchange="window.ui.updateProfileInfo(this.value)">
                             <option value="CONSERVADOR" ${conf.spending_profile === 'CONSERVADOR' ? 'selected' : ''}>Conservador</option>
                             <option value="BALANCEADO" ${conf.spending_profile === 'BALANCEADO' ? 'selected' : ''}>Balanceado</option>
                             <option value="FLEXIBLE" ${conf.spending_profile === 'FLEXIBLE' ? 'selected' : ''}>Flexible</option>
                         </select>
                         <div id="profile-specs"></div>
                     </div>
                     <div class="form-group">
                        <p style="font-size: 0.75rem; color: #64748b; margin-bottom: 5px;">Tu ingreso mensual es la base para tu organización. Los préstamos se gestionan en su propio módulo.</p>
                     </div>
                `
            },
            {
                id: 'cuentas', title: 'Fuentes de pago', icon: '💳', content: `
                    <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 15px;">Indica desde dónde sale el dinero para tus gastos diarios.</p>
                    <div id="accounts-list" style="margin-bottom: 1.5rem;">${this.renderAccountsList()}</div>
                    ${this.store.accounts.some(a => a.type === 'CREDITO') ? `
                    <button type="button" class="btn btn-primary" style="width:100%; margin-bottom:20px; background:var(--text-main); color:white;" onclick="window.ui.showPayCardModal()">
                        💳 Registrar pago a tarjeta
                    </button>
                    ` : ''}
                    <div id="account-form-static" class="card" style="background:var(--bg-body); padding:15px; border:1px solid var(--border-color);">
                        <h4 style="margin:0 0 10px 0; font-size:0.9rem;">+ Agregar otra fuente</h4>
                        <div style="display:flex; flex-direction:column; gap:8px;">
                            <input type="text" id="new-acc-name" placeholder="Nombre (ej. Mi otro banco)">
                            <select id="new-acc-type">
                                <option value="EFECTIVO">Efectivo</option>
                                <option value="BANCO">Débito</option>
                                <option value="CREDITO">Crédito</option>
                            </select>
                            <input type="text" id="new-acc-bal" placeholder="Saldo Inicial / Saldo de Tarjeta">
                            <button type="button" class="btn btn-primary" onclick="window.ui.handleTinyAccountAdd()">Guardar Fuente</button>
                        </div>
                    </div>
                `
            },
            {
                id: 'prestamos', title: 'Préstamos (Deuda)', icon: '🏛️', content: `
                    <p style="font-size: 0.85rem; color: #64748b; margin-bottom: 15px;">Gestiona solo deudas con saldo pendiente (Hipotecas, créditos bancarios). <i>Renting o cuotas fijas de servicios deben ir en Gastos Fijos.</i></p>
                    <div id="loans-list" style="margin-bottom: 1.5rem;">${this.renderLoansList()}</div>
                    <div class="card" style="background:#fff7ed; padding:15px; border:1px solid #ffedd5;">
                        <h4 style="margin:0 0 10px 0; font-size:0.9rem;">+ Nuevo Préstamo</h4>
                        <div style="display:flex; flex-direction:column; gap:8px;">
                            <input type="text" id="loan-name" placeholder="Nombre (ej. Crédito Carro)">
                            <div style="display:flex; gap:8px;">
                                <input type="text" id="loan-payment" placeholder="Cuota mensual" style="flex:1;" oninput="window.ui.formatCurrencyInput(this)">
                                <input type="text" id="loan-day" placeholder="Día de pago (opc)" style="flex:0.6;" maxlength="2">
                            </div>
                            <input type="text" id="loan-balance" placeholder="Saldo pendiente (opcional)" oninput="window.ui.formatCurrencyInput(this)">
                            <button type="button" class="btn btn-primary" style="background:#ea580c;" onclick="window.ui.handleTinyLoanAdd()">Guardar Préstamo</button>
                        </div>
                    </div>
                `
            },
            {
                id: 'ingresos', title: 'Ingresos Recurrentes', icon: '💵', content: `
                    <div id="recurring-incomes-list" style="margin-bottom: 1rem;">${this.renderRecurringIncomesList()}</div>
                    <div class="card" style="background:#f0fdf4; padding:15px; border:1px solid #dcfce7;">
                        <h4 style="margin:0 0 10px 0; font-size:0.9rem;">Nuevo Ingreso</h4>
                        <div style="display:flex; flex-direction:column; gap:8px;">
                            <input type="text" id="new-ri-name" placeholder="Nombre (ej. Salario)">
                            <div style="display:flex; gap:8px;">
                                <input type="text" id="new-ri-amt" placeholder="Monto" style="flex:1;" oninput="window.ui.formatCurrencyInput(this)">
                                <select id="new-ri-cat" style="flex:1;">${this.store.categories.filter(c => c.group === 'INGRESOS').map(c => `<option value="${c.id}">${c.name}</option>`).join('')}</select>
                            </div>
                            <button type="button" class="btn btn-primary" style="background:#16a34a;" onclick="window.ui.handleTinyRIAdd()">+ Agregar</button>
                        </div>
                    </div>
                `
            },
            {
                id: 'gastos_fijos', title: 'Gastos Fijos', icon: '📅', content: `
                    <div id="fixed-expenses-list" style="margin-bottom: 1rem;">${this.renderFixedExpensesList()}</div>
                    <div class="card" style="background:#f9fafb; padding:15px; border:1px solid #eee;">
                        <h4 style="margin:0 0 10px 0; font-size:0.9rem;">Nuevo Gasto Fijo</h4>
                        <div style="display:flex; flex-direction:column; gap:8px;">
                            <input type="text" id="new-fe-name" placeholder="Nombre (ej. Arriendo)">
                            <div style="display:flex; gap:8px;">
                                <input type="text" id="new-fe-amt" placeholder="Monto" style="flex:1;" oninput="window.ui.formatCurrencyInput(this)">
                                <select id="new-fe-cat" style="flex:1;">${categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}</select>
                            </div>
                            <button type="button" class="btn btn-primary" onclick="window.ui.handleTinyFEAdd()">+ Agregar</button>
                        </div>
                    </div>
                `
            },
            {
                id: 'presupuesto', title: 'Presupuesto Mensual', icon: '🎯', content: `
                     <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 15px; margin-bottom: 20px;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                            <div>
                                <span style="display: block; font-size: 0.65rem; color: #64748b; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Perfil Activo</span>
                                <span style="background: #e0f2fe; color: #0369a1; padding: 4px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 700; border: 1px solid #bae6fd;">
                                    ✨ ${conf.spending_profile || 'BALANCEADO'}
                                </span>
                            </div>
                            <button type="button" id="auto-budget-btn" class="btn-primary" style="padding: 8px 16px; border-radius: 12px; font-size: 0.85rem; box-shadow: none;">
                                Aplicar estructura del perfil
                            </button>
                        </div>
                        <div id="budget-status-msg" style="font-size: 0.8rem; color: #334155; font-weight: 600; padding-top: 10px; border-top: 1px dashed #cbd5e1;">
                            ${conf.budget_user_customized ? '🔒 Presupuesto personalizado guardado. Solo cambia si tú lo decides.' : (Object.keys(budgets).length > 0 ? '✔️ Estructura aplicada según tu perfil. Pulsa "Guardar Cambios" para proteger tus ajustes.' : '⚠️ Presupuesto no definido. Usa "Aplicar estructura del perfil" o define tus montos manualmente.')}
                        </div>
                        <div id="budget-alert-tip" style="margin-top:10px; font-size:0.75rem; color:#64748b;">
                            💡 Tip: Puedes tocar los nombres de las categorías para personalizarlas. Pulsa "Guardar Cambios" para que tus ajustes sean permanentes.
                        </div>
                     </div>
 
                     <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; padding: 0 4px;">
                         <span id="budget-summary-pill" style="font-size:0.85rem; font-weight:700; color:#475569;">Calculando...</span>
                     </div>
                    <div style="margin-bottom:1rem;">
                        <h4 style="margin: 0 0 8px 0; font-size: 0.8rem; color: #3b82f6; text-transform: uppercase;">📌 Compromisos Fijos</h4>
                        ${fixedCats.map(c => renderRow(c, true)).join('')}
                    </div>
                    ${savingCat && (fixedFloor[savingCat.id] || 0) === 0 ? `
                    <div style="margin-bottom:1rem;">
                        <h4 style="margin: 0 0 8px 0; font-size: 0.8rem; color: #10b981; text-transform: uppercase;">💰 ${(conf.category_names && conf.category_names['cat_5']) || 'Ahorro'}</h4>
                        ${renderRow(savingCat, false, true)}
                    </div>` : ''}
                    ${Object.keys(groups).map(g => {
                    const gc = categories.filter(c => c.group === g && (fixedFloor[c.id] || 0) === 0 && c.id !== 'cat_5');
                    // Header logic: use custom name if ALL categories in group are mapped or just stick to group name (safer)
                    return gc.length ? `<div style="margin-bottom:1rem;"><h4 style="margin:0 0 8px 0; font-size:0.8rem; color:#64748b; text-transform:uppercase;">${groups[g]}</h4>${gc.map(c => renderRow(c)).join('')}</div>` : '';
                }).join('')}
                `
            },
            {
                id: 'avanzado', title: 'Avanzado', icon: '🛠️', content: `
                      <p style="font-size: 0.85rem; color: #64748b; margin-top: -5px; margin-bottom: 15px;">Acciones de mantenimiento y sistema.</p>
                      
                      ${isAdmin ? `
                      <div style="background: #f5f3ff; border: 1px solid #ddd6fe; border-radius: 12px; padding: 15px; margin-bottom: 15px; display: flex; align-items: center; gap: 12px;">
                          <div style="font-size: 1.5rem;">🧠</div>
                          <div>
                              <div style="font-weight: 700; color: #5b21b6; font-size: 0.9rem;">Asistente Financiero Activo <span style="background:#10b981; color:white; font-size:0.6rem; padding:2px 6px; border-radius:4px; vertical-align:middle; margin-left:4px;">ON</span></div>
                              <div style="font-size: 0.75rem; color: #6d28d9; opacity: 0.8;">La IA centralizada está operando correctamente para todos tus usuarios.</div>
                          </div>
                      </div>
                      ` : ''}

                      <div style="padding: 15px; border-radius: 12px; border: 1px solid #fee2e2; background: #fff5f5;">
                          <button type="button" onclick="window.ui.performNuclearUpdate()" style="background: none; border: none; color: #dc2626; font-size: 0.85rem; font-weight: 600; cursor: pointer; text-decoration: underline; padding: 0;">
                              ☢️ Forzar reinicio y limpieza profunda de caché
                          </button>
                      </div>
                  `
            }
        ];

        this.container.innerHTML = `
            <div class="centro-financiero-layout" style="max-width: 800px; margin: 0 auto; padding-bottom: 100px;">
                <p style="font-size: 0.95rem; color: #64748b; margin-top: -15px; margin-bottom: 25px;">Define cómo quieres que funcione tu dinero este mes.</p>
                <form id="global-settings-form">
                    ${sections.map(s => {
            const isOpen = expanded === s.id;
            return `
                            <div class="accordion-item" style="margin-bottom: 0.5rem; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                                <div onclick="window.ui.toggleSection('${s.id}')" style="padding: 1rem 1.2rem; cursor: pointer; display: flex; align-items: center; justify-content: space-between; background: ${isOpen ? '#f8fafc' : '#fff'};">
                                    <div style="display: flex; align-items: center; gap: 0.8rem;">
                                        <span style="font-size: 1.2rem;">${s.icon}</span>
                                        <h3 style="margin: 0; font-size: 1rem; font-weight: 700; color: #1e293b;">${s.title}</h3>
                                    </div>
                                    <div style="color: #94a3b8;">${isOpen ? '▼' : '▶'}</div>
                                </div>
                                <div id="sec-content-${s.id}" style="display: ${isOpen ? 'block' : 'none'}; padding: 1.2rem; border-top: 1px solid #f1f5f9;">
                                    ${s.content}
                                </div>
                            </div>
                        `;
        }).join('')}
                    
                    <div style="position: fixed; bottom: 0; left: 0; right: 0; padding: 1rem; background: rgba(255,255,255,0.9); backdrop-filter: blur(10px); border-top: 1px solid #e2e8f0; z-index: 1000; display: flex; flex-direction: column; align-items: center; gap: 6px;">
                        ${!this.store.initialized ? `
                        <p style="font-size: 0.78rem; color: #f59e0b; font-weight: 600; margin: 0;">
                            ⏳ Cargando datos desde la nube… espera antes de guardar.
                        </p>` : ''}
                        <button type="submit" class="btn btn-primary" id="settings-save-btn"
                            ${!this.store.initialized ? 'disabled' : ''}
                            style="width: 100%; max-width: 500px; padding: 1rem; font-size: 1rem; font-weight: 700; border-radius: 12px; box-shadow: 0 4px 15px rgba(59,130,246,0.3); ${
                                !this.store.initialized ? 'opacity:0.5; cursor:not-allowed;' : ''
                            }">
                            💾 Guardar Cambios
                        </button>
                    </div>
                </form>

                <div style="background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 12px; padding: 16px; display: flex; align-items: center; gap: 16px; margin-top:2rem;">
                    <div style="font-size: 2.5rem;">🧠</div>
                    <div>
                        <h4 style="margin: 0 0 4px 0; color: #3730a3; font-size: 1rem; display: flex; align-items: center; gap: 8px;">
                            Asistente Financiero Activo <span style="background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.6rem; font-weight: bold;">ON</span>
                        </h4>
                        <p style="margin: 0; font-size: 0.85rem; color: #4338ca; line-height: 1.4;">
                            Tu inteligencia artificial está operando y protegiendo tu salud financiera en tiempo real.
                         </p>
                     </div>
                 </div>
             </div>
         `;

        setTimeout(() => {
            this.updateBudgetTotal();
            this.updateProfileInfo(conf.spending_profile || 'BALANCEADO');
        }, 100);
        if (window.feather) window.feather.replace();

        this.container.onclick = (e) => {
            const target = e.target;
            if (target.id === 'force-update-env-btn' || target.closest('#force-update-env-btn')) {
                this.performNuclearUpdate();
            }

            if (target.id === 'auto-budget-btn' || target.closest('#auto-budget-btn')) {
                // PROTECTION: If user already has a customized budget, confirm overwrite
                if (conf.budget_user_customized) {
                    if (!confirm('⚠️ Ya tienes un presupuesto personalizado guardado. ¿Estás seguro de que quieres reemplazarlo con la estructura del perfil? Este cambio solo se aplica al formulario — NO se guarda hasta que pulses "Guardar Cambios".')) {
                        return;
                    }
                }

                const incomeInput = document.querySelector('input[name="monthly_income_target"]');
                const profileSelect = document.querySelector('select[name="spending_profile"]');
                const incomeStr = incomeInput ? incomeInput.value.replace(/\D/g, '') : '0';
                const income = parseFloat(incomeStr) || 0;
                const profile = profileSelect ? profileSelect.value : 'BALANCEADO';

                if (income <= 0) {
                    alert('⚠️ Por favor ingresa un "Ingreso Mensual Objetivo" válido.');
                    return;
                }

                const distributions = this.getDistributions();
                const weights = distributions[profile] || distributions['BALANCEADO'];
                // Usamos todas las categorías presupuestables visibles en la pantalla de ajustes
                const activeCats = categories;

                const totalFixed = activeCats.reduce((sum, cat) => sum + (fixedFloor[cat.id] || 0), 0);
                const surplus = income - totalFixed;

                if (surplus < 0) {
                    alert('⚠️ Gastos fijos superan ingresos.');
                } else {
                    const finalValues = {};
                    let totalRounded = 0;

                    // Categorías que pueden recibir excedente (las que NO tienen piso fijo)
                    const flexibleCats = activeCats.filter(cat => (fixedFloor[cat.id] || 0) === 0);
                    const totalFlexWeight = flexibleCats.reduce((sum, c) => sum + (weights[c.id] || 0.005), 0);

                    activeCats.forEach((cat, index) => {
                        const floor = fixedFloor[cat.id] || 0;
                        let val = floor;

                        // Si no tiene piso fijo, le damos su parte del excedente
                        if (floor === 0 && flexibleCats.length > 0) {
                            const weight = weights[cat.id] || 0.005;
                            val = surplus * (weight / totalFlexWeight);
                        }

                        // Redondeo a miles para todas menos la última
                        if (index < activeCats.length - 1) {
                            val = Math.round(val / 1000) * 1000;
                            totalRounded += val;
                        }
                        finalValues[cat.id] = val;
                    });

                    // Ajuste de centavos/redondeo en la última categoría (normalmente Otros o Ahorro)
                    const lastCat = activeCats[activeCats.length - 1];
                    finalValues[lastCat.id] = Math.max(0, income - totalRounded);

                    activeCats.forEach(cat => {
                        const input = document.querySelector(`input[name="budget_${cat.id}"]`);
                        if (input) input.value = this.formatNumberWithDots(finalValues[cat.id]);
                    });
                    
                    // REMOVED auto-save to prevent budget wipes without explicit 'Guardar Cambios'
                    this.updateBudgetTotal();
                    const statusMsg = document.getElementById('budget-status-msg');
                    if (statusMsg) statusMsg.innerHTML = '✨ Estructura sugerida aplicada al formulario. No olvides pulsar "Guardar Cambios" para confirmar.';
                    alert('✨ Estructura del perfil sugerida. Revisa los montos y pulsa "Guardar Cambios" al final.');
                }
            }

            if (target.classList.contains('delete-account') || target.closest('.delete-account')) {
                const id = (target.dataset.id || target.closest('.delete-account').dataset.id);
                if (confirm('¿Borrar esta cuenta?')) {
                    this.store.deleteAccount(id);
                    this.render();
                }
            }
            if (target.classList.contains('edit-account') || target.closest('.edit-account')) {
                const id = (target.dataset.id || target.closest('.edit-account').dataset.id);
                this.showEditAccountModal(id);
            }

            // Loans
            if (target.classList.contains('edit-loan') || target.closest('.edit-loan')) {
                const id = (target.dataset.id || target.closest('.edit-loan').dataset.id);
                this.showEditLoanModal(id);
            }
            if (target.classList.contains('delete-loan') || target.closest('.delete-loan')) {
                const id = (target.dataset.id || target.closest('.delete-loan').dataset.id);
                this.handleLoanDelete(id);
            }

            // Fixed Expenses
            if (target.classList.contains('edit-fixed-exp') || target.closest('.edit-fixed-exp')) {
                const id = (target.dataset.id || target.closest('.edit-fixed-exp').dataset.id);
                this.showEditFixedExpenseModal(id);
            }
            if (target.classList.contains('delete-fixed-exp') || target.closest('.delete-fixed-exp')) {
                const id = (target.dataset.id || target.closest('.delete-fixed-exp').dataset.id);
                this.handleFixedExpenseDelete(id);
            }

            // Recurring Incomes
            if (target.classList.contains('edit-rec-inc') || target.closest('.edit-rec-inc')) {
                const id = (target.dataset.id || target.closest('.edit-rec-inc').dataset.id);
                this.showEditRecurringIncomeModal(id);
            }
            if (target.classList.contains('delete-rec-inc') || target.closest('.delete-rec-inc')) {
                const id = (target.dataset.id || target.closest('.delete-rec-inc').dataset.id);
                this.handleRecurringIncomeDelete(id);
            }
        };

        this.container.onsubmit = (e) => {
            e.preventDefault();
            if (e.target.id === 'global-settings-form') {

                // LAYER 3: Block save if store not fully initialized (prevents budget wipe on fast reload)
                if (!this.store.initialized) {
                    alert('⏳ Los datos aún se están cargando desde la nube. Por favor espera un momento e intenta de nuevo.');
                    return;
                }

                const formData = new FormData(e.target);
                // CRITICAL: Build budgets FRESH from form fields only.
                // Do NOT merge with stored values — the form IS the source of truth.
                // If a category has no value in the form, it means the user removed it.
                const newBudgets = {};
                const newNames = {};
                const newTypes = {};

                for (let [key, value] of formData.entries()) {
                    if (key.startsWith('budget_')) {
                        const catId = key.replace('budget_', '');
                        const val = parseFloat(value.toString().replace(/\D/g, '')) || 0;
                        if (val > 0) newBudgets[catId] = val;
                    }
                    if (key.startsWith('cat_name_')) {
                        const catId = key.replace('cat_name_', '');
                        if (value) newNames[catId] = value;
                    }
                    if (key.startsWith('cat_type_')) {
                        const catId = key.replace('cat_type_', '');
                        if (value) newTypes[catId] = value;
                    }
                }

                console.log('💾 Guardar Cambios: Budget keys being saved:', Object.keys(newBudgets));

                // Pass explicitBudgetSave flag so the store fully replaces the budgets field
                // in Firestore instead of merging (which would keep deleted categories alive).
                this.store.updateConfig({
                    monthly_income_target: parseFloat(formData.get('monthly_income_target').toString().replace(/\D/g, '')) || 0,
                    user_name: formData.get('user_name'),
                    spending_profile: formData.get('spending_profile'),
                    has_debts: formData.get('has_debts') === 'on',
                    total_debt: parseFloat(formData.get('total_debt') ? formData.get('total_debt').toString().replace(/\D/g, '') : '0') || 0,
                    gemini_api_key: formData.get('gemini_api_key') || '',
                    budgets: newBudgets,
                    category_names: newNames,
                    category_types: newTypes,
                    budget_user_customized: true  // Flag: user has explicitly saved their budget
                }, { explicitBudgetSave: true });
                alert('✅ Cambios guardados. Tu presupuesto personalizado ha sido protegido.');
                this.render();
            }
        };
    }

    handleTinyAccountAdd() {
        const name = document.getElementById('new-acc-name').value;
        const type = document.getElementById('new-acc-type').value;
        const bal = parseFloat(document.getElementById('new-acc-bal').value.replace(/\D/g, '')) || 0;
        if (!name) return alert('Ponle un nombre');
        this.store.addAccount({ name, type, initial_balance: bal });
        this.render();
    }

    async handleTinyRIAdd() {
        const nameInput = document.getElementById('new-ri-name');
        const amtInput = document.getElementById('new-ri-amt');
        const catInput = document.getElementById('new-ri-cat');

        const name = nameInput.value;
        const amt = parseFloat(amtInput.value.replace(/\D/g, '')) || 0;
        const cat = catInput.value;

        if (!name || !amt) return alert('Completa los campos');

        await this.store.addRecurringIncome({ name, amount: amt, category_id: cat, day: 1 });
        alert('✅ Ingreso agregado');

        nameInput.value = '';
        amtInput.value = '';

        await this.render();
    }

    async handleTinyFEAdd() {
        const nameInput = document.getElementById('new-fe-name');
        const amtInput = document.getElementById('new-fe-amt');
        const catInput = document.getElementById('new-fe-cat');

        const name = nameInput.value;
        const amt = parseFloat(amtInput.value.replace(/\D/g, '')) || 0;
        const cat = catInput.value;

        if (!name || !amt) return alert('Completa los campos');

        console.log('Adding Fixed Expense:', { name, amt, cat });
        await this.store.addFixedExpense({ name, amount: amt, category_id: cat, day: 1 });
        alert('✅ Gasto fijo agregado');

        nameInput.value = '';
        amtInput.value = '';

        await this.render();
    }

    async performNuclearUpdate() {
        if (!confirm('¿Actualizar a la última versión? Esto recargará la aplicación.')) return;
        try {
            if ('serviceWorker' in navigator) {
                const regs = await navigator.serviceWorker.getRegistrations();
                for (let r of regs) await r.unregister();
            }
            const keys = await caches.keys();
            for (let k of keys) await caches.delete(k);
            window.location.href = window.location.pathname + '?update=' + Date.now();
        } catch (e) {
            window.location.reload();
        }
    }


    renderAccountsList() {
        let list = this.store.accounts || [];
        if (list.length === 0) return '';

        // Filtro: No mostrar cuentas en $0 para reducir ruido, a menos que sean las principales o sea la única
        if (list.length > 1) {
            list = list.filter(a => {
                const isMain = ['acc_1', 'acc_2', 'acc_tc_1'].includes(a.id);
                return isMain || a.current_balance !== 0;
            });
        }

        return list.map(a => {
            const isTC = a.type === 'CREDITO';
            const label = isTC ? 'Saldo de tarjeta' : 'Saldo disponible';
            const statusColor = 'var(--text-main)';

            // Info de corte si aplica
            let corteHtml = '';
            if (isTC && a.billing_cycle_day) {
                const cycleInfo = this.calculateCardCycle(a);
                corteHtml = `
                <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 5px; background: #f8fafc; padding: 6px 10px; border-radius: 8px; border: 1px dashed #e2e8f0;">
                   <b>Ciclo actual:</b> ${this.formatCurrency(cycleInfo.cycleSpending)} 
                   <span style="margin: 0 4px; color: #cbd5e1;">|</span>
                   <b>Corte:</b> Día ${a.billing_cycle_day}
                </div>`;
            }

            return `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid var(--border-color); padding: 1rem 0;">
                <div style="flex: 1;">
                    <div style="font-weight: 700; font-size: 0.95rem; color: var(--text-main);">${a.name}</div>
                    <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 2px;">
                       ${label}: <b style="color: ${statusColor}">${this.formatCurrency(a.current_balance)}</b>
                    </div>
                    ${corteHtml}
                </div>
                <div style="display: flex; gap: 0.5rem; margin-top: 4px;">
                    <button class="btn-text edit-account" data-id="${a.id}" style="color: var(--primary-color);" title="Editar">
                        <i data-feather="edit-2" style="width:18px;"></i>
                    </button>
                    ${!['acc_1', 'acc_2', 'acc_tc_1'].includes(a.id) ? `
                    <button class="btn-text delete-account" data-id="${a.id}" style="color: var(--text-muted);" title="Borrar">
                        <i data-feather="trash-2" style="width:18px;"></i>
                    </button>
                    ` : ''}
                </div>
            </div>
        `}).join('');
    }

    calculateCardCycle(account) {
        if (!account.billing_cycle_day) return { cycleSpending: 0 };
        const now = new Date();
        const cycleDay = parseInt(account.billing_cycle_day);
        let startDate;

        if (now.getDate() >= cycleDay) {
            startDate = new Date(now.getFullYear(), now.getMonth(), cycleDay);
        } else {
            startDate = new Date(now.getFullYear(), now.getMonth() - 1, cycleDay);
        }

        const cycleSpending = (this.store.transactions || [])
            .filter(t => t.account_id === account.id && t.type === 'GASTO' && new Date(t.date) >= startDate)
            .reduce((sum, t) => sum + t.amount, 0);

        return { cycleSpending };
    }

    showEditAccountModal(id) {
        const acc = this.store.accounts.find(a => a.id === id);
        if (!acc) return;

        const html = `
            <div style="display:flex; flex-direction:column; gap:12px; text-align:left;">
                <div>
                    <label style="display:block; font-size:0.8rem; font-weight:700; margin-bottom:4px;">Nombre</label>
                    <input type="text" id="edit-acc-name" value="${acc.name}" style="width:100%; padding:10px; border-radius:8px; border:1px solid #ccc;">
                </div>
                <div>
                    <label style="display:block; font-size:0.8rem; font-weight:700; margin-bottom:4px;">${acc.type === 'CREDITO' ? 'Saldo de tarjeta' : 'Saldo actual'}</label>
                    <input type="text" id="edit-acc-bal" value="${this.formatNumberWithDots(acc.current_balance)}" style="width:100%; padding:10px; border-radius:8px; border:1px solid #ccc;">
                </div>
                ${acc.type === 'CREDITO' ? `
                <div>
                    <label style="display:block; font-size:0.8rem; font-weight:700; margin-bottom:4px;">Día de Corte (Opcional)</label>
                    <input type="number" id="edit-acc-cycle" value="${acc.billing_cycle_day || ''}" min="1" max="31" placeholder="Ej: 15" style="width:100%; padding:10px; border-radius:8px; border:1px solid #ccc;">
                    <p style="font-size:0.75rem; color:#666; margin-top:4px;">Ayuda a agrupar tus compras en el ciclo actual para darte mejor claridad.</p>
                </div>
                ` : ''}
                <button onclick="window.ui.saveAccountEdit('${id}')" class="btn btn-primary" style="width:100%; margin-top:10px;">Guardar Cambios</button>
            </div>
        `;
        this.showModal(`Editar ${acc.name}`, html);
    }

    saveAccountEdit(id) {
        const name = document.getElementById('edit-acc-name').value;
        const bal = parseFloat(document.getElementById('edit-acc-bal').value.replace(/\D/g, '')) || 0;
        const cycleInput = document.getElementById('edit-acc-cycle');
        const cycleDay = cycleInput ? cycleInput.value : null;

        const idx = this.store.accounts.findIndex(a => a.id === id);
        if (idx !== -1) {
            this.store.accounts[idx].name = name;
            this.store.accounts[idx].current_balance = bal;
            if (cycleDay !== null) this.store.accounts[idx].billing_cycle_day = cycleDay;
            this.store._saveAccountsLocally(); // Force save
            alert('✅ Cuenta actualizada');
            this.render();
        }
    }

    showPayCardModal() {
        const cards = this.store.accounts.filter(a => a.type === 'CREDITO');
        const sources = this.store.accounts.filter(a => a.type !== 'CREDITO');

        if (cards.length === 0) return alert('No tienes tarjetas de crédito configuradas.');

        const html = `
            <div style="display:flex; flex-direction:column; gap:16px; text-align:left;">
                <div>
                    <label style="display:block; font-size:0.85rem; font-weight:700; margin-bottom:6px;">¿Qué tarjeta vas a pagar?</label>
                    <select id="pay-card-target" style="width:100%; padding:12px; border-radius:12px; border:1px solid #ccc;">
                        ${cards.map(c => `<option value="${c.id}">${c.name} (Saldo: ${this.formatCurrency(c.current_balance)})</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label style="display:block; font-size:0.85rem; font-weight:700; margin-bottom:6px;">¿Desde qué cuenta sale el dinero?</label>
                    <select id="pay-card-source" style="width:100%; padding:12px; border-radius:12px; border:1px solid #ccc;">
                        ${sources.map(s => `<option value="${s.id}">${s.name} (Disponible: ${this.formatCurrency(s.current_balance)})</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label style="display:block; font-size:0.85rem; font-weight:700; margin-bottom:6px;">Monto del pago</label>
                    <input type="text" id="pay-card-amount" placeholder="$0" style="width:100%; padding:12px; border-radius:12px; border:1px solid #ccc; font-size:1.1rem; font-weight:700;" oninput="window.ui.formatCurrencyInput(this)">
                </div>
                
                <div style="background:#f0fbff; padding:12px; border-radius:12px; font-size:0.8rem; color:#0c4a6e; line-height:1.4; border:1px solid #bae6fd;">
                    ℹ️ <b>Nota Educativa:</b> Este pago reduce tu saldo de tarjeta, pero NO cuenta como gasto de consumo nuevo, ya que las compras originales ya fueron procesadas.
                </div>

                <button onclick="window.ui.handlePayCardSubmit()" class="btn btn-primary" style="width:100%; padding:14px; font-weight:700;">✅ Registrar Pago</button>
            </div>
        `;
        this.showModal('Pagar Tarjeta de Crédito', html);
    }

    async handlePayCardSubmit() {
        const targetId = document.getElementById('pay-card-target').value;
        const sourceId = document.getElementById('pay-card-source').value;
        const amountStr = document.getElementById('pay-card-amount').value.replace(/\./g, '');
        const amount = parseFloat(amountStr) || 0;

        if (amount <= 0) return alert('Ingresa un monto válido.');

        const target = this.store.accounts.find(a => a.id === targetId);
        const source = this.store.accounts.find(a => a.id === sourceId);

        // 1. Transaction to Card (Income/Payment)
        await this.store.addTransaction({
            type: 'PAGO_TARJETA',
            amount,
            date: new Date().toISOString().split('T')[0],
            account_id: targetId,
            category_id: 'cat_ext_transfer', // Generic tag for transfer
            note: `Pago desde ${source.name}`
        });

        // 2. Reflect on source account
        this.store._updateAccountBalanceLocal(sourceId, amount, 'PAGO_TARJETA');
        if (this.store.uid) {
            await db.collection('users').doc(this.store.uid).collection('accounts').doc(sourceId).update({ current_balance: source.current_balance });
        }

        alert('✅ Pago registrado con éxito.');
        this.render();
    }

    renderFixedExpensesList() {
        const list = this.store.config.fixed_expenses || [];
        if (list.length === 0) return '<p class="text-secondary" style="font-size: 0.85rem;">No tienes gastos fijos configurados.</p>';

        return list.map(fe => {
            const cat = this.store.categories.find(c => c.id === fe.category_id) || { name: '?' };
            return `
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eee; padding: 0.6rem 0;">
                    <div>
                        <div style="font-weight: 600; font-size: 0.95rem;">${fe.name || fe.title || 'Gasto Fijo'}</div>
                        <div style="font-size: 0.85rem; color: #666;">
                           Día ${fe.day || 1} • ${cat.name} • ${this.formatCurrency(fe.amount)}
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
            const cat = this.store.categories.find(c => c.id === ri.category_id) || { name: 'Ingreso' };
            return `
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eee; padding: 0.6rem 0;">
                    <div>
                        <div style="font-weight: 600; font-size: 0.95rem;">${ri.name}</div>
                        <div style="font-size: 0.85rem; color: #666;">
                           Día ${ri.day} • ${cat.name} • ${this.formatCurrency(ri.amount)}
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

    renderStrategyReport() {
        this.pageTitle.textContent = 'Mi Semana 📊';
        if (typeof StrategyReport === 'undefined') {
            this.container.innerHTML = '<div style="padding:2rem; color:#999;">Módulo no cargado.</div>';
            return;
        }
        const report = new StrategyReport(this.container, this.store, this.aiAdvisor);
        window.strategyReport = report;
        report.render();
        if (window.feather) window.feather.replace();
    }

    async renderGoals() {
        this.pageTitle.textContent = 'Mis Metas 🧠';
        const goals = this.store.getGoals();
        const config = this.store.config;
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        const savedPlan = await this.store.getSavedMonthPlan(currentYear, currentMonth);

        let contextualAlert = '';
        try {
            const auditEvents = JSON.parse(localStorage.getItem('cc_weekly_events') || '{}');
            if (auditEvents.rebalances && auditEvents.rebalances.length > 0) {
                const mainCat = auditEvents.rebalances[0].fromCat || 'Gastos';
                contextualAlert = `
                    <div style="background:#FFF5F5; border-radius:12px; padding:12px; margin-bottom:1.5rem; display:flex; align-items:center; gap:10px; border:1px solid #FED7D7;">
                        <span style="font-size:1.2rem;">💡</span>
                        <p style="margin:0; font-size:0.85rem; color:#C53030;">
                            Reducir <b>${mainCat}</b> un 15% contribuiría significativamente a tu Plan del Mes.
                        </p>
                    </div>
                `;
            }
        } catch (e) { }

        let html = `
            <div id="cfo-plan-container" style="margin-bottom: 2rem; background: white; border-radius: 20px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
                <div style="background: #f8fafc; padding: 15px 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 1.2rem;">📌</span>
                        <span style="font-weight: 800; color: #1e293b; font-size: 0.9rem;">Plan del Mes</span>
                    </div>
                    <span id="plan-status-badge" style="font-size: 0.7rem; font-weight: 700; background: ${savedPlan ? '#dcfce7' : '#fef3c7'}; color: ${savedPlan ? '#166534' : '#92400e'}; padding: 4px 10px; border-radius: 20px;">
                        ${savedPlan ? '✅ Listo' : '⚒️ En construcción'}
                    </span>
                </div>
                <div style="padding: 20px;" id="cfo-plan-content">
                    ${savedPlan ? this._renderPlanDetails(savedPlan) : `
                        <div style="text-align: center; padding: 10px 0;">
                            <p style="color: #64748b; font-size: 0.85rem; margin-bottom: 15px;">Diseñemos tu estrategia para este mes basada en tus datos reales.</p>
                            <button class="btn btn-primary" id="generate-month-plan-btn" style="background: #1e293b; border: none; padding: 10px 24px; font-weight: 700;">
                                🧠 Generar Plan del Mes
                            </button>
                        </div>
                    `}
                </div>
            </div>

            <div style="margin-bottom: 1.2rem; display: flex; justify-content: space-between; align-items: center;">
                <h3 style="margin:0; font-size: 1.1rem; color: #1e293b;">Tus Metas</h3>
                <div style="display:flex; gap:8px;">
                    <button class="btn btn-text" id="suggest-smart-goal-btn" style="color:#9C27B0; font-size:0.8rem; font-weight:700;">🎯 Sugerencia IA</button>
                    <button class="btn btn-text" id="add-goal-btn" style="color:#2563eb; font-size:0.8rem; font-weight:700;">+ Nueva Meta</button>
                </div>
            </div>
            ${contextualAlert}
            <div id="smart-goal-suggestion-box"></div>
        `;

        if (goals.length === 0) {
            html += `<div style="text-align:center; padding: 2rem; background: #f8fafc; border-radius: 15px; color: #64748b; font-size: 0.85rem;">Crea una meta para empezar a ahorrar.</div>`;
        } else {
            html += `<div class="stats-grid" style="grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));">`;
            goals.forEach(g => {
                const percent = Math.min((g.current_amount / g.target_amount) * 100, 100);
                let color = (g.type === 'EMERGENCY') ? '#4CAF50' : (g.type === 'DEBT') ? '#F44336' : '#2196F3';
                html += `
                    <div class="card" style="border-top: 4px solid ${color};">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                            <span style="font-weight:800; color:#1e293b;">${g.name}</span>
                            <button class="delete-goal" data-id="${g.id}" style="background:none; border:none; color:#cbd5e1; cursor:pointer;"><i data-feather="trash-2" style="width:14px;"></i></button>
                        </div>
                        <div style="font-size:1.4rem; font-weight:800; color:#1e293b; margin-bottom:10px;">${this.formatCurrency(g.current_amount)}</div>
                        <div style="background:#f1f5f9; height:8px; border-radius:10px; overflow:hidden; margin-bottom:15px;">
                            <div style="width:${percent}%; background:${color}; height:100%;"></div>
                        </div>
                        <button class="btn btn-secondary add-fund-btn" data-id="${g.id}" data-type="${g.type}" style="width:100%; border: 1.5px solid ${color}; color:${color}; font-weight:700;">+ Abonar</button>
                    </div>
                `;
            });
            html += `</div>`;
        }

        this.container.innerHTML = html;

        // Handlers
        const gBtn = document.getElementById('generate-month-plan-btn');
        if (gBtn) gBtn.onclick = () => this._handleGeneratePlan();

        const sBtn = document.getElementById('suggest-smart-goal-btn');
        if (sBtn) sBtn.onclick = () => this._handleSuggestSmartGoal();

        const aBtn = document.getElementById('add-goal-btn');
        if (aBtn) aBtn.onclick = () => {
            const name = prompt("Nombre de la meta:");
            const target = parseFloat((prompt("Monto ($):") || "0").replace(/\./g, ''));
            if (name && target > 0) { this.store.addGoal({ name, target_amount: target, current_amount: 0, type: 'PURCHASE' }); this.render(); }
        }

        const appBtn = document.getElementById('apply-plan-btn');
        if (appBtn) appBtn.onclick = () => this._handleApplyPlan(savedPlan);

        document.querySelectorAll('.add-fund-btn').forEach(b => {
            b.onclick = (e) => {
                const id = e.currentTarget.dataset.id;
                const type = e.currentTarget.dataset.type;
                const amount = parseFloat((prompt("Monto a abonar ($):") || "0").replace(/\./g, ''));
                if (amount <= 0) return;
                const accIndex = prompt(`¿Elegir cuenta?\n${this.store.accounts.map((a, i) => `${i + 1}. ${a.name}`).join('\n')}`);
                const account = this.store.accounts[parseInt(accIndex) - 1];
                if (account) {
                    this.store.addTransaction({
                        type: (type === 'DEBT' ? 'PAGO_DEUDA' : 'AHORRO'), amount, date: new Date().toISOString().split('T')[0],
                        category_id: (type === 'DEBT' ? 'cat_7' : 'cat_5'), account_id: account.id, goal_id: id, note: 'Abono meta'
                    });
                    this.render();
                }
            }
        });

        document.querySelectorAll('.delete-goal').forEach(b => {
            b.onclick = (e) => {
                const id = e.currentTarget.dataset.id;
                if (confirm("¿Borrar meta?")) { this.store.deleteGoal(id); this.render(); }
            }
        });

        if (window.feather) window.feather.replace();
    }

    _renderPlanDetails(plan) {
        let pLines = (plan.prioridades || []).map((p, i) => `
            <div style="background:white; border:1px solid #f1f5f9; padding:10px; border-radius:10px; margin-bottom:8px; font-size:0.8rem;">
                <div style="font-weight:800; color:#1e293b;">${i + 1}. ${p.accion} ${p.monto > 0 ? `($${p.monto.toLocaleString()})` : ''}</div>
                <div style="color:#64748b;">${p.por_que}</div>
                <div style="color:#2563eb; font-weight:700; font-size:0.7rem; margin-top:2px;">📈 ${p.impacto}</div>
            </div>
        `).join('');

        let wLines = (plan.plan_semanal || []).map(s => `
            <div style="flex:1; background:#f8fafc; padding:8px; border-radius:10px; border:1px solid #eff6ff; min-width:100px;">
                <div style="font-size:0.6rem; font-weight:800; color:#94a3b8;">SEM ${s.semana}</div>
                <div style="font-size:0.75rem; font-weight:700; color:#1e293b;">${s.accion}</div>
                ${s.monto > 0 ? `<div style="font-size:0.75rem; color:#2563eb; font-weight:800;">$${s.monto.toLocaleString()}</div>` : ''}
            </div>
        `).join('');

        return `
            <div style="background:#eff6ff; padding:12px; border-radius:12px; margin-bottom:1.5rem; border-left:4px solid #2563eb;">
                <p style="margin:0; font-size:0.85rem; color:#1e40af; font-weight:700;">🏠 Diagnóstico: ${plan.diagnostico_corto}</p>
            </div>
            <div style="margin-bottom:1.5rem;">
                <div style="font-size:0.7rem; font-weight:800; color:#94a3b8; text-transform:uppercase; margin-bottom:8px;">Prioridades</div>
                ${pLines}
            </div>
            <div style="margin-bottom:1.5rem;">
                <div style="font-size:0.7rem; font-weight:800; color:#94a3b8; text-transform:uppercase; margin-bottom:8px;">Plan Semanal</div>
                <div style="display:flex; gap:8px; overflow-x:auto;">${wLines}</div>
            </div>
            <div style="background:#fffbeb; padding:12px; border-radius:12px; border:1px solid #fde68a; margin-bottom:1.5rem;">
                <div style="font-weight:800; font-size:0.7rem; color:#92400e;">REGLA DE CONTROL</div>
                <p style="margin:0; font-size:0.75rem; color:#78350f;">${plan.regla_control}</p>
            </div>
            <button class="btn btn-primary" id="apply-plan-btn" style="width:100%; background:#2563eb; font-weight:700;">Aplicar Plan a Metas</button>
        `;
    }

    async _handleGeneratePlan() {
        const btn = document.getElementById('generate-month-plan-btn');
        const content = document.getElementById('cfo-plan-content');
        if (this.store.transactions.length < 5) { alert("Registra al menos 5 movimientos."); return; }

        btn.disabled = true; btn.innerHTML = '🕒 Generando...';
        content.innerHTML = '<div style="text-align:center; padding:20px;"><div class="spinner"></div></div>';

        const history = this.store.getHistorySummary(3);
        const config = this.store.config;
        const now = new Date();
        const breakdown = this.store.getCategoryBreakdown(now.getMonth(), now.getFullYear());

        const contextData = {
            ingresoMensualProm: history.reduce((a, b) => a + b.income, 0) / history.length,
            gastosFijosProm: (config.fixed_expenses || []).reduce((a, b) => a + b.amount, 0),
            ahorroActual: history.reduce((a, b) => a + (b.savings || 0), 0),
            deudaTotal: config.total_debt || 0,
            categoriasTopGasto: Object.entries(breakdown).sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]),
            metasActuales: this.store.getGoals().map(g => ({ nombre: g.name, objetivo: g.target_amount }))
        };

        try {
            const plan = await this.aiAdvisor.getMonthPlan(contextData);
            if (plan) {
                await this.store.saveMonthPlan(now.getFullYear(), now.getMonth(), plan);
                this.render();
            }
        } catch (e) { alert("Error IA"); this.render(); }
    }

    async _handleApplyPlan(plan) {
        if (!plan) return;
        if (confirm("¿Aplicar cambios sugeridos?")) {
            const hasEmergency = this.store.getGoals().some(g => g.type === 'EMERGENCY');
            if (!hasEmergency) this.store.addGoal({ name: 'Fondo de Emergencia', target_amount: 5000000, current_amount: 0, type: 'EMERGENCY' });
            alert("Aplicado con éxito.");
            this.render();
        }
    }

    async _handleSuggestSmartGoal() {
        const box = document.getElementById('smart-goal-suggestion-box');
        box.innerHTML = '<p style="text-align:center; font-size:0.8rem; color:#64748b;">Analizando...</p>';
        const history = this.store.getHistorySummary(3);
        const averages = {
            ingresos_promedio: history.reduce((a, b) => a + b.income, 0) / history.length,
            gastos_promedio: history.reduce((a, b) => a + b.expenses, 0) / history.length,
            score_promedio: 85, perfil: this.store.config.spending_profile || 'BALANCEADO'
        };
        try {
            const sug = await this.aiAdvisor.getSmartGoalSuggestion(averages);
            if (sug) {
                box.innerHTML = `<div style="background:#f9f5ff; border:1px solid #9C27B020; padding:15px; border-radius:15px; margin-bottom:1.5rem;">
                    <div style="font-weight:800; color:#4a148c; font-size:0.8rem; margin-bottom:5px;">Sugerencia de tu asesor</div>
                    <div style="font-weight:700; font-size:1rem; margin-bottom:5px;">${sug.nombre_meta}</div>
                    <p style="font-size:0.75rem; color:#475569; margin-bottom:10px;">${sug.justificacion}</p>
                    <button class="btn btn-primary" id="confirm-sug-btn" style="background:#9C27B0; width:100%; border-radius:10px;">Crear Meta ($${sug.monto_sugerido.toLocaleString()})</button>
                </div>`;
                document.getElementById('confirm-sug-btn').onclick = () => {
                    this.store.addGoal({ type: sug.tipo_meta, name: sug.nombre_meta, target_amount: sug.monto_sugerido, current_amount: 0 });
                    this.render();
                };
            }
        } catch (e) { box.innerHTML = ''; }
    }

    showModal(title, textHTML) {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `<div class="modal-content" style="max-width:400px;">
            <div class="modal-header"><h3>${title}</h3><button class="close-modal">&times;</button></div>
            <div style="padding:10px 0; font-size:0.9rem; color:var(--text-secondary);">${textHTML}</div>
        </div>`;
        modal.querySelector('.close-modal').onclick = () => document.body.removeChild(modal);
        document.body.appendChild(modal);
        requestAnimationFrame(() => modal.classList.remove('hidden'));
    }

    renderLoansList() {
        const list = this.store.config.loans || [];
        if (list.length === 0) return '<p class="text-secondary" style="font-size: 0.85rem;">No tienes préstamos registrados.</p>';
        return list.map(loan => `
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eee; padding: 1.2rem 0;">
                <div style="flex:1;">
                    <div style="font-weight: 700; font-size: 1rem; color: var(--text-main);">${loan.name}</div>
                    <div style="font-size: 0.85rem; color: #64748b;">
                        Cuota: <b>${this.formatCurrency(loan.monthly_payment)}</b> 
                    </div>
                    ${loan.total_balance > 0 ? `<div style="font-size: 0.75rem; color: #ef4444; font-weight:600; margin-top: 2px;">Saldo pendiente: ${this.formatCurrency(loan.total_balance)}</div>` : ''}
                    <button class="btn-text" onclick="window.ui.handleMoveLoanToFixed('${loan.id}')" style="color: #6366f1; font-size: 0.7rem; padding: 0.4rem 0; font-weight: 700; text-decoration: underline; background:none; border:none; cursor:pointer;">
                        🔄 Esto no es deuda (Mover a gasto fijo)
                    </button>
                </div>
                <div style="display: flex; gap: 0.5rem;">
                    <button class="btn-text edit-loan" data-id="${loan.id}" style="color: #2196F3; padding: 8px;">
                        <i data-feather="edit-2" style="width:18px;"></i>
                    </button>
                    <button class="btn-text delete-loan" data-id="${loan.id}" style="color: #ef4444; padding: 8px;">
                        <i data-feather="trash-2" style="width:18px;"></i>
                    </button>
                </div>
            </div>
        `).join('') + '<script>feather.replace();</script>';
    }

    async handleMoveLoanToFixed(id) {
        const conf = this.store.config;
        const loan = (conf.loans || []).find(l => l.id == id); // Use loose equality for ID matching
        if (!loan) return;

        if (confirm(`¿Mover "${loan.name || loan.title || 'Préstamo'}" a Gastos Fijos? Esto eliminará el saldo pendiente y lo tratará como un gasto recurrente.`)) {
            const newFixed = [...(conf.fixed_expenses || [])];
            newFixed.push({
                id: 'fix_' + Date.now(),
                name: loan.name || loan.title || 'Renting/Leasing',
                amount: loan.monthly_payment,
                day: 1,
                category_id: 'cat_10'
            });

            const newLoans = (conf.loans || []).filter(l => l.id != id);
            await this.store.updateConfig({
                fixed_expenses: newFixed,
                loans: newLoans
            });
            await this.render();
            alert(`✅ Movido a Gastos Fijos.`);
        }
    }

    showEditLoanModal(id) {
        const loan = (this.store.config.loans || []).find(l => l.id == id);
        if (!loan) return;

        const html = `
            <div style="display:flex; flex-direction:column; gap:12px; text-align:left;">
                <div>
                    <label style="display:block; font-size:0.8rem; font-weight:700; margin-bottom:4px;">Nombre del préstamo</label>
                    <input type="text" id="edit-loan-name" value="${loan.name}" style="width:100%; padding:10px; border-radius:8px; border:1px solid #ccc;">
                </div>
                <div style="display:flex; gap:10px;">
                    <div style="flex:1;">
                        <label style="display:block; font-size:0.8rem; font-weight:700; margin-bottom:4px;">Cuota Mensual</label>
                        <input type="text" id="edit-loan-payment" value="${this.formatNumberWithDots(loan.monthly_payment)}" style="width:100%; padding:10px; border-radius:8px; border:1px solid #ccc;" oninput="window.ui.formatCurrencyInput(this)">
                    </div>
                    <div style="width:80px;">
                        <label style="display:block; font-size:0.8rem; font-weight:700; margin-bottom:4px;">Día</label>
                        <input type="number" id="edit-loan-day" value="${loan.payment_day || ''}" min="1" max="31" style="width:100%; padding:10px; border-radius:8px; border:1px solid #ccc;">
                    </div>
                </div>
                <div>
                    <label style="display:block; font-size:0.8rem; font-weight:700; margin-bottom:4px;">Saldo Total Pendiente</label>
                    <input type="text" id="edit-loan-balance" value="${this.formatNumberWithDots(loan.total_balance || 0)}" style="width:100%; padding:10px; border-radius:8px; border:1px solid #ccc;" oninput="window.ui.formatCurrencyInput(this)">
                </div>
                <button onclick="window.ui.saveLoanEdit('${id}')" class="btn btn-primary" style="width:100%; margin-top:10px;">Guardar Cambios</button>
            </div>
        `;
        this.showModal(`Editar ${loan.name}`, html);
    }

    async saveLoanEdit(id) {
        const nameInput = document.getElementById('edit-loan-name');
        const paymentInput = document.getElementById('edit-loan-payment');
        const balanceInput = document.getElementById('edit-loan-balance');
        const dayInput = document.getElementById('edit-loan-day');

        const name = nameInput ? nameInput.value : '';
        const payment = parseFloat(paymentInput ? paymentInput.value.replace(/\D/g, '') : '0') || 0;
        const balance = parseFloat(balanceInput ? balanceInput.value.replace(/\D/g, '') : '0') || 0;
        const day = dayInput ? dayInput.value : '';

        const loans = [...(this.store.config.loans || [])];
        const idx = loans.findIndex(l => l.id == id);
        if (idx !== -1) {
            loans[idx] = { ...loans[idx], name, title: name, monthly_payment: payment, total_balance: balance, payment_day: day };
            await this.store.updateConfig({ loans });
            alert('✅ Préstamo actualizado');
            await this.render();
        }
    }

    showEditFixedExpenseModal(id) {
        const fe = (this.store.config.fixed_expenses || []).find(f => f.id === id);
        if (!fe) return;

        const categories = this.store.categories.filter(c => c.group !== 'INGRESOS');

        const html = `
            <div style="display:flex; flex-direction:column; gap:12px; text-align:left;">
                <div>
                    <label style="display:block; font-size:0.8rem; font-weight:700; margin-bottom:4px;">Nombre del gasto</label>
                    <input type="text" id="edit-fe-name" value="${fe.name || fe.title || ''}" style="width:100%; padding:10px; border-radius:8px; border:1px solid #ccc;">
                </div>
                <div style="display:flex; gap:10px;">
                    <div style="flex:1;">
                        <label style="display:block; font-size:0.8rem; font-weight:700; margin-bottom:4px;">Monto</label>
                        <input type="text" id="edit-fe-amt" value="${this.formatNumberWithDots(fe.amount)}" style="width:100%; padding:10px; border-radius:8px; border:1px solid #ccc;" oninput="window.ui.formatCurrencyInput(this)">
                    </div>
                    <div style="width:80px;">
                        <label style="display:block; font-size:0.8rem; font-weight:700; margin-bottom:4px;">Día</label>
                        <input type="number" id="edit-fe-day" value="${fe.day || 1}" min="1" max="31" style="width:100%; padding:10px; border-radius:8px; border:1px solid #ccc;">
                    </div>
                </div>
                <div>
                    <label style="display:block; font-size:0.8rem; font-weight:700; margin-bottom:4px;">Categoría</label>
                    <select id="edit-fe-cat" style="width:100%; padding:10px; border-radius:8px; border:1px solid #ccc;">
                        ${categories.map(c => `<option value="${c.id}" ${c.id === fe.category_id ? 'selected' : ''}>${c.name}</option>`).join('')}
                    </select>
                </div>
                <button onclick="window.ui.saveFixedExpenseEdit('${id}')" class="btn btn-primary" style="width:100%; margin-top:10px;">Guardar Cambios</button>
            </div>
        `;
        this.showModal(`Editar ${fe.name || fe.title || 'Gasto'}`, html);
    }

    async saveFixedExpenseEdit(id) {
        const name = document.getElementById('edit-fe-name').value;
        const amt = parseFloat(document.getElementById('edit-fe-amt').value.replace(/\D/g, '')) || 0;
        const day = document.getElementById('edit-fe-day').value;
        const cat = document.getElementById('edit-fe-cat').value;

        const fixed = [...(this.store.config.fixed_expenses || [])];
        const idx = fixed.findIndex(f => f.id == id);
        if (idx !== -1) {
            fixed[idx] = { ...fixed[idx], name, title: name, amount: amt, day, category_id: cat };
            await this.store.updateConfig({ fixed_expenses: fixed });
            alert('✅ Gasto fijo actualizado');
            await this.render();
        }
    }

    async handleFixedExpenseDelete(id) {
        if (!confirm('¿Eliminar este gasto fijo?')) return;
        const fixed = (this.store.config.fixed_expenses || []).filter(f => f.id !== id);
        await this.store.updateConfig({ fixed_expenses: fixed });
        this.render();
    }

    showEditRecurringIncomeModal(id) {
        const ri = (this.store.config.recurring_incomes || []).find(r => r.id === id);
        if (!ri) return;

        const categories = this.store.categories.filter(c => c.group === 'INGRESOS');

        const html = `
            <div style="display:flex; flex-direction:column; gap:12px; text-align:left;">
                <div>
                    <label style="display:block; font-size:0.8rem; font-weight:700; margin-bottom:4px;">Nombre del ingreso</label>
                    <input type="text" id="edit-ri-name" value="${ri.name}" style="width:100%; padding:10px; border-radius:8px; border:1px solid #ccc;">
                </div>
                <div style="display:flex; gap:10px;">
                    <div style="flex:1;">
                        <label style="display:block; font-size:0.8rem; font-weight:700; margin-bottom:4px;">Monto</label>
                        <input type="text" id="edit-ri-amt" value="${this.formatNumberWithDots(ri.amount)}" style="width:100%; padding:10px; border-radius:8px; border:1px solid #ccc;" oninput="window.ui.formatCurrencyInput(this)">
                    </div>
                    <div style="width:80px;">
                        <label style="display:block; font-size:0.8rem; font-weight:700; margin-bottom:4px;">Día</label>
                        <input type="number" id="edit-ri-day" value="${ri.day || 1}" min="1" max="31" style="width:100%; padding:10px; border-radius:8px; border:1px solid #ccc;">
                    </div>
                </div>
                <div>
                    <label style="display:block; font-size:0.8rem; font-weight:700; margin-bottom:4px;">Categoría</label>
                    <select id="edit-ri-cat" style="width:100%; padding:10px; border-radius:8px; border:1px solid #ccc;">
                        ${categories.map(c => `<option value="${c.id}" ${c.id === ri.category_id ? 'selected' : ''}>${c.name}</option>`).join('')}
                    </select>
                </div>
                <button onclick="window.ui.saveRecurringIncomeEdit('${id}')" class="btn btn-primary" style="width:100%; margin-top:10px;">Guardar Cambios</button>
            </div>
        `;
        this.showModal(`Editar ${ri.name}`, html);
    }

    async saveRecurringIncomeEdit(id) {
        const name = document.getElementById('edit-ri-name').value;
        const amt = parseFloat(document.getElementById('edit-ri-amt').value.replace(/\D/g, '')) || 0;
        const day = document.getElementById('edit-ri-day').value;
        const cat = document.getElementById('edit-ri-cat').value;

        const recurring = [...(this.store.config.recurring_incomes || [])];
        const idx = recurring.findIndex(r => r.id === id);
        if (idx !== -1) {
            recurring[idx] = { ...recurring[idx], name, amount: amt, day, category_id: cat };
            await this.store.updateConfig({ recurring_incomes: recurring });
            alert('✅ Ingreso recurrente actualizado');
            this.render();
        }
    }

    async handleRecurringIncomeDelete(id) {
        if (!confirm('¿Eliminar este ingreso recurrente?')) return;
        const recurring = (this.store.config.recurring_incomes || []).filter(r => r.id !== id);
        await this.store.updateConfig({ recurring_incomes: recurring });
        this.render();
    }

    async handleTinyLoanAdd() {
        const name = document.getElementById('loan-name').value;
        const paymentStr = document.getElementById('loan-payment').value.replace(/\D/g, '');
        const payment = parseFloat(paymentStr) || 0;
        const day = document.getElementById('loan-day').value;
        const balanceStr = document.getElementById('loan-balance').value.replace(/\D/g, '');
        const balance = parseFloat(balanceStr) || 0;

        if (!name || payment <= 0) {
            alert("El nombre y la cuota mensual son obligatorios.");
            return;
        }

        const loans = this.store.config.loans || [];
        loans.push({
            id: 'loan_' + Date.now(),
            name,
            monthly_payment: payment,
            payment_day: day,
            total_balance: balance,
            created_at: new Date().toISOString()
        });

        await this.store.updateConfig({ loans });
        this.render();
    }

    async handleLoanDelete(id) {
        if (!confirm("¿Eliminar este préstamo? Esto devolverá el cupo a tu presupuesto disponible.")) return;
        const loansList = (this.store.config.loans || []).filter(l => l.id !== id);
        await this.store.updateConfig({ loans: loansList });
        this.render();
    }

    showNewMonthModal(templateData, y, m) {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'new-month-modal';
        modal.style.zIndex = '100000';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 400px; text-align: center; padding: 30px;">
                <h2 style="margin-bottom: 15px; font-size: 1.5rem;">✨ Nuevo mes: ${this.monthNames[m]} ${y}</h2>
                <p style="margin-bottom: 25px; color: var(--text-secondary);">
                    ¿Quieres mantener tu ingreso y tus préstamos igual que el mes pasado?
                </p>
                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <button class="btn btn-primary" id="confirm-same-btn" style="width: 100%; padding: 12px; font-weight: 700;">✅ Mantener igual</button>
                    <button class="btn" id="adjust-values-btn" style="width: 100%; border: 1px solid var(--border-color); padding: 12px;">✏️ Ajustar valores</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.classList.remove('hidden');

        document.getElementById('confirm-same-btn').onclick = async () => {
            await this.store.saveMonthPlan(y, m, templateData);
            modal.remove();
            await this.render();
        };

        document.getElementById('adjust-values-btn').onclick = () => {
            modal.remove();
            this.showMonthlyAdjustmentModal(templateData, y, m);
        };
    }

    showMonthlyAdjustmentModal(templateData, y, m) {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'adjust-month-modal';
        modal.style.zIndex = '100001';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px; padding: 25px;">
                <h3 style="margin-bottom: 20px;">Ajustar para ${this.monthNames[m]}</h3>
                
                <div class="form-group" style="margin-bottom: 20px;">
                    <label style="font-weight: 700; display: block; margin-bottom: 8px;">Tu ingreso para este mes</label>
                    <div style="display: flex; align-items: center; gap: 10px; background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 5px 12px;">
                        <span style="font-weight: 700; color: #64748b;">$</span>
                        <input type="text" id="adj-income" value="${this.formatNumberWithDots(templateData.monthly_income_target)}" 
                               style="width: 100%; font-size: 1.2rem; font-weight: 800; border: none; outline: none;"
                               oninput="window.ui.formatCurrencyInput(this)">
                    </div>
                </div>

                <div style="margin-bottom: 15px;">
                    <label style="font-weight: 700; display: block; margin-bottom: 8px;">Cuotas de Préstamos</label>
                    <div id="adj-loans-list" style="display: flex; flex-direction: column; gap: 10px; max-height: 200px; overflow-y: auto; padding-right: 5px;">
                        ${templateData.loans.length > 0 ? templateData.loans.map((loan, index) => `
                            <div style="display: flex; justify-content: space-between; align-items: center; background: #f8f9fa; padding: 12px; border-radius: 10px; border: 1px solid #eee;">
                                <div style="font-weight: 600; font-size: 0.9rem;">${loan.name}</div>
                                <div style="display: flex; align-items: center; gap: 5px;">
                                    <span style="color: #64748b; font-size: 0.8rem;">$</span>
                                    <input type="text" class="adj-loan-payment" data-index="${index}" value="${this.formatNumberWithDots(loan.monthly_payment)}" 
                                           style="width: 100px; text-align: right; border-radius: 6px; border: 1px solid #ccc; padding: 5px; font-weight: 700;"
                                           oninput="window.ui.formatCurrencyInput(this)">
                                </div>
                            </div>
                        `).join('') : '<p style="font-size: 0.85rem; color: #64748b; text-align: center;">No tienes préstamos activos.</p>'}
                    </div>
                </div>

                <p style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 20px; background: #f0f9ff; padding: 10px; border-radius: 8px; border-left: 4px solid #3b82f6;">
                    💡 Estos cambios solo afectan a <strong>${this.monthNames[m]}</strong> y servirán de modelo para el mes siguiente.
                </p>

                <div style="display: flex; gap: 10px;">
                    <button class="btn btn-primary" id="save-adj-btn" style="flex: 1; padding: 12px;">Guardar Cambios</button>
                    <button class="btn" id="cancel-adj-btn" style="flex: 0.5; padding: 12px; border: 1px solid #ddd;">Cancelar</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.classList.remove('hidden');

        document.getElementById('cancel-adj-btn').onclick = () => modal.remove();

        document.getElementById('save-adj-btn').onclick = async () => {
            const newIncome = parseFloat(document.getElementById('adj-income').value.replace(/\D/g, '')) || 0;
            const newLoans = JSON.parse(JSON.stringify(templateData.loans));
            const loanInputs = document.querySelectorAll('.adj-loan-payment');
            loanInputs.forEach(input => {
                const idx = parseInt(input.dataset.index);
                newLoans[idx].monthly_payment = parseFloat(input.value.replace(/\D/g, '')) || 0;
            });

            const finalData = {
                monthly_income_target: newIncome,
                loans: newLoans
            };

            await this.store.saveMonthPlan(y, m, finalData);
            modal.remove();
            await this.render();
        };
    }
}
