import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User } from 'firebase/auth';
import { auth, db } from './firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { LogIn, LogOut, LayoutDashboard, Users, Settings as SettingsIcon, FileText, ScanLine, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Scanner from './components/Scanner';
import AdminPortal from './components/AdminPortal';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'scan' | 'admin'>('scan');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Hardened Admin Check
  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      return;
    }

    const adminEmail = 'noviharyanto062@gmail.com';
    const userEmail = user.email?.toLowerCase().trim();
    
    if (userEmail === adminEmail) {
      console.log('Admin detected via email match');
      setIsAdmin(true);
    } else {
      // Fallback to Firestore for other admins
      getDoc(doc(db, 'users', user.uid)).then((userDoc) => {
        if (userDoc.exists() && userDoc.data().role === 'admin') {
          setIsAdmin(true);
        }
      }).catch(err => console.error('Admin check error:', err));
    }
  }, [user]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error('Login error:', error);
      let message = 'Gagal masuk dengan Google.';
      
      if (error.code === 'auth/unauthorized-domain') {
        message = 'Domain ini belum terdaftar di Firebase. Silakan tambahkan domain Vercel Anda di Firebase Console (Authentication > Settings > Authorized Domains).';
      } else if (error.code === 'auth/popup-closed-by-user') {
        message = 'Jendela login ditutup sebelum selesai.';
      } else if (error.code === 'auth/operation-not-allowed') {
        message = 'Metode login Google belum diaktifkan di Firebase Console.';
      }
      
      alert(message);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 text-center border border-stone-200"
        >
          <div className="w-20 h-20 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <ScanLine className="w-10 h-10 text-emerald-600" />
          </div>
          <h1 className="text-3xl font-bold text-stone-900 mb-2">Sistem Absensi</h1>
          <p className="text-stone-500 mb-8">Silakan masuk dengan akun Google Anda untuk melanjutkan.</p>
          <button
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-4 px-6 rounded-2xl transition-all shadow-lg shadow-emerald-200"
          >
            <LogIn className="w-5 h-5" />
            Masuk dengan Google
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col">
      {/* Navigation */}
      <nav className="bg-white border-b border-stone-200 px-4 py-3 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-100">
              <ScanLine className="w-6 h-6 text-white" />
            </div>
            <span className="font-bold text-xl text-stone-900 hidden sm:block">Absensi Pegawai</span>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            {isAdmin && (
              <div className="flex bg-stone-100 p-1 rounded-xl">
                <button
                  onClick={() => setView('scan')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    view === 'scan' ? 'bg-white text-emerald-600 shadow-sm' : 'text-stone-500 hover:text-stone-700'
                  }`}
                >
                  <ScanLine className="w-4 h-4" />
                  <span className="hidden sm:block">Scan</span>
                </button>
                <button
                  onClick={() => setView('admin')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    view === 'admin' ? 'bg-emerald-600 text-white shadow-md' : 'text-stone-500 hover:text-stone-700'
                  }`}
                >
                  <Lock className={`w-4 h-4 ${view === 'admin' ? 'text-white' : 'text-stone-400'}`} />
                  <span className="hidden sm:block">Portal Admin</span>
                </button>
              </div>
            )}

            <div className="h-8 w-[1px] bg-stone-200 mx-2 hidden sm:block"></div>

            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold text-stone-900 leading-none">{user.displayName}</p>
                <p className="text-[10px] text-stone-400 mt-0.5">{user.email}</p>
                <div className="flex items-center justify-end gap-1.5 mt-1">
                  {isAdmin && (
                    <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded uppercase tracking-wider">
                      Admin
                    </span>
                  )}
                  <p className="text-xs text-stone-500">{isAdmin ? 'Administrator' : 'Pegawai'}</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                title="Keluar"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        <AnimatePresence mode="wait">
          {view === 'scan' ? (
            <motion.div
              key="scan"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="h-full"
            >
              <Scanner />
            </motion.div>
          ) : (
            <motion.div
              key="admin"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="h-full"
            >
              <AdminPortal />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
