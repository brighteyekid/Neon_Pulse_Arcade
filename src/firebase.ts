// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getAnalytics } from "firebase/analytics";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBXcwebXwOH169mlHLLNRngptO_nNQG9Tc",
  authDomain: "fsocietystore-ef090.firebaseapp.com",
  projectId: "fsocietystore-ef090",
  storageBucket: "fsocietystore-ef090.firebasestorage.app",
  messagingSenderId: "143319953254",
  appId: "1:143319953254:web:a2c28c6b852e342d6822a7",
  measurementId: "G-JPC5EHBH0D"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
const db = getFirestore(app);
const auth = getAuth(app);
const analytics = getAnalytics(app);
const storage = getStorage(app);

// Export the services for use in other files
export { db, auth, analytics, storage }; 