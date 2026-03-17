import React, { useState } from 'react';
import { LayoutDashboard, Users, Settings as SettingsIcon, FileText } from 'lucide-react';
import Dashboard from './Dashboard';
import EmployeeManagement from './EmployeeManagement';
import Settings from './Settings';
import Reports from './Reports';

type AdminView = 'dashboard' | 'employees' | 'settings' | 'reports';

export default function AdminPortal() {
  const [activeView, setActiveView] = useState<AdminView>('dashboard');

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
