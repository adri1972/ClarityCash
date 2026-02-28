// CONFIGURACIÓN MAESTRA DE FIREBASE
// Proyecto: claritycash-e93ca - ACTIVADO ✅

window.firebaseConfig = {
    apiKey: "AIzaSyCxFOkfwLBXwl_LRGCIkDj7ynu7u78qVvU",
    authDomain: "claritycash-e93ca.firebaseapp.com",
    projectId: "claritycash-e93ca",
    storageBucket: "claritycash-e93ca.firebasestorage.app",
    messagingSenderId: "1025747176522",
    appId: "1:1025747176522:web:cbaf63f774bc088f7e2ab3",
    measurementId: "G-G1V6719RKQ"
};

// Inicializar Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();

// Persistencia local para que no se cierre la sesión al recargar
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
