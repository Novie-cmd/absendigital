import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User } from 'firebase/auth';
import { auth, db } from './firebase';
import { doc, getDoc, setDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { LogIn, LogOut, LayoutDashboard, Users, Settings as SettingsIcon, FileText, ScanLine, Lock, UserPlus, CheckCircle2, XCircle, Clock, User as UserIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Scanner from './components/Scanner';
import AdminPortal from './components/AdminPortal';
import { recordAttendance, AttendanceResult } from './utils/attendance';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'scan' | 'admin'>('scan');
  const [linking, setLinking] = useState(false);
  const [linkId, setLinkId] = useState('');
  const [externalToken, setExternalToken] = useState<string | null>(null);
  const [attendanceResult, setAttendanceResult] = useState<AttendanceResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [settings, setSettings] = useState<any>(null);

  useEffect(() => {
    // Check for external scan token in URL
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      setExternalToken(token);
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Hardened Admin & Employee Check
  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      setEmployeeId(null);
      return;
    }

    const adminEmail = 'noviharyanto062@gmail.com';
    const userEmail = user.email?.toLowerCase().trim();
    
    if (userEmail === adminEmail) {
      setIsAdmin(true);
    }

    // Fetch user profile and settings from Firestore
    const fetchData = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          setUserProfile(data);
          if (data.role === 'admin') setIsAdmin(true);
          if (data.employeeId) setEmployeeId(data.employeeId);
        }

        const settingsDoc = await getDoc(doc(db, 'settings', 'config'));
        if (settingsDoc.exists()) setSettings(settingsDoc.data());
      } catch (err) {
        console.error('Data fetch error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user]);

  const handleExternalAttendance = async () => {
    if (!user || !externalToken || !settings) return;
    
    setIsProcessing(true);
    try {
      const result = await recordAttendance(externalToken, userProfile, settings, user.email);
      setAttendanceResult(result);
      // Clear URL params
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (error) {
      console.error('External attendance error:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLinkAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !linkId.trim()) return;
    
    setLinking(true);
    try {
      // 1. Verify if employeeId exists in employees collection
      const employeesRef = collection(db, 'employees');
      const q = query(employeesRef, where('employeeId', '==', linkId.trim()));
      const snap = await getDocs(q);
      
      if (snap.empty) {
        alert('ID Pegawai tidak ditemukan. Silakan hubungi admin untuk mendaftarkan ID Anda.');
        return;
      }

      const employeeData = snap.docs[0].data();

      // 2. Link to user document
      await setDoc(doc(db, 'users', user.uid), {
        email: user.email,
        name: user.displayName,
        employeeId: linkId.trim(),
        employeeName: employeeData.name,
        role: 'employee',
        updatedAt: serverTimestamp()
      }, { merge: true });

      setEmployeeId(linkId.trim());
      alert(`Berhasil menghubungkan akun dengan ${employeeData.name}!`);
    } catch (error: any) {
      console.error('Linking error:', error);
      alert('Gagal menghubungkan akun: ' + (error.message || 'Terjadi kesalahan.'));
    } finally {
      setLinking(false);
    }
  };

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
          <p className="text-[10px] font-bold text-blue-500 uppercase tracking-[0.2em] mb-4">Kesbangpoldagri NTB</p>
          <div className="w-20 h-20 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <ScanLine className="w-10 h-10 text-emerald-600" />
          </div>
          <h1 className="text-3xl font-bold text-stone-900 mb-2">Sistem Absensi</h1>
          <p className="text-stone-500 mb-8">Silakan masuk dengan akun Google Anda untuk melakukan absensi.</p>
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

  if (!employeeId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 border border-stone-200"
        >
          <div className="text-center mb-8">
            <p className="text-[10px] font-bold text-blue-500 uppercase tracking-[0.2em] mb-4">Kesbangpoldagri NTB</p>
            <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <UserPlus className="w-8 h-8 text-blue-600" />
            </div>
            <h1 className="text-2xl font-bold text-stone-900">Hubungkan Akun</h1>
            <p className="text-stone-500 text-sm mt-2">
              Masukkan ID Pegawai Anda untuk menghubungkan akun Google ini dengan data kehadiran Anda.
            </p>
          </div>

          <form onSubmit={handleLinkAccount} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-1">ID Pegawai (NIK/NIP)</label>
              <input
                required
                type="text"
                value={linkId}
                onChange={(e) => setLinkId(e.target.value)}
                placeholder="Contoh: EMP001"
                className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={linking}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-blue-100 disabled:opacity-50"
            >
              {linking ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : 'Hubungkan Sekarang'}
            </button>
          </form>

          {isAdmin && (
            <button
              onClick={() => setEmployeeId('ADMIN_TEMP')}
              className="w-full mt-4 text-emerald-600 text-sm font-bold hover:text-emerald-700 transition-all py-2 border border-emerald-100 rounded-xl"
            >
              Lewati ke Portal Admin
            </button>
          )}

          <button
            onClick={handleLogout}
            className="w-full mt-4 text-stone-400 text-sm hover:text-stone-600 transition-all"
          >
            Keluar dan gunakan akun lain
          </button>
        </motion.div>
      </div>
    );
  }

  // External Scan View
  if (externalToken && !attendanceResult) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 text-center border border-stone-200"
        >
          <p className="text-[10px] font-bold text-blue-500 uppercase tracking-[0.2em] mb-4">Kesbangpoldagri NTB</p>
          <div className="w-20 h-20 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <ScanLine className="w-10 h-10 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-stone-900 mb-2">Konfirmasi Absensi</h1>
          <p className="text-stone-500 mb-8">Anda akan melakukan Absen, lanjutkan?</p>
          
          <div className="space-y-3">
            <button
              onClick={handleExternalAttendance}
              disabled={isProcessing}
              className="w-full flex items-center justify-center gap-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 px-6 rounded-2xl transition-all shadow-lg shadow-emerald-200 disabled:opacity-50"
            >
              {isProcessing ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : 'Lanjutkan'}
            </button>
            <button
              onClick={() => setExternalToken(null)}
              disabled={isProcessing}
              className="w-full text-stone-400 text-sm hover:text-stone-600 transition-all py-2"
            >
              Batalkan
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // Attendance Result View (from External Scan)
  if (attendanceResult) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 text-center border border-stone-200"
        >
          {attendanceResult.success ? (
            <>
              <p className="text-[10px] font-bold text-blue-500 uppercase tracking-[0.2em] mb-4">Kesbangpoldagri NTB</p>
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="w-10 h-10 text-emerald-600" />
              </div>
              <h3 className="text-2xl font-bold text-stone-900 mb-2">{attendanceResult.message}</h3>
              <div className="bg-stone-50 rounded-2xl p-6 w-full border border-stone-100 space-y-4 mb-8">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-stone-500">
                    <UserIcon className="w-4 h-4" />
                    <span className="text-sm">Nama</span>
                  </div>
                  <span className="font-semibold text-stone-900">{attendanceResult.data?.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-stone-500">
                    <Clock className="w-4 h-4" />
                    <span className="text-sm">Waktu</span>
                  </div>
                  <span className="font-semibold text-stone-900">{attendanceResult.data?.time}</span>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <XCircle className="w-10 h-10 text-red-600" />
              </div>
              <h3 className="text-2xl font-bold text-stone-900 mb-2">Gagal Absensi</h3>
              <p className="text-stone-500 mb-8">{attendanceResult.message}</p>
            </>
          )}
          
          <button
            onClick={() => {
              setAttendanceResult(null);
              setExternalToken(null);
            }}
            className="w-full bg-stone-900 hover:bg-stone-800 text-white font-bold py-4 rounded-2xl transition-all shadow-lg"
          >
            Selesai
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
          <div className="flex flex-col">
            <span className="text-[9px] font-bold text-blue-500 uppercase tracking-widest leading-none mb-1.5 ml-1">Kesbangpoldagri NTB</span>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-100">
                <ScanLine className="w-6 h-6 text-white" />
              </div>
              <span className="font-bold text-xl text-stone-900 hidden sm:block">Absensi Pegawai</span>
            </div>
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
        {/* Debug Info (Only for Admin Email) */}
        {user.email === 'noviharyanto062@gmail.com' && (
          <div className="mb-4 p-2 bg-stone-100 rounded-lg text-[10px] text-stone-400 font-mono flex gap-4">
            <span>UID: {user.uid}</span>
            <span>Email: {user.email}</span>
            <span>Admin: {isAdmin ? 'YES' : 'NO'}</span>
            <span>View: {view}</span>
          </div>
        )}
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
