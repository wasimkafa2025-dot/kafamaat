import { initializeApp, getApp, getApps, FirebaseApp } from "firebase/app";
import { 
  getFirestore, 
  enableIndexedDbPersistence, 
  enableMultiTabIndexedDbPersistence, 
  Firestore, 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  where, 
  getDocs, 
  writeBatch 
} from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";

// The auto-provisioned workspace configurations
export const WORKSPACE_FIREBASE_CONFIG = {
  apiKey: "AIzaSyBc4rd74Ibf7nkV3SfTji8EDPChAZTW_LY",
  authDomain: "ai-studio-applet-webapp-313aa.firebaseapp.com",
  projectId: "ai-studio-applet-webapp-313aa",
  storageBucket: "ai-studio-applet-webapp-313aa.firebasestorage.app",
  messagingSenderId: "833142233878",
  appId: "1:833142233878:web:4878a2f05c54cb14ae0e37"
};

// The custom database configuration explicitly provided by the user
export const USER_FIREBASE_CONFIG = {
  apiKey: "AIzaSyBxmhx7wRReWw5x7UfLO1n3OK9JfAMnsTw",
  authDomain: "recruitmen-2cc3d.firebaseapp.com",
  projectId: "recruitmen-2cc3d",
  storageBucket: "recruitmen-2cc3d.firebasestorage.app",
  messagingSenderId: "664767825491",
  appId: "1:664767825491:web:1dab8315c72225f85828a6",
  measurementId: "G-DW30NNVLVK"
};

let activeApp: FirebaseApp | null = null;
let activeDb: Firestore | null = null;

// Keep track of DBs where persistence has already been attempted to avoid duplicate calls
const persistedDbs = new Set<Firestore>();

function setupPersistence(db: Firestore) {
  if (persistedDbs.has(db)) return;
  persistedDbs.add(db);

  if (typeof window !== "undefined") {
    try {
      enableMultiTabIndexedDbPersistence(db)
        .then(() => {
          console.log("Firestore multi-tab offline persistence enabled successfully.");
        })
        .catch((err) => {
          if (err.code === 'failed-precondition') {
            // Multiple tabs open, fall back to single tab persistence
            enableIndexedDbPersistence(db)
              .then(() => {
                console.log("Firestore single-tab offline persistence enabled.");
              })
              .catch((singleErr) => {
                console.warn("Firestore single-tab persistence failed: ", singleErr);
              });
          } else if (err.code === 'unimplemented') {
            console.warn("Firestore offline persistence is not supported by this browser.");
          } else {
            console.warn("Firestore offline persistence setup error: ", err);
          }
        });
    } catch (e) {
      console.warn("Exception during Firestore offline persistence initialization: ", e);
    }
  }
}

function tryInitializeAnalytics(app: FirebaseApp) {
  if (typeof window !== "undefined") {
    isSupported()
      .then((supported) => {
        if (supported) {
          getAnalytics(app);
          console.log("Firebase Analytics initialized successfully.");
        }
      })
      .catch((err) => {
        console.warn("Firebase Analytics initialization skipped:", err);
      });
  }
}

export function getFirebaseInstance(mode: "user" | "workspace" = "user"): { app: FirebaseApp; db: Firestore } {
  const config = mode === "user" ? USER_FIREBASE_CONFIG : WORKSPACE_FIREBASE_CONFIG;
  const appName = `taskflow_${mode}`;

  try {
    if (getApps().some(app => app.name === appName)) {
      const app = getApp(appName);
      const db = getFirestore(app);
      setupPersistence(db);
      tryInitializeAnalytics(app);
      return { app, db };
    }

    const app = initializeApp(config, appName);
    const db = getFirestore(app);
    setupPersistence(db);
    tryInitializeAnalytics(app);
    return { app, db };
  } catch (error) {
    console.error(`Error initializing Firebase app [${mode}]:`, error);
    // Fallback to whichever is successfully initialized
    if (getApps().length > 0) {
      const app = getApps()[0];
      const db = getFirestore(app);
      setupPersistence(db);
      tryInitializeAnalytics(app);
      return { app, db };
    }
    // Final fallback
    const app = initializeApp(config, appName);
    const db = getFirestore(app);
    setupPersistence(db);
    tryInitializeAnalytics(app);
    return { app, db };
  }
}


// Default helper to get active database based on saved preferences
export function getActiveDb(): Firestore {
  const savedMode = localStorage.getItem("taskflow_db_mode") as "user" | "workspace" || "user";
  return getFirebaseInstance(savedMode).db;
}

export function getActiveDbMode(): "user" | "workspace" {
  return (localStorage.getItem("taskflow_db_mode") as "user" | "workspace") || "user";
}

export function setActiveDbMode(mode: "user" | "workspace") {
  localStorage.setItem("taskflow_db_mode", mode);
}
