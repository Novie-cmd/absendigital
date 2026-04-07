import { collection, query, where, getDocs, addDoc, serverTimestamp, getDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { format } from 'date-fns';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface AttendanceResult {
  success: boolean;
  message: string;
  data?: {
    name: string;
    type: 'in' | 'out';
    time: string;
    isLate: boolean;
    isEarlyLeave: boolean;
  };
}

export async function recordAttendance(
  decodedText: string,
  userProfile: any,
  settings: any,
  userEmail?: string | null
): Promise<AttendanceResult> {
  try {
    let targetEmployeeId = decodedText;
    let targetEmployeeName = '';

    // Check if it's an Office QR scan by an employee
    if (decodedText === settings?.officeQrToken) {
      let currentEmployeeId = userProfile?.employeeId;

      // Fallback: Try to find employee by email if ID is missing (common for admins)
      if (!currentEmployeeId && userEmail) {
        const employeesRef = collection(db, 'employees');
        const qEmail = query(employeesRef, where('email', '==', userEmail.toLowerCase().trim()));
        const emailSnap = await getDocs(qEmail);
        if (!emailSnap.empty) {
          const empData = emailSnap.docs[0].data();
          currentEmployeeId = empData.employeeId;
          targetEmployeeName = empData.name; // Use name from employee record
        }
      }

      if (!currentEmployeeId) {
        return { success: false, message: 'Akun Anda belum terhubung dengan ID Pegawai. Silakan hubungi admin atau hubungkan ID Anda di profil.' };
      }
      targetEmployeeId = currentEmployeeId;
      if (!targetEmployeeName) {
        targetEmployeeName = userProfile?.employeeName || '';
      }
    }

    // 1. Find employee by employeeId
    const employeesRef = collection(db, 'employees');
    const q = query(employeesRef, where('employeeId', '==', targetEmployeeId));
    
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return { success: false, message: 'Pegawai tidak ditemukan. Silakan hubungi admin.' };
    }

    const employee = querySnapshot.docs[0].data();
    targetEmployeeName = employee.name;
    const today = format(new Date(), 'yyyy-MM-dd');

    // 2. Check last attendance for today
    const attendanceRef = collection(db, 'attendance');
    const attendanceQuery = query(
      attendanceRef,
      where('employeeId', '==', targetEmployeeId),
      where('date', '==', today)
    );
    
    const attendanceSnapshot = await getDocs(attendanceQuery);

    let type: 'in' | 'out' = 'in';
    if (!attendanceSnapshot.empty) {
      const docs = attendanceSnapshot.docs.map(d => d.data());
      docs.sort((a, b) => {
        const timeA = a.timestamp?.toMillis?.() || 0;
        const timeB = b.timestamp?.toMillis?.() || 0;
        return timeB - timeA;
      });
      const lastAttendance = docs[0];
      type = lastAttendance.type === 'in' ? 'out' : 'in';
    }

    // 3. Calculate Lateness
    let isLate = false;
    let isEarlyLeave = false;
    
    if (settings) {
      const now = new Date();
      const day = now.getDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
      const currentTimeStr = format(now, 'HH:mm');
      
      let startTime = '';
      let endTime = '';
      
      if (day >= 1 && day <= 4) { // Mon-Thu
        startTime = settings.workStartTimeMonThu;
        endTime = settings.workEndTimeMonThu;
      } else if (day === 5) { // Fri
        startTime = settings.workStartTimeFri;
        endTime = settings.workEndTimeFri;
      }
      
      if (startTime && type === 'in') {
        const [startH, startM] = startTime.split(':').map(Number);
        const [currH, currM] = currentTimeStr.split(':').map(Number);
        const startTotal = startH * 60 + startM + (settings.lateThreshold || 0);
        const currTotal = currH * 60 + currM;
        if (currTotal > startTotal) {
          isLate = true;
        }
      }
      
      if (endTime && type === 'out') {
        const [endH, endM] = endTime.split(':').map(Number);
        const [currH, currM] = currentTimeStr.split(':').map(Number);
        const endTotal = endH * 60 + endM;
        const currTotal = currH * 60 + currM;
        if (currTotal < endTotal) {
          isEarlyLeave = true;
        }
      }
    }

    // 4. Record attendance
    await addDoc(attendanceRef, {
      employeeId: targetEmployeeId,
      employeeName: targetEmployeeName,
      type,
      timestamp: serverTimestamp(),
      date: today,
      method: decodedText === settings?.officeQrToken ? 'self_scan' : 'admin_scan',
      isLate,
      isEarlyLeave
    });

    return {
      success: true,
      message: `Absen ${type === 'in' ? 'Hadir' : 'Pulang'} Berhasil!`,
      data: { name: targetEmployeeName, type, time: format(new Date(), 'HH:mm:ss'), isLate, isEarlyLeave }
    };

  } catch (error: any) {
    console.error('Attendance error:', error);
    return { success: false, message: 'Terjadi kesalahan sistem: ' + (error.message || 'Unknown error') };
  }
}
