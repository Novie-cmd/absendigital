import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { Clock, Save, AlertCircle, CheckCircle2, QrCode, Download, MapPin, Navigation, FileText, ExternalLink, Database, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { getGoogleToken, setGoogleToken, createSpreadsheet, verifySpreadsheetAccess } from '../utils/googleSheets';

export default function Settings({ dinasId, dinasName }: { dinasId?: string; dinasName?: string }) {
  const [settings, setSettings] = useState({
    workStartTimeMonThu: '08:00',
    workEndTimeMonThu: '17:00',
    workStartTimeFri: '08:00',
    workEndTimeFri: '16:30',
    lateThreshold: 15,
    officeQrToken: 'OFFICE_ATTENDANCE_TOKEN_123',
    officeLat: 0,
    officeLng: 0,
    officeRadius: 100,
    useGeofencing: false,
    useGoogleSheets: false,
    spreadsheetId: '',
    spreadsheetUrl: ''
  });
  const [googleAuthToken, setGoogleAuthToken] = useState<string | null>(getGoogleToken());
  const [creatingSheet, setCreatingSheet] = useState(false);
  const [verifyingSheet, setVerifyingSheet] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [resolvedDinasName, setResolvedDinasName] = useState<string>('');

  useEffect(() => {
    const currentDinasId = dinasId || 'kesbangpol';
    const fetchDinasName = async () => {
      try {
        const dSnap = await getDoc(doc(db, 'dinases', currentDinasId));
        if (dSnap.exists()) {
          setResolvedDinasName(dSnap.data().name);
        } else {
          setResolvedDinasName(dinasName || 'Kesbangpoldagri NTB');
        }
      } catch (err) {
        console.error('Error fetching dinas name from db:', err);
        setResolvedDinasName(dinasName || 'Kesbangpoldagri NTB');
      }
    };
    fetchDinasName();
  }, [dinasId, dinasName]);

  useEffect(() => {
    const currentDinasId = dinasId || 'kesbangpol';
    const unsubscribe = onSnapshot(doc(db, 'settings', currentDinasId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setSettings(prev => ({ ...prev, ...data }));
      }
      setLoading(false);
      setError(null);
    }, (err) => {
      console.error('Settings: Snapshot error:', err);
      setError('Gagal memuat pengaturan. Pastikan Anda memiliki izin yang cukup.');
      setLoading(false);
    });
    return () => unsubscribe();
  }, [dinasId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    const currentDinasId = dinasId || 'kesbangpol';
    const nameOfDinas = resolvedDinasName || dinasName || "Kesbangpoldagri NTB";
    try {
      await setDoc(doc(db, 'settings', currentDinasId), {
        ...settings,
        dinasId: currentDinasId,
        dinasName: nameOfDinas
      }, { merge: true });
      setMessage({ type: 'success', text: 'Pengaturan berhasil disimpan!' });
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      console.error('Error saving settings:', err);
      setMessage({ type: 'error', text: 'Gagal menyimpan pengaturan: ' + (err.message || 'Terjadi kesalahan.') });
    } finally {
      setSaving(false);
    }
  };

  const downloadOfficeQR = () => {
    const svg = document.getElementById('office-qr');
    if (svg) {
      const svgData = new XMLSerializer().serializeToString(svg);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const img = new Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx?.drawImage(img, 0, 0);
        const pngFile = canvas.toDataURL("image/png");
        const downloadLink = document.createElement("a");
        downloadLink.download = `QR_KANTOR_ABSENSI.png`;
        downloadLink.href = `${pngFile}`;
        downloadLink.click();
      };
      img.src = "data:image/svg+xml;base64," + btoa(svgData);
    }
  };

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation tidak didukung oleh browser Anda.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setSettings({
          ...settings,
          officeLat: position.coords.latitude,
          officeLng: position.coords.longitude
        });
        alert("Lokasi berhasil diambil!");
      },
      (error) => {
        console.error("Error getting location:", error);
        alert("Gagal mengambil lokasi. Pastikan izin lokasi diberikan.");
      }
    );
  };

  const loginGoogleAccount = async () => {
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/spreadsheets');
    provider.addScope('https://www.googleapis.com/auth/drive.file');
    try {
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setGoogleToken(credential.accessToken);
        setGoogleAuthToken(credential.accessToken);
        alert("Akun Google berhasil dihubungkan!");
      } else {
        alert("Gagal mendapatkan kode akses Google.");
      }
    } catch (err: any) {
      console.error("Google login error:", err);
      alert("Gagal menghubungkan ke Google: " + (err.message || err));
    }
  };

  const handleCreateNewSheet = async () => {
    if (!googleAuthToken) {
      alert("Silakan hubungkan akun Google Anda terlebih dahulu.");
      return;
    }
    
    setCreatingSheet(true);
    const currentDinasId = dinasId || 'kesbangpol';
    const nameOfDinas = resolvedDinasName || dinasName || (settings as any).dinasName || "Kesbangpoldagri NTB";
    try {
      const sheetInfo = await createSpreadsheet(googleAuthToken, `Data Absensi ${nameOfDinas}`);
      const updatedSettings = {
        ...settings,
        useGoogleSheets: true,
        spreadsheetId: sheetInfo.id,
        spreadsheetUrl: sheetInfo.url
      };
      setSettings(updatedSettings);
      
      // Save directly to firestore
      await setDoc(doc(db, 'settings', currentDinasId), {
        ...updatedSettings,
        dinasId: currentDinasId,
        dinasName: nameOfDinas
      }, { merge: true });
      alert("Berhasil membuat Google Sheets baru untuk absensi!");
    } catch (err: any) {
      console.error("Error creating sheet:", err);
      if (err.message && (err.message.includes("401") || err.message.includes("UNAUTHENTICATED"))) {
        setGoogleToken(null);
        setGoogleAuthToken(null);
        alert("Sesi Google Anda telah berakhir atau tidak valid. Silakan klik tombol 'Hubungkan' terlebih dahulu untuk menyambungkan kembali akun Google Anda.");
      } else {
        alert("Gagal membuat Google Sheets: " + (err.message || err));
      }
    } finally {
      setCreatingSheet(false);
    }
  };

  const handleVerifyAccess = async () => {
    if (!googleAuthToken) {
      alert("Silakan hubungkan akun Google Anda terlebih dahulu.");
      return;
    }
    if (!settings.spreadsheetId.trim()) {
      alert("Silakan masukkan ID Spreadsheet terlebih dahulu.");
      return;
    }

    setVerifyingSheet(true);
    try {
      const accessible = await verifySpreadsheetAccess(googleAuthToken, settings.spreadsheetId.trim());
      if (accessible) {
        alert("Koneksi berhasil! Spreadsheet dapat diakses dengan baik.");
      } else {
        alert("Koneksi Gagal. Periksa kembali ID Spreadsheet Anda atau pastikan akun Google berhak mengakses file tersebut.");
      }
    } catch (err: any) {
      console.error("Error verifying access:", err);
      if (err.message && (err.message.includes("401") || err.message.includes("UNAUTHENTICATED"))) {
        setGoogleToken(null);
        setGoogleAuthToken(null);
        alert("Sesi Google Anda telah berakhir atau tidak valid. Silakan klik tombol 'Hubungkan' terlebih dahulu untuk menyambungkan kembali akun Google Anda.");
      } else if (err.message === "NOT_FOUND" || (err.message && err.message.includes("404"))) {
        alert("Gagal melakukan verifikasi: Spreadsheet tidak ditemukan atau telah dihapus dari Google Drive Anda. Silakan hapus ID tersebut lalu klik tombol hijau di bawah untuk membuat spreadsheet yang baru.");
      } else {
        alert("Gagal melakukan verifikasi: " + (err.message || err));
      }
    } finally {
      setVerifyingSheet(false);
    }
  };

  if (loading) return <div className="animate-pulse space-y-8">...</div>;

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-3xl p-8 text-center">
        <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-red-900 mb-2">Terjadi Kesalahan</h3>
        <p className="text-red-700 mb-6">{error}</p>
        <button 
          onClick={() => window.location.reload()}
          className="bg-red-600 text-white px-6 py-2 rounded-xl hover:bg-red-700 transition-all"
        >
          Muat Ulang Halaman
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="space-y-8">
        <div className="text-left">
          <h2 className="text-3xl font-bold text-stone-900">Pengaturan Waktu</h2>
          <p className="text-stone-500 mt-2">Atur jam kerja dan toleransi keterlambatan.</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-3xl border border-stone-200 shadow-xl p-8 space-y-8">
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-stone-900 border-b border-stone-100 pb-2">Senin - Kamis</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-bold text-stone-700">
                  <Clock className="w-4 h-4 text-emerald-600" />
                  Jam Masuk
                </label>
                <input
                  type="time"
                  value={settings.workStartTimeMonThu}
                  onChange={(e) => setSettings({ ...settings, workStartTimeMonThu: e.target.value })}
                  className="w-full px-6 py-4 bg-stone-50 border border-stone-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all text-xl font-bold text-stone-900"
                />
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-bold text-stone-700">
                  <Clock className="w-4 h-4 text-amber-600" />
                  Jam Pulang
                </label>
                <input
                  type="time"
                  value={settings.workEndTimeMonThu}
                  onChange={(e) => setSettings({ ...settings, workEndTimeMonThu: e.target.value })}
                  className="w-full px-6 py-4 bg-stone-50 border border-stone-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all text-xl font-bold text-stone-900"
                />
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <h3 className="text-lg font-bold text-stone-900 border-b border-stone-100 pb-2">Jum'at</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-bold text-stone-700">
                  <Clock className="w-4 h-4 text-emerald-600" />
                  Jam Masuk
                </label>
                <input
                  type="time"
                  value={settings.workStartTimeFri}
                  onChange={(e) => setSettings({ ...settings, workStartTimeFri: e.target.value })}
                  className="w-full px-6 py-4 bg-stone-50 border border-stone-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all text-xl font-bold text-stone-900"
                />
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-bold text-stone-700">
                  <Clock className="w-4 h-4 text-amber-600" />
                  Jam Pulang
                </label>
                <input
                  type="time"
                  value={settings.workEndTimeFri}
                  onChange={(e) => setSettings({ ...settings, workEndTimeFri: e.target.value })}
                  className="w-full px-6 py-4 bg-stone-50 border border-stone-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all text-xl font-bold text-stone-900"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-bold text-stone-700">
              <AlertCircle className="w-4 h-4 text-blue-600" />
              Toleransi Keterlambatan (Menit)
            </label>
            <div className="relative">
              <input
                type="number"
                min="0"
                max="120"
                value={settings.lateThreshold}
                onChange={(e) => setSettings({ ...settings, lateThreshold: parseInt(e.target.value) })}
                className="w-full px-6 py-4 bg-stone-50 border border-stone-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all text-xl font-bold text-stone-900 pr-20"
              />
              <span className="absolute right-6 top-1/2 -translate-y-1/2 text-stone-400 font-bold">Menit</span>
            </div>
          </div>

          <div className="space-y-6 pt-4 border-t border-stone-100">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-stone-900">Pembatasan Lokasi (Geofencing)</h3>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={settings.useGeofencing}
                  onChange={(e) => setSettings({ ...settings, useGeofencing: e.target.checked })}
                  className="sr-only peer" 
                />
                <div className="w-11 h-6 bg-stone-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>

            {settings.useGeofencing && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="space-y-6"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-500 uppercase tracking-wider">Latitude</label>
                    <input
                      type="number"
                      step="any"
                      value={settings.officeLat}
                      onChange={(e) => setSettings({ ...settings, officeLat: parseFloat(e.target.value) })}
                      className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-500 uppercase tracking-wider">Longitude</label>
                    <input
                      type="number"
                      step="any"
                      value={settings.officeLng}
                      onChange={(e) => setSettings({ ...settings, officeLng: parseFloat(e.target.value) })}
                      className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl font-mono text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-500 uppercase tracking-wider">Radius Jangkauan (Meter)</label>
                  <div className="relative">
                    <input
                      type="number"
                      min="10"
                      max="1000"
                      value={settings.officeRadius}
                      onChange={(e) => setSettings({ ...settings, officeRadius: parseInt(e.target.value) })}
                      className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl font-bold"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400 text-xs">Meter</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={getCurrentLocation}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-blue-50 text-blue-700 rounded-xl text-sm font-bold hover:bg-blue-100 transition-all"
                >
                  <Navigation className="w-4 h-4" />
                  Gunakan Lokasi Saya Saat Ini
                </button>
                <p className="text-[10px] text-stone-400 italic">
                  *Klik tombol di atas saat Anda berada di titik tengah kantor untuk mengatur koordinat secara otomatis.
                </p>
              </motion.div>
            )}
          </div>

          <AnimatePresence>
            {message && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={`p-4 rounded-2xl flex items-center gap-3 ${
                  message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100'
                }`}
              >
                {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                <span className="font-semibold">{message.text}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            type="submit"
            disabled={saving}
            className="w-full flex items-center justify-center gap-3 bg-stone-900 hover:bg-stone-800 text-white font-bold py-5 rounded-2xl transition-all shadow-xl disabled:opacity-50"
          >
            {saving ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            ) : (
              <>
                <Save className="w-6 h-6" />
                Simpan Perubahan
              </>
            )}
          </button>
        </form>
      </div>

      <div className="space-y-8">
        <div className="text-left">
          <h2 className="text-3xl font-bold text-stone-900">QR Code Kantor</h2>
          <p className="text-stone-500 mt-2">Cetak QR Code ini dan tempel di dinding kantor untuk di-scan pegawai.</p>
        </div>

        <div className="bg-white rounded-3xl border border-stone-200 shadow-xl p-8 flex flex-col items-center text-center">
          <div className="bg-white p-6 rounded-3xl border-2 border-stone-100 mb-6">
            <QRCodeSVG
              id="office-qr"
              value={`${window.location.origin}/?token=${settings.officeQrToken}`}
              size={240}
              level="H"
              includeMargin={true}
            />
          </div>
          <h4 className="text-xl font-bold text-stone-900 mb-2">QR Absensi Lokasi</h4>
          <p className="text-stone-400 text-sm max-w-xs">
            Cetak QR ini. Pegawai dapat melakukan scan menggunakan Google Lens atau kamera HP untuk langsung masuk ke sistem absensi.
          </p>
          <button
            onClick={downloadOfficeQR}
            type="button"
            className="mt-8 w-full flex items-center justify-center gap-2 bg-emerald-600 text-white font-bold py-4 rounded-2xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
          >
            <Download className="w-5 h-5" />
            Unduh QR Kantor
          </button>
        </div>

        {/* Integrasi Google Sheets Bento Card */}
        <div className="bg-white rounded-3xl border border-stone-200 shadow-xl p-8 flex flex-col">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center">
              <Database className="w-6 h-6 text-emerald-600" />
            </div>
            <div className="text-left">
              <h3 className="text-lg font-bold text-stone-900">Integrasi Google Sheets</h3>
              <p className="text-xs text-stone-400">Hubungkan database absensi ke spreadsheet Anda</p>
            </div>
          </div>

          <div className="space-y-6">
            {/* Status Google Connection */}
            <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 flex items-center justify-between text-left">
              <div>
                <p className="text-xs font-bold text-stone-500 uppercase tracking-wider">Status Koneksi Akun</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`w-2.5 h-2.5 rounded-full ${googleAuthToken ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`}></span>
                  <span className="text-sm font-semibold text-stone-700">
                    {googleAuthToken ? 'Terhubung ke Google' : 'Google Belum Terhubung'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={loginGoogleAccount}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  googleAuthToken 
                    ? 'bg-stone-200 text-stone-600 hover:bg-stone-300' 
                    : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-md shadow-emerald-100'
                }`}
              >
                {googleAuthToken ? 'Ganti Akun' : 'Hubungkan'}
              </button>
            </div>

            {/* Google Sheets Sync Toggles & Settings */}
            <div className="space-y-4 text-left">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-stone-800">Aktifkan Sinkronisasi Otomatis</h4>
                  <p className="text-[11px] text-stone-400">Absensi pegawai otomatis masuk ke Sheets</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.useGoogleSheets}
                    disabled={!googleAuthToken}
                    onChange={(e) => setSettings({ ...settings, useGoogleSheets: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-stone-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600 peer-disabled:opacity-50"></div>
                </label>
              </div>

              {!googleAuthToken && (
                <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-[11px] text-amber-700">
                  <p className="font-bold flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" /> Memerlukan Hubungan Google
                  </p>
                  Sesi Google Anda belum aktif. Silakan klik "Hubungkan" di atas terlebih dahulu demi mengizinkan sinkronisasi ke spreadsheet.
                </div>
              )}

              {googleAuthToken && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="space-y-4 pt-2 border-t border-stone-100"
                >
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">ID Spreadsheet Google</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Masukkan ID Spreadsheet..."
                        value={settings.spreadsheetId}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSettings({
                            ...settings,
                            spreadsheetId: val,
                            spreadsheetUrl: val.trim() ? `https://docs.google.com/spreadsheets/d/${val.trim()}/edit` : ''
                          });
                        }}
                        className="flex-1 px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-mono"
                      />
                      <button
                        type="button"
                        onClick={handleVerifyAccess}
                        disabled={verifyingSheet}
                        className="px-3 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-semibold border border-stone-200 transition-all disabled:opacity-50"
                      >
                        {verifyingSheet ? 'Cek..' : 'Tes'}
                      </button>
                    </div>
                  </div>

                  {settings.spreadsheetId && (
                    <div className="space-y-1.5 p-3.5 bg-emerald-50/40 rounded-2xl border border-emerald-100 flex flex-col items-start">
                      <a
                        href={`https://docs.google.com/spreadsheets/d/${settings.spreadsheetId}/edit`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-800 transition underline decoration-dashed underline-offset-4"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Buka Spreadsheet Anda di Google Sheets ↗
                      </a>
                      <p className="text-[11px] text-stone-500 leading-relaxed">
                        <strong>Catatan Penting:</strong> Jika spreadsheet Anda dilaporkan <em>telah dihapus</em> atau tidak dapat diakses di Google Drive, silakan hapus ID Spreadsheet di atas dan buat sheet yang baru dengan menekan tombol hijau di bawah ini.
                      </p>
                    </div>
                  )}

                  <div className="pt-2">
                    <div className="text-center text-xs text-stone-400 font-semibold mb-2">— ATAU —</div>
                    <button
                      type="button"
                      onClick={handleCreateNewSheet}
                      disabled={creatingSheet}
                      className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/60 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                    >
                      {creatingSheet ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-emerald-600"></div>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 text-emerald-500" />
                          Buat Google Sheets Absensi Baru
                        </>
                      )}
                    </button>
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
