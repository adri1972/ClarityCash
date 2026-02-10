class FinancialAdvisor {
    constructor(store) {
        this.store = store;
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
                message: `Estás en números rojos (-$${Math.abs(summary.balance_net).toLocaleString()}). Estás usando deuda o ahorros previos para vivir.`,
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
                        message: `Al ritmo actual ($${monthlySavings.toLocaleString()}/mes), tardarás ${monthsToGo} meses (${(monthsToGo / 12).toFixed(1)} años). Aumenta tu ahorro un 10% para llegar antes.`,
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

        // --- 2. BUDGET VELOCITY (Mid-month check) ---
        const today = new Date();
        const isCurrentMonth = today.getMonth() === month && today.getFullYear() === year;

        if (isCurrentMonth) {
            const day = today.getDate();
            const progress = day / 30; // 0.5 at day 15

            Object.keys(budgets).forEach(catId => {
                const limit = budgets[catId];
                const cat = this.store.categories.find(c => c.id === catId);
                if (!cat) return;
                const spent = breakdown[cat.name] || 0;
                const spentPct = spent / limit;

                // Critical: 50% month passed, but 90% budget used
                if (progress < 0.6 && spentPct > 0.9) {
                    insights.push({
                        type: 'critical',
                        title: `🛑 Freno de Mano: ${cat.name}`,
                        message: `¡Cuidado! Apenas es día ${day} y ya te gastaste el presupuesto de ${cat.name}. Deja la tarjeta en casa.`,
                        impact: limit - spent
                    });
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
                message: `Gastas $${foodTotal.toLocaleString()} en comer fuera. Si cocinas más, podrías ahorrar fácilmente $${(foodTotal * 0.4).toLocaleString()} este mes.`,
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
                message: `Pagas $${subs.toLocaleString()} en suscripciones. ¿Realmente usas todas las plataformas este mes? Cancela una y ahorra.`,
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
     */
    /**
     * Action Plan Generator (The "What to do next")
     * Returns structured advice for the Dashboard Hero Section
     * NOW WITH "DEEP DIVE" ANALYSIS (Less generic, more math-based)
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
            // Filter by month/year robustly
            if (!t.date) return false;
            const parts = t.date.split('-');
            if (parts.length < 2) return false;
            const tYear = parseInt(parts[0], 10);
            const tMonth = parseInt(parts[1], 10) - 1;
            return tMonth === month && tYear === year;
        });

        // --- SCENARIO 0: EMPTY STATE ---
        if (summary.income === 0 && txs.length === 0) {
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
        // --- HELPER: Find Top Leaks ---
        // Exclude Fixed Costs (Vivienda, Educacion, Salud, financiero)
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
                    // Truncate and clean for better grouping
                    m = m.split(' ')[0].replace(/[^a-zA-Z]/g, '').toUpperCase();
                    if (m.length < 3) m = "Varios";
                    if (!merchantMap[m]) merchantMap[m] = 0;
                    merchantMap[m] += t.amount;
                });
                topMerchantsList = Object.entries(merchantMap)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 3); // Top 3
            }
        }

        // --- LOGIC TREE ---

        // CASE A: DEFICIT (The House is on Fire)
        if (summary.balance_net < 0) {
            status = 'CRITICAL';
            const deficit = Math.abs(summary.balance_net);
            priority = `🚨 DÉFICIT DE ${this.formatMoney(deficit)}`;

            // Fix: Include 'Tarjeta de Crédito' in Debt Calculation
            const cardPayment = breakdown['Tarjeta de Crédito'] || 0;
            const debtPay = summary.debt_payment + cardPayment;

            if (debtPay > income * 0.3) { // Lowered threshold to 30%
                diagnosis = `Tu deuda te está asfixiando. Pagas ${this.formatMoney(debtPay)}, que es el ${((debtPay / income) * 100).toFixed(0)}% de tu ingreso.`;
                adjustments.push(`<b>🛑 Frena el pago de capital:</b> Solo paga los mínimos legales este mes. Necesitas liquidez para comer.`);
                adjustments.push(`<b>📞 Llama al banco ya:</b> Pide "Rediferir a 24 o 36 cuotas" la tarjeta de mayor cuota. Bajarás la mensualidad inmediatamente.`);
            }
            else if (topLeak) {
                let merchantText = "";
                if (topMerchantsList.length > 0) {
                    const names = topMerchantsList.map(m => `${m[0]} (${this.formatMoney(m[1])})`).join(', ');
                    merchantText = `<br><br>👉 <b>Principales fugas:</b> ${names}.`;
                }

                // Discrepancy Check (User spent huge last month vs this month)
                let hangoverWarn = "";
                if (prevExpenses > income * 1.5) {
                    hangoverWarn = `<br><br>⚠️ <b>Ciclo de Deuda:</b> Veo gastos muy altos el mes anterior (${this.formatMoney(prevExpenses)}). Si usaste tarjeta, esas cuotas te están asfixiando hoy.`;
                }

                diagnosis = `Tu déficit (${this.formatMoney(deficit)}) proviene de <b>${topLeak[0]}</b> (${this.formatMoney(topLeak[1])}) y tus deudas.${merchantText}${hangoverWarn}`;

                // SMART ACTION for Debt Hangover
                if (deficit > income * 0.3) {
                    adjustments.push(`<b>🛑 Crisis de Liquidez:</b> No podrás pagar todo de golpe a fin de mes.`);

                    if (topMerchantsList.length > 0) {
                        const bigOne = topMerchantsList[0];
                        adjustments.push(`<b>📞 Acción Inteligente:</b> Llama a tu banco y redifiere la compra de <b>${bigOne[0]}</b> a 12 o 24 cuotas. Esto liberará caja INMEDIATA.`);
                    } else {
                        adjustments.push(`<b>📞 Salvavidas:</b> Paga solo el Mínimo de la tarjeta este mes y usa el efectivo para comida/servicios.`);
                    }
                } else {
                    adjustments.push(`<b>Plan de Choque:</b> No gastes ni un peso más en ${topLeak[0]} hasta el próximo mes.`);
                }
            }
            else {
                diagnosis = "Tus costos fijos (Vivienda/Servicios) son mayores a tus ingresos. Esto es estructural.";
                adjustments.push(`<b>Ingreso de Emergencia:</b> Vende algo por Marketplace que valga al menos ${this.formatMoney(deficit)} esta semana.`);
            }

        }
        // CASE B: BREAK-EVEN (Living on the Edge)
        else if (summary.savings < (income * 0.05)) {
            status = 'WARNING';
            priority = "⚠️ RIESGO ALTO (Vives al día)";

            if (topLeak) {
                const leakPct = (topLeak[1] / income) * 100;
                let merchantText = "";

                // 1. Merchant Breakdown (The "Who") -> In Diagnosis
                if (topMerchantsList.length > 0) {
                    const topList = topMerchantsList.map(m => `${m[0]} (${this.formatMoney(m[1])})`).join(', ');
                    merchantText = `<br><br>👉 <b>Se fue en:</b> ${topList} y otros.`;
                }

                diagnosis = `No ahorras porque <b>${topLeak[0]}</b> consume el ${leakPct.toFixed(0)}% de tu ingreso (${this.formatMoney(topLeak[1])}).${merchantText}`;



                // 2. Frequency Analysis (The "How")
                const cat = this.store.categories.find(c => c.name === topLeak[0]);
                const count = txs.filter(t => t.category_id === cat?.id).length;

                if (count > 6) {
                    adjustments.push(`<b>Comportamiento Compulsivo:</b> Hiciste ${count} compras distintas en esta categoría. Estás comprando por impulso, no por necesidad.`);
                    adjustments.push(`👉 <b>Estrategia de Fricción:</b> Retira en efectivo tu presupuesto semanal para ${topLeak[0]}. Cuando se acabe el billete, se acabó el gasto.`);
                } else {
                    adjustments.push(`<b>Compras Grandes:</b> Hiciste pocas compras pero de alto valor.`);
                    adjustments.push(`👉 <b>Regla de las 72h:</b> Para compras > $200k, espera 3 días antes de pagar. Dale tiempo a tu cerebro racional.`);
                }
            } else {
                diagnosis = "El dinero se te escapa en 'Gastos Hormiga' dispersos.";
                adjustments.push("<b>Ayuno de Gasto:</b> Próximos 3 días, gasta SOLO en transporte y comida básica. Nada más.");
            }
        }
        // CASE C: GOOD (Can optimize)
        else {
            status = 'OK';
            priority = "📈 SUPERÁVIT: Optimización";
            const surplus = summary.balance_net + summary.savings; // True cash available

            diagnosis = `Tienes un flujo de caja positivo de ${this.formatMoney(surplus)}. ¡Muy bien! Pero el dinero quieto pierde valor.`;

            if (this.store.config.has_debts) {
                adjustments.push(`<b>Ataque a la Deuda:</b> Usa exactamente ${this.formatMoney(surplus * 0.8)} para hacer un abono extraordinario a capital.`);
                adjustments.push(`<b>El Efecto:</b> Esto te ahorrará meses de intereses futuros.`);
            } else {
                adjustments.push(`<b>Inversión Automática:</b> Programa una transferencia de ${this.formatMoney(surplus)} a un bolsillo de inversión el día de pago.`);
                adjustments.push("<b>Sube el nivel:</b> Tu estilo de vida está controlado. Es hora de aumentar tu meta de ingresos.");
            }
        }

        return { status, priority, diagnosis, adjustments };
    }

    formatMoney(amount) {
        return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(amount);
    }
}
