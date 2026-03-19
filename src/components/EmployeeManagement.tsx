import React, { useState, useEffect } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { Plus, Search, Edit2, Trash2, QrCode, X, Save, UserPlus, Download } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'motion/react';

interface Employee {
  id: string;
  name: string;
  employeeId: string;
  department: string;
  position: string;
  createdAt: any;
}

export default function EmployeeManagement() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    employeeId: '',
    department: '',
    position: ''
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log('EmployeeManagement: Checking data...');
    const q = query(collection(db, 'employees'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log('EmployeeManagement: Received snapshot, size:', snapshot.size);
      const sortedEmployees = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Employee))
        .sort((a, b) => {
          const timeA = a.createdAt?.toMillis?.() || 0;
          const timeB = b.createdAt?.toMillis?.() || 0;
          return timeB - timeA;
        });
      setEmployees(sortedEmployees);
      setLoading(false);
      setError(null);
    }, (err) => {
      console.error('EmployeeManagement: Snapshot error:', err);
      setError('Gagal memuat data pegawai. Pastikan Anda memiliki izin yang cukup.');
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleOpenModal = (employee?: Employee) => {
    if (employee) {
      setSelectedEmployee(employee);
      setFormData({
        name: employee.name,
        employeeId: employee.employeeId,
        department: employee.department,
        position: employee.position
      });
    } else {
      setSelectedEmployee(null);
      setFormData({ name: '', employeeId: '', department: '', position: '' });
    }
    setIsModalOpen(true);
  };

  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (selectedEmployee) {
        await updateDoc(doc(db, 'employees', selectedEmployee.id), formData);
      } else {
        await addDoc(collection(db, 'employees'), {
          ...formData,
          createdAt: serverTimestamp()
        });
      }
      setIsModalOpen(false);
    } catch (error: any) {
      console.error('Error saving employee:', error);
      alert('Gagal menyimpan data pegawai: ' + (error.message || 'Terjadi kesalahan.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Apakah Anda yakin ingin menghapus pegawai ini?')) {
      try {
        await deleteDoc(doc(db, 'employees', id));
      } catch (error) {
        console.error('Error deleting employee:', error);
      }
    }
  };

  const filteredEmployees = employees.filter(emp => 
    emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.employeeId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.department.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const downloadQR = (id: string, name: string) => {
    const svg = document.getElementById(`qr-${id}`);
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
        downloadLink.download = `QR_${name}_${id}.png`;
        downloadLink.href = `${pngFile}`;
        downloadLink.click();
      };
      img.src = "data:image/svg+xml;base64," + btoa(svgData);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-stone-900">Data Pegawai</h2>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-6 rounded-2xl transition-all shadow-lg shadow-emerald-100"
        >
          <Plus className="w-5 h-5" />
          Tambah Pegawai
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 w-5 h-5" />
        <input
          type="text"
          placeholder="Cari nama, ID, atau departemen..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-12 pr-4 py-4 bg-white border border-stone-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all shadow-sm"
        />
      </div>

      {/* Employee List */}
      <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200">
                <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase tracking-wider">Pegawai</th>
                <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase tracking-wider">ID Pegawai</th>
                <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase tracking-wider">Departemen</th>
                <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase tracking-wider">Jabatan</th>
                <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase tracking-wider text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {loading ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-stone-400">Memuat data...</td></tr>
              ) : error ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-red-500 font-medium">{error}</td></tr>
              ) : filteredEmployees.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-stone-400">Tidak ada data pegawai.</td></tr>
              ) : (
                filteredEmployees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-stone-50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-stone-100 rounded-xl flex items-center justify-center text-stone-500 font-bold">
                          {emp.name.charAt(0)}
                        </div>
                        <span className="font-bold text-stone-900">{emp.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-stone-600 font-mono text-sm">{emp.employeeId}</td>
                    <td className="px-6 py-4 text-stone-600">{emp.department}</td>
                    <td className="px-6 py-4 text-stone-600">{emp.position}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => { setSelectedEmployee(emp); setIsQRModalOpen(true); }}
                          className="p-2 text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
                          title="Lihat QR Code"
                        >
                          <QrCode className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleOpenModal(emp)}
                          className="p-2 text-stone-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                          title="Edit"
                        >
                          <Edit2 className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleDelete(emp.id)}
                          className="p-2 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                          title="Hapus"
                        >
                          <Trash2 className="w-5 h-5" />
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

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden"
            >
              <div className="px-8 py-6 border-b border-stone-100 flex items-center justify-between">
                <h3 className="text-xl font-bold text-stone-900">
                  {selectedEmployee ? 'Edit Pegawai' : 'Tambah Pegawai Baru'}
                </h3>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-stone-100 rounded-xl transition-all">
                  <X className="w-5 h-5 text-stone-400" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="p-8 space-y-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-stone-700 mb-1">Nama Lengkap</label>
                    <input
                      required
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-stone-700 mb-1">ID Pegawai (Barcode)</label>
                    <input
                      required
                      type="text"
                      value={formData.employeeId}
                      onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                      className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-stone-700 mb-1">Departemen</label>
                      <input
                        type="text"
                        value={formData.department}
                        onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                        className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-stone-700 mb-1">Jabatan</label>
                      <input
                        type="text"
                        value={formData.position}
                        onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                        className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-6 py-3 border border-stone-200 text-stone-600 font-bold rounded-xl hover:bg-stone-50 transition-all"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    ) : (
                      <Save className="w-5 h-5" />
                    )}
                    {saving ? 'Menyimpan...' : 'Simpan'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* QR Code Modal */}
      <AnimatePresence>
        {isQRModalOpen && selectedEmployee && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden"
            >
              <div className="px-8 py-6 border-b border-stone-100 flex items-center justify-between">
                <h3 className="text-xl font-bold text-stone-900">QR Code Pegawai</h3>
                <button onClick={() => setIsQRModalOpen(false)} className="p-2 hover:bg-stone-100 rounded-xl transition-all">
                  <X className="w-5 h-5 text-stone-400" />
                </button>
              </div>
              <div className="p-8 flex flex-col items-center text-center">
                <div className="bg-white p-4 rounded-2xl border-2 border-stone-100 mb-6">
                  <QRCodeSVG
                    id={`qr-${selectedEmployee.id}`}
                    value={selectedEmployee.employeeId}
                    size={200}
                    level="H"
                    includeMargin={true}
                  />
                </div>
                <h4 className="text-2xl font-bold text-stone-900">{selectedEmployee.name}</h4>
                <p className="text-stone-500 font-mono mt-1">{selectedEmployee.employeeId}</p>
                <p className="text-stone-400 text-sm mt-4">
                  Gunakan QR Code ini untuk melakukan absensi pada mesin scanner.
                </p>
                <button
                  onClick={() => downloadQR(selectedEmployee.id, selectedEmployee.name)}
                  className="mt-8 w-full flex items-center justify-center gap-2 bg-stone-900 text-white font-bold py-4 rounded-2xl hover:bg-stone-800 transition-all"
                >
                  <Download className="w-5 h-5" />
                  Unduh QR Code
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
