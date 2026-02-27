// CONFIGURACIÓN MAESTRA DE FIREBASE
// Proyecto: claritycash-e93ca

const firebaseConfig = {
    apiKey: "REPLACE_WITH_YOUR_FIREBASE_API_KEY", // El usuario debe completar esto o lo buscaremos
    authDomain: "claritycash-e93ca.firebaseapp.com",
    projectId: "claritycash-e93ca",
    storageBucket: "claritycash-e93ca.appspot.com",
    messagingSenderId: "REPLACE_WITH_SENDER_ID",
    appId: "REPLACE_WITH_APP_ID"
};

// Inicializar Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();

// Persistencia local para que no se cierre la sesión al recargar
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
