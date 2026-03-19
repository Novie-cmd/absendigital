import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { collection, query, where, getDocs, addDoc, serverTimestamp, orderBy, limit, getDoc, doc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { format } from 'date-fns';
import { CheckCircle2, XCircle, Clock, User as UserIcon, LogIn, LogOut, Camera, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function Scanner() {
  const [userProfile, setUserProfile] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [scanResult, setScanResult] = useState<{ success: boolean; message: string; data?: any } | null>(null);
  const [isScanning, setIsScanning] = useState(true);
  const [isCameraLoading, setIsCameraLoading] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    // Fetch user profile and office token
    const fetchData = async () => {
      if (auth.currentUser) {
        const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
        if (userDoc.exists()) setUserProfile(userDoc.data());
      }
      const settingsDoc = await getDoc(doc(db, 'settings', 'config'));
      if (settingsDoc.exists()) setSettings(settingsDoc.data());
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (isScanning && !scanResult) {
      startCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isScanning, scanResult]);

  const startCamera = async () => {
    setIsCameraLoading(true);
    setCameraError(null);

    try {
      // Tunggu DOM siap
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const html5QrCode = new Html5Qrcode("reader");
      html5QrCodeRef.current = html5QrCode;

      const config = { fps: 10, qrbox: { width: 250, height: 250 } };

      await html5QrCode.start(
        { facingMode: "environment" },
        config,
        (decodedText) => {
          onScanSuccess(decodedText);
        },
        (errorMessage) => {
          // Abaikan error scan rutin
        }
      );
      
      setIsCameraLoading(false);
    } catch (err: any) {
      console.error("Gagal memulai kamera:", err);
      setIsCameraLoading(false);
      
      if (err?.message?.includes("Permission denied")) {
        setCameraError("Izin kamera ditolak. Silakan izinkan kamera di pengaturan browser Anda.");
      } else if (err?.message?.includes("NotFound")) {
        setCameraError("Kamera tidak ditemukan. Pastikan perangkat Anda memiliki kamera.");
      } else {
        setCameraError("Gagal mengakses kamera. Silakan coba muat ulang halaman atau pastikan kamera tidak sedang digunakan aplikasi lain.");
      }
    }
  };

  const stopCamera = async () => {
    if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
      try {
        await html5QrCodeRef.current.stop();
        html5QrCodeRef.current = null;
      } catch (err) {
        console.error("Gagal menghentikan kamera:", err);
      }
    }
  };

  async function onScanSuccess(decodedText: string) {
    // Hentikan kamera segera setelah berhasil scan
    await stopCamera();
    setIsScanning(false);
    
    try {
      let targetEmployeeId = decodedText;
      let targetEmployeeName = '';

      // Check if it's an Office QR scan by an employee
      if (decodedText === settings?.officeQrToken) {
        if (!userProfile?.employeeId) {
          setScanResult({ success: false, message: 'Akun Anda belum terhubung dengan ID Pegawai.' });
          return;
        }
        targetEmployeeId = userProfile.employeeId;
        targetEmployeeName = userProfile.employeeName || 'Pegawai';
      }

      // 1. Find employee by employeeId
      const employeesRef = collection(db, 'employees');
      const q = query(employeesRef, where('employeeId', '==', targetEmployeeId));
      
      let querySnapshot;
      try {
        querySnapshot = await getDocs(q);
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'employees');
        return;
      }

      if (querySnapshot.empty) {
        setScanResult({ success: false, message: 'Pegawai tidak ditemukan. Silakan hubungi admin.' });
        return;
      }

      const employee = querySnapshot.docs[0].data();
      targetEmployeeName = employee.name;
      const today = format(new Date(), 'yyyy-MM-dd');

      // 2. Check last attendance for today
      const attendanceRef = collection(db, 'attendance');
      const attendanceQuery = query(
        attendanceRef,
        where('employeeId', '==', targetEmployeeId),
        where('date', '==', today)
      );
      
      let attendanceSnapshot;
      try {
        attendanceSnapshot = await getDocs(attendanceQuery);
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'attendance');
        return;
      }

      let type: 'in' | 'out' = 'in';
      if (!attendanceSnapshot.empty) {
        const docs = attendanceSnapshot.docs.map(d => d.data());
        docs.sort((a, b) => {
          const timeA = a.timestamp?.toMillis?.() || 0;
          const timeB = b.timestamp?.toMillis?.() || 0;
          return timeB - timeA;
        });
        const lastAttendance = docs[0];
        type = lastAttendance.type === 'in' ? 'out' : 'in';
      }

      // 3. Calculate Lateness
      let isLate = false;
      let isEarlyLeave = false;
      
      if (settings) {
        const now = new Date();
        const day = now.getDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
        const currentTimeStr = format(now, 'HH:mm');
        
        let startTime = '';
        let endTime = '';
        
        if (day >= 1 && day <= 4) { // Mon-Thu
          startTime = settings.workStartTimeMonThu;
          endTime = settings.workEndTimeMonThu;
        } else if (day === 5) { // Fri
          startTime = settings.workStartTimeFri;
          endTime = settings.workEndTimeFri;
        }
        
        if (startTime && type === 'in') {
          const [startH, startM] = startTime.split(':').map(Number);
          const [currH, currM] = currentTimeStr.split(':').map(Number);
          const startTotal = startH * 60 + startM + (settings.lateThreshold || 0);
          const currTotal = currH * 60 + currM;
          if (currTotal > startTotal) {
            isLate = true;
          }
        }
        
        if (endTime && type === 'out') {
          const [endH, endM] = endTime.split(':').map(Number);
          const [currH, currM] = currentTimeStr.split(':').map(Number);
          const endTotal = endH * 60 + endM;
          const currTotal = currH * 60 + currM;
          if (currTotal < endTotal) {
            isEarlyLeave = true;
          }
        }
      }

      // 4. Record attendance
      try {
        await addDoc(attendanceRef, {
          employeeId: targetEmployeeId,
          employeeName: targetEmployeeName,
          type,
          timestamp: serverTimestamp(),
          date: today,
          method: decodedText === settings?.officeQrToken ? 'self_scan' : 'admin_scan',
          isLate,
          isEarlyLeave
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'attendance');
        return;
      }

      setScanResult({
        success: true,
        message: `Absen ${type === 'in' ? 'Hadir' : 'Pulang'} Berhasil!`,
        data: { name: targetEmployeeName, type, time: format(new Date(), 'HH:mm:ss'), isLate, isEarlyLeave }
      });

    } catch (error) {
      console.error('Attendance error:', error);
      // Jika error adalah JSON string dari handleFirestoreError, parse pesannya
      let displayMessage = 'Terjadi kesalahan sistem. Silakan coba lagi.';
      try {
        const parsedError = JSON.parse((error as Error).message);
        if (parsedError.error) {
          displayMessage = `Kesalahan: ${parsedError.error}`;
        }
      } catch (e) {
        // Bukan JSON, gunakan default
      }
      setScanResult({ success: false, message: displayMessage });
    }
  }

  const resetScanner = () => {
    setScanResult(null);
    setIsScanning(true);
    setCameraError(null);
  };

  return (
    <div className="max-w-2xl mx-auto flex flex-col items-center gap-8">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-stone-900">Scan Barcode / QR Code</h2>
        <p className="text-stone-500 mt-2">Arahkan barcode pegawai Anda ke kamera untuk melakukan absensi.</p>
      </div>

      <div className="w-full bg-white rounded-3xl shadow-xl overflow-hidden border border-stone-200 p-6">
        <AnimatePresence mode="wait">
          {isScanning && !scanResult ? (
            <motion.div
              key="scanner"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="relative"
            >
              {isCameraLoading && (
                <div className="absolute inset-0 z-10 bg-white flex flex-col items-center justify-center gap-4 rounded-2xl min-h-[300px]">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600"></div>
                  <p className="text-stone-500 text-sm animate-pulse">Menghubungkan ke Kamera...</p>
                </div>
              )}
              
              {cameraError && (
                <div className="absolute inset-0 z-20 bg-white flex flex-col items-center justify-center p-8 text-center gap-4 rounded-2xl min-h-[300px]">
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                    <AlertCircle className="w-8 h-8 text-red-600" />
                  </div>
                  <p className="text-stone-700 font-medium">{cameraError}</p>
                  <button
                    onClick={startCamera}
                    className="flex items-center gap-2 bg-stone-900 hover:bg-stone-800 text-white px-6 py-2 rounded-xl transition-all"
                  >
                    <Camera className="w-4 h-4" />
                    Coba Lagi
                  </button>
                </div>
              )}

              <div id="reader" className="w-full overflow-hidden rounded-2xl border-2 border-dashed border-stone-200 min-h-[300px] bg-stone-50"></div>
              
              {!isCameraLoading && !cameraError && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-64 h-64 border-2 border-emerald-500 rounded-3xl animate-pulse flex items-center justify-center">
                    <div className="w-full h-0.5 bg-emerald-500 absolute top-1/2 -translate-y-1/2 animate-[scan_2s_linear_infinite]"></div>
                  </div>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="result"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center text-center py-12"
            >
              {scanResult?.success ? (
                <>
                  <p className="text-[10px] font-bold text-blue-500 uppercase tracking-[0.2em] mb-4">Kesbangpoldagri NTB</p>
                  <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
                    <CheckCircle2 className="w-12 h-12 text-emerald-600" />
                  </div>
                  <h3 className="text-2xl font-bold text-stone-900 mb-2">{scanResult.message}</h3>
                  <div className="bg-stone-50 rounded-2xl p-6 w-full max-w-sm border border-stone-100 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-stone-500">
                        <UserIcon className="w-4 h-4" />
                        <span className="text-sm">Nama Pegawai</span>
                      </div>
                      <span className="font-semibold text-stone-900">{scanResult.data?.name}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-stone-500">
                        <Clock className="w-4 h-4" />
                        <span className="text-sm">Waktu</span>
                      </div>
                      <span className="font-semibold text-stone-900">{scanResult.data?.time}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-stone-500">
                        {scanResult.data?.type === 'in' ? <LogIn className="w-4 h-4" /> : <LogOut className="w-4 h-4" />}
                        <span className="text-sm">Status</span>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
                          scanResult.data?.type === 'in' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {scanResult.data?.type === 'in' ? 'Hadir' : 'Pulang'}
                        </span>
                        {scanResult.data?.isLate && scanResult.data?.type === 'in' && (
                          <span className="text-[10px] font-bold text-red-600 uppercase tracking-wider">Terlambat</span>
                        )}
                        {scanResult.data?.isEarlyLeave && scanResult.data?.type === 'out' && (
                          <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Pulang Awal</span>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-[10px] font-bold text-blue-500 uppercase tracking-[0.2em] mb-4">Kesbangpoldagri NTB</p>
                  <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mb-6">
                    <XCircle className="w-12 h-12 text-red-600" />
                  </div>
                  <h3 className="text-2xl font-bold text-stone-900 mb-2">Gagal Melakukan Absensi</h3>
                  <p className="text-stone-500 mb-8">{scanResult?.message}</p>
                </>
              )}

              <button
                onClick={resetScanner}
                className="mt-8 bg-stone-900 hover:bg-stone-800 text-white font-semibold py-3 px-8 rounded-xl transition-all shadow-lg"
              >
                Scan Lagi
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <style>{`
        @keyframes scan {
          0% { top: 0%; }
          50% { top: 100%; }
          100% { top: 0%; }
        }
        #reader video {
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
          border-radius: 1rem !important;
        }
      `}</style>
    </div>
  );
}
