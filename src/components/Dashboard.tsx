import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { Users, UserCheck, UserMinus, Clock, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { motion } from 'motion/react';

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalEmployees: 0,
    presentToday: 0,
    absentToday: 0,
    lateToday: 0
  });
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    
    // 1. Get total employees
    const employeesRef = collection(db, 'employees');
    const unsubscribeEmployees = onSnapshot(employeesRef, (snapshot) => {
      setStats(prev => ({ ...prev, totalEmployees: snapshot.size }));
    });

    // 2. Get attendance today
    const attendanceRef = collection(db, 'attendance');
    const todayQuery = query(attendanceRef, where('date', '==', today));
    const unsubscribeToday = onSnapshot(todayQuery, (snapshot) => {
      const presentIds = new Set();
      snapshot.docs.forEach(doc => {
        if (doc.data().type === 'in') {
          presentIds.add(doc.data().employeeId);
        }
      });
      setStats(prev => ({ 
        ...prev, 
        presentToday: presentIds.size,
        absentToday: Math.max(0, prev.totalEmployees - presentIds.size)
      }));
    });

    // 3. Get recent activity
    const recentQuery = query(attendanceRef, orderBy('timestamp', 'desc'), limit(5));
    const unsubscribeRecent = onSnapshot(recentQuery, (snapshot) => {
      setRecentActivity(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // 4. Get chart data (last 7 days)
    const fetchChartData = async () => {
      try {
        const days = Array.from({ length: 7 }, (_, i) => 6 - i);
        const promises = days.map(async (i) => {
          const date = subDays(new Date(), i);
          const dateStr = format(date, 'yyyy-MM-dd');
          const q = query(attendanceRef, where('date', '==', dateStr), where('type', '==', 'in'));
          const snapshot = await getDocs(q);
          const uniquePresent = new Set(snapshot.docs.map(doc => doc.data().employeeId)).size;
          return {
            name: format(date, 'EEE'),
            present: uniquePresent,
            date: dateStr
          };
        });

        const data = await Promise.all(promises);
        setChartData(data);
      } catch (error) {
        console.error('Error fetching chart data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchChartData();

    return () => {
      unsubscribeEmployees();
      unsubscribeToday();
      unsubscribeRecent();
    };
  }, []);

  const statCards = [
    { label: 'Total Pegawai', value: stats.totalEmployees, icon: Users, color: 'bg-blue-500' },
    { label: 'Hadir Hari Ini', value: stats.presentToday, icon: UserCheck, color: 'bg-emerald-500' },
    { label: 'Absen Hari Ini', value: stats.absentToday, icon: UserMinus, color: 'bg-red-500' },
    { label: 'Terlambat', value: stats.lateToday, icon: Clock, color: 'bg-amber-500' },
  ];

  if (loading) return <div className="animate-pulse space-y-8">...</div>;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-stone-900">Dashboard Ringkasan</h2>
        <div className="flex items-center gap-2 text-stone-500 text-sm bg-white px-4 py-2 rounded-xl border border-stone-200">
          <Clock className="w-4 h-4" />
          {format(new Date(), 'dd MMMM yyyy')}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((card, idx) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`${card.color} p-3 rounded-2xl text-white shadow-lg shadow-stone-100`}>
                <card.icon className="w-6 h-6" />
              </div>
              <TrendingUp className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-stone-500 text-sm font-medium">{card.label}</p>
            <h3 className="text-3xl font-bold text-stone-900 mt-1">{card.value}</h3>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Chart */}
        <div className="lg:col-span-2 bg-white p-8 rounded-3xl border border-stone-200 shadow-sm">
          <h3 className="text-lg font-bold text-stone-900 mb-6">Tren Kehadiran (7 Hari Terakhir)</h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#94a3b8', fontSize: 12 }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#94a3b8', fontSize: 12 }}
                />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="present" radius={[6, 6, 0, 0]} barSize={40}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index === 6 ? '#10b981' : '#e2e8f0'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm">
          <h3 className="text-lg font-bold text-stone-900 mb-6">Aktivitas Terbaru</h3>
          <div className="space-y-6">
            {recentActivity.length === 0 ? (
              <p className="text-stone-400 text-center py-8">Belum ada aktivitas hari ini.</p>
            ) : (
              recentActivity.map((activity, idx) => (
                <div key={activity.id} className="flex items-start gap-4">
                  <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${activity.type === 'in' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-stone-900 truncate">{activity.employeeName}</p>
                    <p className="text-xs text-stone-500 mt-0.5">
                      Absen {activity.type === 'in' ? 'Hadir' : 'Pulang'}
                    </p>
                  </div>
                  <span className="text-xs font-medium text-stone-400">
                    {activity.timestamp?.toDate ? format(activity.timestamp.toDate(), 'HH:mm') : '--:--'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
