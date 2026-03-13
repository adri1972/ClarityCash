class FinancialAdvisor {
    constructor(store) {
        this.store = store;
    }

    formatMoney(amount) {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: this.store.config.currency || 'COP',
            minimumFractionDigits: 0
        }).format(amount);
    }

    /**
     * Main Analysis Engine
     * Generates a list of "Insights" (Cards) for the UI.
     */
    analyze(month, year) {
        const insights = [];
        const summary = this.store.getFinancialSummary(month, year);
        const conf = this.store.config;
        const budgets = conf.budgets || {};
        const breakdown = this.store.getCategoryBreakdown(month, year); // Names as keys
        const goals = this.store.getGoals(); // Enhanced goals with current amounts

        // --- 0. CRITICAL: Cash Flow & Survival ---
        if (summary.balance_net < 0) {
            insights.push({
                type: 'critical',
                title: '⛔ Fuga de Capital',
                message: `Estás en números rojos (-${this.formatMoney(Math.abs(summary.balance_net))}). Estás usando deuda o ahorros previos para vivir.`,
                impact: Math.abs(summary.balance_net)
            });
        }

        // --- 1. GOAL PROJECTION (The "Why") ---
        // Find the most urgent goal
        const activeGoals = goals.filter(g => g.current_amount < g.target_amount);
        if (activeGoals.length > 0) {
            const topGoal = activeGoals[0]; // Just pick first for simplicity or sort by priority
            const monthlySavings = summary.savings;

            if (monthlySavings > 0) {
                const remaining = topGoal.target_amount - topGoal.current_amount;
                const monthsToGo = Math.ceil(remaining / monthlySavings);

                if (monthsToGo > 12) {
                    insights.push({
                        type: 'warning',
                        title: `🐢 Meta Lejana: ${topGoal.name}`,
                        message: `Al ritmo actual (${this.formatMoney(monthlySavings)}/mes), tardarás ${monthsToGo} meses (${(monthsToGo / 12).toFixed(1)} años). Aumenta tu ahorro un 10% para llegar antes.`,
                        impact: 50
                    });
                } else {
                    insights.push({
                        type: 'info',
                        title: `🚀 En camino: ${topGoal.name}`,
                        message: `¡Bien! A este ritmo, completarás tu meta en ${monthsToGo} meses. Mantén la constancia.`,
                        savingsPotential: 0
                    });
                }
            } else {
                insights.push({
                    type: 'warning',
                    title: `⚠️ Meta Estancada: ${topGoal.name}`,
                    message: `No registras ahorro este mes. Tu meta "${topGoal.name}" no avanza.`,
                    impact: 100
                });
            }
        }

        // --- 2. BUDGET VELOCITY & CATEGORY ALERTS ---
        const today = new Date();
        const isCurrentMonth = today.getMonth() === month && today.getFullYear() === year;

        // Identify "Fixed" categories to avoid noise
        const fixedCatIds = new Set();
        (conf.fixed_expenses || []).forEach(fe => { if (fe.category_id) fixedCatIds.add(fe.category_id); });
        (conf.loans || []).forEach(l => { if (l.category_id) fixedCatIds.add(l.category_id); });
        // Financial categories usually behave like fixed obligations
        fixedCatIds.add('cat_7'); // Deuda/Créditos
        fixedCatIds.add('cat_fin_4'); // Tarjeta de Crédito

        if (isCurrentMonth) {
            this.store.categories.forEach(cat => {
                if (cat.group === 'INGRESOS') return; // Ignore income categories

                const limit = budgets[cat.id] || 0;
                const spent = breakdown[cat.name] || 0;
                const isFixed = fixedCatIds.has(cat.id);

                if (spent > 0 || limit > 0) {
                    const spentPct = limit > 0 ? (spent / limit) : (spent > 0 ? 1.1 : 0);

                    // 1. CRITICAL: Over 100% or Unbudgeted
                    if (spentPct > 1) {
                        const overAmount = spent - limit;
                        const title = limit === 0 ? `⚠️ Sin Presupuesto: ${cat.name}` : `🛑 Exceso: ${cat.name}`;
                        const message = limit === 0 
                            ? `Gastaste ${this.formatMoney(spent)} en <b>"${cat.name}"</b> sin presupuesto asignado.`
                            : `Excediste <b>${cat.name}</b> por <b>${this.formatMoney(overAmount)}</b> (Límite: ${this.formatMoney(limit)}).`;

                        insights.push({
                            type: 'critical',
                            title: title,
                            message: message,
                            recommendation: limit > 0 ? `Evita nuevos gastos en <b>${cat.name}</b> este mes y recorta el excedente de otra categoría.` : `Asigna un presupuesto a esta categoría en el Centro Financiero para evitar fugas.`,
                            impact: spent - limit
                        });
                    }
                    // 2. WARNING: Over 80% (only for non-fixed)
                    else if (spentPct > 0.8) {
                        // Skip yellow alerts for fixed expenses if they haven't exceeded 100%
                        if (isFixed) return; 

                        insights.push({
                            type: 'warning',
                            title: `⚠️ Atención: ${cat.name}`,
                            message: `Estás cerca de superar tu presupuesto en esta categoría (${Math.round(spentPct * 100)}%). Considera reducir este gasto durante el resto del mes.`,
                            impact: limit - spent
                        });
                    }
                }
            });
        }

        // --- 3. CATEGORY SPECIFIC ADVICE (The "How") ---

        // A. Food / Delivery (Common leak)
        const foodTotal = (breakdown['Restaurantes / Domicilios'] || 0) + (breakdown['Café / Snacks'] || 0);
        const marketTotal = breakdown['Alimentación'] || 0; // Mercado

        // If Eating Out > 50% of Market (Bad ratio)
        if (marketTotal > 0 && foodTotal > (marketTotal * 0.5)) {
            insights.push({
                type: 'warning',
                title: '🍔 Exceso en Domicilios',
                message: `Gastas ${this.formatMoney(foodTotal)} en comer fuera. Si cocinas más, podrías ahorrar fácilmente ${this.formatMoney(foodTotal * 0.4)} este mes.`,
                savingsPotential: foodTotal * 0.4,
                impact: foodTotal
            });
        }

        // B. Subscriptions
        const subs = breakdown['Suscripciones Digitales'] || 0;
        if (subs > 100000) {
            insights.push({
                type: 'info',
                title: '📺 Revisión de Streaming',
                message: `Pagas ${this.formatMoney(subs)} en suscripciones. ¿Realmente usas todas las plataformas este mes? Cancela una y ahorra.`,
                savingsPotential: 30000,
                impact: subs
            });
        }

        // --- 4. DEBT INTELLIGENCE ---
        if (conf.has_debts) {
            const debtPayments = (breakdown['Deuda/Créditos'] || 0) + (breakdown['Tarjeta de Crédito'] || 0);
            if (debtPayments === 0 && summary.income > 0) {
                insights.push({
                    type: 'critical',
                    title: '⏳ Deuda en Mora Latente',
                    message: 'Tienes deudas registradas pero no veo pagos este mes. ¡No pagues intereses de mora!',
                    impact: 1000
                });
            }
        }

        // Sort by impact/priority
        return insights.sort((a, b) => {
            const typeScore = { 'critical': 3, 'warning': 2, 'info': 1 };
            return (typeScore[b.type] || 0) - (typeScore[a.type] || 0);
        }).slice(0, 5); // Top 5
    }

    /**
     * Action Plan Generator (The "What to do next")
     * Returns structured advice for the Dashboard Hero Section
     * NOW WITH UNIVERSAL AI ANALYSIS FOR ALL SITUATIONS
     */
    generateActionPlan(month, year) {
        const summary = this.store.getFinancialSummary(month, year);
        const breakdown = this.store.getCategoryBreakdown(month, year);

        // Previous Month Context (for "Hangover" effect)
        let prevMonth = month - 1;
        let prevYear = year;
        if (prevMonth < 0) { prevMonth = 11; prevYear--; }
        const prevSummary = this.store.getFinancialSummary(prevMonth, prevYear);
        const prevExpenses = prevSummary.expenses;

        const income = summary.income > 0 ? summary.income : 1;

        const txs = this.store.transactions.filter(t => {
            if (!t.date) return false;
            const parts = t.date.split('-');
            if (parts.length < 2) return false;
            const tYear = parseInt(parts[0], 10);
            const tMonth = parseInt(parts[1], 10) - 1;
            return tMonth === month && tYear === year;
        });

        // --- SCENARIO 0: EMPTY STATE ---
        // --- SCENARIO 0: EMPTY STATE ---
        if (summary.income === 0 && summary.expenses === 0 && txs.length === 0) {
            return {
                status: 'ONBOARDING',
                priority: "👋 Bienvenida a tu Libertad Financiera",
                adjustments: [
                    `La IA necesita datos para "pensar".`,
                    `1️⃣ <b>Define tu Meta:</b> Ve a Configuración y dinos a qué aspiras.`,
                    `2️⃣ <b>Registra Todo:</b> Usa el botón '+' o importa tu extracto bancario.`
                ],
                keep: ""
            };
        }

        let status = 'OK';
        let priority = "";
        let adjustments = [];
        let diagnosis = "";

        // --- HELPER: Find Top Leaks ---
        const fixedCats = ['Vivienda', 'Educación', 'Salud', 'Ahorro', 'Inversión', 'Pago Deuda', 'Deuda/Créditos', 'Tarjeta de Crédito', 'Impuestos', 'Salario / Nómina', 'Honorarios', 'Otros Ingresos'];
        const discretionary = Object.entries(breakdown)
            .filter(([name, val]) => !fixedCats.includes(name) && val > 0)
            .sort((a, b) => b[1] - a[1]); // Descending

        const topLeak = discretionary.length > 0 ? discretionary[0] : null;

        // --- HELPER: Top 3 Merchants in Leak Category ---
        let topMerchantsList = [];
        if (topLeak) {
            const leakName = topLeak[0];
            const cat = this.store.categories.find(c => c.name === leakName);
            if (cat) {
                const catTxs = txs.filter(t => t.category_id === cat.id);
                const merchantMap = {};
                catTxs.forEach(t => {
                    let m = t.note || "Varios";
                    m = m.split(' ')[0].replace(/[^a-zA-Z]/g, '').toUpperCase();
                    if (m.length < 3) m = "Varios";
                    if (!merchantMap[m]) merchantMap[m] = 0;
                    merchantMap[m] += t.amount;
                });
                topMerchantsList = Object.entries(merchantMap)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 3);
            }
        }

        const effectiveSavings = summary.savings + Math.max(0, summary.balance_net);
        const totalFixedCosts = (this.store.config.fixed_expenses || []).reduce((sum, fe) => sum + (fe.amount || 0), 0);

        // CASE A: DEFICIT (Any Deficit)
        if (summary.balance_net < 0) {
            status = 'CRITICAL';
            const deficit = Math.abs(summary.balance_net);
            priority = `😟 Gastaste ${this.formatMoney(deficit)} más de lo que ganaste`;

            const topLeakName = topLeak ? topLeak[0] : 'Gastos Generales';
            const topLeakAmount = topLeak ? this.formatMoney(topLeak[1]) : '$0';

            let merchantText = "";
            if (topMerchantsList.length > 0) {
                const names = topMerchantsList.map(m => `${m[0]} (${this.formatMoney(m[1])})`).join(', ');
                merchantText = `<br><br>👉 <b>Principales fugas:</b> ${names}.`;
            }

            diagnosis = `Tienes un hueco de ${this.formatMoney(deficit)}. Tu principal fuga es <b>${topLeakName}</b> (${topLeakAmount}).${merchantText}`;

            diagnosis = `Tienes un hueco de ${this.formatMoney(deficit)}. Tu principal fuga es <b>${topLeakName}</b> (${topLeakAmount}).${merchantText}`;

            adjustments.push(`<b>Acción Inmediata:</b> Recorta ${this.formatMoney(deficit * 0.2)} en ${topLeakName} para equilibrar.`);
            adjustments.push({
                type: 'AI_ANALYSIS_REQUIRED',
                fallback: `Analizando cómo tapar el hueco de ${this.formatMoney(deficit)}...`,
                context: {
                    problem: 'DEFICIT',
                    deficit: this.formatMoney(deficit),
                    income: this.formatMoney(income),
                    expenses: this.formatMoney(summary.expenses),
                    top_leak_name: topLeakName,
                    top_leak_amount: topLeakAmount,
                    debt_payment: this.formatMoney(summary.debt_payment),
                    full_context: `Usuario con déficit de ${this.formatMoney(deficit)}. Ingreso: ${this.formatMoney(income)}. Gasto Total: ${this.formatMoney(summary.expenses)}. Fuga principal: ${topLeakName} (${topLeakAmount}). Pago Deuda: ${this.formatMoney(summary.debt_payment)}.`
                }
            });
        }
        // CASE B: LIVING ON EDGE
        else if (effectiveSavings < (income * 0.05)) {
            status = 'WARNING';
            priority = "😬 Cuidado, estás gastando casi todo";

            if (topLeak) {
                const leakPct = (topLeak[1] / income) * 100;
                diagnosis = `No ahorras porque <b>${topLeak[0]}</b> consume el ${leakPct.toFixed(0)}% de tu ingreso (${this.formatMoney(topLeak[1])}).`;

                adjustments.push(`<b>Meta Coach:</b> Intenta no gastar más en <b>${topLeak[0]}</b> por el resto de la semana.`);
                adjustments.push({
                    type: 'AI_ANALYSIS_REQUIRED',
                    fallback: "Calculando tu margen de seguridad...",
                    context: {
                        problem: 'WARNING',
                        income: this.formatMoney(income),
                        top_leak_name: topLeak[0],
                        top_leak_amount: this.formatMoney(topLeak[1]),
                        full_context: `Usuario vive al día. Ingreso: ${this.formatMoney(income)}. Principal gasto: ${topLeak[0]} (${this.formatMoney(topLeak[1])}).`
                    }
                });
            } else {
                diagnosis = "El dinero se te escapa en 'Gastos Hormiga' dispersos.";
                adjustments.push("<b>Reto AI:</b> Reduce gastos hormiga esta semana.");
            }
        }
        // CASE C: SURPLUS
        else {
            status = 'OK';
            priority = "😊 ¡Bien! Te sobró dinero este mes";
            const surplus = effectiveSavings;
            const fixedCostPct = income > 0 ? ((totalFixedCosts / income) * 100).toFixed(0) : 0;

            if (totalFixedCosts > 0) {
                diagnosis = `Tu flujo positivo es ${this.formatMoney(surplus)}. Tus costos fijos son ${this.formatMoney(totalFixedCosts)} (${fixedCostPct}% del ingreso).`;
            } else {
                diagnosis = `Tienes un flujo de caja positivo de ${this.formatMoney(surplus)}. ¡Muy bien!`;
            }

            adjustments.push(`<b>Consejo Pro:</b> Tienes ${this.formatMoney(surplus)} libres. ¿Los pasamos a tu meta?`);
            adjustments.push({
                type: 'AI_ANALYSIS_REQUIRED',
                fallback: "Preparando una estrategia de inversión para tu excedente...",
                context: {
                    problem: 'SURPLUS',
                    surplus: this.formatMoney(surplus),
                    full_context: `Usuario tiene superávit de ${this.formatMoney(surplus)}.`
                }
            });
        }

        return { status, priority, diagnosis, adjustments };
    }

    formatMoney(amount) {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: this.store.config.currency || 'COP',
            maximumFractionDigits: 0
        }).format(amount);
    }
}
