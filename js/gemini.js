/**
 * AI Integration Module — Gemini + ChatGPT
 * Calls AI APIs directly from the user's browser.
 * Each user provides their own API key — no server needed.
 */
class AIAdvisor {
    constructor(store) {
        this.store = store;
        this.GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
        this.OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
    }

    getProvider() {
        return this.store.config.ai_provider || 'gemini'; // 'gemini' or 'openai'
    }

    getApiKey() {
        const provider = this.getProvider();
        if (provider === 'openai') {
            return this.store.config.openai_api_key || '';
        }
        return this.store.config.gemini_api_key || '';
    }

    hasApiKey() {
        return this.getApiKey().length > 10;
    }

    /**
     * Build financial context prompt from user data
     */
    buildPrompt(month, year) {
        const summary = this.store.getFinancialSummary(month, year);
        const breakdown = this.store.getCategoryBreakdown(month, year);
        const conf = this.store.config;
        const budgets = conf.budgets || {};
        const goals = this.store.getGoals ? this.store.getGoals() : [];

        const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

        // Build category breakdown text
        let breakdownText = '';
        Object.entries(breakdown).forEach(([name, amount]) => {
            if (amount > 0) {
                const budget = Object.entries(budgets).find(([id]) => {
                    const cat = this.store.categories.find(c => c.id === id);
                    return cat && cat.name === name;
                });
                const budgetAmount = budget ? budgets[budget[0]] : 0;
                const pct = summary.income > 0 ? ((amount / summary.income) * 100).toFixed(1) : '0';
                breakdownText += `  - ${name}: $${amount.toLocaleString('es-CO')} (${pct}% del ingreso)`;
                if (budgetAmount > 0) {
                    const usage = ((amount / budgetAmount) * 100).toFixed(0);
                    breakdownText += ` [Presupuesto: $${budgetAmount.toLocaleString('es-CO')}, Uso: ${usage}%]`;
                }
                breakdownText += '\n';
            }
        });

        // Build goals text
        let goalsText = 'No tiene metas definidas.';
        if (goals.length > 0) {
            goalsText = goals.map(g => {
                const pct = g.target_amount > 0 ? ((g.current_amount / g.target_amount) * 100).toFixed(0) : '0';
                return `  - ${g.name}: $${g.current_amount.toLocaleString('es-CO')} / $${g.target_amount.toLocaleString('es-CO')} (${pct}%)`;
            }).join('\n');
        }

        // Previous month comparison
        let prevMonth = month - 1;
        let prevYear = year;
        if (prevMonth < 0) { prevMonth = 11; prevYear--; }
        const prevSummary = this.store.getFinancialSummary(prevMonth, prevYear);

        const currency = conf.currency || 'COP';

        return `Eres ClarityCoach, un asesor financiero personal certificado. Tu trabajo NO es solo analizar números, sino PROTEGER al usuario de errores financieros y GUIARLO hacia sus metas. Piensa como un coach que genuinamente se preocupa por su cliente.

DATOS FINANCIEROS DE ${monthNames[month]} ${year}:

💰 RESUMEN DEL MES:
  - Ingreso total: $${summary.income.toLocaleString('es-CO')} ${currency}
  - Gastos totales: $${summary.expenses.toLocaleString('es-CO')}
  - Ahorro: $${summary.savings.toLocaleString('es-CO')}
  - Inversión: $${summary.investment.toLocaleString('es-CO')}
  - Pago deudas: $${summary.debt_payment.toLocaleString('es-CO')}
  - Balance neto: $${summary.balance_net.toLocaleString('es-CO')}

📊 DESGLOSE POR CATEGORÍA (con presupuesto si existe):
${breakdownText || '  (Sin datos de categorías)'}

📈 MES ANTERIOR (${monthNames[prevMonth]} ${prevYear}):
  - Ingreso: $${prevSummary.income.toLocaleString('es-CO')}
  - Gastos: $${prevSummary.expenses.toLocaleString('es-CO')}
  - Balance: $${prevSummary.balance_net.toLocaleString('es-CO')}

🎯 METAS DEL USUARIO:
${goalsText}

👤 PERFIL:
  - Ingreso objetivo: $${(conf.monthly_income_target || 0).toLocaleString('es-CO')} /mes
  - Estilo: ${conf.spending_profile || 'BALANCEADO'}
  - Tiene deudas: ${conf.has_debts ? 'Sí, deuda total: $' + (conf.total_debt || 0).toLocaleString('es-CO') : 'No'}

═══════════════════════════════════
INSTRUCCIONES ESTRICTAS PARA TU RESPUESTA:
═══════════════════════════════════

Tu respuesta DEBE seguir EXACTAMENTE esta estructura. No te saltes ninguna sección:

🏥 DIAGNÓSTICO (2-3 oraciones)
Evalúa la salud financiera general. Sé honesto pero motivador. Usa una analogía simple si ayuda.

🚨 ALERTAS TEMPRANAS
Identifica PROBLEMAS que el usuario puede NO estar viendo:
- Si alguna categoría supera el 80% del presupuesto → alerta de que se va a pasar
- Si los gastos van en tendencia ascendente vs mes anterior → advertir
- Si no está ahorrando lo mínimo (10% sin deuda, 5% con deuda) → alerta urgente
- Si gasta más de lo que gana → alerta crítica con plan de emergencia
- Si tiene deuda y no la está pagando agresivamente → estrategia de pago
Incluye MONTOS ESPECÍFICOS. No digas "gasta mucho en X", di "gasta $X en Y, que es Z% más de lo recomendado"

🎯 TUS METAS
Para CADA meta del usuario:
- ¿Cuánto le falta?
- A su ritmo actual, ¿en cuántos meses la logra?
- ¿Qué podría hacer para lograrlo MÁS RÁPIDO? (con montos exactos)
- Si no tiene metas, motívalo a crear una y sugiere un monto realista basado en sus ingresos

💡 PLAN DE ACCIÓN SEMANAL
Da 3-4 acciones MUY CONCRETAS para esta semana. No genéricas. Ejemplos:
- "Reduce tu gasto en [categoría] de $X a $Y — eso son $Z menos al mes que puedes destinar a [meta]"
- "Transfiere $X hoy a tu ahorro antes de que lo gastes"
- "Cancela/reduce [gasto específico] — te libera $X/mes"

📊 COMPARACIÓN CON MES ANTERIOR
- ¿Mejoraste o empeoraste? Sé específico con números.
- ¿Qué categoría subió más? ¿Cuál bajó?
- Felicítalo si mejoró, o motívalo si no.

⚠️ PREVENCIÓN DE DEUDA
- Si NO tiene deuda: felicítalo y recuérdale mantener un fondo de emergencia (3-6 meses de gastos)
- Si SÍ tiene deuda: prioriza el pago. Sugiere método avalancha (pagar primero la más cara) o bola de nieve (la más pequeña primero). Da un plan con montos.

REGLAS DE FORMATO:
- Usa emojis para hacer el texto visual
- NO uses markdown (ni #, ni **, ni *)
- Usa saltos de línea para separar secciones
- Incluye SIEMPRE montos en pesos específicos, no porcentajes vagos
- Máximo 500 palabras
- Tono: profesional pero cercano, como un amigo que sabe de finanzas
- Idioma: español latinoamericano`;
    }

    /**
     * Call AI API (Gemini or OpenAI)
     */
    async getAdvice(month, year) {
        const apiKey = this.getApiKey();
        if (!apiKey) {
            throw new Error('NO_KEY');
        }

        const prompt = this.buildPrompt(month, year);
        const provider = this.getProvider();

        try {
            let text;
            if (provider === 'openai') {
                text = await this._callOpenAI(apiKey, prompt);
            } else {
                text = await this._callGemini(apiKey, prompt);
            }

            if (!text) {
                throw new Error('EMPTY_RESPONSE');
            }

            // Cache the response
            this.cacheResponse(month, year, text);
            return text;

        } catch (err) {
            if (['NO_KEY', 'INVALID_KEY', 'RATE_LIMIT', 'API_ERROR', 'EMPTY_RESPONSE'].includes(err.message)) {
                throw err;
            }
            throw new Error('NETWORK_ERROR');
        }
    }

    async _callGemini(apiKey, prompt) {
        const response = await fetch(`${this.GEMINI_URL}?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
            })
        });

        if (!response.ok) {
            if (response.status === 400 || response.status === 403) throw new Error('INVALID_KEY');
            if (response.status === 429) throw new Error('RATE_LIMIT');
            throw new Error('API_ERROR');
        }

        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    async _callOpenAI(apiKey, prompt) {
        const response = await fetch(this.OPENAI_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: 'Eres un asesor financiero personal experto. Responde en español.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.7,
                max_tokens: 1024
            })
        });

        if (!response.ok) {
            if (response.status === 401) throw new Error('INVALID_KEY');
            if (response.status === 429) throw new Error('RATE_LIMIT');
            throw new Error('API_ERROR');
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content || '';
    }

    /**
     * Cache response to avoid unnecessary API calls
     */
    cacheResponse(month, year, text) {
        const key = `cc_ai_${year}_${month}`;
        const data = { text, timestamp: Date.now(), provider: this.getProvider() };
        localStorage.setItem(key, JSON.stringify(data));
    }

    /**
     * Get cached response if less than 24 hours old
     */
    getCachedResponse(month, year) {
        const key = `cc_ai_${year}_${month}`;
        const raw = localStorage.getItem(key);
        if (!raw) return null;

        try {
            const data = JSON.parse(raw);
            const hoursOld = (Date.now() - data.timestamp) / (1000 * 60 * 60);
            if (hoursOld < 24) {
                return data.text;
            }
        } catch (e) { /* invalid cache */ }
        return null;
    }
}
