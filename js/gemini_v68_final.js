/**
 * AI Integration Module — Gemini + ChatGPT
 * Calls AI APIs directly from the user's browser.
 * Each user provides their own API key — no server needed.
 */
class AIAdvisor {
    constructor(store) {
        this.store = store;
        this.GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
        this.OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
    }

    getProvider() {
        return 'gemini'; // Force Gemini as the only provider since dev is paying
    }

    getApiKey() {
        // En la arquitectura v68.FINAL-8 (Firebase Proxy) la llave ya NO vive en el frontend.
        // Siempre retornamos un código dummy para mantener la compatibilidad del UI,
        // ya que la llave real ahora vive oculta en Google Cloud Secret Manager.
        return "PROXY_ACTIVE_HIDDEN_KEY";
    }

    hasApiKey() {
        // En la arquitectura v68.FINAL-9 la IA está integrada de fábrica.
        return true;
    }

    /**
     * AI Auto-Trigger Analysis on new transaction
     * Includes "Gasto Hormiga" API-saving cache
     */
    async analyzeTransaction(tx) {
        // En la versión PRO integrada, siempre está activo.
        const apiKey = this.getApiKey();
        if (!apiKey) return null;

        // "Gasto Hormiga" Pattern Cache Logic
        // If the user logs the EXACT SAME amount and category consecutively within 5 minutes
        const cacheKey = `${tx.amount}_${tx.category_id}`;
        const now = Date.now();

        if (!this.hormigaCache) this.hormigaCache = { key: '', count: 0, time: 0, response: null };

        if (this.hormigaCache.key === cacheKey && (now - this.hormigaCache.time) < 5 * 60 * 1000) {
            this.hormigaCache.count++;
            this.hormigaCache.time = now;

            if (this.hormigaCache.count === 2 && this.hormigaCache.response) {
                console.log("🤖 IA Caché: Usando análisis anterior para ahorrar tokens (Gasto repetido detectado localmente)");
                return this.hormigaCache.response;
            }
            // If hits 3+, falls through to hit API to trigger "Gasto Hormiga" cumulative logic in prompt
        } else {
            this.hormigaCache = { key: cacheKey, count: 1, time: now, response: null };
        }

        // Minimal Context Building
        const dateObj = new Date(tx.date);
        const month = dateObj.getMonth();
        const year = dateObj.getFullYear();
        const summary = this.store.getFinancialSummary(month, year);

        const cat = this.store.categories.find(c => c.id === tx.category_id);
        const catName = cat ? cat.name : 'Otra';
        const budgetAmount = parseFloat(this.store.config.budgets?.[tx.category_id]) || 0;

        const startOfMonth = new Date(year, month, 1).toISOString();
        const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59).toISOString();
        const spent = this.store.transactions
            .filter(t => t.category_id === tx.category_id && t.type === 'GASTO' && t.date >= startOfMonth && t.date <= endOfMonth)
            .reduce((sum, t) => sum + parseFloat(t.amount), 0);

        const last3 = this.store.transactions
            .filter(t => t.id !== tx.id)
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 3);

        const last3Str = last3.map(t => {
            const c = this.store.categories.find(cat => cat.id === t.category_id);
            return `- ${t.type}: $${t.amount} en ${c ? c.name : 'N/A'}`;
        }).join('\\n');

        const prompt = `NUEVO MOVIMIENTO REGISTRADO:
- Monto: $${tx.amount}
- Tipo: ${tx.type}
- Categoría: ${catName}
- Nota: ${tx.note || 'Sin nota'}
- ADVERTENCIA INTERNA: Este mismo gasto exacto se ha registrado ${this.hormigaCache.count} veces en los últimos 5 minutos.

CONTEXTO DEL MES:
- Presupuesto total de ${catName}: $${budgetAmount}
- Gastado hasta ahora en ${catName} (incluyendo este gasto): $${spent}
- Balance Neto del Mes: $${summary.balance_net}

ÚLTIMOS 3 MOVIMIENTOS HISTÓRICOS:
${last3Str || 'Ninguno'}`;

        try {
            const rawText = await this._callGemini(apiKey, prompt);

            // 1. Clean the response thoroughly
            let cleanText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();

            // 2. Extract only the JSON part (find first { and last })
            const firstBrace = cleanText.indexOf('{');
            const lastBrace = cleanText.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace >= firstBrace) {
                cleanText = cleanText.substring(firstBrace, lastBrace + 1);
            }

            // 3. One more check: sanitize unescaped newlines inside strings that might break parsing
            cleanText = cleanText.replace(/\n/g, '\\n').replace(/\r/g, '');
            // Let JSON.parse handle it now, but first revert the strictly necessary ones for structure
            cleanText = cleanText.replace(/\\n"/g, '"').replace(/"\\n/g, '"').replace(/,\s*\\n/g, ',').replace(/\{\s*\\n/g, '{').replace(/\[\s*\\n/g, '[').replace(/\\n\s*\}/g, '}').replace(/\\n\s*\]/g, ']');

            const jsonResponse = JSON.parse(cleanText);

            this.hormigaCache.response = jsonResponse;
            return jsonResponse;
        } catch (e) {
            const keySuffix = apiKey ? apiKey.slice(-4) : 'NONE';
            console.error("AI Auto-Analyze Error (JSON Parse Failed):", e);
            // Si falla el parseo, devolver un objeto mínimo seguro para no romper la UI
            return {
                is_hormiga: false,
                is_overbudget: false,
                is_alert: true,
                trigger_reason: "Error procesando IA",
                advice_text: "Hubo un error interpretando mi análisis. Revisa tu presupuesto manualmente."
            };
        }
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

        return `Eres ClarityCoach, un Asesor Financiero Personal y Educador. Tu trabajo NO es solo analizar números, sino EDUCAR al usuario, protegerlo de errores financieros y guiarlo hacia sus metas de forma clara y sencilla. Usa un tono pedagógico. NO uses palabras alarmistas como "crítico" o "graves". Muestra empatía.

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
- Si no está ahorrando lo mínimo (10% sin deuda, 5% con deuda) → sugiere cómo empezar a hacerlo
- Si gasta más de lo que gana → alerta con un plan de ajuste manejable
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

⚠️ PREVENCIÓN DE DEUDA Y REBALANCEO (REGLAS ESTRICTAS):
- PROTECCIÓN DE INTOCABLES: NUNCA sugieras usar dinero destinado a Gastos Fijos, Deudas o Ahorro para cubrir gastos variables. Esto está estrictamente prohibido.
- REGLA DE REBALANCEO (LA ESCALERA DE SACRIFICIO): Ante cualquier exceso de gasto en una categoría, debes sugerir "coger dinero" de otras categorías en este orden estricto:
  1. Ocio
  2. Alcohol/Tabaco
  3. Café/Snacks
- Si NO tiene deuda: felicítalo y recuérdale mantener un fondo de emergencia (3-6 meses de gastos)
- Si SÍ tiene deuda: prioriza el pago. Sugiere método avalancha (pagar primero la más cara) o bola de nieve (la más pequeña primero). Da un plan con montos.

REGLAS DE FORMATO:
- Usa emojis para hacer el texto visual
- NO uses markdown (ni #, ni **, ni *)
- Usa saltos de línea para separar secciones
- Incluye SIEMPRE montos en pesos específicos, no porcentajes vagos
- Máximo 500 palabras
- Tono: pedagógico, educativo, optimista y cercano, como un muy buen maestro de finanzas
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
        const systemInstruction = `Eres un Analista Estratégico Senior y CFO Virtual. Tu misión es analizar cada transacción de Clarity Cash en milisegundos.
Razonamiento: Si el gasto rompe una tendencia o pone en riesgo el presupuesto mensual, genera una alerta inmediata.
Personalidad: Profesional, empática y técnica. No uses frases genéricas; usa datos.
Formato de salida: Responde siempre en formato JSON para que la app pueda mostrar notificaciones visuales o actualizar gráficos automáticamente.
Esquema Obligatorio:
{
  "alerta": boolean,
  "categoria": string,
  "analisis_cfo": string,
  "nivel_riesgo": 1-5
}`;

        // Determinar URL de enrutamiento basado en Arquitectura Proxy
        const conf = this.store && this.store.config ? this.store.config : {};

        // Fallback al projectId de firebase-config.js si no hay uno personalizado en el store
        const projectId = conf.firebase_project_id || (window.firebaseConfig ? window.firebaseConfig.projectId : 'claritycash-e93ca');

        if (!projectId) {
            throw new Error("PROXY_MISSING: Falta el Project ID de Firebase.");
        }

        const PROXY_URL = `https://us-central1-${projectId}.cloudfunctions.net/proxyGemini`;

        // Payload enviado al Proxy (el proxy se encarga de empaquetar en el JSON estricto de Google)
        const proxyPayload = {
            model: "gemini-2.5-flash",
            contents: [{ parts: [{ text: `${systemInstruction}\n\n---\n\n${prompt}` }] }],
            generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 1024
            }
        };

        const response = await fetch(PROXY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(proxyPayload)
        });

        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({}));
            const errorMessage = errorBody.error?.message || response.statusText;

            if (response.status === 400 || response.status === 403) throw new Error(`INVALID_KEY: ${errorMessage}`);
            if (response.status === 429) throw new Error('RATE_LIMIT');
            if (response.status === 404) throw new Error(`PROXY_NOT_FOUND: Asegúrate de haber desplegado Firebase Functions. Detalle: ${response.statusText}`);
            throw new Error(`API_ERROR: ${errorMessage}`);
        }

        const data = await response.json();
        const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        return textResponse;
    }

    /**
     * Test the API connection status
     */
    /**
     * Test the API connection status
     */
    async checkConnection(explicitKey = null) {
        const apiKey = explicitKey || this.getApiKey();

        if (!apiKey || apiKey.length < 10) throw new Error('No hay API Key configurada o es muy corta');

        const provider = this.getProvider();

        try {
            if (provider === 'openai') {
                await this._callOpenAI(apiKey, 'Hola, responde con un OK.');
            } else {
                await this._callGemini(apiKey, 'Hola, responde con un OK.');
            }
            return true;
        } catch (error) {
            console.error("Connection Check Failed:", error);
            throw error;
        }
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

    async getConsultation(context) {
        if (!this.hasApiKey()) {
            return "⚠️ Configura tu API Key en Ajustes para recibir consejos personalizados.";
        }

        const apiKey = this.getApiKey();

        let role = "Analista Estratégico Senior";
        let strategy = "Analiza la situación con rigor y da directrices claras, no consejos suaves.";

        if (context.problem && context.problem.includes('DEFICIT')) {
            role = "Experto en Crisis y Reestructuración de Deudas";
            strategy = "El usuario está en DÉFICIT. Su casa financiera está en llamas. Tu objetivo es apagar el fuego con medidas de choque inmediatas. Prioriza liquidez y supervivencia.";
        } else if (context.problem === 'WARNING') {
            role = "Coach de Hábitos y Ahorro";
            strategy = "El usuario vive al día. Su riesgo es alto ante cualquier imprevisto. Tu objetivo es despertarlo y encontrar fugas de dinero para crear un colchón de seguridad.";
        } else if (context.problem === 'SURPLUS') {
            role = "Gestor de Patrimonio e Inversiones";
            strategy = "El usuario tiene dinero extra (Superávit). Tu objetivo es que NO se lo gaste en tonterías. Sugiérele estrategias de crecimiento.";
        }

        const prompt = `
            ROL: ${role}
            ESTRATEGIA: ${strategy}
            DIAGNÓSTICO DEL PACIENTE (DATOS REALES):
            ${context.full_context}
            
            TU MISIÓN: Genera un diagnóstico estratégico corto de máximo 400 caracteres.
        `;

        try {
            return await this._callGemini(apiKey, prompt);
        } catch (error) {
            console.error(error);
            throw error;
        }
    }

    /**
     * Cache response to avoid unnecessary API calls
     */
    cacheResponse(month, year, text) {
        const key = `cc_ai_v65_${year}_${month}_${this.getProvider()}`; // Provider-aware cache
        const data = { text, timestamp: Date.now() };
        localStorage.setItem(key, JSON.stringify(data));
    }

    /**
     * Get cached response if less than 24 hours old
     */
    getCachedResponse(month, year) {
        const key = `cc_ai_v65_${year}_${month}_${this.getProvider()}`;
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

    /**
     * Scan a receipt image/PDF using Multimodal AI
     * @param {string} base64Data - Raw base64 string
     * @param {string} mimeType - e.g. "image/jpeg" or "application/pdf"
     * @returns {Promise<Object>} Extracted data
     */
    async scanReceipt(base64Data, mimeType = 'image/jpeg') {
        if (!this.hasApiKey()) {
            throw new Error('Primero configura tu API Key en Ajustes para recibir consejos personalizados.');
        }

        const apiKey = this.getApiKey();
        const prompt = `Extrae datos de factura en JSON: date, amount (number), merchant, category, note.`;

        try {
            const conf = this.store && this.store.config ? this.store.config : {};
            const projectId = conf.firebase_project_id || '';
            const PROXY_URL = `https://us-central1-${projectId}.cloudfunctions.net/proxyGemini`;

            const response = await fetch(PROXY_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: prompt },
                            { inline_data: { mime_type: mimeType, data: base64Data } }
                        ]
                    }]
                })
            });

            const data = await response.json();
            if (data.error) throw new Error(data.error.message);
            const text = data.candidates[0].content.parts[0].text;
            return JSON.parse(text.replace(/```json|```/g, '').trim());
        } catch (error) {
            console.error('AI Scan Error:', error);
            throw new Error(`Aviso de IA: ${error.message}`);
        }
    }

    /**
     * REACTIVE AI: Instant feedback on a new transaction
     * Called immediately after user adds an expense/income
     */
    async getInstantInsight(tx, categoryParams) {
        if (!this.hasApiKey()) return null;

        // --- RATE LIMITING (Stabilization v68.I) ---
        const now = Date.now();
        if (this.lastInsightTime && (now - this.lastInsightTime < 12000)) {
            console.log('⏳ AI Cooling down...');
            return null; // Skip if called within 12 seconds
        }
        this.lastInsightTime = now;

        const apiKey = this.getApiKey();
        const provider = this.getProvider();
        const { catName, catTotal, budgetLimit, isOverBudget, triggerReason } = categoryParams;

        // Personality: Strategic Senior Analyst (Direct, strict, risk-aware)
        const prompt = `
            ACTÚA COMO: Un Analista Estratégico Senior y CFO Virtual. Eres directo, riguroso y señalas riesgos sin complacencia.
            CONTEXTO: El usuario acaba de registrar un GASTO nuevo y ha activado una alerta: [${triggerReason || 'N/A'}].
            
            DATOS DEL GASTO:
            - Monto: $${tx.amount.toLocaleString()}
            - Categoría: ${catName}
            - Nota: "${tx.note || ''}"
            
            ESTADO FINANCIERO ACTUAL DE ESA CATEGORÍA:
            - Total gastado este mes (incluyendo este): $${catTotal.toLocaleString()}
            - Límite Presupuesto: $${budgetLimit > 0 ? budgetLimit.toLocaleString() : 'No definido'}
            - ALERTA ACTIVADA: ${triggerReason ? triggerReason : (isOverBudget ? 'SOBREGIRO' : 'Ninguna grave')}
            
            TU MISIÓN:
            Genera una reacción educativa (Máximo 2-3 oraciones cortas) para enviarle una notificación push (Toast).
            
            REGLAS DE TONO Y LÓGICA:
            - Sé directo y profesional. Elimina la complacencia. No uses sarcasmo.
            - Si es un gasto innecesario → Señala el riesgo para sus finanzas y aplica la "Escalera de Sacrificio": sugiere recortar primero de Ocio, luego Alcohol/Tabaco, y luego Café/Snacks para compensarlo.
            - Si rompió el presupuesto → Da una directriz clara de ajuste inmediato. PROHIBIDO sugerir tocar Ahorros, Gastos Fijos o pago de Deudas.
            - Si es un gasto alto → Señala con firmeza el impacto si no fue planeado.
            - Si es un gasto necesario/bien planeado → Valídalo de forma breve y técnica.
            - Usa emojis con moderación.
            - Habla en español profesional y directo.
            - NO saludes. Ve al grano inmediatamente.
            
            SALIDA ESPERADA:
            Solo el texto de la notificación.
        `;

        try {
            let text = "";
            if (provider === 'openai') {
                const response = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                    body: JSON.stringify({
                        model: "gpt-4o-mini", // Fast model
                        messages: [{ role: "user", content: prompt }],
                        max_tokens: 60,
                        temperature: 0.8 // Creative
                    })
                });

                if (response.status === 429) return "🧠 Cerebro ocupado... dame un segundo.";
                if (!response.ok) return null;

                const data = await response.json();
                text = data.choices[0].message.content;
            } else {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: { maxOutputTokens: 60, temperature: 0.8 }
                    })
                });

                if (response.status === 429) return "🧠 Cerebro ocupado... dame un segundo.";
                if (!response.ok) return null;

                const data = await response.json();
                text = data.candidates[0].content.parts[0].text;
            }
            return text.replace(/"/g, '').trim(); // Clean quotes

        } catch (error) {
            console.error("Instant Insight Error:", error);
            return null; // Silent fail
        }
    }

    /**
     * REACTIVE AI: Negative Balance Intervention
     * Called when the user attempts a transaction that drops balance below zero.
     */
    async getNegativeBalanceInsight(tx, account, categories) {
        if (!this.hasApiKey()) {
            return `"Oye, estás intentando registrar un gasto de $${tx.amount.toLocaleString()} desde la cuenta ${account.name}, pero esa cuenta solo tiene $${account.current_balance.toLocaleString()}. Los activos NO pueden ser negativos. ¿De dónde salió realmente este dinero?"`;
        }

        const apiKey = this.getApiKey();
        const provider = this.getProvider();
        const catName = categories.find(c => c.id === tx.category_id)?.name || 'Otra';

        const prompt = `
            ACTÚA COMO: Un Analista Estratégico Senior y CFO Virtual. Eres directo, riguroso y señalas riesgos sin complacencia.
            CONTEXTO: El usuario está intentando registrar un gasto que dejará su cuenta en NEGATIVO (números rojos), lo cual es financieramente imposible para el activo seleccionado (no es tarjeta de crédito).
            
            DATOS DEL INTENTO DE GASTO:
            - Monto intentado: $${tx.amount.toLocaleString()}
            - Categoría del gasto: ${catName}
            - Cuenta Origen: ${account.name} (Saldo real disponible: $${account.current_balance.toLocaleString()})
            - Déficit generado: $${Math.abs(account.current_balance - tx.amount).toLocaleString()}
            
            TU MISIÓN:
            Escribe el texto de intervención (2-3 oraciones como máximo) para detener al usuario.
            
            REGLAS DE TONO Y LÓGICA:
            1. Señala el error matemático/lógico (no se puede gastar más de lo que hay en esa cuenta).
            2. Aplica la "Jerarquía de Sacrificio" si es relevante: Si este gasto fue en Ocio, Alcohol/Tabaco, o Café/Snacks, cuestiona la necesidad del mismo frente al déficit.
            3. Pregunta "¿De dónde salió realmente este dinero? ¿Es una deuda que no has registrado?".
            4. Sé muy directo, como un auditor financiero. Elimina la complacencia.
            5. Habla en español profesional. No saludes. Letra normal sin formato markdown. Usa máximo un emoji.
            
            SALIDA ESPERADA:
            Solo el texto de la intervención.
        `;

        try {
            let text = "";
            if (provider === 'openai') {
                const response = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                    body: JSON.stringify({
                        model: "gpt-4o-mini",
                        messages: [{ role: "user", content: prompt }],
                        max_tokens: 150,
                        temperature: 0.7
                    })
                });

                if (!response.ok) throw new Error('API Error');
                const data = await response.json();
                text = data.choices[0].message.content;
            } else {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: { maxOutputTokens: 150, temperature: 0.7 }
                    })
                });

                if (!response.ok) throw new Error('API Error');
                const data = await response.json();
                text = data.candidates[0].content.parts[0].text;
            }
            return text.replace(/"/g, '').trim();

        } catch (error) {
            console.error("Negative Insight Error:", error);
            return `"Oye, estás intentando registrar un gasto de $${tx.amount.toLocaleString()} desde la cuenta ${account.name}, pero esa cuenta solo tiene $${account.current_balance.toLocaleString()}. Los activos NO pueden ser negativos. ¿De dónde salió realmente este dinero?"`;
        }
    }

    /**
     * REACTIVE AI: Overbudget / Rebalance Intervention
     */
    async getOverbudgetInsight(catName, excessAmount, surplusCats) {
        if (!this.hasApiKey()) {
            return `"Te has pasado por $${excessAmount.toLocaleString()} en ${catName}. ¿Quieres cubrirlo prestado del dinero sobrante de otra categoría?"`;
        }

        const apiKey = this.getApiKey();
        const provider = this.getProvider();

        let surplusText = "No tienes categorías con saldo a favor.";
        if (surplusCats && surplusCats.length > 0) {
            surplusText = surplusCats.map(c => `- ${c.name}: Sobra $${c.surplus.toLocaleString()}`).join('\n');
        }

        const prompt = `
            ACTÚA COMO: Un Analista Estratégico Senior y CFO Virtual. Riguroso y directo.
            CONTEXTO: El usuario acaba de registrar un gasto que rompió su presupuesto mensual en la categoría "${catName}" por un exceso de $${excessAmount.toLocaleString()}.
            
            OPCIONES DE REBALANCEO DISPONIBLES (Categorías que aún tienen dinero):
            ${surplusText}
            
            TU MISIÓN:
            Escribe un mensaje de intervención corto (2-3 líneas) para mostrarle en un popup de "Rebalanceo de Presupuesto".
            
            REGLAS DE LÓGICA (JERARQUÍA DE SACRIFICIO):
            1. Reprende profesionalmente el exceso en "${catName}".
            2. Revisa la lista de OPCIONES DE REBALANCEO. Si ves "Ocio", "Alcohol/Tabaco" o "Café/Snacks" en esa lista, DEBES EXIGIR que saque el dinero de allí para cubrir el exceso. Ese es el orden estricto de sacrificio.
            3. Si no están esas categorías superfluas, pregúntale de cuál categoría vital prefiere "robar" el dinero para tapar el hueco.
            4. Tono directo, sin complacencia. NADA de markdown.
            
            SALIDA ESPERADA:
            Solo el texto del mensaje.
        `;

        try {
            let text = "";
            if (provider === 'openai') {
                const response = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                    body: JSON.stringify({
                        model: "gpt-4o-mini",
                        messages: [{ role: "user", content: prompt }],
                        max_tokens: 150,
                        temperature: 0.7
                    })
                });
                if (!response.ok) throw new Error('API Error');
                const data = await response.json();
                text = data.choices[0].message.content;
            } else {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: { maxOutputTokens: 150, temperature: 0.7 }
                    })
                });
                if (!response.ok) throw new Error('API Error');
                const data = await response.json();
                text = data.candidates[0].content.parts[0].text;
            }
            return text.replace(/"/g, '').trim();

        } catch (error) {
            console.error("Overbudget Insight Error:", error);
            return `"Te has pasado por $${excessAmount.toLocaleString()} en ${catName}. ¿Quieres cubrirlo prestado del dinero sobrante de otra categoría?"`;
        }
    }

    /**
     * WEEKLY CFO VERDICT — Diagnóstico Estratégico Semanal
     */
    async getWeeklyCFOVerdict(weeklyData) {
        const apiKey = this.config.gemini_api_key || this.config.openai_api_key;
        if (!apiKey) throw new Error('No API key configured');

        const systemPrompt = `Eres el CFO de ClarityCash: un Analista Estratégico Senior de finanzas personales.
Tu misión es guiar decisiones financieras de forma clara, cercana y pedagógica.
70% análisis con datos reales + 30% motivación sobria.
Lenguaje simple, sin tecnicismos (no usar "superávit/déficit").
No dramatices (evita "crítico", "peligro").
No inventes cifras: usa solo los datos entregados. Si faltan datos, dilo y da una recomendación educativa breve.
Enfócate en dirección: qué debe hacer el usuario la próxima semana.
Señala 1 foco principal (categoría/patrón) y da 2 acciones concretas.

Restricciones:
- Máximo 220 palabras.
- Responde SIEMPRE con esta estructura:
  Diagnóstico de la semana
  Riesgos detectados
  Recomendaciones para la próxima semana
  Mensaje final

Además:
- Evalúa coherencia con el perfil financiero declarado (Conservador/Balanceado/Flexible).
- Compara la semana actual con los promedios de las últimas 4 semanas.`;

        const userPrompt = `Aquí están los datos financieros semanales del usuario (incluye perfil, score, fugas, incidentes, categorías excedidas, ingresos/gastos/balance, y promedios 4 semanas):
${JSON.stringify(weeklyData, null, 2)}`;

        try {
            let text = '';
            const proxyUrl = this.config.firebase_project_id
                ? `https://us-central1-${this.config.firebase_project_id}.cloudfunctions.net/geminiProxy`
                : null;

            if (proxyUrl) {
                const response = await fetch(proxyUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt: `${systemPrompt}\n\n${userPrompt}`, maxTokens: 1000 })
                });
                if (!response.ok) throw new Error('Proxy Error');
                const data = await response.json();
                text = data.result || data.text || '';
            } else if (this.config.ai_provider === 'openai' && this.config.openai_api_key) {
                const response = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.config.openai_api_key}` },
                    body: JSON.stringify({
                        model: 'gpt-4o-mini',
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: userPrompt }
                        ],
                        max_tokens: 1000, temperature: 0.7
                    })
                });
                if (!response.ok) throw new Error('API Error');
                const data = await response.json();
                text = data.choices[0].message.content;
            } else {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [
                            { role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }
                        ],
                        generationConfig: { maxOutputTokens: 1000, temperature: 0.7 }
                    })
                });
                if (!response.ok) throw new Error('API Error');
                const data = await response.json();
                text = data.candidates[0].content.parts[0].text;
            }
            return text.trim();
        } catch (error) {
            console.error('Weekly CFO Verdict Error:', error);
            throw error;
        }
    }

    /**
     * SMART GOAL SUGGESTION — IA propone metas basadas en datos
     */
    async getSmartGoalSuggestion(historicalData) {
        const apiKey = this.getApiKey();
        const systemPrompt = `Eres el CFO estratégico de ClarityCash. 
Tu misión es proponer metas financieras realistas basadas en datos reales del usuario.
No inventes cifras. No seas dramático. Lenguaje claro y directo.
Propón metas alcanzables (no agresivas ni irreales).
Siempre explica el porqué en términos simples.

Responde SIEMPRE en formato JSON:
{
  "tipo_meta": "EMERGENCY | DEBT | PURCHASE | SAVINGS",
  "nombre_meta": "Nombre sugerido",
  "monto_sugerido": 0,
  "plazo_meses": 0,
  "cuota_mensual": 0,
  "justificacion": "Breve explicación estratégica (máx 120 palabras)"
}`;

        const userPrompt = `Datos del usuario: ${JSON.stringify(historicalData, null, 2)}`;

        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
                    generationConfig: { maxOutputTokens: 500, temperature: 0.7 }
                })
            });

            if (!response.ok) throw new Error('API Error');
            const data = await response.json();
            const text = data.candidates[0].content.parts[0].text;
            return JSON.parse(text.replace(/```json|```/g, '').trim());
        } catch (e) {
            console.error('Smart Goal Error:', e);
            return null;
        }
    }

    /**
     * MONTHLY STRATEGIC PLAN — CFO crea el plan de prioridades
     */
    async getMonthPlan(contextData) {
        const apiKey = this.getApiKey();
        const systemPrompt = `Eres el CFO de ClarityCash. Tu trabajo es construir un Plan del Mes con orden de prioridades.
Usa lenguaje simple. No uses "superávit/déficit". Di "Te quedó dinero" o "Te faltó dinero".
No inventes números. Solo usa los del JSON. Entrega recomendaciones accionables, máximo 6 pasos.

ESTRUCTURA DE RESPUESTA (JSON estricto):
{
  "diagnostico_corto": "1 frase corta de impacto",
  "prioridades": [
    {"accion": "Qué hacer", "monto": 0, "por_que": "Justificación", "impacto": "Ej: Acelera meta X en 2 semanas"}
  ],
  "plan_semanal": [
    {"semana": 1, "accion": "...", "monto": 0},
    {"semana": 2, "accion": "...", "monto": 0},
    {"semana": 3, "accion": "...", "monto": 0},
    {"semana": 4, "accion": "...", "monto": 0}
  ],
  "regla_control": "Si [categoría] pasa de $[monto] esta semana, frena y compensa con [otra]."
}`;

        const userPrompt = `Datos financieros reales del usuario: ${JSON.stringify(contextData, null, 2)}`;

        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
                    generationConfig: { maxOutputTokens: 1024, temperature: 0.7 }
                })
            });

            if (!response.ok) throw new Error('API Error');
            const data = await response.json();
            const text = data.candidates[0].content.parts[0].text;
            return JSON.parse(text.replace(/```json|```/g, '').trim());
        } catch (e) {
            console.error('Month Plan AI Error:', e);
            return null;
        }
    }
}
