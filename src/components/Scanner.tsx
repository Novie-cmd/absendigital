import React, { useState, useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { collection, query, where, getDocs, addDoc, serverTimestamp, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { format } from 'date-fns';
import { CheckCircle2, XCircle, Clock, User as UserIcon, LogIn, LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function Scanner() {
  const [scanResult, setScanResult] = useState<{ success: boolean; message: string; data?: any } | null>(null);
  const [isScanning, setIsScanning] = useState(true);
  const [isCameraLoading, setIsCameraLoading] = useState(true);
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    if (isScanning) {
      setIsCameraLoading(true);
      // Berikan sedikit jeda agar DOM siap
      const timer = setTimeout(() => {
        const scanner = new Html5QrcodeScanner(
          'reader',
          { fps: 10, qrbox: { width: 250, height: 250 } },
          /* verbose= */ false
        );

        scanner.render(
          (decodedText) => {
            onScanSuccess(decodedText);
          },
          (error) => {
            // onScanFailure - Abaikan error scan rutin
            setIsCameraLoading(false);
          }
        );
        
        scannerRef.current = scanner;
        
        // Cek apakah video element sudah muncul
        const checkVideo = setInterval(() => {
          const video = document.querySelector('#reader video');
          if (video) {
            setIsCameraLoading(false);
            clearInterval(checkVideo);
          }
        }, 100);

        return () => clearInterval(checkVideo);
      }, 500);

      return () => clearTimeout(timer);
    }

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(error => {
          console.error('Failed to clear scanner:', error);
        });
      }
    };
  }, [isScanning]);

  async function onScanSuccess(decodedText: string) {
    if (!isScanning) return;
    setIsScanning(false);
    
    try {
      // 1. Find employee by employeeId (decodedText)
      const employeesRef = collection(db, 'employees');
      const q = query(employeesRef, where('employeeId', '==', decodedText));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        setScanResult({ success: false, message: 'Pegawai tidak ditemukan. Silakan hubungi admin.' });
        return;
      }

      const employee = querySnapshot.docs[0].data();
      const employeeName = employee.name;
      const today = format(new Date(), 'yyyy-MM-dd');

      // 2. Check last attendance for today
      const attendanceRef = collection(db, 'attendance');
      const attendanceQuery = query(
        attendanceRef,
        where('employeeId', '==', decodedText),
        where('date', '==', today),
        orderBy('timestamp', 'desc'),
        limit(1)
      );
      const attendanceSnapshot = await getDocs(attendanceQuery);

      let type: 'in' | 'out' = 'in';
      if (!attendanceSnapshot.empty) {
        const lastAttendance = attendanceSnapshot.docs[0].data();
        type = lastAttendance.type === 'in' ? 'out' : 'in';
      }

      // 3. Record attendance
      await addDoc(attendanceRef, {
        employeeId: decodedText,
        employeeName,
        type,
        timestamp: serverTimestamp(),
        date: today
      });

      setScanResult({
        success: true,
        message: `Absen ${type === 'in' ? 'Hadir' : 'Pulang'} Berhasil!`,
        data: { name: employeeName, type, time: format(new Date(), 'HH:mm:ss') }
      });

    } catch (error) {
      console.error('Attendance error:', error);
      setScanResult({ success: false, message: 'Terjadi kesalahan sistem. Silakan coba lagi.' });
    }
  }

  function onScanFailure(error: any) {
    // console.warn(`Code scan error = ${error}`);
  }

  const resetScanner = () => {
    setScanResult(null);
    setIsScanning(true);
  };

  return (
    <div className="max-w-2xl mx-auto flex flex-col items-center gap-8">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-stone-900">Scan Barcode / QR Code</h2>
        <p className="text-stone-500 mt-2">Arahkan barcode pegawai Anda ke kamera untuk melakukan absensi.</p>
      </div>

      <div className="w-full bg-white rounded-3xl shadow-xl overflow-hidden border border-stone-200 p-6">
        <AnimatePresence mode="wait">
          {isScanning ? (
            <motion.div
              key="scanner"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="relative"
            >
              {isCameraLoading && (
                <div className="absolute inset-0 z-10 bg-white flex flex-col items-center justify-center gap-4 rounded-2xl">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600"></div>
                  <p className="text-stone-500 text-sm animate-pulse">Menyiapkan Kamera...</p>
                </div>
              )}
              <div id="reader" className="w-full overflow-hidden rounded-2xl border-2 border-dashed border-stone-200"></div>
              {!isCameraLoading && (
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
                      <span className="font-semibold text-stone-900">{scanResult.data.name}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-stone-500">
                        <Clock className="w-4 h-4" />
                        <span className="text-sm">Waktu</span>
                      </div>
                      <span className="font-semibold text-stone-900">{scanResult.data.time}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-stone-500">
                        {scanResult.data.type === 'in' ? <LogIn className="w-4 h-4" /> : <LogOut className="w-4 h-4" />}
                        <span className="text-sm">Status</span>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
                        scanResult.data.type === 'in' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {scanResult.data.type === 'in' ? 'Hadir' : 'Pulang'}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <>
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
        #reader__scan_region {
          background: white !important;
        }
        #reader__dashboard_section_csr button {
          background: #10b981 !important;
          color: white !important;
          border: none !important;
          padding: 8px 16px !important;
          border-radius: 8px !important;
          font-weight: 600 !important;
          cursor: pointer !important;
        }
      `}</style>
    </div>
  );
}
