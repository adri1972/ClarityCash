/**
 * AI Logic Module
 * Generates actionable financial insights based on strict rules.
 */

// 3) PORCENTAJES BASE (REFERENCIA OFICIAL)
const REFERENCE_PERCENTAGES = {
    NO_DEBT: {
        'Vivienda': 30, // Limit 35
        'Alimentación': 12,
        'Transporte': 10,
        'Salud': 5,
        'Ahorro': 20, // Min 10
        'Inversión': 8,
        'Educación': 5,
        'Ocio': 7,
        'Otros/Imprevistos': 3
    },
    WITH_DEBT: {
        'Vivienda': 30,
        'Alimentación': 12,
        'Transporte': 9,
        'Salud': 5,
        'Pago Deuda': 15, // Limit 30
        'Ahorro': 12, // Min 5-10
        'Inversión': 3,
        'Educación': 4,
        'Ocio': 5,
        'Otros/Imprevistos': 2
    }
};

class FinancialAdvisor {
    constructor(store) {
        this.store = store;
    }

    analyze() {
        const config = this.store.config;
        const summary = this.store.getFinancialSummary();
        const breakdown = this.store.getCategoryBreakdown(); // By Name
        const recommendations = [];

        if (summary.income === 0) {
            recommendations.push({
                type: 'critical',
                title: 'Faltan Ingresos',
                message: 'No has registrado ingresos este mes. Registra tu salario para activar el análisis.',
                priority: 10
            });
            return recommendations;
        }

        const income = summary.income;
        const hasDebt = config.has_debts;
        const profile = config.spending_profile; // CONSERVADOR, BALANCEADO, FLEXIBLE

        // Define tolerance based on profile
        const tolerances = { 'CONSERVADOR': 3, 'BALANCEADO': 5, 'FLEXIBLE': 7 };
        const tolerance = tolerances[profile] || 5;

        // Select Reference Table
        const targets = hasDebt ? REFERENCE_PERCENTAGES.WITH_DEBT : REFERENCE_PERCENTAGES.NO_DEBT;

        // --- 1. Validate Critical Limits ---

        // A) Housing Logic
        // Need to find which category name maps to 'Vivienda' in logic, 
        // assuming standard names match keys in REFERENCE_PERCENTAGES
        const housingSpend = breakdown['Vivienda'] || 0;
        const housingRatio = (housingSpend / income) * 100;
        if (housingRatio > 35) {
            const delta = housingRatio - 35;
            const savingsPotential = (income * (delta / 100)); // Keep as number for formatting in UI
            recommendations.push({
                type: 'critical',
                title: 'Vivienda por encima del rango',
                message: `Tu gasto en Vivienda fue ${housingRatio.toFixed(1)}%. El límite saludable es 35%.`,
                savingsPotential: savingsPotential,
                action: 'Busca opciones de refinanciamiento o reduce servicios asociados.',
                priority: 9
            });
        }

        // B) Debt Logic (if applicable)
        if (hasDebt) {
            const debtRatio = (summary.debt_payment / income) * 100;
            if (debtRatio > 30) {
                const delta = debtRatio - 30;
                const savingsPotential = (income * (delta / 100));
                recommendations.push({
                    type: 'critical',
                    title: 'Nivel de Deuda Crítico',
                    message: `Estás destinando ${debtRatio.toFixed(1)}% a pagos de deuda. El límite saludable es 30%.`,
                    savingsPotential: savingsPotential,
                    action: 'Prioriza pagos a la deuda más cara y evita nuevas cuotas.',
                    priority: 9
                });
            }
        }

        // C) Net Balance Logic
        if (summary.balance_net < 0) {
            recommendations.push({
                type: 'critical',
                title: 'Balance Neto Negativo',
                message: `Tu balance es negativo (-$${Math.abs(summary.balance_net).toLocaleString('es-CO')}). Tu caja se deteriora.`,
                action: 'Recorta primero Ocio/Otros y fija un presupuesto por categoría.',
                priority: 10
            });
        }

        // --- 2. Savings Checks ---
        // Savings Total = Ahorro Transactions
        const savingsRatio = (summary.savings / income) * 100;
        const minSavings = hasDebt ? 5 : 10;
        const targetSavings = targets['Ahorro'];

        if (savingsRatio < minSavings) {
            const delta = targetSavings - savingsRatio;
            const amountNeeded = (income * (delta / 100));
            recommendations.push({
                type: 'warning',
                title: 'Ahorro por debajo del mínimo',
                message: `Tu ahorro fue ${savingsRatio.toFixed(1)}%. La referencia es ${targetSavings}%.`,
                savingsPotential: amountNeeded,
                action: `Programa un ‘ahorro primero’ al inicio del mes.`,
                priority: 8
            });
        }

        // --- 3. Category Deviations ---
        Object.keys(targets).forEach(catName => {
            // Skip special calculations already done
            if (['Ahorro', 'Inversión', 'Pago Deuda'].includes(catName)) return;

            const targetPct = targets[catName];
            const actualSpend = breakdown[catName] || 0;
            const actualPct = (actualSpend / income) * 100;
            const diff = actualPct - targetPct;

            if (diff >= tolerance) {
                // Determine Delta (pp) and Amount
                const amountOver = (income * (diff / 100));

                recommendations.push({
                    type: 'alert',
                    title: `Exceso en ${catName}`,
                    message: `Este mes, ${catName} representa ${actualPct.toFixed(1)}% (Ref: ${targetPct}%).`,
                    savingsPotential: amountOver,
                    action: `Define un tope semanal para ${catName}.`,
                    priority: 5 + (diff / 10) // Higher deviation = higher priority
                });
            }
        });

        // Sort by priority descending
        return recommendations.sort((a, b) => b.priority - a.priority).slice(0, 5);
    }
}
