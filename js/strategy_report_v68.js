/**
 * STRATEGY REPORT v68 — Veredicto Semanal del CFO
 * Vista de Diagnóstico y Auditoría Financiera
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

    // ─── Leer eventos de la semana actual ──────────────────────────────────
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
        const total = events.interventions.length + events.rebalances.length;
        if (total === 0) return { color: '#2E7D32', bg: '#E8F5E9', label: '🟢 Disciplina Óptima', score: 100 };
        if (total <= 2) return { color: '#E65100', bg: '#FFF3E0', label: '🟡 Atención Requerida', score: 65 };
        return { color: '#C62828', bg: '#FFEBEE', label: '🔴 Riesgo Financiero', score: 30 };
    }

    // ─── Render principal ──────────────────────────────────────────────────
    render() {
        const events = this.getWeeklyEvents();
        const health = this.getHealthStatus(events);
        const integrityOk = this.checkIntegrity();
        const weekKey = this.getWeekKey();

        // ¿Ya hay veredicto cacheado esta semana?
        let cachedVerdict = null;
        try {
            const cv = JSON.parse(localStorage.getItem('cc_cfo_verdict'));
            if (cv && cv.week === weekKey) cachedVerdict = cv.text;
        } catch (e) { }

        // Calcular fugas totales
        const totalLeaked = events.rebalances.reduce((s, r) => s + (r.amount || 0), 0);
        const fmt = (n) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);

        // Generar tabla de rebalanceos
        const rebalanceRows = events.rebalances.length > 0
            ? events.rebalances.map(r => `
                <div style="display:flex; justify-content:space-between; align-items:center; padding: 10px 0; border-bottom: 1px solid var(--border-color, #f0f0f0); font-size:0.85rem;">
                    <div>
                        <span style="color:#C62828; font-weight:600;">${r.fromCat || 'Ocio'}</span>
                        <span style="color:#999; margin: 0 6px;">→</span>
                        <span style="color:#1565C0; font-weight:600;">${r.toCat || 'Otro'}</span>
                    </div>
                    <span style="font-weight:700; color:#E65100;">${fmt(r.amount || 0)}</span>
                </div>
            `).join('')
            : `<p style="color:#999; font-size:0.85rem; text-align:center; padding:12px 0;">✅ Sin fugas de capital esta semana.</p>`;

        // Generar lista de intervenciones
        const interventionRows = events.interventions.length > 0
            ? events.interventions.map(i => `
                <div style="display:flex; justify-content:space-between; align-items:center; padding: 8px 0; border-bottom: 1px solid var(--border-color, #f0f0f0); font-size:0.85rem;">
                    <span style="color:#555;">Saldo negativo en <b>${i.account || 'cuenta'}</b></span>
                    <span style="font-weight:700; color:#C62828;">${fmt(i.amount || 0)}</span>
                </div>
            `).join('')
            : `<p style="color:#999; font-size:0.85rem; text-align:center; padding:12px 0;">✅ Sin incidentes de saldo negativo.</p>`;

        this.container.innerHTML = `
            <div style="max-width: 480px; margin: 0 auto; padding: 0 0 100px 0;">
                
                <!-- WIDGET DE SALUD -->
                <div style="background: ${health.bg}; border-radius: 20px; padding: 24px; margin-bottom: 20px; text-align:center; border: 2px solid ${health.color}30;">
                    <div style="font-size: 2.5rem; margin-bottom: 8px;">
                        ${health.score === 100 ? '🏆' : health.score >= 65 ? '⚠️' : '🚨'}
                    </div>
                    <div style="font-size:1.1rem; font-weight:800; color:${health.color}; margin-bottom:4px;">${health.label}</div>
                    <div style="font-size:0.8rem; color:${health.color}; opacity:0.8;">Semana ${weekKey}</div>
                    
                    <!-- Barra visual -->
                    <div style="background:${health.color}20; border-radius:20px; height:8px; margin:14px 0; overflow:hidden;">
                        <div style="background:${health.color}; height:100%; width:${health.score}%; border-radius:20px; transition: width 1s ease;"></div>
                    </div>
                    <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; text-align:center; margin-top:8px;">
                        <div style="background:white; border-radius:10px; padding:8px;">
                            <div style="font-size:1.2rem; font-weight:800; color:${health.color};">${events.rebalances.length}</div>
                            <div style="font-size:0.65rem; color:#888; text-transform:uppercase;">Rebalanceos</div>
                        </div>
                        <div style="background:white; border-radius:10px; padding:8px;">
                            <div style="font-size:1.2rem; font-weight:800; color:${health.color};">${events.interventions.length}</div>
                            <div style="font-size:0.65rem; color:#888; text-transform:uppercase;">Incidentes</div>
                        </div>
                        <div style="background:white; border-radius:10px; padding:8px;">
                            <div style="font-size:1.2rem; font-weight:800; color:${integrityOk ? '#2E7D32' : '#C62828'};">${integrityOk ? '✓' : '✗'}</div>
                            <div style="font-size:0.65rem; color:#888; text-transform:uppercase;">Blindado</div>
                        </div>
                    </div>
                </div>

                <!-- FUGAS DE CAPITAL -->
                <div style="background:var(--bg-surface, white); border-radius:16px; padding:18px; margin-bottom:16px; box-shadow: 0 2px 12px rgba(0,0,0,0.06);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                        <h4 style="margin:0; font-size:0.9rem; font-weight:700; color:var(--text-main, #1e293b);">💸 Fugas de Capital</h4>
                        ${totalLeaked > 0 ? `<span style="font-size:0.8rem; font-weight:700; color:#C62828;">${fmt(totalLeaked)} total</span>` : ''}
                    </div>
                    ${rebalanceRows}
                </div>

                <!-- INCIDENTES DE INTEGRIDAD -->
                <div style="background:var(--bg-surface, white); border-radius:16px; padding:18px; margin-bottom:16px; box-shadow: 0 2px 12px rgba(0,0,0,0.06);">
                    <h4 style="margin:0 0 12px 0; font-size:0.9rem; font-weight:700; color:var(--text-main, #1e293b);">🛡️ Incidentes de Saldo Negativo</h4>
                    ${interventionRows}
                </div>

                <!-- VEREDICTO DEL CFO -->
                <div style="background: linear-gradient(135deg, #1a1a2e, #16213e); border-radius:20px; padding:20px; margin-bottom:16px;">
                    <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px;">
                        <span style="font-size:1.5rem;">🧠</span>
                        <div>
                            <div style="color:white; font-weight:800; font-size:0.95rem;">Veredicto del CFO</div>
                            <div style="color:#888; font-size:0.72rem;">Análisis estratégico semanal por IA</div>
                        </div>
                    </div>
                    
                    <div id="cfo-verdict-box" style="background:rgba(255,255,255,0.06); border-radius:12px; padding:14px; min-height:80px; color:#e2e8f0; font-size:0.88rem; line-height:1.6;">
                        ${cachedVerdict
                ? `<span id="cfo-text">${cachedVerdict}</span>`
                : `<span style="color:#555; font-size:0.82rem;">Toca "Generar Veredicto" para que la IA analice tu semana.</span>`
            }
                    </div>

                    ${cachedVerdict ? `
                        <div style="margin-top:8px; font-size:0.7rem; color:#555; text-align:right;">✓ Cachéado esta semana</div>
                    ` : `
                        <button id="generate-verdict-btn" onclick="window.strategyReport.generateVerdict()" 
                            style="width:100%; margin-top:14px; padding:12px; background:linear-gradient(135deg, #E91E63, #9C27B0); color:white; border:none; border-radius:12px; font-weight:700; font-size:0.9rem; cursor:pointer; transition: opacity 0.2s;">
                            ⚡ Generar Veredicto
                        </button>
                    `}
                </div>

                <!-- BOTÓN AJUSTAR PRESUPUESTO -->
                <button onclick="document.querySelector('[data-view=settings]').click()" 
                    style="width:100%; padding:14px; background:var(--bg-surface, white); border:2px solid #E91E63; color:#E91E63; border-radius:16px; font-weight:700; font-size:0.95rem; cursor:pointer;">
                    📊 Ajustar Presupuesto para el Próximo Mes
                </button>
            </div>
        `;

        // Animar barra de salud
        setTimeout(() => {
            const bar = this.container.querySelector('[style*="width:' + health.score + '%"]');
            if (bar) bar.style.width = health.score + '%';
        }, 100);
    }

    // ─── Generar Veredicto IA ──────────────────────────────────────────────
    async generateVerdict() {
        if (!this.aiAdvisor || !this.aiAdvisor.hasApiKey()) {
            const box = document.getElementById('cfo-verdict-box');
            if (box) box.innerHTML = '<span style="color:#C62828;">⚠️ Conecta tu IA en Configuración para generar el veredicto.</span>';
            return;
        }

        const btn = document.getElementById('generate-verdict-btn');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Analizando...'; }

        const events = this.getWeeklyEvents();
        const integrityOk = this.checkIntegrity();
        const totalLeaked = events.rebalances.reduce((s, r) => s + (r.amount || 0), 0);

        const weeklyData = {
            semana: this.getWeekKey(),
            rebalanceos: events.rebalances.length,
            fugas_capital_total: totalLeaked,
            fugas_detalle: events.rebalances.map(r => `${r.fromCat} → ${r.toCat}: $${r.amount?.toLocaleString()}`),
            incidentes_saldo_negativo: events.interventions.length,
            intocables_blindados: integrityOk
        };

        try {
            const verdict = await this.aiAdvisor.getWeeklyCFOVerdict(weeklyData);
            if (verdict) {
                // Guardar en caché
                localStorage.setItem('cc_cfo_verdict', JSON.stringify({ week: this.getWeekKey(), text: verdict }));

                // Mostrar con efecto typewriter
                const box = document.getElementById('cfo-verdict-box');
                if (box) {
                    box.innerHTML = '<span id="cfo-text"></span>';
                    const textEl = document.getElementById('cfo-text');
                    let i = 0;
                    const interval = setInterval(() => {
                        if (i < verdict.length) {
                            textEl.textContent += verdict[i];
                            i++;
                        } else {
                            clearInterval(interval);
                            // Mostrar indicador de caché y ocultar botón
                            if (btn) btn.remove();
                            box.insertAdjacentHTML('afterend', '<div style="margin-top:8px; font-size:0.7rem; color:#555; text-align:right;">✓ Cachéado esta semana</div>');
                        }
                    }, 18);
                }
            }
        } catch (e) {
            console.error('CFO Verdict error:', e);
            const box = document.getElementById('cfo-verdict-box');
            if (box) box.innerHTML = '<span style="color:#C62828;">Error al generar el veredicto. Inténtalo de nuevo.</span>';
            if (btn) { btn.disabled = false; btn.textContent = '⚡ Generar Veredicto'; }
        }
    }
}
