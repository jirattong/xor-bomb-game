// lib/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyCVHDRmfyZEypybZQwz2bqNalt_DQPr3WE",
  authDomain: "xor-bomb-game.firebaseapp.com",
  databaseURL: "https://xor-bomb-game-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "xor-bomb-game",
  storageBucket: "xor-bomb-game.firebasestorage.app",
  messagingSenderId: "272278943242",
  appId: "1:272278943242:web:8084762092bbdd4d27d1f3",
  measurementId: "G-BLBHFJNX4B",
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const rtdb = getDatabase(app);