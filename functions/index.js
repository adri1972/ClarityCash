const functions = require('firebase-functions');
const cors = require('cors')({ origin: true }); // Acepta peticiones de cualquier dominio (iOS/PWA/Localhost)
const fetch = require('node-fetch');

/**
 * Proxy Maestro de ClarityCash para Gemini
 * Evade bloqueos 404, CORS y de Red de Safari al canalizar las peticiones por Firebase.
 */
exports.proxyGemini = functions.https.onRequest((req, res) => {
    // Intercepta OPTIONS y las autoriza para CORS
    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'POST');
        res.set('Access-Control-Allow-Headers', 'Content-Type');
        res.set('Access-Control-Max-Age', '3600');
        return res.status(204).send('');
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
            let modelName = payload.model || "gemini-1.0-pro";

            // Preparamos payload oficial (A Gemini no le gusta el campo model extra)
            const googlePayload = { ...payload };
            delete googlePayload.model;

            const targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

            console.log(`📡 Enviando tráfico hacia: ${modelName}`);

            const response = await fetch(targetUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(googlePayload)
            });

            const data = await response.json();

            // Retorna en crudo lo que Google Cloud responda (Pasa el proxy exacto)
            return res.status(response.status).json(data);

        } catch (error) {
            console.error('Proxy Fatal Error:', error);
            return res.status(500).json({ error: { message: `Fallo de Comunicación Interna: ${error.message}` } });
        }
    });
});
