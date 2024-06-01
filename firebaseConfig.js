// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBNhnmeNafANMzx-xUWjUCU1p9NtZDfCHA",
  authDomain: "genie-ai-1ca85.firebaseapp.com",
  projectId: "genie-ai-1ca85",
  storageBucket: "genie-ai-1ca85.appspot.com",
  messagingSenderId: "431710853984",
  appId: "1:431710853984:web:dae60660cac1bee0fe1c05",
  measurementId: "G-4RSWJBFW93"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = firebase.auth();

export {auth}
