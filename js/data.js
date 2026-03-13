const STORAGE_KEY = 'clarity_cash_data_v2';
const DEFAULT_DATA = {
    config: {
        currency: 'COP',
        user_name: 'Mi Espacio',
        monthly_income_target: 0,
        savings_goal_type: 'PERCENT',
        savings_goal_value: 20,
        spending_profile: 'BALANCEADO',
        has_debts: false,
        total_debt: 0,
        budgets: {},
        fixed_expenses: [],
        loans: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        migrationCompleted: false, // Marker for Firebase migration
        subscription: {
            plan: "trial",
            trialStart: new Date().toISOString(),
            trialEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            status: "active"
        }
    },
    goals: [],
    accounts: [
        { id: 'acc_1', name: 'Efectivo', type: 'EFECTIVO', initial_balance: 0, current_balance: 0, created_at: new Date().toISOString() },
        { id: 'acc_2', name: 'Débito', type: 'BANCO', initial_balance: 0, current_balance: 0, created_at: new Date().toISOString() },
        { id: 'acc_tc_1', name: 'Tarjeta de crédito', type: 'CREDITO', initial_balance: 0, current_balance: 0, created_at: new Date().toISOString() }
    ],
    categories: [
        { id: 'cat_inc_1', name: 'Salario / Nómina', group: 'INGRESOS', is_default: true },
        { id: 'cat_inc_2', name: 'Honorarios', group: 'INGRESOS', is_default: true },
        { id: 'cat_inc_3', name: 'Otros Ingresos', group: 'INGRESOS', is_default: true },
        { id: 'cat_2', name: 'Alimentación', group: 'NECESIDADES', is_default: true },
        { id: 'cat_3', name: 'Transporte', group: 'NECESIDADES', is_default: true },
        { id: 'cat_gasolina', name: 'Gasolina', group: 'NECESIDADES', is_default: true },
        { id: 'cat_4', name: 'Salud', group: 'NECESIDADES', is_default: true },
        { id: 'cat_1', name: 'Alquiler / Hipoteca', group: 'VIVIENDA', is_default: true },
        { id: 'cat_viv_servicios', name: 'Servicios Públicos', group: 'VIVIENDA', is_default: true },
        { id: 'cat_viv_gas', name: 'Gas Natural', group: 'VIVIENDA', is_default: true },
        { id: 'cat_viv_net', name: 'Internet / TV', group: 'VIVIENDA', is_default: true },
        { id: 'cat_viv_cel', name: 'Plan Celular', group: 'VIVIENDA', is_default: true },
        { id: 'cat_viv_man', name: 'Mantenimiento / Admón', group: 'VIVIENDA', is_default: true },
        { id: 'cat_5', name: 'Ahorro', group: 'FINANCIERO', is_default: true },
        { id: 'cat_6', name: 'Inversión', group: 'FINANCIERO', is_default: true },
        { id: 'cat_7', name: 'Deuda/Créditos', group: 'FINANCIERO', is_default: true },
        { id: 'cat_fin_4', name: 'Tarjeta de Crédito', group: 'FINANCIERO', is_default: true },
        { id: 'cat_fin_5', name: 'Renting / Leasing', group: 'FINANCIERO', is_default: true },
        { id: 'cat_fin_int', name: 'Intereses Financieros', group: 'FINANCIERO', is_default: true },
        { id: 'cat_8', name: 'Educación', group: 'CRECIMIENTO', is_default: true },
        { id: 'cat_9', name: 'Ocio', group: 'ESTILO_DE_VIDA', is_default: true },
        { id: 'cat_subs', name: 'Suscripciones Digitales', group: 'ESTILO_DE_VIDA', is_default: true },
        { id: 'cat_rest', name: 'Restaurantes / Domicilios', group: 'ESTILO_DE_VIDA', is_default: true },
        { id: 'cat_personal', name: 'Ropa / Cuidado Personal', group: 'ESTILO_DE_VIDA', is_default: true },
        { id: 'cat_deporte', name: 'Deporte / Gym', group: 'ESTILO_DE_VIDA', is_default: true },
        { id: 'cat_vicios', name: 'Alcohol / Tabaco', group: 'ESTILO_DE_VIDA', is_default: true },
        { id: 'cat_ant', name: 'Café / Snacks', group: 'OTROS', is_default: true },
        { id: 'cat_10', name: 'Otros/Imprevistos', group: 'OTROS', is_default: true }
    ],
    transactions: []
};

class Store {
    constructor() {
        this.uid = null;
        this.data = JSON.parse(JSON.stringify(DEFAULT_DATA));
        this.data.config.fixed_expenses = this.data.config.fixed_expenses || [];
        this.unsubscribe = null;
        this.initialized = false;
    }

    /**
     * Inicialización del Store para un usuario específico (Firestore)
     * @param {string} uid 
     */
    async init(uid) {
        if (!uid) {
            console.log("Store: No UID, using temporary defaults.");
            return this.data;
        }

        this.uid = uid;
        console.log(`📡 Store: Sincronizando datos para ${uid}...`);

        try {
            // 1. Obtener Configuración
            const configDoc = await db.collection('users').doc(uid).get();

            if (!configDoc.exists) {
                // Usuario nuevo o necesita migración de LocalStorage
                await this._checkAndPerformMigration();
            } else {
                const firestoreConfig = configDoc.data() || {};
                
                // --- ARQUITECTURA DE DATOS: MIGRACIÓN AUTOMÁTICA v78.0 ---
                // Detectar si el usuario tiene datos "atrapados" en el objeto antiguo fixed_expenses
                // En versiones viejas, por un bug, monthly_income_target y otros campos se metieron dentro de fixed_expenses
                if (firestoreConfig.fixed_expenses && typeof firestoreConfig.fixed_expenses === 'object' && !Array.isArray(firestoreConfig.fixed_expenses)) {
                    console.warn("⚠️ Store: Detectada estructura de datos antigua. Migrando a raíz...");
                    const legacy = firestoreConfig.fixed_expenses;
                    
                    // Solo migramos si los valores en la raíz están en 0/vacíos y los de legacy tienen datos
                    if ((!firestoreConfig.monthly_income_target || firestoreConfig.monthly_income_target === 0) && legacy.monthly_income_target) {
                        firestoreConfig.monthly_income_target = legacy.monthly_income_target;
                        firestoreConfig.spending_profile = legacy.spending_profile || firestoreConfig.spending_profile || 'BALANCEADO';
                        firestoreConfig.has_debts = legacy.has_debts !== undefined ? legacy.has_debts : firestoreConfig.has_debts;
                        
                        // Si tiene presupuestos, asumimos que están personalizados
                        if (firestoreConfig.budgets && Object.keys(firestoreConfig.budgets).length > 0) {
                            firestoreConfig.budget_user_customized = true;
                        }
                        
                        console.log("✅ Store: Migración de campos exitosa.");
                        // Programar una limpieza de la nube para borrar el objeto fixed_expenses corrupto
                        this._needsLegacyCleanup = true;
                    }
                }

                this.data.config = { ...DEFAULT_DATA.config, ...firestoreConfig };

                // Si se realizó migración o falta el flag, saneamos
                if (this._needsLegacyCleanup || !firestoreConfig.migrationCompleted) {
                    console.log("📡 Store: Saneando documento de usuario en nube...");
                    await this._saveConfig(this.data.config, { explicitBudgetSave: true });
                    this.data.config.migrationCompleted = true;
                    this._needsLegacyCleanup = false;
                }

                // Asegurar que exista el objeto subscription
                if (!this.data.config.subscription) {
                    this.data.config.subscription = {
                        plan: "trial",
                        trialStart: this.data.config.created_at || new Date().toISOString(),
                        trialEnd: new Date(new Date(this.data.config.created_at || Date.now()).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                        status: "active"
                    };
                    await this._saveConfig(this.data.config);
                }
            }

            // 2. Cargar Colecciones (One-time fetch for initial load)
            await this._loadCollections();

            this.initialized = true;
            console.log("✅ Store: Datos sincronizados.");
            return this.data;
        } catch (error) {
            console.error("Store Init Errors:", error);
            throw error;
        }
    }

    async _loadCollections() {
        const uid = this.uid;

        // Carga paralela de colecciones
        const [accs, cats, txts, goals] = await Promise.all([
            db.collection('users').doc(uid).collection('accounts').get(),
            db.collection('users').doc(uid).collection('categories').get(),
            db.collection('users').doc(uid).collection('transactions').get(),
            db.collection('users').doc(uid).collection('goals').get()
        ]);

        this.data.accounts = accs.empty ? DEFAULT_DATA.accounts : accs.docs.map(doc => doc.data());
        
        // --- RESTORATION GUARD ---
        // Ensure essential accounts always exist (Cash, Debit, Credit)
        const essentialIds = ['acc_1', 'acc_2', 'acc_tc_1'];
        essentialIds.forEach(id => {
            if (!this.data.accounts.find(a => a.id === id)) {
                console.log(`📡 Store: Restaurando cuenta esencial faltante: ${id}`);
                const def = DEFAULT_DATA.accounts.find(d => d.id === id);
                if (def) {
                    const restoredAcc = { ...def, created_at: new Date().toISOString() };
                    this.data.accounts.push(restoredAcc);
                    if (this.uid) {
                        db.collection('users').doc(this.uid).collection('accounts').doc(id).set(restoredAcc);
                    }
                }
            }
        });

        this.data.categories = cats.empty ? DEFAULT_DATA.categories : cats.docs.map(doc => doc.data());
        this.data.transactions = txts.docs.map(doc => doc.data());
        this.data.goals = goals.docs.map(doc => doc.data());
    }

    /**
     * MIGRACIÓN: De LocalStorage a Firestore
     */
    async _checkAndPerformMigration() {
        // Doble verificación: si ya se migró, evitar ejecutar de nuevo.
        const configDoc = await db.collection('users').doc(this.uid).get();
        if (configDoc.exists && configDoc.data() && configDoc.data().migrationCompleted) {
            console.log("Migration: Ya fue completada previamente.");
            this.data.config = { ...DEFAULT_DATA.config, ...configDoc.data() };
            return;
        }

        const localRaw = localStorage.getItem('clarity_cash_data_v2');
        if (!localRaw) {
            console.log("Migration: No local data to migrate.");
            
            // Check if user already had SOMETHING in firestore (configDoc comes from previous get in init or we do a new one)
            const configDoc = await db.collection('users').doc(this.uid).get();
            if (configDoc.exists) {
                console.log("Migration: Firestore data exists, just marking as migrated.");
                await db.collection('users').doc(this.uid).set({ migrationCompleted: true }, { merge: true });
                this.data.config = { ...DEFAULT_DATA.config, ...configDoc.data(), migrationCompleted: true };
                return;
            }

            console.log("Migration: Creating defaults for fresh cloud user.");
            const defaultConfig = { ...DEFAULT_DATA.config, migrationCompleted: true };
            await this._saveConfig(defaultConfig);
            return;
        }

        try {
            const localData = JSON.parse(localRaw);
            console.log("🚛 Migration: Moving localStorage data to Firestore via Batches...");

            // Config will be added at the end
            const newConfig = { ...localData.config, migrationCompleted: true, updated_at: new Date().toISOString() };

            const operations = [];

            if (localData.accounts) {
                localData.accounts.forEach(a => operations.push({
                    ref: db.collection('users').doc(this.uid).collection('accounts').doc(a.id || Date.now().toString() + Math.random().toString(36).substr(2, 5)),
                    data: a
                }));
            }
            if (localData.categories) {
                localData.categories.forEach(c => operations.push({
                    ref: db.collection('users').doc(this.uid).collection('categories').doc(c.id || Date.now().toString() + Math.random().toString(36).substr(2, 5)),
                    data: c
                }));
            }
            if (localData.goals) {
                localData.goals.forEach(g => operations.push({
                    ref: db.collection('users').doc(this.uid).collection('goals').doc(g.id || Date.now().toString() + Math.random().toString(36).substr(2, 5)),
                    data: g
                }));
            }
            if (localData.transactions) {
                localData.transactions.forEach(t => operations.push({
                    ref: db.collection('users').doc(this.uid).collection('transactions').doc(t.id || Date.now().toString() + Math.random().toString(36).substr(2, 5)),
                    data: t
                }));
            }

            // Agregamos el documento de configuración al final para que solo se marque completado si todas las operaciones fueron registradas
            operations.push({
                ref: db.collection('users').doc(this.uid),
                data: newConfig
            });

            // Procesamos las operaciones en lotes de 500 (límite de Firestore)
            const BATCH_SIZE = 500;
            for (let i = 0; i < operations.length; i += BATCH_SIZE) {
                const batch = db.batch();
                const chunk = operations.slice(i, i + BATCH_SIZE);
                chunk.forEach(op => batch.set(op.ref, op.data, { merge: true }));
                await batch.commit();
            }

            console.log("✅ Migration: Complete. Cleaning localStorage.");
            localStorage.setItem('cc_migrated_backup', localRaw); // Backup por si acaso
            localStorage.removeItem('clarity_cash_data_v2');

            // Actualizamos los datos locales solo si no hubo error
            this.data = localData;
            this.data.config.migrationCompleted = true;

        } catch (e) {
            console.error("Migration Failed:", e);
        }
    }

    // --- MÉTODOS DE ESCRITURA (Async y Sync con Cloud) ---

    async _saveConfig(config, options = {}) {
        if (!this.uid) return;

        // LAYER 2 — Budget wipe protection at save level
        // If the config being saved has empty budgets, but the CURRENT in-memory config
        // already has real budget values, we NEVER silently overwrite with empty.
        // EXCEPTION: if explicitBudgetSave is true, the user explicitly clicked "Guardar Cambios"
        // and we must respect their decision (even if budgets is empty = they cleared everything).
        const existingBudgets = this.data.config ? this.data.config.budgets : null;
        if (
            !options.explicitBudgetSave &&
            existingBudgets &&
            Object.keys(existingBudgets).length > 0 &&
            (!config.budgets || Object.keys(config.budgets).length === 0)
        ) {
            console.warn('🛡️ Store _saveConfig: Budget wipe blocked. Restoring existing budgets before saving.');
            config = { ...config, budgets: existingBudgets };
        }

        this.data.config = config;
        this.data.config.updated_at = new Date().toISOString();

        const docRef = db.collection('users').doc(this.uid);

        // CRITICAL FIX: When budgets are being explicitly saved by the user,
        // we must FULLY REPLACE the budgets field in Firestore.
        // Using set({ merge: true }) alone NEVER deletes sub-fields that the user removed.
        // Solution: First delete the old budgets field, then write the complete new config.
        if (options.explicitBudgetSave) {
            console.log('🔒 Store _saveConfig: Explicit budget save — fully replacing budgets field in Firestore.');
            try {
                // Step 1: Delete old fields completely.
                // We also check for 'fixed_expenses' because some users have corrupted legacy data 
                // where config properties got trapped inside that field as a Map instead of an Array.
                const fieldsToDelete = {
                    budgets: firebase.firestore.FieldValue.delete(),
                    category_names: firebase.firestore.FieldValue.delete()
                };

                if (config.fixed_expenses && typeof config.fixed_expenses === 'object' && !Array.isArray(config.fixed_expenses)) {
                    console.warn("🧹 Store _saveConfig: Eliminando objeto corrupto legacy 'fixed_expenses' de Firestore.");
                    fieldsToDelete.fixed_expenses = firebase.firestore.FieldValue.delete();
                    // Importante: No queremos re-escribir este objeto corrupto en el set(...) posterior.
                    delete config.fixed_expenses; 
                }

                await docRef.update(fieldsToDelete);
            } catch (e) {
                // Document might not exist yet or fields might not exist — that's fine
                console.log('(Budget field cleanup skipped — field may not exist yet)');
            }
            // Step 2: Write the full config with the new budgets object
            await docRef.set(this.data.config);
        } else {
            await docRef.set(this.data.config, { merge: true });
        }

        window.dispatchEvent(new CustomEvent('c_store_updated'));
    }

    async addTransaction(txData) {
        const id = Date.now().toString() + Math.random().toString(36).substr(2, 5);
        const newTx = {
            ...txData,
            id,
            amount: parseFloat(txData.amount),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        // Logic sync
        this.data.transactions.push(newTx);
        this._updateAccountBalanceLocal(newTx.account_id, newTx.amount, newTx.type);

        // Cloud Sync
        if (this.uid) {
            const batch = db.batch();
            const txRef = db.collection('users').doc(this.uid).collection('transactions').doc(id);
            batch.set(txRef, newTx);

            // Actualizar balance de cuenta en Cloud
            const acc = this.data.accounts.find(a => a.id === newTx.account_id);
            if (acc) {
                const accRef = db.collection('users').doc(this.uid).collection('accounts').doc(acc.id);
                batch.set(accRef, acc, { merge: true });
            }
            await batch.commit();
        }

        window.dispatchEvent(new CustomEvent('c_store_updated'));
        return newTx;
    }

    async updateTransaction(id, updates) {
        const index = this.data.transactions.findIndex(t => t.id === id);
        if (index === -1) return;

        const oldTx = this.data.transactions[index];
        // Revert balance impact
        this._updateAccountBalanceLocal(oldTx.account_id, oldTx.amount, oldTx.type === 'INGRESO' ? 'GASTO' : 'INGRESO');

        const mergedTx = { ...oldTx, ...updates, updated_at: new Date().toISOString() };
        this.data.transactions[index] = mergedTx;

        // Apply new balance impact
        this._updateAccountBalanceLocal(mergedTx.account_id, mergedTx.amount, mergedTx.type);

        if (this.uid) {
            const batch = db.batch();
            batch.set(db.collection('users').doc(this.uid).collection('transactions').doc(id), mergedTx);

            const acc = this.data.accounts.find(a => a.id === mergedTx.account_id);
            if (acc) {
                batch.set(db.collection('users').doc(this.uid).collection('accounts').doc(acc.id), acc, { merge: true });
            }
            await batch.commit();
        }

        window.dispatchEvent(new CustomEvent('c_store_updated'));
    }

    async deleteTransaction(id) {
        const index = this.data.transactions.findIndex(t => t.id === id);
        if (index === -1) return;
        const tx = this.data.transactions[index];

        this._updateAccountBalanceLocal(tx.account_id, tx.amount, tx.type === 'INGRESO' ? 'GASTO' : 'INGRESO');
        this.data.transactions.splice(index, 1);

        if (this.uid) {
            const batch = db.batch();
            batch.delete(db.collection('users').doc(this.uid).collection('transactions').doc(id));
            const acc = this.data.accounts.find(a => a.id === tx.account_id);
            if (acc) {
                batch.set(db.collection('users').doc(this.uid).collection('accounts').doc(acc.id), acc, { merge: true });
            }
            await batch.commit();
        }
        window.dispatchEvent(new CustomEvent('c_store_updated'));
    }

    async addFixedExpense(fe) {
        const id = 'fix_' + Date.now();
        const newFE = { ...fe, id };
        if (!this.data.config.fixed_expenses) this.data.config.fixed_expenses = [];
        this.data.config.fixed_expenses.push(newFE);
        await this.updateConfig({ fixed_expenses: this.data.config.fixed_expenses });
        return newFE;
    }

    async addRecurringIncome(ri) {
        const id = 'ri_' + Date.now();
        const newRI = { ...ri, id };
        if (!this.data.config.recurring_incomes) this.data.config.recurring_incomes = [];
        this.data.config.recurring_incomes.push(newRI);
        await this.updateConfig({ recurring_incomes: this.data.config.recurring_incomes });
        return newRI;
    }

    // --- Helpers Balance ---
    _updateAccountBalanceLocal(accountId, amount, type) {
        const account = this.data.accounts.find(a => a.id === accountId);
        if (!account) return;

        if (type === 'PAGO_TARJETA') {
            // Este tipo se usa cuando el dinero ENTRA a la tarjeta desde otra cuenta
            if (account.type === 'CREDITO') {
                account.current_balance -= amount; // Disminuye saldo de tarjeta (deuda)
            } else {
                account.current_balance -= amount; // Sale de la cuenta de origen (Efectivo/Debito)
            }
            return;
        }

        if (account.type === 'CREDITO') {
            // Para Crédito: Un gasto AUMENTA el saldo de tarjeta (uso de línea). Un ingreso DISMINUYE el saldo.
            if (type === 'INGRESO') account.current_balance -= amount;
            else account.current_balance += amount;
        } else {
            // Para Efectivo/Débito: Un ingreso AUMENTA el saldo. Un gasto DISMINUYE el saldo.
            if (type === 'INGRESO') account.current_balance += amount;
            else account.current_balance -= amount;
        }
    }

    // --- Getters (Siguen siendo síncronos sobre la caché local para no romper la UI) ---
    get transactions() { return this.data.transactions; }
    get accounts() { return this.data.accounts; }
    get categories() { return this.data.categories; }
    get config() { return this.data.config; }
    get goals() { return this.data.goals; }

    // --- Otros métodos adaptados ---
    async updateConfig(newConfig, options = {}) {
        // Guard: Prevent overwriting data with defaults during race conditions at startup
        if (this.uid && !this.initialized) {
            console.warn('🛡️ Store updateConfig: BLOCKED — store not initialized yet. Aborting to prevent budget wipe.');
            return;
        }

        // LAYER 1 — Budget wipe protection at update level
        // If the caller is trying to set budgets to empty {} but we already have
        // real budget values in memory, strip the budgets key from the update.
        // EXCEPTION: if explicitBudgetSave, the user explicitly saved — we respect their choice.
        if (
            !options.explicitBudgetSave &&
            newConfig.budgets !== undefined &&
            Object.keys(newConfig.budgets).length === 0 &&
            this.data.config.budgets &&
            Object.keys(this.data.config.budgets).length > 0
        ) {
            console.warn('🛡️ Store updateConfig: Budget wipe attempt with empty object blocked. Existing budgets preserved.');
            const safeConfig = { ...newConfig };
            delete safeConfig.budgets; // Remove from update — Layer 2 will also catch it if it slips through
            const config = { ...this.data.config, ...safeConfig };
            await this._saveConfig(config);
            // PROPAGAR A MES ACTUAL
            try {
                const now = new Date();
                const y = now.getFullYear();
                const m = now.getMonth();
                let currentPlan = await this.getSavedMonthPlan(y, m);
                if (currentPlan) {
                    let changed = false;
                    if (newConfig.monthly_income_target !== undefined) {
                        currentPlan.monthly_income_target = newConfig.monthly_income_target;
                        changed = true;
                    }
                    if (newConfig.loans !== undefined) {
                        currentPlan.loans = newConfig.loans;
                        changed = true;
                    }
                    if (changed) await this.saveMonthPlan(y, m, currentPlan);
                }
            } catch (e) { console.warn('Sync Plan Error:', e); }
            return;
        }

        const config = { ...this.data.config, ...newConfig };
        await this._saveConfig(config, options);

        // PROPAGAR A MES ACTUAL: si edita préstamos/ingreso desde ajustes, el Dashboard debe actualizarse.
        try {
            const now = new Date();
            const y = now.getFullYear();
            const m = now.getMonth();
            let currentPlan = await this.getSavedMonthPlan(y, m);
            if (currentPlan) {
                let changed = false;
                if (newConfig.monthly_income_target !== undefined) {
                    currentPlan.monthly_income_target = newConfig.monthly_income_target;
                    changed = true;
                }
                if (newConfig.loans !== undefined) {
                    currentPlan.loans = newConfig.loans;
                    changed = true;
                }
                if (changed) {
                    await this.saveMonthPlan(y, m, currentPlan);
                }
            }
        } catch (e) { console.warn("Sync Plan Error:", e); }
    }

    async addAccount(account) {
        const id = 'acc_' + Date.now().toString();
        const newAcc = {
            ...account,
            id,
            current_balance: parseFloat(account.initial_balance),
            created_at: new Date().toISOString()
        };
        this.data.accounts.push(newAcc);
        if (this.uid) await db.collection('users').doc(this.uid).collection('accounts').doc(id).set(newAcc);
        window.dispatchEvent(new CustomEvent('c_store_updated'));
        return newAcc;
    }

    async addGoal(goal) {
        const id = Date.now().toString();
        const newGoal = { ...goal, id, created_at: new Date().toISOString(), status: 'ACTIVE' };
        this.data.goals.push(newGoal);
        if (this.uid) await db.collection('users').doc(this.uid).collection('goals').doc(id).set(newGoal);
        window.dispatchEvent(new CustomEvent('c_store_updated'));
        return newGoal;
    }

    async updateGoal(id, updates) {
        const idx = this.data.goals.findIndex(g => g.id === id);
        if (idx === -1) return;
        this.data.goals[idx] = { ...this.data.goals[idx], ...updates };
        if (this.uid) await db.collection('users').doc(this.uid).collection('goals').doc(id).set(this.data.goals[idx]);
        window.dispatchEvent(new CustomEvent('c_store_updated'));
    }

    // (Otros métodos como getFinancialSummary se mantienen igual ya que leen de this.data.transactions)
    getFinancialSummary(month, year) {
        const m = month !== undefined ? month : new Date().getMonth();
        const y = year !== undefined ? year : new Date().getFullYear();
        const monthlyTx = this.data.transactions.filter(t => {
            const parts = t.date.split('-');
            return parseInt(parts[0]) === y && (parseInt(parts[1]) - 1) === m;
        });
        const s = { income: 0, expenses: 0, savings: 0, investment: 0, debt_payment: 0, balance_net: 0 };
        monthlyTx.forEach(t => {
            const type = (t.type || '').toUpperCase();
            if (type === 'INGRESO') s.income += t.amount;
            else if (type === 'GASTO') s.expenses += t.amount;
            else if (type === 'AHORRO') s.savings += t.amount;
            else if (type === 'INVERSION') s.investment += t.amount;
            else if (type === 'PAGO_DEUDA' || type === 'PAGO_TARJETA') s.debt_payment += t.amount;
        });

        // --- 💵 MODELO DE INGRESOS CORRECTO ---
        // REGLA: El ingreso total del mes = Base Configurada + Ingresos Adicionales Manuales
        //
        // 1. BASE AUTOMÁTICA = monthly_income_target (configurado en Centro Financiero)
        //    Esta base existe SIEMPRE, sin necesidad de registrar ninguna transacción.
        //
        // 2. INGRESOS ADICIONALES = transacciones de tipo 'INGRESO' registradas manualmente
        //    Estas son ingresos EXTRA (honorarios, bonos, ventas, etc.) y se suman encima.
        //
        // IMPORTANTE: Los 'recurring_incomes' son fuentes configuradas (como el salario) que
        //    YA están contabilizadas como parte del monthly_income_target. No se vuelven a sumar
        //    para evitar doble conteo. Si el usuario quiere fuentes extra, debe sumarlas.

        const confIncome = parseFloat((this.data.config.monthly_income_target || '0').toString().replace(/\D/g, '')) || 0;
        
        // Las transacciones INGRESO son extras manuales: se suman a la base
        // (ya estaban en s.income desde el loop de monthlyTx arriba)
        s.income = confIncome + s.income;

        s.balance_net = s.income - (s.expenses + s.savings + s.investment + s.debt_payment);
        return s;
    }

    getCategoryBreakdown(month, year) {
        const m = month !== undefined ? month : new Date().getMonth();
        const y = year !== undefined ? year : new Date().getFullYear();
        const monthlyTx = this.data.transactions.filter(t => {
            const parts = t.date.split('-');
            return parseInt(parts[0]) === y && (parseInt(parts[1]) - 1) === m && (t.type === 'GASTO' || t.type === 'PAGO_DEUDA');
        });
        const breakdown = {};
        monthlyTx.forEach(t => {
            const cat = this.data.categories.find(c => c.id === t.category_id);
            const name = cat ? cat.name : 'Otro';
            breakdown[name] = (breakdown[name] || 0) + t.amount;
        });
        return breakdown;
    }

    getGoals() {
        // Logic similar to old data.js but reading from this.data.goals and this.data.transactions
        return this.data.goals.map(g => {
            const txs = this.data.transactions.filter(t => t.goal_id === g.id);
            const current = txs.reduce((sum, t) => sum + t.amount, 0);
            return { ...g, current_amount: current };
        });
    }

    // Helper for Strategy Report tracking (remains local for session, but could be cloudified)
    trackWeeklyEvent(type, data) {
        // ... similar logic as before
    }

    async processFixedExpenses(month, year) {
        if (!this.data.config.fixed_expenses) this.data.config.fixed_expenses = [];
        const fixed = this.data.config.fixed_expenses;

        const now = new Date();
        const isCurrentOrPast = (year < now.getFullYear()) || (year === now.getFullYear() && month <= now.getMonth());
        if (!isCurrentOrPast) return;

        for (let fe of fixed) {
            const exists = this.data.transactions.find(t =>
                t.is_auto_fixed && t.category_id === fe.category_id &&
                (t.fixed_id === fe.id || t.description.includes(fe.name || 'Fijo')) &&
                (() => {
                    if (!t.date) return false;
                    const parts = t.date.split('-');
                    return parseInt(parts[0]) === year && (parseInt(parts[1]) - 1) === month;
                })()
            );

            // AUTO-CLEAN DUPLICATES: If by the previous timezone bug multiple duplicates were spawned, safely delete the extras
            const allTxsForFe = this.data.transactions.filter(t =>
                t.is_auto_fixed && t.category_id === fe.category_id &&
                (t.fixed_id === fe.id || t.description.includes(fe.name || 'Fijo')) &&
                t.date && parseInt(t.date.split('-')[0]) === year && (parseInt(t.date.split('-')[1]) - 1) === month
            );
            if (allTxsForFe.length > 1) {
                const toDelete = allTxsForFe.slice(1);
                for (let dup of toDelete) {
                    await this.deleteTransaction(dup.id);
                }
            }

            if (!exists) {
                const accountId = this.data.accounts && this.data.accounts.length > 0 ? this.data.accounts[0].id : 'acc_1';
                let txDate = new Date(year, month, 1).toISOString().split('T')[0];
                if (year === now.getFullYear() && month === now.getMonth()) {
                    txDate = now.toISOString().split('T')[0];
                }

                await this.addTransaction({
                    type: 'GASTO',
                    amount: fe.amount,
                    date: txDate,
                    category_id: fe.category_id,
                    description: (fe.name || 'Compromiso Fijo') + ' (Automático)',
                    account_id: accountId,
                    is_auto_fixed: true,
                    fixed_id: fe.id
                });
            } else if (exists && exists.amount !== fe.amount) {
                await this.updateTransaction(exists.id, { amount: fe.amount });
            }
        }
    }

    getHistorySummary(monthsCount = 6) {
        const history = [];
        const now = new Date();
        const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

        for (let i = 0; i < monthsCount; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const m = d.getMonth();
            const y = d.getFullYear();

            const summary = this.getFinancialSummary(m, y);

            history.unshift({
                month: m,
                year: y,
                label: monthNames[m],
                income: summary.income,
                expenses: summary.expenses,
                balance: summary.balance_net,
                savings: summary.savings
            });
        }
        return history;
    }

    // --- Persistencia del Plan del Mes (CFO) ---
    async saveMonthPlan(year, month, planData) {
        const planId = `${year}-${month + 1}`;
        if (!this.data.plans) this.data.plans = {};
        this.data.plans[planId] = { ...planData, timestamp: Date.now(), versionPrompt: "v71.5" };

        if (this.uid) {
            await db.collection('users').doc(this.uid).collection('plans').doc(planId).set(this.data.plans[planId]);
        }
        window.dispatchEvent(new CustomEvent('c_store_updated'));
    }

    async getSavedMonthPlan(year, month) {
        const planId = `${year}-${month + 1}`;
        if (this.data.plans && this.data.plans[planId]) return this.data.plans[planId];

        if (this.uid) {
            const doc = await db.collection('users').doc(this.uid).collection('plans').doc(planId).get();
            if (doc.exists) {
                if (!this.data.plans) this.data.plans = {};
                this.data.plans[planId] = doc.data();
                return this.data.plans[planId];
            }
        }
        return null;
    }

    async nuclearReset() {
        if (!this.uid) {
            localStorage.clear();
            return true;
        }
        console.log("🔥 NUCLEAR RESET: Limpiando Firestore...");
        try {
            const batchCommit = async (collectionName) => {
                const snap = await db.collection('users').doc(this.uid).collection(collectionName).get();
                if (!snap.empty) {
                    const batch = db.batch();
                    snap.forEach(doc => batch.delete(doc.ref));
                    await batch.commit();
                }
            };
            await batchCommit('transactions');
            await batchCommit('accounts');
            await batchCommit('goals');
            await batchCommit('plans');
            const newConfig = { ...DEFAULT_DATA.config, user_name: this.data.config.user_name || 'Usuario', migrationCompleted: true };
            await db.collection('users').doc(this.uid).set(newConfig);
            localStorage.clear();
            return true;
        } catch (e) {
            console.error("Error in nuclearReset:", e);
            throw e;
        }
    }
}
