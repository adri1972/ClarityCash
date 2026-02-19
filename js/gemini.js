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
        const conf = this.store && this.store.config ? this.store.config : {};
        return conf.ai_provider || 'gemini'; // 'gemini' or 'openai'
    }

    getApiKey() {
        const provider = this.getProvider();
        const conf = this.store && this.store.config ? this.store.config : {};

        if (provider === 'openai') {
            return conf.openai_api_key || '';
        }
        return conf.gemini_api_key || '';
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
            const errorBody = await response.json().catch(() => ({}));
            const errorMessage = errorBody.error?.message || response.statusText;

            if (response.status === 400 || response.status === 403) throw new Error(`INVALID_KEY: ${errorMessage}`);
            if (response.status === 429) throw new Error('RATE_LIMIT');
            throw new Error(`API_ERROR: ${errorMessage}`);
        }

        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
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
        const provider = this.getProvider();

        // 1. Define Persona & Strategy based on Problem Type
        let role = "Asesor Financiero Personal";
        let strategy = "Analiza la situación y da consejos prácticos.";

        if (context.problem && context.problem.includes('DEFICIT')) {
            role = "Experto en Crisis y Reestructuración de Deudas";
            strategy = "El usuario está en DÉFICIT. Su casa financiera está en llamas. Tu objetivo es apagar el fuego con medidas de choque inmediatas. Prioriza liquidez y supervivencia.";
        } else if (context.problem === 'WARNING') {
            role = "Coach de Hábitos y Ahorro";
            strategy = "El usuario vive al día (paycheck to paycheck). Su riesgo es alto ante cualquier imprevisto. Tu objetivo es despertarlo y encontrar fugas de dinero para crear un colchón de seguridad.";
        } else if (context.problem === 'SURPLUS') {
            role = "Gestor de Patrimonio e Inversiones";
            strategy = "El usuario tiene dinero extra (Superávit). Tu objetivo es que NO se lo gaste en tonterías. Sugiérele estrategias de crecimiento (Inversión, Fondo de Emergencia o Prepago de deuda inteligente).";
        }

        const prompt = `
            ROL: ${role}
            ESTRATEGIA: ${strategy}
            
            DIAGNÓSTICO DEL PACIENTE (DATOS REALES):
            ${context.full_context}
            
            TU MISIÓN:
            Genera un diagnóstico estratégico corto. NO repitas los números obvios que ya vio el usuario ("Gastaste X más").
            En su lugar, enfócate en el SIGNIFICADO y la SOLUCIÓN.
            
            ESTRUCTURA DE RESPUESTA:
            1. 🧠 EL INSIGHT: Una frase contundente sobre su comportamiento. (Ej: "Estás financiando tu estilo de vida con deuda, cuidado.")
            2. 🛠️ LA ESTRATEGIA: Una recomendación de alto nivel.
            3. 👉 ACCIÓN INMEDIATA: Algo que pueda hacer ya mismo.
            
            REGLAS DE ORO:
            1. Sé quirúrgico. Ve a la yugular del problema.
            2. Tono: Consultor Senior (Serio pero cercano).
            3. Usa emojis con moderación.
            4. Máximo 400 caracteres.
            
            FORMATO: Texto plano.
        `;

        try {
            let text = "";
            if (provider === 'openai') {
                const response = await fetch(this.OPENAI_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                    body: JSON.stringify({
                        model: "gpt-4o-mini", // Use mini for speed/availability
                        messages: [{ role: "user", content: prompt }],
                        max_tokens: 300
                    })
                });

                if (!response.ok) {
                    const errErr = await response.json();
                    throw new Error(`OpenAI Error: ${errErr.error?.message || response.statusText}`);
                }

                const data = await response.json();
                text = data.choices[0].message.content;
            } else {
                const url = `${this.GEMINI_URL}?key=${apiKey}`;
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
                });
                const data = await response.json();
                if (data.error) throw new Error(data.error.message);
                text = data.candidates[0].content.parts[0].text;
            }
            return text;
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
            throw new Error('Primero configura tu API Key en Ajustes ⚙️ para usar el escáner inteligente.');
        }

        const provider = this.getProvider();
        const apiKey = this.getApiKey();

        const prompt = `
            Actúa como un experto en extracción de datos de facturas y recibos (OCR Inteligente) para Colombia/Latam.
            Analiza la imagen adjunta y extrae la información en formato JSON estricto.
            
            Instrucciones CRITICAS para MONTO (Amount):
            1. Busca el "TOTAL A PAGAR", "TOTAL A CANCELAR", "A PAGAR" o "NETO".
            2. IMPORTANTE: EL MONTO DEBE SER UN VALOR MONETARIO REAL. Ignora números largos de "Resolución", "Autorización", "CUFE", "Factura No", "NIT" o "Teléfono".
            3. Si ves un número gigante (como 187640...), ES UN CÓDIGO, NO EL PRECIO. El precio real suele tener separadores de miles (ej: 198.514).
            4. El formato de respuesta para 'amount' debe ser NUMBER (ej: 198514). Redondea a entero.

            Instrucciones para COMERCIO y CATEGORÍA:
            1. Merchant: Busca el nombre visible en el logo o encabezado (Ej: "Notaría 7", "D1", "Exito"). MUY IMPORTANTE: Ignora por completo cualquier "NIT", "RUT" o "Número de Identificación Tributaria". Estas palabras o sus números NO son el nombre del negocio y NUNCA deben ir en el campo 'merchant' o 'amount'.
            2. Category:
               - Si es "Notaría" o trámites legales -> "Vivienda" (si parece escritura) o "Servicios".
               - Si es Mercado/Supermercado -> "Alimentación".
               - Si es Gasolinera -> "Transporte".
               - Si es Restaurante -> "Restaurantes".

            Formato JSON de respuesta (solo el objeto):
            {
                "date": "YYYY-MM-DD",
                "amount": number (El valor limpio. JAMÁS pongas el número de autorización),
                "merchant": "Nombre del Negocio",
                "category": "Categoría Sugerida",
                "note": "Breve descripción (ej: 'Derechos Notariales' o 'Escrituración')"
            }
            
            Si algún dato no es visible o claro, usa null.
        `;

        try {
            if (provider === 'openai') {
                if (!mimeType.startsWith('image/')) throw new Error('OpenAI solo soporta imágenes (JPG/PNG). Para PDFs usa Gemini.');
                // OpenAI Vision (GPT-4o / GPT-4-turbo)
                const response = await fetch(this.OPENAI_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({
                        model: "gpt-4o",
                        messages: [
                            {
                                role: "user",
                                content: [
                                    { type: "text", text: prompt },
                                    {
                                        type: "image_url",
                                        image_url: {
                                            "url": `data:${mimeType};base64,${base64Data}`
                                        }
                                    }
                                ]
                            }
                        ],
                        max_tokens: 300
                    })
                });

                const data = await response.json();
                if (data.error) throw new Error(data.error.message);
                const text = data.choices[0].message.content;
                return JSON.parse(text.replace(/```json|```/g, '').trim());

            } else {
                // Gemini Vision (1.5 Flash / 2.0 Flash)
                // URL usually has :generateContent?key=API_KEY
                const url = `${this.GEMINI_URL}?key=${apiKey}`;

                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [
                                { text: prompt },
                                {
                                    inline_data: {
                                        mime_type: mimeType,
                                        data: base64Data
                                    }
                                }
                            ]
                        }]
                    })
                });

                const data = await response.json();
                if (data.error) throw new Error(data.error.message);

                const text = data.candidates[0].content.parts[0].text;
                return JSON.parse(text.replace(/```json|```/g, '').trim());
            }
        } catch (error) {
            console.error('AI Scan Error:', error);
            throw new Error('No se pudo leer el recibo. Intenta con mejor luz o recorta la imagen.');
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

        // Personality: "Pazion" (Witty, Direct, Colombian/Latam slang friendly)
        const prompt = `
            ACTÚA COMO: Un Coach financiero educativo, paciente y empático.
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
            
            REGLAS DE TONO:
            - Sé constructivo, amable y motivador. No uses sarcasmo pesado.
            - Si es un gasto innecesario → Da un consejo rápido de ahorro constructivo.
            - Si rompió el presupuesto → Anímalo a recomponerse ajustando otras categorías.
            - Si es un gasto alto → Sugiere cómo amortizarlo o planearlo mejor.
            - Si es un gasto necesario/bien planeado → Valida su buena gestión.
            - Usa emojis.
            - Habla en español latino, claro, amigable y profesional.
            - NO saludes. Ve al grano de manera directa pero suave.
            
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
}
