import { initializeApp, getApp, getApps } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut as firebaseSignOut, 
  User,
  Auth
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { LocalDB } from '../lib/supabase';
import { format } from 'date-fns';

// 1. Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth: Auth = getAuth(app);

// 2. Configure Google Auth Provider with requested scopes
const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/spreadsheets');
provider.addScope('https://www.googleapis.com/auth/drive.file');

// In-memory token cache (Do not store in localStorage for security)
let cachedAccessToken: string | null = null;
let isSigningIn = false;

// Initialize listeners for auth state changes to clear cached token on sign-out
onAuthStateChanged(auth, (user) => {
  if (!user) {
    cachedAccessToken = null;
  }
});

export interface GoogleUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export const GoogleSheetsService = {
  /**
   * Listens for changes in Google authentication state
   */
  onAuthChange(callback: (user: GoogleUser | null, token: string | null) => void) {
    return onAuthStateChanged(auth, async (user) => {
      if (user) {
        callback({
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL
        }, cachedAccessToken);
      } else {
        callback(null, null);
      }
    });
  },

  /**
   * Triggers a login popup to fetch/renew Google Auth Token
   */
  async signInWithGoogle(): Promise<{ user: GoogleUser; token: string }> {
    if (isSigningIn) {
      throw new Error("Signin progress is already active...");
    }
    isSigningIn = true;
    try {
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken;
      
      if (!token) {
        throw new Error("Failed to retrieve Google Access Token.");
      }
      
      cachedAccessToken = token;
      
      const gUser: GoogleUser = {
        uid: result.user.uid,
        email: result.user.email,
        displayName: result.user.displayName,
        photoURL: result.user.photoURL
      };

      return { user: gUser, token };
    } catch (e: any) {
      console.error("Google login failed:", e);
      throw e;
    } finally {
      isSigningIn = false;
    }
  },

  /**
   * Signs the user out from Google Auth sessions
   */
  async logout(): Promise<void> {
    await firebaseSignOut(auth);
    cachedAccessToken = null;
    localStorage.removeItem('apl_google_sheets_id');
  },

  /**
   * Returns current cached Access Token
   */
  getAccessToken(): string | null {
    return cachedAccessToken;
  },

  /**
   * Retrieves preferred spreadsheet ID from LocalStorage
   */
  getStoredSpreadsheetId(): string | null {
    return localStorage.getItem('apl_google_sheets_id');
  },

  /**
   * Stores preferred spreadsheet ID to LocalStorage
   */
  storeSpreadsheetId(id: string): void {
    localStorage.setItem('apl_google_sheets_id', id);
  },

  /**
   * Helper to make secure Google API requests
   */
  async apiFetch(url: string, options: RequestInit = {}): Promise<any> {
    const token = this.getAccessToken();
    if (!token) {
      throw new Error("NOT_AUTHENTICATED: Google Sheets integration requires Google sign-in.");
    }

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    const response = await fetch(url, { ...options, headers });
    
    if (response.status === 401) {
      cachedAccessToken = null; // Token expired
      throw new Error("TOKEN_EXPIRED: Your Google session has expired. Please sign in with Google again.");
    }
    
    if (!response.ok) {
      const errText = await response.text();
      let msg = `Google API Error (${response.status})`;
      try {
        const errJson = JSON.parse(errText);
        msg = errJson?.error?.message || msg;
      } catch {}
      throw new Error(msg);
    }

    return response.json();
  },

  /**
   * Searches user's Drive for an existing attendance spreadsheet
   */
  async findExistingSpreadsheet(): Promise<string | null> {
    try {
      const q = encodeURIComponent("name = 'APL Attendance Logs Engine' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false");
      const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`;
      const data = await this.apiFetch(url);
      if (data.files && data.files.length > 0) {
        return data.files[0].id;
      }
      return null;
    } catch {
      return null;
    }
  },

  /**
   * Creates a new spreadsheet in user's Drive
   */
  async createSpreadsheet(): Promise<string> {
    const body = {
      properties: {
        title: 'APL Attendance Logs Engine'
      }
    };
    
    const data = await this.apiFetch('https://sheets.googleapis.com/v1/spreadsheets', {
      method: 'POST',
      body: JSON.stringify(body)
    });

    if (data.spreadsheetId) {
      this.storeSpreadsheetId(data.spreadsheetId);
      return data.spreadsheetId;
    }
    throw new Error("Failed to create spreadsheet.");
  },

  /**
   * Returns sheet structure, ensuring the specific month sheet tab exist
   */
  async ensureSheetTabExists(spreadsheetId: string, title: string, headers: string[]): Promise<void> {
    // 1. Get spreadsheet metadata
    const metadata = await this.apiFetch(`https://sheets.googleapis.com/v1/spreadsheets/${spreadsheetId}`);
    const sheetsList = metadata.sheets || [];
    const tabExists = sheetsList.some((s: any) => s.properties?.title === title);

    if (!tabExists) {
      // 2. Insert new tab
      const reqBody = {
        requests: [
          {
            addSheet: {
              properties: {
                title
              }
            }
          }
        ]
      };
      await this.apiFetch(`https://sheets.googleapis.com/v1/spreadsheets/${spreadsheetId}:batchUpdate`, {
        method: 'POST',
        body: JSON.stringify(reqBody)
      });

      const valueBody = {
        range: `'${title}'!A1`,
        majorDimension: 'ROWS',
        values: [headers]
      };

      await this.apiFetch(`https://sheets.googleapis.com/v1/spreadsheets/${spreadsheetId}/values/'${title}'!A1?valueInputOption=USER_ENTERED`, {
        method: 'PUT',
        body: JSON.stringify(valueBody)
      });
    }
  },

  /**
   * Helper to fetch employee name from LocalDB 'users'
   */
  getEmployeeName(uid: string): { name: string; role: string } {
    const users = LocalDB.get('users');
    const user = users.find(u => u.id === uid);
    return {
      name: user?.name || uid,
      role: user?.role || 'EMPLOYEE'
    };
  },

  /**
   * Formats a raw attendance record into standard columns as a spreadsheet row
   */
  formatAttendanceRow(record: any): any[] {
    const empInfo = this.getEmployeeName(record.userId);
    const dateStr = record.date || format(new Date(), 'yyyy-MM-dd');

    const inTime = record.checkInTime ? format(new Date(record.checkInTime), 'hh:mm:ss a') : 'N/A';
    const outTime = record.checkOutTime ? format(new Date(record.checkOutTime), 'hh:mm:ss a') : 'N/A';
    
    const latIn = record.checkInLocation?.latitude || '';
    const lngIn = record.checkInLocation?.longitude || '';
    const locationString = latIn ? `https://www.google.com/maps/search/?api=1&query=${latIn},${lngIn}` : 'N/A';

    return [
      record.id || `rec_${Date.now()}`,
      dateStr,
      record.userId || 'N/A',
      empInfo.name,
      empInfo.role,
      inTime,
      outTime,
      record.hoursWorked !== undefined ? record.hoursWorked : 0,
      record.earnings !== undefined ? record.earnings : 0,
      record.distanceDriven !== undefined ? record.distanceDriven : 0,
      record.shipments !== undefined ? record.shipments : 0,
      record.odometerStart !== undefined ? record.odometerStart : '',
      record.odometerEnd !== undefined ? record.odometerEnd : '',
      record.customerValue !== undefined ? record.customerValue : 0,
      record.erpValue !== undefined ? record.erpValue : 0,
      record.valueDifference !== undefined ? record.valueDifference : 0,
      locationString,
      record.checkInPhoto ? "[Photo Collected - Available in Central Media Profile]" : 'No Photo',
      record.checkOutPhoto ? "[Photo Collected - Available in Central Media Profile]" : 'No Photo',
      record.status || 'PRESENT',
      record.selectedPinCodes ? record.selectedPinCodes.join(', ') : 'N/A'
    ];
  },

  /**
   * Syncs custom attendance record to specific spreadsheet.
   */
  async pushSingleRecord(spreadsheetId: string, record: any): Promise<void> {
    await this.pushRecordByType(spreadsheetId, 'attendance', record);
  },

  /**
   * Generic push record by type ('attendance', 'mismatches', 'ad_hoc_jobs') with dual month/date tab separation
   */
  async pushRecordByType(spreadsheetId: string, type: string, record: any): Promise<void> {
    const recordDate = record.date ? new Date(record.date) : new Date();
    const monthYear = format(recordDate, 'MMMM yyyy');

    let tabTitle = `${monthYear}`;
    let headers: string[] = [];
    let formattedRow: any[] = [];

    if (type === 'attendance') {
      tabTitle = `Attendance ${monthYear}`;
      headers = [
        "Record ID (রিপোর্ট আইডি)",
        "Date (তারিখ)",
        "Employee ID (আইডি)",
        "Employee Name (নাম)",
        "Role (পদবী)",
        "Check In (ইন সময়)",
        "Check Out (আউট সময়)",
        "Duration (কাজের ঘন্টা)",
        "Trip Earnings (টাকা)",
        "Distance Driven (কিমি)",
        "Shipment Count (চালান)",
        "Odometer Start (স্টার্ট মিটার)",
        "Odometer End (এন্ড মিটার)",
        "Customer Value (কাস্টমার ভ্যালু)",
        "ERP Value (ইআরপি ভ্যালু)",
        "Value Mismatch (পার্থক্য)",
        "Location Log (ইন অবস্থান/ম্যাপ)",
        "Check In Photo REF (ছবি লিঙ্ক)",
        "Check Out Photo REF (ছবি লিঙ্ক)",
        "Status (স্ট্যাটাস)",
        "Selected Pins (নির্বাচিত পিন)"
      ];
      formattedRow = this.formatAttendanceRow(record);
    } else if (type === 'mismatches') {
      tabTitle = `Mismatches ${monthYear}`;
      headers = [
        "Record ID (রিপোর্ট আইডি)",
        "Date (তারিখ)",
        "Employee ID (আইডি)",
        "Employee Name (নাম)",
        "Timestamp (সময়)",
        "Barcodes (বারকোডসমূহ)",
        "Customer Value (কাস্টমার ভ্যালু)",
        "ERP Value (ইআরপি ভ্যালু)",
        "Value Mismatch (পার্থক্য)"
      ];
      const empInfo = this.getEmployeeName(record.userId);
      const dateStr = record.date || format(new Date(), 'yyyy-MM-dd');
      const timestampStr = record.timestamp ? format(new Date(record.timestamp), 'hh:mm:ss a') : 'N/A';
      const barcodesStr = Array.isArray(record.barcodes) ? record.barcodes.join(', ') : (record.barcodes || '');
      formattedRow = [
        record.id || `mismatch_${Date.now()}`,
        dateStr,
        record.userId || 'N/A',
        record.employeeName || empInfo.name,
        timestampStr,
        barcodesStr,
        record.customerValue !== undefined ? record.customerValue : 0,
        record.erpValue !== undefined ? record.erpValue : 0,
        record.valueDifference !== undefined ? record.valueDifference : 0
      ];
    } else if (type === 'ad_hoc_jobs') {
      tabTitle = `AdHoc ${monthYear}`;
      headers = [
        "Record ID (রিপোর্ট আইডি)",
        "Date (তারিখ)",
        "Employee ID (আইডি)",
        "Employee Name (নাম)",
        "Vehicle Type (গাড়ির ধরন)",
        "Start Time (শুরুর সময়)",
        "End Time (শেষ সময়)",
        "Total Hours (কাজের ঘন্টা)",
        "Value (টাকা/মূল্য)",
        "Status (স্ট্যাটাস)",
        "Timestamp (সময়)"
      ];
      const empInfo = this.getEmployeeName(record.userId);
      const dateStr = record.date || format(new Date(), 'yyyy-MM-dd');
      const timestampStr = record.timestamp ? format(new Date(record.timestamp), 'hh:mm:ss a') : 'N/A';
      formattedRow = [
        record.id || `adhoc_${Date.now()}`,
        dateStr,
        record.userId || 'N/A',
        record.employeeName || empInfo.name,
        record.vehicleType || '',
        record.startTime || '',
        record.endTime || '',
        record.totalHours !== undefined ? record.totalHours : 0,
        record.value !== undefined ? record.value : 0,
        record.status || 'PENDING',
        timestampStr
      ];
    } else {
      return;
    }

    await this.ensureSheetTabExists(spreadsheetId, tabTitle, headers);

    // Read current keys to avoid duplicates
    const tabData = await this.apiFetch(`https://sheets.googleapis.com/v1/spreadsheets/${spreadsheetId}/values/'${tabTitle}'!A:A`);
    const existingIds = (tabData.values || []).map((row: any[]) => row[0]);
    const existingIndex = existingIds.indexOf(formattedRow[0]);

    if (existingIndex !== -1) {
      const rowIndex = existingIndex + 1;
      const endLetter = String.fromCharCode(65 + formattedRow.length - 1);
      const range = `'${tabTitle}'!A${rowIndex}:${endLetter}${rowIndex}`;
      const valueBody = {
        range,
        majorDimension: 'ROWS',
        values: [formattedRow]
      };
      await this.apiFetch(`https://sheets.googleapis.com/v1/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`, {
        method: 'PUT',
        body: JSON.stringify(valueBody)
      });
    } else {
      const range = `'${tabTitle}'!A1`;
      const valueBody = {
        range,
        majorDimension: 'ROWS',
        values: [formattedRow]
      };
      await this.apiFetch(`https://sheets.googleapis.com/v1/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED`, {
        method: 'POST',
        body: JSON.stringify(valueBody)
      });
    }
  },

  /**
   * Syncs ALL local attendance records from `db_cockroach_attendance` to Google Sheets
   */
  async syncAllLocalData(spreadsheetId: string, onProgress?: (current: number, total: number) => void): Promise<number> {
    const list = LocalDB.get('attendance');
    const mismatches = LocalDB.get('mismatches');
    const adHocJobs = LocalDB.get('ad_hoc_jobs');

    const totalRecords = (list?.length || 0) + (mismatches?.length || 0) + (adHocJobs?.length || 0);
    if (totalRecords === 0) return 0;

    let count = 0;

    // Sync attendance
    if (list && list.length > 0) {
      for (let i = 0; i < list.length; i++) {
        await this.pushRecordByType(spreadsheetId, 'attendance', list[i]);
        count++;
        if (onProgress) onProgress(count, totalRecords);
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    // Sync mismatches
    if (mismatches && mismatches.length > 0) {
      for (let i = 0; i < mismatches.length; i++) {
        await this.pushRecordByType(spreadsheetId, 'mismatches', mismatches[i]);
        count++;
        if (onProgress) onProgress(count, totalRecords);
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    // Sync adHocJobs
    if (adHocJobs && adHocJobs.length > 0) {
      for (let i = 0; i < adHocJobs.length; i++) {
        await this.pushRecordByType(spreadsheetId, 'ad_hoc_jobs', adHocJobs[i]);
        count++;
        if (onProgress) onProgress(count, totalRecords);
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    return count;
  }
};
