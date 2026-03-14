const functions = require('firebase-functions');
const cors = require('cors')({ origin: true }); // Acepta peticiones de cualquier dominio (iOS/PWA/Localhost)
const fetch = require('node-fetch');

/**
 * Proxy Maestro de ClarityCash para Gemini
 * Evade bloqueos 404, CORS y de Red de Safari al canalizar las peticiones por Firebase.
 */
exports.proxyGemini = functions.runWith({
    serviceAccount: 'firebase-adminsdk-fbsvc@claritycash-e93ca.iam.gserviceaccount.com'
}).https.onRequest((req, res) => {
    // Intercepta OPTIONS y las autoriza para CORS
    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.set('Access-Control-Max-Age', '86400');
        return res.status(204).end();
    }

    // Ejecuta la lógica principal con Cors Wrapper
    cors(req, res, async () => {
        if (req.method !== 'POST') {
            return res.status(405).json({ error: { message: 'Método no permitido. Usa POST.' } });
        }

        try {
            // Extrae la llave segura desde el entorno
            // Esta llave se inyecta desde GitHub Secrets durante el despliegue
            const apiKey = process.env.GEMINI_API_KEY;

            if (!apiKey || apiKey.length < 5) {
                console.error("CRÍTICO: GEMINI_API_KEY no encontrada en el contenedor.");
                return res.status(500).json({ error: { message: "Error 500: Fallo en el puente de seguridad. Falta la llave de acceso al motor." } });
            }

            const payload = req.body;

            // Modelo de respaldo definido por la directiva
            let modelName = payload.model || "gemini-2.0-flash";

            const commonHeaders = { 
                'Content-Type': 'application/json',
                'Referer': 'https://claritycash-e93ca.firebaseapp.com/'
            };

            if (payload.action === 'list') {
                const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
                const listResponse = await fetch(listUrl, { headers: commonHeaders });
                const listData = await listResponse.json();
                return res.status(200).json(listData);
            }

            // --- STABILIZATION: Remove legacy metadata and ensure clean payload ---
            const googlePayload = {
                contents: payload.contents,
                generationConfig: payload.generationConfig || {}
            };

            const targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

            console.log(`📡 Proxying to Gemini v1beta [${modelName}]`);

            const response = await fetch(targetUrl, {
                method: 'POST',
                headers: commonHeaders,
                body: JSON.stringify(googlePayload)
            });

            const data = await response.json();

            if (!response.ok) {
                console.error("❌ Gemini API Error:", data);
                return res.status(response.status).json(data);
            }

            return res.status(200).json(data);

        } catch (error) {
            console.error('Proxy Fatal Error:', error);
            return res.status(500).json({ error: { message: `Fallo de Comunicación Interna: ${error.message}` } });
        }
    });
});
