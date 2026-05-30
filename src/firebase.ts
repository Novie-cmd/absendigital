import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const config = firebaseConfig as any;
export const db = getFirestore(app, config.firestoreDatabaseId);
export const auth = getAuth(app);
