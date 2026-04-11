import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'
import { getFunctions } from 'firebase/functions'

const env = (key: string) => {
  try {
    // @ts-ignore
    return import.meta.env?.[key] || process.env?.[key]
  } catch {
    return process.env?.[key]
  }
}

const firebaseConfig = {
  apiKey: env('VITE_FIREBASE_API_KEY')?.trim(),
  authDomain: env('VITE_FIREBASE_AUTH_DOMAIN')?.trim(),
  projectId: env('VITE_FIREBASE_PROJECT_ID')?.trim(),
  storageBucket: env('VITE_FIREBASE_STORAGE_BUCKET')?.trim(),
  messagingSenderId: env('VITE_FIREBASE_MESSAGING_SENDER_ID')?.trim(),
  appId: env('VITE_FIREBASE_APP_ID')?.trim(),
}

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()
export const db = getFirestore(app)
export const storage = getStorage(app)
export const functions = getFunctions(app)

// Enable offline persistence
if (typeof window !== 'undefined') {
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn('Firestore persistence failed: Multiple tabs open')
    } else if (err.code === 'unimplemented') {
      console.warn('Firestore persistence failed: Browser not supported')
    }
  })
}
