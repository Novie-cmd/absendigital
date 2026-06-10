import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User } from 'firebase/auth';
import { auth, db } from './firebase';
import { doc, getDoc, setDoc, serverTimestamp, collection, query, where, getDocs, onSnapshot, runTransaction, updateDoc } from 'firebase/firestore';
import { LogIn, LogOut, LayoutDashboard, Users, Settings as SettingsIcon, FileText, ScanLine, Lock, UserPlus, CheckCircle2, XCircle, Clock, User as UserIcon, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Scanner from './components/Scanner';
import AdminPortal from './components/AdminPortal';
import { recordAttendance, AttendanceResult } from './utils/attendance';
import { setGoogleToken, getGoogleToken, appendAttendanceToSheet } from './utils/googleSheets';
import { format } from 'date-fns';
import { DEFAULT_DINAS_LIST, Dinas } from './utils/dinases';

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

  // Dinas states
  const [dinases, setDinases] = useState<Dinas[]>(DEFAULT_DINAS_LIST);
  const [selectedDinasId, setSelectedDinasId] = useState<string>('');
  const [isRegisteringDinas, setIsRegisteringDinas] = useState(false);
  const [newDinasName, setNewDinasName] = useState('');
  const [dinasLoading, setDinasLoading] = useState(false);

  useEffect(() => {
    // Dynarnically listen and merge custom Dinases from Firestore
    console.log('App: Setting up metadata and dynamically listening to dinas list...');
    const unsub = onSnapshot(collection(db, 'dinases'), (snap) => {
      const customDinases = snap.docs.map(doc => ({ id: doc.id, name: doc.data().name } as Dinas));
      const merged = [...DEFAULT_DINAS_LIST];
      customDinases.forEach(cd => {
        if (!merged.some(m => m.id === cd.id)) {
          merged.push(cd);
        }
      });
      setDinases(merged);
    }, (err) => {
      console.warn('Custom dinases snapshot listener failed, using defaults.', err);
    });
    return () => unsub();
  }, []);

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
        let currentProfile = null;

        if (userDoc.exists()) {
          currentProfile = userDoc.data();
          setUserProfile(currentProfile);
          if (currentProfile.role === 'admin' || userEmail === adminEmail) setIsAdmin(true);
          if (currentProfile.employeeId) setEmployeeId(currentProfile.employeeId);
        } else {
          // SEAMLESS AUTO-LINK: Check if email exists in employees collection
          const employeesRef = collection(db, 'employees');
          const q = query(employeesRef, where('email', '==', userEmail));
          const snap = await getDocs(q);
          
          if (!snap.empty) {
            const employeeData = snap.docs[0].data();
            const newProfile = {
              email: user.email,
              name: user.displayName,
              employeeId: employeeData.employeeId,
              employeeName: employeeData.name,
              dinasId: employeeData.dinasId || 'kesbangpol',
              dinasName: employeeData.dinasName || 'Kesbangpoldagri NTB',
              role: userEmail === adminEmail ? 'admin' : 'employee',
              updatedAt: serverTimestamp()
            };
            
            console.log('Attempting seamless link for UID:', user.uid);
            try {
              await setDoc(doc(db, 'users', user.uid), newProfile);
              setUserProfile(newProfile);
              setEmployeeId(employeeData.employeeId);
              if (newProfile.role === 'admin' || userEmail === adminEmail) setIsAdmin(true);
              console.log('Seamlessly linked account for:', employeeData.name);
            } catch (err: any) {
              console.error('Error during seamless link:', err);
              // Don't throw here, just let the user try manual link
            }
          }
        }

        // Settings are loaded inside the real-time subscription effect below
      } catch (err) {
        console.error('Data fetch error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user]);

  // 1. Real-time configuration settings listener
  useEffect(() => {
    const currentDinasId = userProfile?.dinasId || 'kesbangpol';
    const unsubSettings = onSnapshot(doc(db, 'settings', currentDinasId), (snap) => {
      if (snap.exists()) {
        setSettings(snap.data());
      }
    }, (err) => {
      console.error('Settings listener error:', err);
    });
    return () => unsubSettings();
  }, [userProfile?.dinasId]);

  const handleSelectDinas = async (dinas: Dinas, roleSet: 'admin' | 'employee') => {
    if (!user) return;
    setDinasLoading(true);
    try {
      const updatedProfile = {
        email: user.email,
        name: user.displayName,
        dinasId: dinas.id,
        dinasName: dinas.name,
        role: roleSet,
        employeeId: roleSet === 'admin' ? 'ADMIN_TEMP' : '',
        updatedAt: serverTimestamp()
      };
      await setDoc(doc(db, 'users', user.uid), updatedProfile);
      setUserProfile(updatedProfile);
      if (roleSet === 'admin') {
        setIsAdmin(true);
        setEmployeeId('ADMIN_TEMP');
      }
    } catch (err) {
      console.error("Gagal memilih dinas:", err);
      alert("Gagal memilih dinas");
    } finally {
      setDinasLoading(false);
    }
  };

  const handleCreateDinas = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newDinasName.trim()) return;
    setDinasLoading(true);
    try {
      const generatedSlug = newDinasName.toLowerCase().trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');

      const finalSlug = generatedSlug || `skpd-${Date.now()}`;

      // 1. Create settings document
      await setDoc(doc(db, 'settings', finalSlug), {
        dinasId: finalSlug,
        dinasName: newDinasName.trim(),
        workStartTimeMonThu: '08:00',
        workEndTimeMonThu: '17:00',
        workStartTimeFri: '08:00',
        workEndTimeFri: '16:30',
        lateThreshold: 15,
        officeLat: 0,
        officeLng: 0,
        officeRadius: 100,
        useGeofencing: false,
        useGoogleSheets: false,
        spreadsheetId: '',
        spreadsheetUrl: ''
      });

      // 2. Register Dinas
      await setDoc(doc(db, 'dinases', finalSlug), {
        id: finalSlug,
        name: newDinasName.trim()
      });

      // 3. Save profile
      const updatedProfile = {
        email: user.email,
        name: user.displayName,
        dinasId: finalSlug,
        dinasName: newDinasName.trim(),
        role: 'admin',
        employeeId: 'ADMIN_TEMP',
        updatedAt: serverTimestamp()
      };

      await setDoc(doc(db, 'users', user.uid), updatedProfile);
      setUserProfile(updatedProfile);
      setIsAdmin(true);
      setEmployeeId('ADMIN_TEMP');
    } catch (err) {
      console.error("Gagal meregistrasi Dinas baru:", err);
      alert("Gagal meregistrasi Dinas baru");
    } finally {
      setDinasLoading(false);
    }
  };

  // 2. Real-time background Google Sheets synchronization bridge
  useEffect(() => {
    if (!isAdmin || !settings?.useGoogleSheets || !settings?.spreadsheetId) return;

    const gToken = getGoogleToken();
    if (!gToken) {
      console.warn('Background Sync: Google Sheets is enabled but Google Token is not available.');
      return;
    }

    const today = format(new Date(), 'yyyy-MM-dd');
    const attendanceRef = collection(db, 'attendance');
    const todayQuery = query(
      attendanceRef,
      where('date', '==', today)
    );

    console.log('Background Sync: Running active listener for Google Sheets sync...');

    const processingIds = new Set<string>();
    const currentDinasId = userProfile?.dinasId || 'kesbangpol';

    const unsubscribe = onSnapshot(todayQuery, async (snapshot) => {
      const unsyncedDocs = snapshot.docs.filter(doc => {
        const data = doc.data();
        const matchesDinas = data.dinasId === currentDinasId || (!data.dinasId && currentDinasId === 'kesbangpol');
        const isNotSynced = data.syncedToSheets === false || !('syncedToSheets' in data);
        return isNotSynced && matchesDinas && !processingIds.has(doc.id);
      });

      if (unsyncedDocs.length === 0) return;

      console.log(`Background Sync: Found ${unsyncedDocs.length} unsynced attendance records.`);

      // Process each unsynced record sequentially to prevent API write overlapping
      for (const d of unsyncedDocs) {
        const docRef = doc(db, 'attendance', d.id);

        // Try to obtain an exclusive synchronization lock using a Firestore transaction.
        // This ensures that if multiple browser tabs or devices are open, only ONE wins the race
        // to append to Google Sheets.
        let dataToSync = null;
        try {
          await runTransaction(db, async (transaction) => {
            const freshDoc = await transaction.get(docRef);
            if (!freshDoc.exists()) {
              throw new Error("Document does not exist");
            }
            const freshData = freshDoc.data();
            // If another client has already synced or is currently syncing, abort transaction
            if (freshData.syncedToSheets === true || freshData.syncedToSheets === 'syncing') {
              throw new Error("Already synced or syncing ongoing");
            }
            // Acquire the lock by setting state to 'syncing'
            transaction.update(docRef, { syncedToSheets: 'syncing' });
            dataToSync = freshData;
          });
        } catch (lockError: any) {
          console.log(`Background Sync: Skip syncing document ${d.id} as it is already being processed or completed:`, lockError.message);
          continue;
        }

        if (!dataToSync) continue;
        const data: any = dataToSync;

        // Lock document processing in local memory too
        processingIds.add(d.id);

        try {
          let timeStr = format(new Date(), 'HH:mm:ss');
          if (data.timestamp) {
            const dateObj = data.timestamp.toDate ? data.timestamp.toDate() : new Date(data.timestamp);
            timeStr = format(dateObj, 'HH:mm:ss');
          }

          // Trigger append to Google Sheets API
          await appendAttendanceToSheet(gToken, settings.spreadsheetId, {
            id: d.id, // Pass Firestore Doc ID
            date: data.date,
            time: timeStr,
            employeeId: data.employeeId,
            employeeName: data.employeeName,
            type: data.type,
            method: data.method || 'self_scan',
            isLate: !!data.isLate,
            isEarlyLeave: !!data.isEarlyLeave
          });

          // Mark as successfully synced in Firestore so we don't process it again
          await updateDoc(docRef, { syncedToSheets: true });
          console.log(`Background Sync: Document ${d.id} successfully synced to Google Sheets and marked sync=true.`);
        } catch (syncErr: any) {
          console.error(`Background Sync: Failed to sync doc ${d.id}`, syncErr);
          // Unlock on failure to allow retry (set back to false)
          processingIds.delete(d.id);
          try {
            await updateDoc(docRef, { syncedToSheets: false });
          } catch (revertErr) {
            console.error("Failed to revert syncedToSheets status", revertErr);
          }
          if (syncErr.message && (syncErr.message.includes("401") || syncErr.message.includes("UNAUTHENTICATED"))) {
            console.warn("Background Sync: Stale Google access token detected. Clearing cached token from memory.");
            setGoogleToken(null);
          }
        }
      }
    });

    return () => unsubscribe();
  }, [isAdmin, settings]);

  const handleExternalAttendance = async () => {
    if (!user || !externalToken || !settings) return;
    
    setIsProcessing(true);
    try {
      let userLocation = null;
      
      // Only request location if geofencing is enabled
      if (settings.useGeofencing) {
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 5000,
              maximumAge: 0
            });
          });
          userLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
        } catch (locErr) {
          console.error('Location error:', locErr);
          // We'll pass null and let recordAttendance handle the error if geofencing is required
        }
      }

      const result = await recordAttendance(externalToken, userProfile, settings, user.email, userLocation);
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
    const currentDinasId = userProfile?.dinasId || 'kesbangpol';
    const currentDinasName = userProfile?.dinasName || 'Kesbangpoldagri NTB';
    try {
      // 1. Verify if employeeId exists in employees collection for current Dinas
      let employeeData;
      try {
        const employeesRef = collection(db, 'employees');
        let q = query(employeesRef, where('employeeId', '==', linkId.trim()), where('dinasId', '==', currentDinasId));
        let snap = await getDocs(q);
        
        if (snap.empty) {
          // Fallback search to find it without dinasId for backwards-compatibility
          const qFallback = query(employeesRef, where('employeeId', '==', linkId.trim()));
          snap = await getDocs(qFallback);
        }

        if (snap.empty) {
          alert(`ID Pegawai tidak ditemukan di dinas ${currentDinasName}. Silakan hubungi admin Anda.`);
          setLinking(false);
          return;
        }
        employeeData = snap.docs[0].data();
      } catch (err: any) {
        console.error('Error querying employees:', err);
        throw new Error('Gagal memverifikasi NIP/NIK Pegawai: ' + err.message);
      }

      // 2. Link to user document
      try {
        console.log('Attempting to link account for UID:', user.uid);
        const updated = {
          email: user.email,
          name: user.displayName,
          employeeId: linkId.trim(),
          employeeName: employeeData.name,
          dinasId: currentDinasId,
          dinasName: currentDinasName,
          role: 'employee',
          updatedAt: serverTimestamp()
        };
        await setDoc(doc(db, 'users', user.uid), updated, { merge: true });
        setUserProfile(updated);
      } catch (err: any) {
        console.error('Error setting user doc:', err);
        throw new Error('Gagal menyimpan profil pengguna: ' + err.message);
      }

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
    provider.addScope('https://www.googleapis.com/auth/spreadsheets');
    provider.addScope('https://www.googleapis.com/auth/drive.file');
    try {
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setGoogleToken(credential.accessToken);
        console.log('Saved Google token on login');
      }
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
      setGoogleToken(null);
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
          <p className="text-[10px] font-bold text-blue-500 uppercase tracking-[0.2em] mb-4">SISTEM ABSENSI SKPD/DINAS</p>
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

  // Pilih Dinas atau Register SKPD baru
  if (!userProfile?.dinasId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 border border-stone-200"
        >
          <div className="text-center mb-6">
            <p className="text-[10px] font-bold text-blue-500 uppercase tracking-[0.2em] mb-4">SISTEM MULTI DINAS / SKPD</p>
            <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-emerald-600" />
            </div>
            <h1 className="text-2xl font-bold text-stone-900">Pilih Dinas / SKPD</h1>
            <p className="text-stone-500 text-sm mt-2">
              Hubungkan akun Anda dengan Dinas/SKPD pilihan Anda atau buat Dinas/SKPD baru jika Anda adalah Admin/Pengelola Dinas.
            </p>
          </div>

          {!isRegisteringDinas ? (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Pilih Dinas / SKPD Terdaftar</label>
                <select
                  value={selectedDinasId}
                  onChange={(e) => setSelectedDinasId(e.target.value)}
                  className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all outline-none"
                >
                  <option value="">-- Pilih Dinas / SKPD --</option>
                  {dinases.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              {selectedDinasId && (
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <button
                    onClick={() => {
                      const matched = dinases.find(d => d.id === selectedDinasId);
                      if (matched) handleSelectDinas(matched, 'employee');
                    }}
                    disabled={dinasLoading}
                    className="flex flex-col items-center justify-center p-4 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 text-emerald-700 rounded-2xl transition-all"
                  >
                    <span className="font-bold text-sm">Masuk Sebagai</span>
                    <span className="text-xs opacity-85 mt-1">Pegawai</span>
                  </button>
                  <button
                    onClick={() => {
                      const matched = dinases.find(d => d.id === selectedDinasId);
                      if (matched) handleSelectDinas(matched, 'admin');
                    }}
                    disabled={dinasLoading}
                    className="flex flex-col items-center justify-center p-4 bg-stone-900 hover:bg-stone-800 border border-stone-800 text-white rounded-2xl transition-all"
                  >
                    <span className="font-bold text-sm">Masuk Sebagai</span>
                    <span className="text-xs opacity-85 mt-1">Admin Dinas</span>
                  </button>
                </div>
              )}

              <div className="relative flex py-2 items-center">
                <div className="flex-grow border-t border-stone-200"></div>
                <span className="flex-shrink mx-4 text-stone-400 text-xs">Atau</span>
                <div className="flex-grow border-t border-stone-200"></div>
              </div>

              <button
                onClick={() => setIsRegisteringDinas(true)}
                className="w-full py-3 text-center text-sm font-semibold text-emerald-600 hover:text-emerald-700 border border-emerald-100 hover:border-emerald-200 rounded-xl transition-all"
              >
                + Daftarkan Dinas / SKPD Baru
              </button>
            </div>
          ) : (
            <form onSubmit={handleCreateDinas} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Nama Dinas / SKPD Baru</label>
                <input
                  required
                  type="text"
                  placeholder="Contoh: Dinas Kelautan & Perikanan NTB"
                  value={newDinasName}
                  onChange={(e) => setNewDinasName(e.target.value)}
                  className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all outline-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsRegisteringDinas(false)}
                  className="flex-1 py-3 text-center text-sm font-semibold text-stone-500 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-xl transition-all"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={dinasLoading || !newDinasName.trim()}
                  className="flex-1 py-3 text-center text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-lg shadow-emerald-100 transition-all disabled:opacity-50"
                >
                  {dinasLoading ? 'Mendaftarkan...' : 'Daftar & Masuk'}
                </button>
              </div>
            </form>
          )}

          <button
            onClick={handleLogout}
            className="w-full mt-6 text-stone-400 text-xs hover:text-stone-600 transition-all text-center"
          >
            Keluar dan gunakan akun lain
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
              Email Anda (<span className="font-semibold text-stone-700">{user.email}</span>) belum terdaftar secara otomatis. 
              Silakan masukkan ID Pegawai Anda untuk menghubungkan akun.
            </p>
            <div className="mt-4 p-3 bg-amber-50 border border-amber-100 rounded-xl text-[11px] text-amber-700 text-left">
              <p className="font-bold mb-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> Tips:
              </p>
              Minta Admin untuk mendaftarkan email Anda di Data Pegawai agar proses ini menjadi otomatis di masa mendatang.
            </div>
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
              window.location.href = 'https://www.google.com';
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
            <span className="text-[9px] font-bold text-blue-500 uppercase tracking-widest leading-none mb-1.5 ml-1">
              {userProfile?.dinasName || 'Kesbangpoldagri NTB'}
            </span>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-100">
                <ScanLine className="w-6 h-6 text-white" />
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center">
                <span className="font-bold text-base sm:text-xl text-stone-900 leading-tight">Absensi Pegawai</span>
                {user.email?.toLowerCase().trim() === 'noviharyanto062@gmail.com' && (
                  <select
                    value={userProfile?.dinasId || 'kesbangpol'}
                    onChange={async (e) => {
                      const selectedId = e.target.value;
                      const matched = dinases.find(d => d.id === selectedId);
                      if (matched) {
                        const updated = {
                          ...userProfile,
                          dinasId: matched.id,
                          dinasName: matched.name,
                          role: 'admin'
                        };
                        setUserProfile(updated);
                        await setDoc(doc(db, 'users', user.uid), updated);
                      }
                    }}
                    className="sm:ml-3 mt-1 sm:mt-0 text-[11px] font-medium text-stone-600 bg-stone-50 border border-stone-200 rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    {dinases.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                )}
              </div>
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
            <span>Dinas: {userProfile?.dinasId}</span>
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
              <Scanner dinasId={userProfile?.dinasId} settingsProp={settings} />
            </motion.div>
          ) : (
            <motion.div
              key="admin"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="h-full"
            >
              <AdminPortal dinasId={userProfile?.dinasId} dinasName={userProfile?.dinasName} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
