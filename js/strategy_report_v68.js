/**
 * STRATEGY REPORT v68 — Lo que dice tu asesor
 * Vista de Diagnóstico y Mi Semana
 * Solo llama a la IA cuando el usuario lo solicita. 1 vez por semana (caché).
 */

class StrategyReport {
    constructor(container, store, aiAdvisor) {
        this.container = container;
        this.store = store;
        this.aiAdvisor = aiAdvisor;
    }

    // ─── Utilidad: número de semana ISO ────────────────────────────────────
    getWeekKey() {
        const d = new Date();
        const y = d.getFullYear();
        const start = new Date(y, 0, 1);
        const week = Math.ceil(((d - start) / 86400000 + start.getDay() + 1) / 7);
        return `${y}-W${String(week).padStart(2, '0')}`;
    }

    renderMarkdown(text) {
        if (!text) return '';
        // Un motor minimalista pero robusto para el CFO
        let html = text
            // 0. Escapar HTML básico para seguridad
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            // 1. Títulos (###, ##, #)
            .replace(/^### (.*$)/gim, '<h4 style="color:#fff; margin:15px 0 8px 0; font-weight:800;">$1</h4>')
            .replace(/^## (.*$)/gim, '<h3 style="color:#fff; margin:18px 0 10px 0; font-weight:800;">$1</h3>')
            // 2. Negritas (soporta multi-línea básica con [^]*?)
            .replace(/\*\*([^]*?)\*\*/g, '<strong>$1</strong>')
            // 3. Saltos de línea
            .replace(/\n/g, '<br>');
        
        return html;
    }
    // ─── Extraer datos consolidados de la semana ───────────────────────────
    getWeeklyData() {
        const now = new Date();
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(new Date(now).setDate(diff));
        monday.setHours(0, 0, 0, 0);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);

        const allTxs = this.store.transactions || [];
        const weeklyTxs = allTxs.filter(t => {
            const d = new Date(t.date);
            return d >= monday && d <= sunday;
        });

        const categories = this.store.categories || [];
        const config = this.store.config || {};
        const budgets = config.budgets || {};

        let ingresos = 0;
        let gastos = 0;
        let ahorro = 0;
        let deuda = 0;
        const catSpending = {};

        weeklyTxs.forEach(t => {
            const cat = categories.find(c => c.id === t.category_id);
            if (!cat) return;

            if (cat.group === 'INGRESOS') {
                ingresos += t.amount;
            } else {
                gastos += t.amount;
                catSpending[cat.id] = (catSpending[cat.id] || 0) + t.amount;
                if (cat.group === 'FINANCIERO') {
                    if (cat.id === 'cat_5') ahorro += t.amount; 
                    if (cat.id === 'cat_7' || cat.id === 'cat_fin_4') deuda += t.amount;
                }
            }
        });

        return { ingresos, gastos, ahorro, deuda, catSpending, budgets, categories };
    }
    getWeeklyEvents() {
        const key = this.getWeekKey();
        try {
            const raw = localStorage.getItem('cc_weekly_events');
            const data = raw ? JSON.parse(raw) : null;
            if (data && data.week === key) return data;
        } catch (e) { }
        return { week: key, rebalances: [], interventions: [], creditDebtEvents: [] };
    }

    // ─── Calcular Integridad de Intocables ─────────────────────────────────
    checkIntegrity() {
        const now = new Date();
        const month = now.getMonth();
        const year = now.getFullYear();
        const startOfMonth = new Date(year, month, 1).toISOString();
        const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

        const intocableIds = ['cat_1', 'cat_5', 'cat_7', 'cat_fin_4',
            'cat_viv_luz', 'cat_viv_agua', 'cat_viv_gas', 'cat_viv_net', 'cat_viv_cel'];

        const fixedIds = (this.store.config.fixed_expenses || []).map(fe => fe.category_id);
        const allProtected = [...new Set([...intocableIds, ...fixedIds])];

        // Verificar si alguna transacción de REBALANCEO salió de categorías protegidas
        const events = this.getWeeklyEvents();
        const leakedFromProtected = events.rebalances.filter(r =>
            allProtected.includes(r.fromCatId)
        );
        return leakedFromProtected.length === 0;
    }

    // ─── Calcular salud financiera ─────────────────────────────────────────
    getHealthStatus(events) {
        // Base: 100 pts
        // -10 por cada fuga de presupuesto semanal registrada
        // -15 por día de saldo negativo
        // -10 extra si hay rebalanceos
        let score = 100;
        score -= (events.rebalances.length * 10);
        score -= (events.interventions.length * 15);
        if (events.rebalances.length > 0) score -= 10;

        // --- CORRECCIÓN: Evaluar excesos reales del mes actual ---
        // Si el usuario tiene categorías con gasto > presupuesto, el score debe reflejarlo
        try {
            const now = new Date();
            const month = now.getMonth();
            const year = now.getFullYear();
            const budgets = (this.store.config && this.store.config.budgets) || {};
            const breakdown = this.store.getCategoryBreakdown ? this.store.getCategoryBreakdown(month, year) : {};
            const categories = this.store.categories || [];

            categories.forEach(cat => {
                if (cat.group === 'INGRESOS') return;
                const limit = budgets[cat.id] || 0;
                if (limit <= 0) return;
                const spent = breakdown[cat.name] || 0;

                if (spent > limit) {
                    const overAmount = spent - limit;
                    const overPct = overAmount / limit;
                    // Penalización base por exceder CUALQUIER categoría
                    score -= 15; 
                    // Penalización extra proporcional al exceso
                    if (overPct > 0.5) score -= 20; // Exceso masivo (>50%)
                    else if (overPct > 0.2) score -= 10; // Exceso notable (>20%)
                }
            });
        } catch(e) { /* silent — no romper si no hay datos */ }

        score = Math.max(0, score);

        if (score >= 90) return { color: '#2E7D32', bg: '#E8F5E9', label: '🟢 Disciplina Óptima', score };
        if (score >= 60) return { color: '#E65100', bg: '#FFF3E0', label: '🟡 Atención Requerida', score };
        return { color: '#C62828', bg: '#FFEBEE', label: '🔴 Riesgo Financiero', score };
    }

    // ─── Utilidad: Rango de fechas de la semana ────────────────────────────
    getWeekRange() {
        const d = new Date();
        const day = d.getDay(); // 0(Dom) a 6(Sab)
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Ajustar al lunes
        const monday = new Date(d.setDate(diff));
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);

        const options = { day: '2-digit', month: 'short' };
        return `Del ${monday.toLocaleDateString('es-CO', options)} al ${sunday.toLocaleDateString('es-CO', options)}`;
    }

    // ─── Utilidad: Promedios de las últimas 4 semanas ──────────────────────
    get4WeekAverages() {
        const allTxs = this.store.transactions;
        const config = this.store.config;
        const now = new Date();
        const averages = { income: 0, expenses: 0, score: 0 };

        // Calculamos para las últimas 4 semanas (28 días)
        const fourWeeksAgo = new Date(now.getTime() - (28 * 24 * 60 * 60 * 1000));

        const periodTxs = allTxs.filter(t => new Date(t.date) >= fourWeeksAgo);

        let totalIncome = 0;
        let totalExpenses = 0;

        periodTxs.forEach(t => {
            const cat = this.store.categories.find(c => c.id === t.category_id);
            if (!cat) return;
            if (cat.group === 'INGRESOS') totalIncome += t.amount;
            else totalExpenses += t.amount;
        });

        averages.income = totalIncome / 4;
        averages.expenses = totalExpenses / 4;

        // Para el score, intentaremos recuperar los últimos 4 scores de caché o usar el actual como base
        averages.score = 85; // Default razonable si no hay histórico
        try {
            const history = JSON.parse(localStorage.getItem('cc_score_history') || '[]');
            if (history.length > 0) {
                const recent = history.slice(-4);
                averages.score = recent.reduce((a, b) => a + b, 0) / recent.length;
            }
        } catch (e) { }

        return averages;
    }

    // ─── Render principal ──────────────────────────────────────────────────
    render() {
        const events = this.getWeeklyEvents();
        const health = this.getHealthStatus(events);
        const integrityOk = this.checkIntegrity();
        const weekKey = this.getWeekKey();
        const weekRange = this.getWeekRange();

        // ¿Ya hay veredicto cacheado esta semana?
        let cachedVerdict = null;
        try {
            const cv = JSON.parse(localStorage.getItem('cc_cfo_verdict'));
            if (cv && cv.week === weekKey) cachedVerdict = cv.text;
        } catch (e) { }

        // Calcular fugas totales
        const totalLeaked = events.rebalances.reduce((s, r) => s + (r.amount || 0), 0);
        const fmt = (n) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);

        // Mensaje dinámico de alertas para el botón
        const hasAlerts = events.rebalances.length > 0 || events.interventions.length > 0 || !integrityOk;
        const alertMessage = hasAlerts
            ? "Hubo alertas esta semana que deberías revisar."
            : "Tu semana fue financieramente estable.";

        // Generar lista de categorías con más gasto esta semana
        const { catSpending, categories } = this.getWeeklyData();
        let topExpensesHtml = '';
        const topWeekly = Object.entries(catSpending)
            .map(([id, amount]) => ({ id, amount, name: (categories.find(c => c.id === id) || { name: 'Otro' }).name }))
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 3);

        if (topWeekly.length > 0) {
            topExpensesHtml = topWeekly.map(cat => `
                <div style="display:flex; justify-content:space-between; align-items:center; padding: 10px 0; border-bottom: 1px solid #f1f5f9; font-size:0.85rem;">
                    <span style="color:#1e293b; font-weight:600;">${cat.name}</span>
                    <span style="font-weight:700; color:#1e293b;">${fmt(cat.amount)}</span>
                </div>
            `).join('');
        } else {
            topExpensesHtml = `<p style="color:#64748b; font-size:0.85rem; text-align:center; padding:12px 0;">✅ No registraste gastos esta semana.</p>`;
        }

        // Generar lista de intervenciones (Saldo Negativo)
        let interventionHtml = '';
        if (events.interventions.length > 0) {
            interventionHtml = `
                <div style="background:#FFF5F5; border: 1px solid #FED7D7; padding:12px; border-radius:10px; margin-bottom:12px; font-size:0.85rem; color:#C53030; font-weight:600;">
                    🚨 Tuviste ${events.interventions.length} días con saldo negativo. Revisa tu flujo semanal.
                </div>
                ${events.interventions.map(i => `
                    <div style="display:flex; justify-content:space-between; align-items:center; padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-size:0.85rem;">
                        <span style="color:#475569;">Saldo negativo en <b>${i.account || 'cuenta'}</b></span>
                        <span style="font-weight:700; color:#dc2626;">${fmt(i.amount || 0)}</span>
                    </div>
                `).join('')}
            `;
        } else {
            interventionHtml = `<p style="color:#64748b; font-size:0.85rem; text-align:center; padding:12px 0;">✅ Sin incidentes de saldo negativo.</p>`;
        }

        this.container.innerHTML = `
            <div style="max-width: 480px; margin: 0 auto; padding: 0 0 100px 0;">
                
                <!-- WIDGET DE SALUD -->
                <div style="background: ${health.bg}; border-radius: 20px; padding: 24px; margin-bottom: 20px; text-align:center; border: 2px solid ${health.color}30;">
                    <div style="font-size: 2.5rem; margin-bottom: 8px;">
                        ${health.score >= 90 ? '🏆' : health.score >= 60 ? '⚠️' : '🚨'}
                    </div>
                    <div style="font-size:1.1rem; font-weight:800; color:${health.color}; margin-bottom:2px;">${health.label}</div>
                    <div style="font-size:0.75rem; color:${health.color}; opacity:0.8; margin-bottom:4px;">Evalúa tu comportamiento financiero semanal.</div>
                    <div style="font-size:0.75rem; color:${health.color}; opacity:0.6; font-weight:600;">${weekRange}</div>
                    
                    <!-- Barra visual -->
                    <div style="background:${health.color}20; border-radius:20px; height:10px; margin:16px 0 8px 0; overflow:hidden;">
                        <div id="health-bar-fill" style="background:${health.color}; height:100%; width:0%; border-radius:20px; transition: width 1s ease-out;"></div>
                    </div>
                    <div style="font-size:0.9rem; font-weight:700; color:${health.color}; margin-bottom:12px;">Salud financiera de la semana: ${health.score} / 100</div>

                    <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; text-align:center; margin-top:8px;">
                        <div style="background:white; border-radius:12px; padding:8px; box-shadow:0 2px 4px rgba(0,0,0,0.04);">
                            <div style="font-size:1.2rem; font-weight:800; color:${health.color};">${events.rebalances.length}</div>
                            <div style="font-size:0.65rem; color:#64748b; text-transform:uppercase;">Gastos descontrolados</div>
                        </div>
                        <div style="background:white; border-radius:12px; padding:8px; box-shadow:0 2px 4px rgba(0,0,0,0.04);">
                            <div style="font-size:1.2rem; font-weight:800; color:${health.color};">${events.interventions.length}</div>
                            <div style="font-size:0.65rem; color:#64748b; text-transform:uppercase;">Semanas en rojo</div>
                        </div>
                        <div style="background:white; border-radius:12px; padding:8px; box-shadow:0 2px 4px rgba(0,0,0,0.04);">
                            <div style="font-size:1.2rem; font-weight:800; color:${integrityOk ? '#059669' : '#dc2626'};">${integrityOk ? '✓' : '✗'}</div>
                            <div style="font-size:0.65rem; color:#64748b; text-transform:uppercase;">Al día</div>
                        </div>
                    </div>
                </div>

                <!-- FUGAS DE CAPITAL -->
                <div style="background:white; border-radius:16px; padding:18px; margin-bottom:16px; box-shadow: 0 4px 20px rgba(0,0,0,0.05); border: 1px solid #f1f5f9;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                        <h4 style="margin:0; font-size:0.95rem; font-weight:700; color:#1e293b;">💸 ¿Dónde se fue tu dinero de la semana?</h4>
                    </div>
                    ${topExpensesHtml}
                </div>

                <!-- INCIDENTES DE INTEGRIDAD -->
                <div style="background:white; border-radius:16px; padding:18px; margin-bottom:16px; box-shadow: 0 4px 20px rgba(0,0,0,0.05); border: 1px solid #f1f5f9;">
                    <h4 style="margin:0 0 12px 0; font-size:0.95rem; font-weight:700; color:#1e293b;">🛡️ ¿Gastaste más de lo que tenías?</h4>
                    ${interventionHtml}
                </div>

                <!-- LO QUE DICE TU ASESOR -->
                <div style="background: linear-gradient(135deg, #1e293b, #0f172a); border-radius:20px; padding:20px; margin-bottom:16px; box-shadow: 0 10px 25px rgba(0,0,0,0.1);">
                    <div style="display:flex; align-items:center; gap:12px; margin-bottom:14px;">
                        <div style="width:40px; height:40px; background:rgba(255,255,255,0.1); border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:1.5rem;">🧠</div>
                        <div>
                            <div style="color:white; font-weight:700; font-size:1rem;">Lo que dice tu asesor</div>
                            <div style="color:#94a3b8; font-size:0.75rem;">Resumen de tu semana</div>
                        </div>
                    </div>
                    
                    <div id="cfo-verdict-box" style="background:rgba(255,255,255,0.05); border-radius:14px; padding:16px; min-height:80px; color:#f1f5f9; font-size:0.95rem; line-height:1.7; border: 1px solid rgba(255,255,255,0.1); white-space: pre-wrap; overflow-wrap: break-word;">
                        ${cachedVerdict
                ? `<div id="cfo-text">${this.renderMarkdown(cachedVerdict)}</div>`
                : `<span style="color:#94a3b8; font-size:0.85rem;">Toca "Analizar semana" para activar tu CFO virtual.</span>`
            }
                    </div>

                    ${cachedVerdict ? `
                        <div style="margin-top:10px; font-size:0.7rem; color:#475569; text-align:right;">✓ Guardado en caché</div>
                    ` : `
                        <div style="text-align:center; margin-top:15px;">
                            <p style="color:#cbd5e1; font-size:0.8rem; margin-bottom:10px; font-weight:500;">${alertMessage}</p>
                            <button id="generate-verdict-btn" onclick="window.strategyReport.generateVerdict()" 
                                style="width:100%; padding:14px; background:linear-gradient(135deg, #E91E63, #9C27B0); color:white; border:none; border-radius:14px; font-weight:700; font-size:1rem; cursor:pointer; transition: transform 0.2s; box-shadow: 0 4px 15px rgba(233,30,99,0.3);">
                                ⚡ Analizar semana
                            </button>
                        </div>
                    `}
                </div>

                <!-- BOTÓN AJUSTAR PRESUPUESTO -->
                <button onclick="document.querySelector('[data-view=settings]').click()" 
                    style="width:100%; padding:15px; background:white; border:2px solid #E91E63; color:#E91E63; border-radius:18px; font-weight:700; font-size:0.95rem; cursor:pointer; transition: all 0.2s;">
                    📊 Ajustar Presupuesto para el Próximo Mes
                </button>
            </div>
        `;

        // Animar barra de salud
        setTimeout(() => {
            const barFill = document.getElementById('health-bar-fill');
            if (barFill) barFill.style.width = health.score + '%';
        }, 300);
    }

    // ─── Generar Asesoría IA ──────────────────────────────────────────────
    async generateVerdict() {
        // --- 🛡️ GUARD: Once-per-week enforcement ---
        const weekKey = this.getWeekKey();
        try {
            const cv = JSON.parse(localStorage.getItem('cc_cfo_verdict'));
            if (cv && cv.week === weekKey) {
                console.log('🛡️ StrategyReport: Analysis already exists for this week. Skipping AI call.');
                this.render(); // Just refresh view to show cached text
                return;
            }
        } catch (e) {}

        if (!this.aiAdvisor || !this.aiAdvisor.hasApiKey()) {
            const box = document.getElementById('cfo-verdict-box');
            if (box) box.innerHTML = '<span style="color:#dc2626; font-weight:600;">⚠️ Conecta tu IA en Configuración para generar el veredicto.</span>';
            return;
        }

        const btn = document.getElementById('generate-verdict-btn');
        const box = document.getElementById('cfo-verdict-box');

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '🕒 Analizando tu semana financiera...';
            btn.style.opacity = '0.7';
        }
        if (box) {
            box.innerHTML = '<div style="display:flex; flex-direction:column; align-items:center; gap:10px; padding:10px; color:#94a3b8;">' +
                '<div class="spinner" style="width:20px; height:20px; border:2px solid #334155; border-top:2px solid #E91E63; border-radius:50%; animation: spin 1s linear infinite;"></div>' +
                '<span>Tu asesor está analizando tus movimientos...</span></div>';
        }

        // ─── Recopilar contextos mensuales y semanales ───
        const { ingresos, gastos, ahorro, deuda, catSpending, budgets, categories } = this.getWeeklyData();

        // Categorías excedidas (Semanal = Mensual / 4)
        const excedidas = [];
        Object.keys(budgets).forEach(catId => {
            const semanalLimit = budgets[catId] / 4;
            const spent = catSpending[catId] || 0;
            if (spent > semanalLimit) {
                const cat = categories.find(c => c.id === catId);
                if (cat) excedidas.push(cat.name);
            }
        });

        const events = this.getWeeklyEvents();
        const health = this.getHealthStatus(events);
        const integrityOk = this.checkIntegrity();
        const averages = this.get4WeekAverages();

        const now = new Date();
        const config = this.store.config || {};
        const monthlySummary = this.store.getFinancialSummary(now.getMonth(), now.getFullYear());

        const weeklyDataForAI = {
            semana: this.getWeekKey(),
            perfil_financiero: config.spending_profile || 'BALANCEADO',
            score_semanal: health.score,
            datos_semana: {
                ingresos: ingresos,
                gastos: gastos,
                balance: ingresos - gastos,
                ahorro: ahorro,
                deuda_pagada: deuda,
                fugas_detectadas: events.rebalances.length,
                categorias_excedidas: excedidas,
                dias_saldo_negativo: events.interventions.length,
            },
            datos_mes_actual: {
                meta_ingreso_total: monthlySummary.income,
                gastos_totales_mes: monthlySummary.expenses + monthlySummary.savings + monthlySummary.investment + monthlySummary.debt_payment,
                disponible_real: monthlySummary.balance_net,
                comprometido_mensual: (config.fixed_expenses || []).reduce((s, fe) => s + fe.amount, 0) + (config.loans || []).reduce((s, l) => s + l.amount, 0)
            },
            contexto_historico: {
                promedio_ingresos_4s: averages.income,
                promedio_gastos_4s: averages.expenses,
                promedio_score_4s: averages.score
            }
        };

        try {
            const verdict = await this.aiAdvisor.getWeeklyCFOVerdict(weeklyDataForAI);
            if (verdict) {
                // Guardar en caché y actualizar histórico de score
                localStorage.setItem('cc_cfo_verdict', JSON.stringify({ week: this.getWeekKey(), text: verdict }));

                try {
                    let history = JSON.parse(localStorage.getItem('cc_score_history') || '[]');
                    if (history.length === 0 || history[history.length - 1] !== health.score) {
                        history.push(health.score);
                        localStorage.setItem('cc_score_history', JSON.stringify(history.slice(-12)));
                    }
                } catch (e) { }

                // 🚀 NUCLEAR UPDATE: Re-render the whole component to reflect consistent state
                this.render();
            }
        } catch (e) {
            console.error('CFO Verdict error:', e);
            if (box) box.innerHTML = `<div style="color:#dc2626; font-size:0.85rem; padding:1rem; background:rgba(220,38,38,0.1); border-radius:8px;">
                <strong>⚠️ Error de conexión:</strong><br>${e.message}
            </div>`;
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '⚡ Reintentar Análisis';
                btn.style.opacity = '1';
            }
        }
    }
}
