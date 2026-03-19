import React, { useState } from 'react';
import { LayoutDashboard, Users, Settings as SettingsIcon, FileText, Activity } from 'lucide-react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import Dashboard from './Dashboard';
import EmployeeManagement from './EmployeeManagement';
import Settings from './Settings';
import Reports from './Reports';

type AdminView = 'dashboard' | 'employees' | 'settings' | 'reports';

export default function AdminPortal() {
  const [activeView, setActiveView] = useState<AdminView>('dashboard');
  const [testingConnection, setTestingConnection] = useState(false);

  const handleTestConnection = async () => {
    setTestingConnection(true);
    try {
      await setDoc(doc(db, 'test_connection', 'status'), {
        lastTest: serverTimestamp(),
        status: 'ok'
      });
      alert('Koneksi ke Database Berhasil!');
    } catch (error: any) {
      console.error('Connection test error:', error);
      alert('Koneksi ke Database Gagal: ' + (error.message || 'Terjadi kesalahan.'));
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
          
          <div className="mt-4 pt-4 border-t border-stone-100 px-2">
            <button
              onClick={handleTestConnection}
              disabled={testingConnection}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-xs font-bold text-stone-400 hover:bg-stone-50 hover:text-stone-600 transition-all disabled:opacity-50"
            >
              <Activity className={`w-4 h-4 ${testingConnection ? 'animate-pulse' : ''}`} />
              {testingConnection ? 'Mengetes...' : 'Tes Koneksi DB'}
            </button>
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
