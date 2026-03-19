import React, { useState } from 'react';
import { LayoutDashboard, Users, Settings as SettingsIcon, FileText, Activity, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { doc, setDoc, serverTimestamp, getDocFromCache, getDocFromServer } from 'firebase/firestore';
import { db } from '../firebase';
import Dashboard from './Dashboard';
import EmployeeManagement from './EmployeeManagement';
import Settings from './Settings';
import Reports from './Reports';

type AdminView = 'dashboard' | 'employees' | 'settings' | 'reports';

export default function AdminPortal() {
  const [activeView, setActiveView] = useState<AdminView>('dashboard');
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);
    console.log('Starting DB connection test...');
    
    try {
      // 1. Try to write to a test collection
      const testDocRef = doc(db, 'test_connection', 'status');
      await setDoc(testDocRef, {
        lastTest: serverTimestamp(),
        status: 'ok',
        testedBy: 'admin'
      });
      
      // 2. Try to read it back from server (not cache) to ensure real connectivity
      const snap = await getDocFromServer(testDocRef);
      
      if (snap.exists()) {
        setTestResult({ success: true, message: 'Koneksi ke Database Berhasil! Database aktif dan merespon.' });
      } else {
        setTestResult({ success: false, message: 'Koneksi berhasil tapi data tidak ditemukan. Silakan cek izin Firestore.' });
      }
    } catch (error: any) {
      console.error('Connection test error:', error);
      let msg = 'Koneksi Gagal: ' + (error.message || 'Terjadi kesalahan.');
      
      if (error.message?.includes('the client is offline')) {
        msg = 'Database Offline: Periksa konfigurasi Firebase Anda atau koneksi internet.';
      } else if (error.code === 'permission-denied') {
        msg = 'Izin Ditolak: Akun Anda mungkin belum terdaftar sebagai Admin di sistem.';
      }
      
      setTestResult({ success: false, message: msg });
    } finally {
      setTestingConnection(false);
    }
  };

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard Absensi', icon: LayoutDashboard },
    { id: 'employees', label: 'Data Pegawai', icon: Users },
    { id: 'settings', label: 'Pengaturan Waktu', icon: SettingsIcon },
    { id: 'reports', label: 'Laporan', icon: FileText },
  ];

  return (
    <div className="flex flex-col lg:flex-row gap-8 h-full">
      {/* Sidebar Menu */}
      <aside className="lg:w-64 flex-shrink-0">
        <div className="bg-white rounded-3xl border border-stone-200 p-2 shadow-sm sticky top-24">
          <nav className="space-y-1">
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id as AdminView)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all ${
                  activeView === item.id
                    ? 'bg-emerald-50 text-emerald-700 shadow-sm'
                    : 'text-stone-500 hover:bg-stone-50 hover:text-stone-900'
                }`}
              >
                <item.icon className={`w-5 h-5 ${activeView === item.id ? 'text-emerald-600' : 'text-stone-400'}`} />
                {item.label}
              </button>
            ))}
          </nav>
          
          <div className="mt-4 pt-4 border-t border-stone-100 px-2 space-y-2">
            <button
              onClick={handleTestConnection}
              disabled={testingConnection}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-xs font-bold transition-all disabled:opacity-50 ${
                testResult?.success 
                  ? 'bg-emerald-50 text-emerald-600' 
                  : testResult === null 
                    ? 'text-stone-400 hover:bg-stone-50 hover:text-stone-600'
                    : 'bg-red-50 text-red-600'
              }`}
            >
              <Activity className={`w-4 h-4 ${testingConnection ? 'animate-pulse' : ''}`} />
              {testingConnection ? 'Mengetes...' : 'Tes Koneksi DB'}
            </button>

            {testResult && (
              <div className={`p-3 rounded-xl text-[10px] flex gap-2 items-start ${
                testResult.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
              }`}>
                {testResult.success ? <CheckCircle2 className="w-3 h-3 mt-0.5 flex-shrink-0" /> : <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />}
                <span>{testResult.message}</span>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Content Area */}
      <div className="flex-1 min-w-0">
        {activeView === 'dashboard' && <Dashboard />}
        {activeView === 'employees' && <EmployeeManagement />}
        {activeView === 'settings' && <Settings />}
        {activeView === 'reports' && <Reports />}
      </div>
    </div>
  );
}
