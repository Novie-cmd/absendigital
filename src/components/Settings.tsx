import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { Clock, Save, AlertCircle, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function Settings() {
  const [settings, setSettings] = useState({
    workStartTime: '08:00',
    workEndTime: '17:00',
    lateThreshold: 15
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'config'), (docSnap) => {
      if (docSnap.exists()) {
        setSettings(docSnap.data() as any);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await setDoc(doc(db, 'settings', 'config'), settings);
      setMessage({ type: 'success', text: 'Pengaturan berhasil disimpan!' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Error saving settings:', error);
      setMessage({ type: 'error', text: 'Gagal menyimpan pengaturan.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="animate-pulse space-y-8">...</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-stone-900">Pengaturan Waktu</h2>
        <p className="text-stone-500 mt-2">Atur jam kerja dan toleransi keterlambatan pegawai.</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-3xl border border-stone-200 shadow-xl p-8 space-y-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-bold text-stone-700">
              <Clock className="w-4 h-4 text-emerald-600" />
              Jam Masuk Kerja
            </label>
            <input
              type="time"
              value={settings.workStartTime}
              onChange={(e) => setSettings({ ...settings, workStartTime: e.target.value })}
              className="w-full px-6 py-4 bg-stone-50 border border-stone-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all text-xl font-bold text-stone-900"
            />
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-bold text-stone-700">
              <Clock className="w-4 h-4 text-amber-600" />
              Jam Pulang Kerja
            </label>
            <input
              type="time"
              value={settings.workEndTime}
              onChange={(e) => setSettings({ ...settings, workEndTime: e.target.value })}
              className="w-full px-6 py-4 bg-stone-50 border border-stone-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all text-xl font-bold text-stone-900"
            />
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
          <p className="text-xs text-stone-400 mt-1 italic">
            * Pegawai dianggap terlambat jika absen masuk lewat dari {settings.workStartTime} + {settings.lateThreshold} menit.
          </p>
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
  );
}
