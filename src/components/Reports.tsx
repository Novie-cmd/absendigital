import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfDay, endOfDay, subDays } from 'date-fns';
import { FileText, Download, Calendar, Search, Filter, User as UserIcon, Clock, LogIn, LogOut, TrendingUp, AlertCircle, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  type: 'in' | 'out';
  timestamp: any;
  date: string;
  isLate?: boolean;
  isEarlyLeave?: boolean;
}

interface Employee {
  id: string;
  name: string;
  employeeId: string;
}

export default function Reports() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch employees for dropdown
    const employeesQuery = query(collection(db, 'employees'), orderBy('name', 'asc'));
    const unsubscribeEmployees = onSnapshot(employeesQuery, (snapshot) => {
      setEmployees(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Employee)));
    });

    return () => unsubscribeEmployees();
  }, []);

  useEffect(() => {
    setLoading(true);
    const q = query(
      collection(db, 'attendance'),
      where('date', '>=', startDate),
      where('date', '<=', endDate),
      orderBy('date', 'desc'),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setRecords(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRecord)));
      setLoading(false);
    });

    return () => unsubscribe();
  }, [startDate, endDate]);

  const filteredRecords = records.filter(record => {
    const matchesSearch = record.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         record.employeeId.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesEmployee = selectedEmployeeId === 'all' || record.employeeId === selectedEmployeeId;
    return matchesSearch && matchesEmployee;
  });

  // Calculate Summary
  const summary = {
    total: filteredRecords.filter(r => r.type === 'in').length,
    late: filteredRecords.filter(r => r.type === 'in' && r.isLate).length,
    earlyLeave: filteredRecords.filter(r => r.type === 'out' && r.isEarlyLeave).length,
    onTime: filteredRecords.filter(r => r.type === 'in' && !r.isLate).length
  };

  const setQuickFilter = (type: 'today' | 'week' | 'month') => {
    const now = new Date();
    if (type === 'today') {
      setStartDate(format(now, 'yyyy-MM-dd'));
      setEndDate(format(now, 'yyyy-MM-dd'));
    } else if (type === 'week') {
      setStartDate(format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
      setEndDate(format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
    } else if (type === 'month') {
      setStartDate(format(startOfMonth(now), 'yyyy-MM-dd'));
      setEndDate(format(endOfMonth(now), 'yyyy-MM-dd'));
    }
  };

  const exportToCSV = () => {
    const headers = ['Nama Pegawai', 'ID Pegawai', 'Tipe', 'Tanggal', 'Waktu', 'Status'];
    const rows = filteredRecords.map(record => [
      record.employeeName,
      record.employeeId,
      record.type === 'in' ? 'Hadir' : 'Pulang',
      record.date,
      record.timestamp?.toDate ? format(record.timestamp.toDate(), 'HH:mm:ss') : '--:--',
      record.isLate ? 'Terlambat' : record.isEarlyLeave ? 'Pulang Awal' : 'Tepat Waktu'
    ]);

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Laporan_Absensi_${startDate}_to_${endDate}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-stone-900">Laporan Absensi</h2>
          <p className="text-stone-500 text-sm">Pantau kehadiran pegawai secara berkala.</p>
        </div>
        <button
          onClick={exportToCSV}
          className="flex items-center justify-center gap-2 bg-stone-900 hover:bg-stone-800 text-white font-semibold py-3 px-6 rounded-2xl transition-all shadow-lg"
        >
          <Download className="w-5 h-5" />
          Ekspor CSV
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
          <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center mb-4">
            <TrendingUp className="w-5 h-5 text-blue-600" />
          </div>
          <p className="text-xs font-bold text-stone-500 uppercase tracking-wider">Total Kehadiran</p>
          <h3 className="text-2xl font-bold text-stone-900 mt-1">{summary.total}</h3>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
          <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center mb-4">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          </div>
          <p className="text-xs font-bold text-stone-500 uppercase tracking-wider">Tepat Waktu</p>
          <h3 className="text-2xl font-bold text-stone-900 mt-1">{summary.onTime}</h3>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
          <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center mb-4">
            <AlertCircle className="w-5 h-5 text-red-600" />
          </div>
          <p className="text-xs font-bold text-stone-500 uppercase tracking-wider">Terlambat</p>
          <h3 className="text-2xl font-bold text-stone-900 mt-1">{summary.late}</h3>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
          <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center mb-4">
            <Clock className="w-5 h-5 text-amber-600" />
          </div>
          <p className="text-xs font-bold text-stone-500 uppercase tracking-wider">Pulang Awal</p>
          <h3 className="text-2xl font-bold text-stone-900 mt-1">{summary.earlyLeave}</h3>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm space-y-6">
        <div className="flex flex-wrap gap-2">
          <button 
            onClick={() => setQuickFilter('today')}
            className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-bold transition-all"
          >
            Hari Ini
          </button>
          <button 
            onClick={() => setQuickFilter('week')}
            className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-bold transition-all"
          >
            Minggu Ini
          </button>
          <button 
            onClick={() => setQuickFilter('month')}
            className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-bold transition-all"
          >
            Bulan Ini
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-500 uppercase tracking-wider flex items-center gap-2">
              <Calendar className="w-3 h-3" />
              Dari Tanggal
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all font-semibold"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-500 uppercase tracking-wider flex items-center gap-2">
              <Calendar className="w-3 h-3" />
              Sampai Tanggal
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all font-semibold"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-500 uppercase tracking-wider flex items-center gap-2">
              <UserIcon className="w-3 h-3" />
              Pilih Pegawai
            </label>
            <select
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all font-semibold"
            >
              <option value="all">Semua Pegawai</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.employeeId}>{emp.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-500 uppercase tracking-wider flex items-center gap-2">
              <Search className="w-3 h-3" />
              Cari Cepat
            </label>
            <input
              type="text"
              placeholder="Nama / ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all font-semibold"
            />
          </div>
        </div>
      </div>

      {/* Records Table */}
      <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200">
                <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase tracking-wider">Pegawai</th>
                <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase tracking-wider">ID Pegawai</th>
                <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase tracking-wider">Tipe</th>
                <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase tracking-wider">Tanggal</th>
                <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase tracking-wider text-right">Waktu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {loading ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-stone-400">Memuat data...</td></tr>
              ) : filteredRecords.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-stone-400">Tidak ada data absensi untuk periode ini.</td></tr>
              ) : (
                filteredRecords.map((record) => (
                  <tr key={record.id} className="hover:bg-stone-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-stone-100 rounded-lg flex items-center justify-center text-stone-500 font-bold text-xs">
                          {record.employeeName.charAt(0)}
                        </div>
                        <span className="font-bold text-stone-900">{record.employeeName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-stone-600 font-mono text-sm">{record.employeeId}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase flex items-center gap-1 w-fit ${
                          record.type === 'in' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {record.type === 'in' ? <LogIn className="w-3 h-3" /> : <LogOut className="w-3 h-3" />}
                          {record.type === 'in' ? 'Hadir' : 'Pulang'}
                        </span>
                        {record.isLate && record.type === 'in' && (
                          <span className="text-[10px] font-bold text-red-600 uppercase tracking-wider ml-1">Terlambat</span>
                        )}
                        {record.isEarlyLeave && record.type === 'out' && (
                          <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider ml-1">Pulang Awal</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-stone-600 text-sm">{record.date}</td>
                    <td className="px-6 py-4 text-right font-mono text-stone-900 font-bold">
                      {record.timestamp?.toDate ? format(record.timestamp.toDate(), 'HH:mm:ss') : '--:--'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
