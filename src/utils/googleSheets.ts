// Helper to coordinate integration with Google Sheets API

let cachedGoogleToken: string | null = null;

export function getGoogleToken(): string | null {
  if (!cachedGoogleToken) {
    cachedGoogleToken = localStorage.getItem('google_access_token');
  }
  return cachedGoogleToken;
}

export function setGoogleToken(token: string | null) {
  cachedGoogleToken = token;
  if (token) {
    localStorage.setItem('google_access_token', token);
  } else {
    localStorage.removeItem('google_access_token');
  }
}

// Check if a sheet is accessible
export async function verifySpreadsheetAccess(token: string, spreadsheetId: string): Promise<boolean> {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=spreadsheetId`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  if (res.status === 401) {
    throw new Error("UNAUTHENTICATED");
  }
  if (res.status === 404) {
    throw new Error("NOT_FOUND");
  }
  return res.ok;
}

// Create a new spreadsheet with default 'Absensi' tab and styling headers
export async function createSpreadsheet(token: string, title: string = "Data Absensi Kesbangpoldagri NTB"): Promise<{ id: string; url: string }> {
  const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      properties: {
        title: title
      },
      sheets: [
        {
          properties: {
            title: "Absensi",
            gridProperties: {
              frozenRowCount: 1
            }
          }
        }
      ]
    })
  });

  if (!res.ok) {
    const errorText = await res.text();
    if (res.status === 401) {
      throw new Error(`UNAUTHENTICATED: Gagal membuat spreadsheet: ${errorText}`);
    }
    throw new Error(`Gagal membuat spreadsheet: ${errorText}`);
  }

  const data = await res.json();
  const id = data.spreadsheetId;
  const url = data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${id}/edit`;

  // Write headers to the new sheet
  await writeHeaders(token, id);

  return { id, url };
}

// Clear values from cell range
async function clearValues(token: string, spreadsheetId: string, range: string) {
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:clear`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
}

// Write the header row
async function writeHeaders(token: string, spreadsheetId: string) {
  const headers = [
    "No",
    "Tanggal",
    "Waktu",
    "ID Pegawai",
    "Nama Pegawai",
    "Tipe Absen",
    "Metode",
    "Status Lambat",
    "Status Pulang Cepat"
  ];

  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Absensi!A1:I1?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      range: "Absensi!A1:I1",
      majorDimension: "ROWS",
      values: [headers]
    })
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Gagal menulis header ke Sheets:", text);
  }
}

// Append a single attendance record to Google Sheets
export async function appendAttendanceToSheet(
  token: string,
  spreadsheetId: string,
  attendance: {
    id?: string;
    date: string;
    time: string;
    employeeId: string;
    employeeName: string;
    type: 'in' | 'out';
    method: string;
    isLate: boolean;
    isEarlyLeave: boolean;
  }
) {
  const row = [
    "=ROW()-1", // Auto incremental numbering using Google Sheet row formulas
    attendance.date,
    attendance.time,
    attendance.employeeId,
    attendance.employeeName,
    attendance.type === 'in' ? 'Hadir' : 'Pulang',
    attendance.method === 'self_scan' ? 'Scan Mandiri' : 'Input Admin',
    attendance.isLate ? 'Terlambat' : 'Tepat Waktu',
    attendance.isEarlyLeave ? 'Pulang Awal' : '-',
    attendance.id || "" // Column J (Firestore Document ID)
  ];

  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Absensi!A2:J2:append?valueInputOption=USER_ENTERED`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      range: "Absensi!A2:J2",
      majorDimension: "ROWS",
      values: [row]
    })
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error("Gagal menambahkan baris absensi ke Sheets:", errorText);
    if (res.status === 401) {
      throw new Error("UNAUTHENTICATED: " + errorText);
    }
    if (res.status === 404) {
      throw new Error("NOT_FOUND");
    }
    throw new Error(errorText);
  }

  return await res.json();
}

// Completely rebuild or batch-export history to Google Sheets
export async function bulkExportAttendances(
  token: string,
  spreadsheetId: string,
  attendances: Array<{
    id?: string;
    date: string;
    timestamp: any;
    employeeId: string;
    employeeName: string;
    type: 'in' | 'out';
    method: string;
    isLate: boolean;
    isEarlyLeave: boolean;
  }>
) {
  // Sort chronologically
  const sorted = [...attendances].sort((a, b) => {
    const timeA = a.timestamp?.seconds || (a.timestamp?.toMillis ? a.timestamp.toMillis() / 1000 : 0);
    const timeB = b.timestamp?.seconds || (b.timestamp?.toMillis ? b.timestamp.toMillis() / 1000 : 0);
    return timeA - timeB;
  });

  const rows = [
    [
      "No",
      "Tanggal",
      "Waktu",
      "ID Pegawai",
      "Nama Pegawai",
      "Tipe Absen",
      "Metode",
      "Status Lambat",
      "Status Pulang Cepat",
      "Firestore ID (Metadata)"
    ]
  ];

  sorted.forEach((att) => {
    let formattedTime = "-";
    if (att.timestamp) {
      const dateObj = att.timestamp.toDate ? att.timestamp.toDate() : new Date(att.timestamp);
      formattedTime = dateObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    rows.push([
      "=ROW()-1",
      att.date,
      formattedTime,
      att.employeeId,
      att.employeeName,
      att.type === 'in' ? 'Hadir' : 'Pulang',
      att.method === 'self_scan' ? 'Scan Mandiri' : 'Input Admin',
      att.isLate ? 'Terlambat' : 'Tepat Waktu',
      att.isEarlyLeave ? 'Pulang Awal' : '-',
      att.id || ""
    ]);
  });

  // Clear out first 2000 rows to avoid leftovers
  await clearValues(token, spreadsheetId, "Absensi!A1:J2000");

  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Absensi!A1?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      range: "Absensi!A1",
      majorDimension: "ROWS",
      values: rows
    })
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401) {
      throw new Error("UNAUTHENTICATED: " + text);
    }
    if (res.status === 404) {
      throw new Error("NOT_FOUND");
    }
    throw new Error(text);
  }

  return await res.json();
}
