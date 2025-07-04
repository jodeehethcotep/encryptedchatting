import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeFirestore, memoryLocalCache } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
    apiKey: "AIzaSyDlQeGyHyABy4Pelt9QpAc5UN0cB708sF0",
    authDomain: "secretchat-6f156.firebaseapp.com",
    projectId: "secretchat-6f156",
    storageBucket: "secretchat-6f156.firebasestorage.app",
    messagingSenderId: "108846777851",
    appId: "1:108846777851:web:eef70ba35d86817520b75e",
    measurementId: "G-VZKEXEZVP8"
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = initializeFirestore(app, { localCache: memoryLocalCache() });
const storage = getStorage(app);

export { app, db, storage };
