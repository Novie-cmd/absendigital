/**
 * =========================================================================
 * GOOGLE APPS SCRIPT (Code.gs)
 * Untuk Otomatisasi & Sinkronisasi Real-Time Absensi Pegawai Kesbangpoldagri NTB
 * =========================================================================
 * 
 * SCRIPT INI MEMBANTU SEBAGAI JEMBATAN KONEKSI ANTARA FIRESTORE & GOOGLE SHEETS.
 * Sistem akan melakukan sinkronisasi otomatis secara berkala di latar belakang 
 * (background sync) tanpa membutuhkan browser admin tetap terbuka.
 * 
 * CARA MEMASANG DI GOOGLE SPREADSHEET:
 * 1. Buka Google Spreadsheet tujuan Anda.
 * 2. Pada menu atas, pilih: Ekstensi -> Apps Script.
 * 3. Hapus kode default yang ada, lalu salin (copy-paste) seluruh isi kode di bawah ini.
 * 4. Ganti konstanta FIREBASE_PROJECT_ID dan API_KEY di bawah jika Anda ingin menggunakan project lain.
 * 5. Klik ikon Simpan (Save) di bagian atas editor Apps Script.
 * 6. Jalankan fungsi 'onOpen' sekali untuk memunculkan Menu Khusus di Spreadsheet, atau 
 *    muat ulang halaman Google Spreadsheet Anda.
 * 7. Klik menu baru "Absensi Kesbangpoldagri" -> "Aktifkan Sinkronisasi Otomatis".
 * 8. Berikan izin otorisasi yang diminta Google (klik Lanjutkan -> Buka project (tidak aman)).
 */

// ==========================================
// KONFIGURASI DATABASE FIRESTORE (OTOMATIS)
// ==========================================
const FIREBASE_PROJECT_ID = "gen-lang-client-0137881932";
const API_KEY = "AIzaSyBLzvNKQ0qLzu7XeWEr2SViCPVmHuLBVvo";

/**
 * Endpoint Utama Web App (serves Index.html)
 */
function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Portal Absensi Kesbangpoldagri NTB - Sync')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Mengambil informasi ringkasan data dan absensi terbaru untuk ditampilkan di UI dashboard
 */
function getDashboardData() {
  const sheetName = "Absensi";
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  
  const result = {
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName(),
    spreadsheetUrl: ss.getUrl(),
    firebaseProjectId: FIREBASE_PROJECT_ID,
    totalRows: 0,
    recentEntries: [],
    triggerActive: false
  };
  
  if (sheet) {
    const lastRow = sheet.getLastRow();
    result.totalRows = lastRow > 1 ? lastRow - 1 : 0;
    
    if (lastRow > 1) {
      // Ambil maksimum 15 entri terbaru untuk dashboard
      const startRow = Math.max(2, lastRow - 14);
      const numRows = lastRow - startRow + 1;
      const range = sheet.getRange(startRow, 1, numRows, 10);
      const values = range.getValues();
      
      // Map baris data ke format JSON dan urutkan dari yang terbaru
      result.recentEntries = values.map((row, index) => {
        return {
          no: row[0],
          tanggal: row[1] ? (row[1] instanceof Date ? Utilities.formatDate(row[1], 'Asia/Makassar', 'yyyy-MM-dd') : row[1].toString()) : "",
          waktu: row[2] ? (row[2] instanceof Date ? Utilities.formatDate(row[2], 'Asia/Makassar', 'HH:mm:ss') : row[2].toString()) : "",
          employeeId: row[3] || "-",
          employeeName: row[4] || "-",
          type: row[5] || "-",
          method: row[6] || "-",
          isLate: row[7] || "-",
          isEarlyLeave: row[8] || "-",
          docId: row[9] || ""
        };
      }).reverse();
    }
  }
  
  // Periksa apakah trigger latar belakang aktif
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'syncFromFirestore') {
      result.triggerActive = true;
      break;
    }
  }
  
  return result;
}

/**
 * Trigger sinkronisasi manual dari dashboard Web App
 */
function runWebSync() {
  try {
    syncFromFirestore();
    return {
      success: true,
      message: "Sinkronisasi berhasil diselesaikan secara real-time dari Firestore!",
      data: getDashboardData()
    };
  } catch (err) {
    return {
      success: false,
      error: err.toString()
    };
  }
}

/**
 * Membuat menu kustom di Google Sheets setiap kali file spreadsheet dibuka.
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Absensi Kesbangpoldagri')
    .addItem('Tarik Data dari Firestore (Manual)', 'syncFromFirestore')
    .addSeparator()
    .addItem('Aktifkan Sinkronisasi Otomatis (Setiap 5 Menit)', 'setupAutoTrigger')
    .addItem('Matikan Sinkronisasi Otomatis', 'removeAutoTrigger')
    .addSeparator()
    .addItem('Petunjuk Hubungkan Webhook', 'showHelpDialog')
    .addToUi();
}

/**
 * Mengambil seluruh data absensi dari Firestore secara real-time / berkala
 * dan mencocokkannya ke dalam Google Spreadsheet Anda.
 */
function syncFromFirestore() {
  const sheetName = "Absensi";
  let sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  
  if (!sheet) {
    sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet(sheetName);
  }

  // Set up headers jika sheet masih kosong
  if (sheet.getLastRow() === 0) {
    writeSheetHeaders(sheet);
  }

  const ui = SpreadsheetApp.getUi();
  
  try {
    // Memanggil API Firestore REST
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/attendance?key=${API_KEY}&pageSize=1000`;
    const response = UrlFetchApp.fetch(url, {
      method: "get",
      muteHttpExceptions: true
    });

    const responseCode = response.getResponseCode();
    if (responseCode !== 200) {
      throw new Error(`Firestore API Error: Code ${responseCode}. Response: ${response.getContentText()}`);
    }

    const data = JSON.parse(response.getContentText());
    if (!data.documents || data.documents.length === 0) {
      Logger.log("Tidak ada data absensi di Firestore.");
      return;
    }

    // Ambil semua data ID yang sudah ada untuk menghindari duplikasi
    const existingIds = getExistingFirestoreIds(sheet);
    let addedCount = 0;

    // Iterasi dokumen dari Firestore
    data.documents.forEach(doc => {
      const docPath = doc.name; // Format: projects/PROJECT_ID/databases/(default)/documents/attendance/ID_DOKUMEN
      const parts = docPath.split('/');
      const firestoreDocId = parts[parts.length - 1];

      // Jika data belum ada, tambahkan baris baru
      if (!existingIds.includes(firestoreDocId)) {
        const fields = doc.fields;
        if (!fields) return;

        // Ekstrak data fields & berikan default nilai kosong
        const date = fields.date ? fields.date.stringValue : "";
        
        // Konversi timestamp ISO ke Waktu WIB/Lokal (Asia/Jakarta)
        let timeStr = "-";
        if (fields.timestamp && fields.timestamp.timestampValue) {
          const rawDate = new Date(fields.timestamp.timestampValue);
          // Format ke WIB (Waktu Indonesia Barat) / WITA sesuai lokal
          const options = { timeZone: 'Asia/Makassar', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
          timeStr = Utilities.formatDate(rawDate, 'Asia/Makassar', 'HH:mm:ss');
        } else if (fields.time) {
          timeStr = fields.time.stringValue;
        }

        const employeeId = fields.employeeId ? fields.employeeId.stringValue : "";
        const employeeName = fields.employeeName ? fields.employeeName.stringValue : "";
        const typeRaw = fields.type ? fields.type.stringValue : "";
        const type = typeRaw === "in" ? "Hadir" : "Pulang";
        
        const methodRaw = fields.method ? fields.method.stringValue : "self_scan";
        const method = methodRaw === "self_scan" ? "Scan Mandiri" : "Input Admin";

        const isLate = fields.isLate ? (fields.isLate.booleanValue ? "Terlambat" : "Tepat Waktu") : "Tepat Waktu";
        const isEarlyLeave = fields.isEarlyLeave ? (fields.isEarlyLeave.booleanValue ? "Pulang Awal" : "-") : "-";

        // Tambah baris ke sheet
        // Kolom: A: No, B: Tanggal, C: Waktu, D: ID Pegawai, E: Nama Pegawai, F: Tipe Absen, G: Metode, H: Status Lambat, I: Status Pulang Cepat, J: Firestore ID Tracker (Tersembunyi/Metadata)
        const rowNum = sheet.getLastRow() + 1;
        sheet.appendRow([
          rowNum - 1,   // Nomor Urut
          date,
          timeStr,
          employeeId,
          employeeName,
          type,
          method,
          isLate,
          isEarlyLeave,
          firestoreDocId // Kolom J sebagai tracker id unik unik
        ]);

        addedCount++;
        
        // Tandai dokumen sebagai telah langsung tersinkron di Firestore
        markAsSyncedInFirestore(firestoreDocId);
      }
    });

    Logger.log(`Sinkronisasi sukses! Berhasil menambahkan ${addedCount} data absensi baru.`);
  } catch (err) {
    Logger.log("Error synchronizing with Firestore: " + err.toString());
  }
}

/**
 * Menghapus/Menandai status 'syncedToSheets' di Firestore menjadi true
 */
function markAsSyncedInFirestore(docId) {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/attendance/${docId}?key=${API_KEY}&updateMask.fieldPaths=syncedToSheets`;
    const payload = {
      fields: {
        syncedToSheets: { booleanValue: true }
      }
    };
    UrlFetchApp.fetch(url, {
      method: "patch",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
  } catch (e) {
    Logger.log("Gagal menandai sync di Firestore: " + e.toString());
  }
}

/**
 * Mengambil semua ID dokumen Firestore yang sudah ada di Spreadsheet kolom J
 */
function getExistingFirestoreIds(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  // Mengambil kolom J (Metadata ID Firestore) dari baris ke-2 hingga terakhir
  const range = sheet.getRange(2, 10, lastRow - 1, 1);
  const values = range.getValues();
  return values.map(row => row[0].toString().trim());
}

/**
 * Menulis Baris Header Default
 */
function writeSheetHeaders(sheet) {
  const headers = [
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
  ];
  sheet.appendRow(headers);
  
  // Format visual header sederhana
  const headerRange = sheet.getRange(1, 1, 1, 10);
  headerRange.setFontWeight("bold");
  headerRange.setBackground("#E2E8F0");
  headerRange.setFontColor("#1E293B");
  headerRange.setHorizontalAlignment("center");
  sheet.setFrozenRows(1);
}

/**
 * Membuat trigger otomatis Apps Script untuk otomatis berjalan berkala (setiap 5 menit).
 * Dengan begini, sinkronisasi bekerja andal 24 jam tanpa perlu login OAuth berulang kali!
 */
function setupAutoTrigger() {
  // Hapus trigger lama yang sejenis untuk mencegah penumpukan duplikasi trigger
  removeAutoTrigger();

  // Buat trigger baru setiap 5 menit
  ScriptApp.newTrigger('syncFromFirestore')
    .timeBased()
    .everyMinutes(5)
    .create();

  const ui = SpreadsheetApp.getUi();
  ui.alert(
    'Sinkronisasi Otomatis Sukses Diaktifkan!', 
    'Latar belakang sistem akan otomatis menyinkronkan data dari sistem absensi ke Google Sheet ini setiap 5 menit.\n\nSesi ini berjalan secara penuh dan tidak akan mengalami kendala kegagalan autentikasi sesi browser.', 
    ui.ButtonSet.OK
  );
}

/**
 * Menghapus trigger otomatis yang terpasang.
 */
function removeAutoTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  let deletedCount = 0;
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'syncFromFirestore') {
      ScriptApp.deleteTrigger(triggers[i]);
      deletedCount++;
    }
  }
  
  if (deletedCount > 0) {
    Logger.log(`Berhasil mematikan ${deletedCount} trigger otomatis.`);
  }
}

/**
 * Menampilkan dialog bantuan / informasi webhook.
 */
function showHelpDialog() {
  const ui = SpreadsheetApp.getUi();
  const title = "Atasi Sesi Google Sheets Berakhir (Expired)";
  const body = 
    "Sistem Absensi Kesbangpoldagri NTB dirancang sinkron secara langsung melalui Google REST API.\n\n" +
    "Namun karena keterbatasan token Google OAuth (yang kadaluwarsa setiap 60 menit), status sinkronisasi kadangkala terganggu di backend browser.\n\n" +
    "SOLUSI TERBAIK:\n" +
    "1. Klik menu 'Absensi Kesbangpoldagri' di atas.\n" +
    "2. Pilih 'Aktifkan Sinkronisasi Otomatis (Setiap 5 Menit)'.\n" +
    "3. Setujui dialog izin akun Google.\n\n" +
    "Dengan mengaktifkan fitur ini, Apps Script internal Google Spreadsheet Anda sendiri yang akan dengan aktif mengambil data langsung secara otomatis dari Firestore secara mandiri, aman, dan tanpa batasan token kedaluwarsa browser sama sekali.";
  
  ui.alert(title, body, ui.ButtonSet.OK);
}
