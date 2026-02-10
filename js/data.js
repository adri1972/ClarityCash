const STORAGE_KEY = 'clarity_cash_data_v2';

const DEFAULT_DATA = {
    // A) Usuario (configuración)
    config: {
        currency: 'COP',
        monthly_income_target: 0,
        savings_goal_type: 'PERCENT', // PERCENT, AMOUNT
        savings_goal_value: 20,       // 20% default
        spending_profile: 'BALANCEADO', // CONSERVADOR, BALANCEADO, FLEXIBLE
        has_debts: false,
        total_debt: 0,
        budgets: {}, // { category_id: limit_amount }
        fixed_expenses: [], // { id, name, amount, category_id, day: 1 }
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    goals: [], // { id, type, name, target_amount, current_amount, deadline (date), status (ACTIVE, COMPLETED) }
    // B) Cuentas
    accounts: [
        { id: 'acc_1', name: 'Billetera', type: 'EFECTIVO', initial_balance: 0, current_balance: 0, created_at: new Date().toISOString() },
        { id: 'acc_2', name: 'Cuenta Principal', type: 'BANCO', initial_balance: 0, current_balance: 0, created_at: new Date().toISOString() }
    ],
    // C) Categorías
    categories: [
        // INGRESOS
        { id: 'cat_inc_1', name: 'Salario / Nómina', group: 'INGRESOS', is_default: true },
        { id: 'cat_inc_2', name: 'Honorarios', group: 'INGRESOS', is_default: true },
        { id: 'cat_inc_3', name: 'Otros Ingresos', group: 'INGRESOS', is_default: true },
        // NECESIDADES
        { id: 'cat_1', name: 'Vivienda', group: 'NECESIDADES', is_default: true },
        { id: 'cat_2', name: 'Alimentación', group: 'NECESIDADES', is_default: true },
        { id: 'cat_3', name: 'Transporte', group: 'NECESIDADES', is_default: true },
        { id: 'cat_gasolina', name: 'Gasolina', group: 'NECESIDADES', is_default: true },
        { id: 'cat_4', name: 'Salud', group: 'NECESIDADES', is_default: true },
        // FINANCIERO
        { id: 'cat_5', name: 'Ahorro', group: 'FINANCIERO', is_default: true },
        { id: 'cat_6', name: 'Inversión', group: 'FINANCIERO', is_default: true },
        { id: 'cat_7', name: 'Deuda/Créditos', group: 'FINANCIERO', is_default: true },
        { id: 'cat_fin_4', name: 'Tarjeta de Crédito', group: 'FINANCIERO', is_default: true },
        { id: 'cat_fin_5', name: 'Renting / Leasing', group: 'FINANCIERO', is_default: true },
        { id: 'cat_fin_int', name: 'Intereses Financieros', group: 'FINANCIERO', is_default: true },
        // CRECIMIENTO
        { id: 'cat_8', name: 'Educación', group: 'CRECIMIENTO', is_default: true },
        // ESTILO_DE_VIDA
        { id: 'cat_9', name: 'Ocio', group: 'ESTILO_DE_VIDA', is_default: true },
        { id: 'cat_subs', name: 'Suscripciones Digitales', group: 'ESTILO_DE_VIDA', is_default: true },
        { id: 'cat_rest', name: 'Restaurantes / Domicilios', group: 'ESTILO_DE_VIDA', is_default: true },
        { id: 'cat_personal', name: 'Ropa / Cuidado Personal', group: 'ESTILO_DE_VIDA', is_default: true },
        { id: 'cat_deporte', name: 'Deporte / Gym', group: 'ESTILO_DE_VIDA', is_default: true },
        { id: 'cat_vicios', name: 'Alcohol / Tabaco', group: 'ESTILO_DE_VIDA', is_default: true },
        // OTROS
        { id: 'cat_ant', name: 'Café / Snacks', group: 'OTROS', is_default: true },
        { id: 'cat_10', name: 'Otros/Imprevistos', group: 'OTROS', is_default: true }
    ],
    // D) Movimientos
    transactions: [] // { id, type, amount, date, account_id, category_id, note, created_at, goal_id }
};

class Store {
    constructor() {
        this.STORAGE_KEY = 'clarity_cash_data_v2';
        this.usingMemory = false;
        this.memoryStore = null;
        this.data = this.init();
    }

    init() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            if (!stored) return JSON.parse(JSON.stringify(DEFAULT_DATA));

            const data = JSON.parse(stored);

            // Critical Fix: Ensure currency exists
            if (!data.config || !data.config.currency) {
                if (!data.config) data.config = {};
                data.config.currency = 'COP';
            }

            // Migration: Ensure new default categories exist in stored data
            const currentCatIds = new Set((data.categories || []).map(c => c.id));
            DEFAULT_DATA.categories.forEach(defCat => {
                if (!currentCatIds.has(defCat.id)) {
                    if (!data.categories) data.categories = [];
                    data.categories.push(defCat);
                }
            });

            // Goals migration
            if (!data.goals) data.goals = [];

            // Merge defaults for backward compatibility
            return { ...DEFAULT_DATA, ...data, config: { ...DEFAULT_DATA.config, ...(data.config || {}) } };
        } catch (e) {
            console.warn('LocalStorage access denied (likely file:// protocol). Using temporary memory.', e);
            this.usingMemory = true;
            this.memoryStore = JSON.parse(JSON.stringify(DEFAULT_DATA));
            return this.memoryStore;
        }
    }

    _save() {
        this.data.config.updated_at = new Date().toISOString();
        if (this.usingMemory) {
            this.memoryStore = JSON.parse(JSON.stringify(this.data)); // Deep copy to prevent direct reference issues
            window.dispatchEvent(new CustomEvent('c_store_updated'));
            return;
        }
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.data));
            window.dispatchEvent(new CustomEvent('c_store_updated'));
        } catch (e) {
            console.error('Save failed:', e);
        }
    }

    // --- Getters ---
    get transactions() { return this.data.transactions; }
    get accounts() { return this.data.accounts; }
    get categories() { return this.data.categories; }
    get config() { return this.data.config; }

    // --- Actions ---

    addTransaction(transaction) {
        // transaction: { type, amount, date, category_id, account_id, note, goal_id, generated_from, etc }
        const newTx = {
            ...transaction,
            id: Date.now().toString() + Math.random().toString(36).substr(2, 5), // Unique ID to prevent loop collisions
            amount: parseFloat(transaction.amount),
            created_at: new Date().toISOString()
        };
        this.data.transactions.push(newTx);

        // Update Account Balance
        this._updateAccountBalance(newTx.account_id, newTx.amount, newTx.type);

        this._save();
        return newTx;
    }

    updateTransaction(id, updates) {
        const index = this.data.transactions.findIndex(t => t.id === id);
        if (index === -1) return;

        const oldTx = this.data.transactions[index];

        // Revert old balance impact
        this._updateAccountBalance(oldTx.account_id, -oldTx.amount, oldTx.type); // Negative amount to reverse? No.
        // Reversal Logic:
        // If INGRESO, we added amount. To reverse, we subtract.
        // If GASTO, we subtracted. To reverse, we add.

        // Let's use a smarter helper or manual logic here.
        // updateAccountBalance adds on INGRESO, subtracts on others.
        // To reverse INGRESO, we treat as GASTO (subtract). 
        // To reverse GASTO, we treat as INGRESO (add).

        if (oldTx.type === 'INGRESO') {
            this._updateAccountBalance(oldTx.account_id, oldTx.amount, 'GASTO');
        } else {
            this._updateAccountBalance(oldTx.account_id, oldTx.amount, 'INGRESO');
        }

        // Apply updates
        const newTx = { ...oldTx, ...updates };
        // Ensure amount is float
        if (updates.amount) newTx.amount = parseFloat(updates.amount);

        this.data.transactions[index] = newTx;

        // Apply new balance impact
        this._updateAccountBalance(newTx.account_id, newTx.amount, newTx.type);

        this._save();
    }

    deleteTransaction(id) {
        const index = this.data.transactions.findIndex(t => t.id === id);
        if (index === -1) return;
        const tx = this.data.transactions[index];

        // Revert balance
        if (tx.type === 'INGRESO') {
            this._updateAccountBalance(tx.account_id, tx.amount, 'GASTO');
        } else {
            this._updateAccountBalance(tx.account_id, tx.amount, 'INGRESO');
        }

        this.data.transactions.splice(index, 1);
        this._save();
    }

    // ... (updateAccountBalance remains same) ...

    getGoals() {
        const goals = this.data.goals || [];
        const txs = this.data.transactions;

        return goals.map(g => {
            // 1. Dedicated Transactions (Explicit Link)
            const dedicatedTxs = txs.filter(t => t.goal_id === g.id);

            // 2. Smart Match (Implicit Link for Orphan Transactions)
            const implicitTxs = txs.filter(t => {
                if (t.goal_id) return false; // Already assigned

                // DEBT Goal: Match 'PAGO_DEUDA' type OR specific debt categories (cat_7=Deuda)
                // Exclude Credit Card/Renting from automatic match as they might be recurrent expenses, not debt payoff.
                if (g.type === 'DEBT') {
                    if (t.type === 'PAGO_DEUDA') return true;
                    if (t.category_id === 'cat_7') return true;
                }

                // EMERGENCY Goal: Match 'AHORRO' type OR 'Ahorro' category
                if (g.type === 'EMERGENCY') {
                    if (t.type === 'AHORRO') return true;
                    if (t.category_id === 'cat_5') return true;
                }

                // PURCHASE Goal: Only explicit links for now to avoid confusion
                return false;
            });

            // Combine unique transactions
            const allMatchTxs = [...dedicatedTxs, ...implicitTxs];

            // Avoid duplicates just in case
            const uniqueTxs = Array.from(new Set(allMatchTxs.map(t => t.id)))
                .map(id => allMatchTxs.find(t => t.id === id));

            const currentAmount = uniqueTxs.reduce((sum, t) => sum + t.amount, 0);

            // Calculate projection
            const last3 = uniqueTxs
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .slice(0, 3);

            return {
                ...g,
                current_amount: currentAmount,
                recent_contributions: last3
            };
        });
    }

    _updateAccountBalance(accountId, amount, type) {
        const account = this.data.accounts.find(a => a.id === accountId);
        if (!account) return;

        // Reglas:
        // GASTO -> reduce
        // INGRESO -> aumenta
        // AHORRO -> reduce (sale de la cuenta operativa)
        // INVERSION -> reduce (sale de la cuenta operativa)
        // PAGO_DEUDA -> reduce

        if (type === 'INGRESO') {
            account.current_balance += amount;
        } else {
            // All others reduce the account balance in this simple model
            account.current_balance -= amount;
        }
    }


    updateConfig(newConfig) {
        this.data.config = { ...this.data.config, ...newConfig };
        this._save();
    }

    addGoal(goal) {
        const newGoal = {
            ...goal,
            id: Date.now().toString(),
            // type: 'EMERGENCY', 'DEBT', 'PURCHASE'
            current_amount: goal.current_amount || 0,
            status: 'ACTIVE',
            created_at: new Date().toISOString()
        };
        // Ensure goals array exists if migrating old data
        if (!this.data.goals) this.data.goals = [];
        this.data.goals.push(newGoal);
        this._save();
        return newGoal;
    }

    updateGoal(id, updates) {
        if (!this.data.goals) return;
        const index = this.data.goals.findIndex(g => g.id === id);
        if (index !== -1) {
            this.data.goals[index] = { ...this.data.goals[index], ...updates };
            this._save();
        }
    }

    deleteGoal(id) {
        if (!this.data.goals) return;
        this.data.goals = this.data.goals.filter(g => g.id !== id);
        this._save();
    }

    // --- Fixed Expenses Management ---
    addFixedExpense(expense) {
        if (!this.data.config.fixed_expenses) this.data.config.fixed_expenses = [];
        const newExp = {
            ...expense,
            id: Date.now().toString(), // Unique ID for the config entry
            day: expense.day || 1
        };
        this.data.config.fixed_expenses.push(newExp);
        this._save();
        return newExp;
    }

    deleteFixedExpense(id) {
        if (!this.data.config.fixed_expenses) return;
        this.data.config.fixed_expenses = this.data.config.fixed_expenses.filter(e => e.id !== id);
        this._save();
    }

    updateFixedExpense(id, updates) {
        if (!this.data.config.fixed_expenses) return;
        const index = this.data.config.fixed_expenses.findIndex(e => e.id === id);
        if (index !== -1) {
            this.data.config.fixed_expenses[index] = { ...this.data.config.fixed_expenses[index], ...updates };
            this._save();
        }
    }

    // --- Recurring Incomes Management ---
    addRecurringIncome(income) {
        if (!this.data.config.recurring_incomes) this.data.config.recurring_incomes = [];
        const newInc = {
            ...income,
            id: Date.now().toString(),
            day: income.day || 1
        };
        this.data.config.recurring_incomes.push(newInc);
        this._save();
        return newInc;
    }

    deleteRecurringIncome(id) {
        if (!this.data.config.recurring_incomes) return;
        this.data.config.recurring_incomes = this.data.config.recurring_incomes.filter(i => i.id !== id);
        this._save();
    }

    updateRecurringIncome(id, updates) {
        if (!this.data.config.recurring_incomes) return;
        const index = this.data.config.recurring_incomes.findIndex(i => i.id === id);
        if (index !== -1) {
            this.data.config.recurring_incomes[index] = { ...this.data.config.recurring_incomes[index], ...updates };
            this._save();
        }
    }

    // Called when viewing a month to ensure fixed items exist
    processFixedExpenses(month, year) {
        const mStr = (month + 1).toString().padStart(2, '0');
        const yStr = year.toString();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        let addedCount = 0;

        // 1. Fixed Expenses
        if (this.data.config.fixed_expenses && this.data.config.fixed_expenses.length > 0) {
            this.data.config.fixed_expenses.forEach(fe => {
                const alreadyExists = this.data.transactions.some(t => {
                    if (t.generated_from === fe.id) {
                        const parts = t.date.split('-'); // YYYY-MM-DD
                        return parseInt(parts[0]) === year && (parseInt(parts[1]) - 1) === month;
                    }
                    return false;
                });

                if (!alreadyExists) {
                    const day = Math.min(fe.day, daysInMonth);
                    const dateStr = `${yStr}-${mStr}-${day.toString().padStart(2, '0')}`;

                    this.addTransaction({
                        type: 'GASTO',
                        amount: fe.amount,
                        date: dateStr,
                        category_id: fe.category_id,
                        account_id: 'acc_2', // Default Bank
                        note: fe.name,
                        generated_from: fe.id
                    });
                    addedCount++;
                }
            });
        }

        // 2. Recurring Incomes
        if (this.data.config.recurring_incomes && this.data.config.recurring_incomes.length > 0) {
            this.data.config.recurring_incomes.forEach(ri => {
                const alreadyExists = this.data.transactions.some(t => {
                    if (t.generated_from === ri.id) {
                        const parts = t.date.split('-');
                        return parseInt(parts[0]) === year && (parseInt(parts[1]) - 1) === month;
                    }
                    return false;
                });

                if (!alreadyExists) {
                    const day = Math.min(ri.day, daysInMonth);
                    const dateStr = `${yStr}-${mStr}-${day.toString().padStart(2, '0')}`;

                    this.addTransaction({
                        type: 'INGRESO',
                        amount: ri.amount,
                        date: dateStr,
                        category_id: 'cat_salario', // Default or specific
                        account_id: 'acc_2',
                        note: ri.name,
                        generated_from: ri.id
                    });
                    addedCount++;
                }
            });
        }

        if (addedCount > 0) {
            console.log(`Generated ${addedCount} recurring transactions for ${yStr}-${mStr}`);
        }
    }

    // NEW: Clear all data for fresh start
    clearTransactions() {
        this.data.transactions = [];
        this.data.accounts.forEach(acc => {
            acc.current_balance = acc.initial_balance || 0;
        });
        this._save();
        return true;
    }

    getAllTransactions() {
        return this.data.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    getFinancialSummary(month, year) {
        const now = new Date();
        const m = month !== undefined ? month : now.getMonth();
        const y = year !== undefined ? year : now.getFullYear();

        const monthlyTx = this.data.transactions.filter(t => {
            if (!t.date) return false;
            const parts = t.date.split('-');
            const txYear = parseInt(parts[0], 10);
            const txMonth = parseInt(parts[1], 10) - 1;
            return txMonth === m && txYear === y;
        });

        const summary = {
            income: 0,
            expenses: 0,
            savings: 0,
            investment: 0,
            debt_payment: 0,
            balance_net: 0,
            period: `${m + 1}/${y}`
        };

        monthlyTx.forEach(t => {
            if (t.type === 'INGRESO') summary.income += t.amount;
            if (t.type === 'GASTO') summary.expenses += t.amount;
            if (t.type === 'AHORRO') summary.savings += t.amount;
            if (t.type === 'INVERSION') summary.investment += t.amount;
            if (t.type === 'PAGO_DEUDA') summary.debt_payment += t.amount;
        });

        // Balance neto = Ingresos - (Gastos + Ahorro + Inversión + Deuda)
        // Note: Savings/Investment are treated as outflows from "cash flow" perspective in this specific net balance formula requested?
        // "Balance neto del mes = ingresos - (gastos + ahorro + inversión + pago_deuda)" -> As per prompt.
        summary.balance_net = summary.income - (summary.expenses + summary.savings + summary.investment + summary.debt_payment);

        return summary;
    }

    getCategoryBreakdown(month, year) {
        const now = new Date();
        const m = month !== undefined ? month : now.getMonth();
        const y = year !== undefined ? year : now.getFullYear();

        // Include GASTO and PAGO_DEUDA in the spending breakdown
        const monthlyTx = this.data.transactions.filter(t => {
            if (!t.date) return false;
            const parts = t.date.split('-');
            const txYear = parseInt(parts[0], 10);
            const txMonth = parseInt(parts[1], 10) - 1;
            return txMonth === m && txYear === y && (t.type === 'GASTO' || t.type === 'PAGO_DEUDA');
        });

        const breakdown = {};
        monthlyTx.forEach(t => {
            const cat = this.data.categories.find(c => c.id === t.category_id);
            const catName = cat ? cat.name : 'Desconocido';
            breakdown[catName] = (breakdown[catName] || 0) + t.amount;
        });

        return breakdown;
    }
    getHistorySummary(months = 6) {
        const history = [];
        const today = new Date();

        for (let i = months - 1; i >= 0; i--) {
            const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
            const m = d.getMonth();
            const y = d.getFullYear();
            const summary = this.getFinancialSummary(m, y);

            // Short Name (e.g., "Ene")
            const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

            history.push({
                label: `${monthNames[m]}`,
                income: summary.income,
                expenses: summary.expenses, // raw positive number
                balance: summary.balance_net
            });
        }
        return history;
    }
}
