#!/bin/bash
cd "$(dirname "$0")"

echo "🚀 Iniciando App Finanzas Personales..."

# Iniciar servidor simple en puerto 8080
# Abrir navegador en 2 segundos
(sleep 2 && open "http://localhost:8080") &

# Ejecutar servidor (esto mantendrá la ventana abierta)
python3 -m http.server 8080
