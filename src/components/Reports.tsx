import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, onSnapshot, doc, deleteDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfDay, endOfDay, subDays, parse } from 'date-fns';
import { id } from 'date-fns/locale';
import { FileText, Download, Calendar, Search, Filter, User as UserIcon, Clock, LogIn, LogOut, TrendingUp, AlertCircle, CheckCircle2, Edit2, Trash2, X, Printer } from 'lucide-react';
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
  const [viewMode, setViewMode] = useState<'history' | 'not-present'>('history');
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus data absensi ini?')) return;
    
    try {
      await deleteDoc(doc(db, 'attendance', id));
    } catch (error) {
      console.error('Error deleting record:', error);
      alert('Gagal menghapus data.');
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord) return;

    try {
      const recordRef = doc(db, 'attendance', editingRecord.id);
      
      // If timestamp is edited as string, convert back to Firestore Timestamp
      // For simplicity, we'll assume the user might want to edit the date and time
      // But let's just allow editing the type and status for now if we don't want to overcomplicate
      // Actually, let's allow editing the type and the 'isLate'/'isEarlyLeave' flags
      
      await updateDoc(recordRef, {
        type: editingRecord.type,
        isLate: editingRecord.isLate || false,
        isEarlyLeave: editingRecord.isEarlyLeave || false,
        date: editingRecord.date
      });

      setEditingRecord(null);
    } catch (error) {
      console.error('Error updating record:', error);
      alert('Gagal memperbarui data.');
    }
  };

  useEffect(() => {
    // Fetch employees for dropdown and "not present" check
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

  // Calculate Not Present Today
  const today = format(new Date(), 'yyyy-MM-dd');
  const presentTodayIds = new Set(
    records
      .filter(r => r.date === today && r.type === 'in')
      .map(r => r.employeeId)
  );
  
  const notPresentToday = employees.filter(emp => !presentTodayIds.has(emp.employeeId));

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
    if (viewMode === 'history') {
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
    } else {
      const headers = ['Nama Pegawai', 'ID Pegawai', 'Status'];
      const rows = notPresentToday.map(emp => [
        emp.name,
        emp.employeeId,
        'Belum Absen Hari Ini'
      ]);

      const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `Pegawai_Belum_Absen_${today}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const title = viewMode === 'history' 
      ? `Laporan Absensi (${format(parse(startDate, 'yyyy-MM-dd', new Date()), 'dd MMM yyyy', { locale: id })} - ${format(parse(endDate, 'yyyy-MM-dd', new Date()), 'dd MMM yyyy', { locale: id })})`
      : `Daftar Pegawai Belum Absen (${format(new Date(), 'dd MMMM yyyy', { locale: id })})`;

    const content = `
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: sans-serif; padding: 40px; color: #333; }
            h1 { text-align: center; margin-bottom: 10px; font-size: 24px; }
            h2 { text-align: center; margin-bottom: 30px; font-size: 16px; color: #666; font-weight: normal; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 12px 8px; text-align: left; font-size: 12px; }
            th { background-color: #f8f9fa; font-weight: bold; }
            .summary { display: flex; justify-content: space-around; margin-bottom: 30px; padding: 20px; background: #f8f9fa; border-radius: 8px; }
            .summary-item { text-align: center; }
            .summary-label { font-size: 10px; text-transform: uppercase; color: #666; margin-bottom: 5px; }
            .summary-value { font-size: 20px; font-weight: bold; }
            .status-tag { padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; }
            .status-late { color: #dc2626; }
            .status-early { color: #d97706; }
            .footer { margin-top: 50px; text-align: right; font-size: 12px; }
            @media print {
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <h1>KESBANGPOLDAGRI NTB</h1>
          <h2>${title}</h2>
          
          ${viewMode === 'history' ? `
            <div class="summary">
              <div class="summary-item">
                <div class="summary-label">Total Kehadiran</div>
                <div class="summary-value">${summary.total}</div>
              </div>
              <div class="summary-item">
                <div class="summary-label">Tepat Waktu</div>
                <div class="summary-value">${summary.onTime}</div>
              </div>
              <div class="summary-item">
                <div class="summary-label">Terlambat</div>
                <div class="summary-value">${summary.late}</div>
              </div>
              <div class="summary-item">
                <div class="summary-label">Pulang Awal</div>
                <div class="summary-value">${summary.earlyLeave}</div>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>No</th>
                  <th>Nama Pegawai</th>
                  <th>ID Pegawai</th>
                  <th>Tipe</th>
                  <th>Tanggal</th>
                  <th>Waktu</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${filteredRecords.map((r, i) => `
                  <tr>
                    <td>${i + 1}</td>
                    <td>${r.employeeName}</td>
                    <td>${r.employeeId}</td>
                    <td>${r.type === 'in' ? 'Hadir' : 'Pulang'}</td>
                    <td>${r.date}</td>
                    <td>${r.timestamp?.toDate ? format(r.timestamp.toDate(), 'HH:mm:ss') : '--:--'}</td>
                    <td>
                      ${r.isLate ? '<span class="status-late">Terlambat</span>' : ''}
                      ${r.isEarlyLeave ? '<span class="status-early">Pulang Awal</span>' : ''}
                      ${!r.isLate && !r.isEarlyLeave ? 'Tepat Waktu' : ''}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : `
            <table>
              <thead>
                <tr>
                  <th>No</th>
                  <th>Nama Pegawai</th>
                  <th>ID Pegawai</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${notPresentToday.map((emp, i) => `
                  <tr>
                    <td>${i + 1}</td>
                    <td>${emp.name}</td>
                    <td>${emp.employeeId}</td>
                    <td>Belum Absen</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `}
          
          <div class="footer">
            <p>Dicetak pada: ${format(new Date(), 'dd MMMM yyyy HH:mm', { locale: id })}</p>
            <br><br><br>
            <p>__________________________</p>
            <p>Admin Kesbangpoldagri</p>
          </div>
          
          <script>
            window.onload = () => {
              window.print();
              window.onafterprint = () => window.close();
            }
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(content);
    printWindow.document.close();
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-stone-900">Laporan Absensi</h2>
          <p className="text-stone-500 text-sm">Pantau kehadiran pegawai secara berkala.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode(viewMode === 'history' ? 'not-present' : 'history')}
            className={`flex items-center justify-center gap-2 font-semibold py-3 px-6 rounded-2xl transition-all shadow-lg ${
              viewMode === 'not-present' 
                ? 'bg-red-600 text-white hover:bg-red-700' 
                : 'bg-white text-stone-700 border border-stone-200 hover:bg-stone-50'
            }`}
          >
            {viewMode === 'history' ? (
              <>
                <AlertCircle className="w-5 h-5" />
                Lihat Belum Absen
              </>
            ) : (
              <>
                <FileText className="w-5 h-5" />
                Lihat Riwayat
              </>
            )}
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center justify-center gap-2 bg-white text-stone-700 border border-stone-200 hover:bg-stone-50 font-semibold py-3 px-6 rounded-2xl transition-all shadow-lg"
          >
            <Printer className="w-5 h-5" />
            Cetak
          </button>
          <button
            onClick={exportToCSV}
            className="flex items-center justify-center gap-2 bg-stone-900 hover:bg-stone-800 text-white font-semibold py-3 px-6 rounded-2xl transition-all shadow-lg"
          >
            <Download className="w-5 h-5" />
            Ekspor CSV
          </button>
        </div>
      </div>

      {viewMode === 'history' ? (
        <>
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
                    <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase tracking-wider">Waktu</th>
                    <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase tracking-wider text-right">Aksi</th>
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
                        <td className="px-6 py-4 font-mono text-stone-900 font-bold">
                          {record.timestamp?.toDate ? format(record.timestamp.toDate(), 'HH:mm:ss') : '--:--'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => setEditingRecord(record)}
                              className="p-2 text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                              title="Edit"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(record.id)}
                              className="p-2 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                              title="Hapus"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-6">
          <div className="bg-red-50 border border-red-100 p-6 rounded-3xl flex items-center gap-4">
            <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-red-900">Pegawai Belum Absen</h3>
              <p className="text-red-700 text-sm">Daftar pegawai yang belum melakukan absensi masuk hari ini ({format(new Date(), 'dd MMMM yyyy', { locale: id })}).</p>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-stone-50 border-b border-stone-200">
                    <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase tracking-wider">Pegawai</th>
                    <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase tracking-wider">ID Pegawai</th>
                    <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {notPresentToday.length === 0 ? (
                    <tr><td colSpan={3} className="px-6 py-12 text-center text-stone-400">Semua pegawai sudah absen hari ini.</td></tr>
                  ) : (
                    notPresentToday.map((emp) => (
                      <tr key={emp.id} className="hover:bg-stone-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-stone-100 rounded-lg flex items-center justify-center text-stone-500 font-bold text-xs">
                              {emp.name.charAt(0)}
                            </div>
                            <span className="font-bold text-stone-900">{emp.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-stone-600 font-mono text-sm">{emp.employeeId}</td>
                        <td className="px-6 py-4">
                          <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-[10px] font-bold uppercase">
                            Belum Absen
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      <AnimatePresence>
        {editingRecord && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-stone-100 flex items-center justify-between bg-stone-50">
                <h3 className="text-lg font-bold text-stone-900">Edit Data Absensi</h3>
                <button 
                  onClick={() => setEditingRecord(null)}
                  className="p-2 hover:bg-stone-200 rounded-xl transition-colors"
                >
                  <X className="w-5 h-5 text-stone-500" />
                </button>
              </div>

              <form onSubmit={handleUpdate} className="p-6 space-y-6">
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-2 block">Pegawai</label>
                    <div className="px-4 py-3 bg-stone-100 border border-stone-200 rounded-xl font-semibold text-stone-600">
                      {editingRecord.employeeName} ({editingRecord.employeeId})
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-2 block">Tipe Absensi</label>
                    <select
                      value={editingRecord.type}
                      onChange={(e) => setEditingRecord({ ...editingRecord, type: e.target.value as 'in' | 'out' })}
                      className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all font-semibold"
                    >
                      <option value="in">Hadir (Masuk)</option>
                      <option value="out">Pulang (Keluar)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-2 block">Tanggal</label>
                    <input
                      type="date"
                      value={editingRecord.date}
                      onChange={(e) => setEditingRecord({ ...editingRecord, date: e.target.value })}
                      className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all font-semibold"
                    />
                  </div>

                  <div className="flex items-center gap-6 pt-2">
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <div className="relative">
                        <input
                          type="checkbox"
                          checked={editingRecord.isLate}
                          onChange={(e) => setEditingRecord({ ...editingRecord, isLate: e.target.checked })}
                          className="sr-only"
                        />
                        <div className={`w-10 h-6 rounded-full transition-colors ${editingRecord.isLate ? 'bg-red-500' : 'bg-stone-200'}`}></div>
                        <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${editingRecord.isLate ? 'translate-x-4' : ''}`}></div>
                      </div>
                      <span className="text-sm font-bold text-stone-700">Terlambat</span>
                    </label>

                    <label className="flex items-center gap-3 cursor-pointer group">
                      <div className="relative">
                        <input
                          type="checkbox"
                          checked={editingRecord.isEarlyLeave}
                          onChange={(e) => setEditingRecord({ ...editingRecord, isEarlyLeave: e.target.checked })}
                          className="sr-only"
                        />
                        <div className={`w-10 h-6 rounded-full transition-colors ${editingRecord.isEarlyLeave ? 'bg-amber-500' : 'bg-stone-200'}`}></div>
                        <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${editingRecord.isEarlyLeave ? 'translate-x-4' : ''}`}></div>
                      </div>
                      <span className="text-sm font-bold text-stone-700">Pulang Awal</span>
                    </label>
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setEditingRecord(null)}
                    className="flex-1 px-6 py-3 border border-stone-200 text-stone-600 font-bold rounded-2xl hover:bg-stone-50 transition-all"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-6 py-3 bg-stone-900 text-white font-bold rounded-2xl hover:bg-stone-800 transition-all shadow-lg"
                  >
                    Simpan
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
