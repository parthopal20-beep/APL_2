import { supabase, realSupabase, isConfigured, getUseLocalFallback, LocalDB } from '../lib/supabase';
import { GoogleSheetsService } from './GoogleSheetsService';

const isSupabaseLive = () => isConfigured && !getUseLocalFallback();

export class SupabaseService {
  private static columnCache: { [key: string]: Set<string> } = {};
  private static missingTables: Set<string> = new Set();

  private static isMockMode(table?: string): boolean {
    return !isConfigured || getUseLocalFallback();
  }

  /**
   * Cleans an object for Supabase:
   * 1. Maps camelCase keys to snake_case/lowercase columns.
   * 2. Removes undefined values.
   */
  private static sanitize(data: any): any {
    const clean: any = {};
    const reverseMap: { [key: string]: string } = {
      'userId': 'userid',
      'userName': 'username',
      'checkInTime': 'checkintime',
      'checkOutTime': 'checkouttime',
      'checkInLocation': 'checkinlocation',
      'checkOutLocation': 'checkoutlocation',
      'checkInPhoto': 'checkinphoto',
      'checkOutPhoto': 'checkoutphoto',
      'customerPhoto': 'customerphoto',
      'erpPhoto': 'erpphoto',
      'hoursWorked': 'hoursworked',
      'reviewNeeded': 'reviewneeded',
      'customerValue': 'customervalue',
      'erpValue': 'erpvalue',
      'valueDifference': 'valuedifference',
      'senderId': 'senderid',
      'senderName': 'sendername',
      'photoUrl': 'photourl',
      'audioUrl': 'audiourl',
      'calculatedAt': 'calculatedat',
      'baseSalary': 'basesalary',
      'shipmentEarnings': 'shipmentearnings',
      'totalEarnings': 'totalearnings',
      'totalHours': 'totalhours',
      'totalShipments': 'totalshipments',
      'totalMileage': 'totalmileage',
      'daysPresent': 'dayspresent',
      'lastActive': 'lastactive',
      'profilePicture': 'profilepicture',
      'activeSessions': 'activesessions',
      'passwordHash': 'passwordhash',
      'jobTitle': 'jobtitle',
      'paymentBase': 'paymentbase',
      'employeeCategory': 'employeecategory',
      'markedBy': 'markedby',
      'employeeName': 'employeename',
      'vehicleType': 'vehicletype',
      'startTime': 'starttime',
      'endTime': 'endtime',
      'releasedBy': 'releasedby',
      'isMandatory': 'ismandatory',
      'odometerStart': 'odometerstart',
      'odometerEnd': 'odometerend',
      'distanceDriven': 'distancedriven',
      'distance_driven': 'distancedriven',
      'odometer_start': 'odometerstart',
      'odometer_end': 'odometerend',
      'hours_worked': 'hoursworked',
      'check_in_time': 'checkintime',
      'check_out_time': 'checkouttime',
      'onlineCash': 'onlinecash',
      'valueMismatch': 'valuemismatch',
      'totalAmount': 'totalamount',
      'totalNotes': 'totalnotes'
    };

    Object.keys(data).forEach(key => {
      const val = data[key];
      if (val === undefined) return;
      
      const targetKey = reverseMap[key] || key.toLowerCase();

      if (val === null) {
        clean[targetKey] = null;
      } else if (Array.isArray(val)) {
        clean[targetKey] = val.map(item => (typeof item === 'object' && item !== null && !(item instanceof Date) ? this.sanitize(item) : item));
      } else if (typeof val === 'object' && val !== null && !(val instanceof Date)) {
        clean[targetKey] = this.sanitize(val);
      } else {
        clean[targetKey] = val;
      }
    });
    return clean;
  }

  /**
   * Desanitizes an object/array from Supabase back to TypeScript camelCase.
   */
  private static desanitize(data: any): any {
    if (!data) return data;
    if (Array.isArray(data)) return data.map(i => this.desanitize(i));
    if (typeof data !== 'object') return data;

    const mapped: any = {};
    const keyMap: { [key: string]: string } = {
      'userid': 'userId',
      'checkintime': 'checkInTime',
      'checkouttime': 'checkOutTime',
      'checkinlocation': 'checkInLocation',
      'checkoutlocation': 'checkOutLocation',
      'checkinphoto': 'checkInPhoto',
      'checkoutphoto': 'checkOutPhoto',
      'customerphoto': 'customerPhoto',
      'erpphoto': 'erpPhoto',
      'hoursworked': 'hoursWorked',
      'shipments': 'shipments',
      'distancedriven': 'distanceDriven',
      'distance_driven': 'distanceDriven',
      'odometerstart': 'odometerStart',
      'odometer_start': 'odometerStart',
      'odometerend': 'odometerEnd',
      'odometer_end': 'odometerEnd',
      'reviewneeded': 'reviewNeeded',
      'customervalue': 'customerValue',
      'erpvalue': 'erpValue',
      'valuedifference': 'valueDifference',
      'senderid': 'senderId',
      'sendername': 'senderName',
      'photourl': 'photoUrl',
      'audiourl': 'audioUrl',
      'calculatedat': 'calculatedAt',
      'basesalary': 'baseSalary',
      'shipmentearnings': 'shipmentEarnings',
      'totalearnings': 'totalEarnings',
      'totalhours': 'totalHours',
      'totalshipments': 'totalShipments',
      'totalmileage': 'totalMileage',
      'dayspresent': 'daysPresent',
      'lastactive': 'lastActive',
      'profilepicture': 'profilePicture',
      'activesessions': 'activeSessions',
      'passwordhash': 'passwordHash',
      'jobtitle': 'jobTitle',
      'paymentbase': 'paymentBase',
      'employeecategory': 'employeeCategory',
      'markedby': 'markedBy',
      'employeename': 'employeeName',
      'vehicletype': 'vehicleType',
      'starttime': 'startTime',
      'endtime': 'endTime',
      'releasedby': 'releasedBy',
      'ismandatory': 'isMandatory',
      'onlinecash': 'onlineCash',
      'valuemismatch': 'valueMismatch',
      'totalamount': 'totalAmount',
      'totalnotes': 'totalNotes'
    };

    Object.keys(data).forEach(key => {
      const camelKey = keyMap[key] || key;
      const val = data[key];

      if (val && typeof val === 'object' && !Array.isArray(val)) {
        mapped[camelKey] = this.desanitize(val);
      } else if (Array.isArray(val)) {
        mapped[camelKey] = val.map(i => (typeof i === 'object' ? this.desanitize(i) : i));
      } else {
        mapped[camelKey] = val;
      }
    });

    return mapped;
  }

  /**
   * Primary Fetch: Reads data from Supabase.
   */
  static async list(table: string, filters?: { column: string; value: any; operator?: string }[], limitValue?: number, order?: { column: string; ascending?: boolean }, retries = 3): Promise<any[]> {
    const tableName = table.toLowerCase();
    if (this.missingTables.has(tableName)) return [];

    // 1. Always check LocalDB first
    const localData = LocalDB.list(tableName, filters, limitValue, order);

    // 2. If Supabase is configured and NOT in persistent fallback, fetch remote
    let remoteData: any[] = [];
    const canFetchSupabase = isConfigured && !getUseLocalFallback() && tableName === 'users';

    if (canFetchSupabase) {
      try {
        let query = realSupabase.from(tableName).select('*');
        
        if (filters) {
          filters.forEach(f => {
            const col = f.column.toLowerCase();
            const op = f.operator || 'eq';
            if (op === 'eq') query = query.eq(col, f.value);
            else if (op === 'gte') query = query.gte(col, f.value);
            else if (op === 'lte') query = query.lte(col, f.value);
            else if (op === 'contains') query = query.contains(col, f.value);
            else if (op === 'like') query = query.ilike(col, f.value);
          });
        }

        if (order) {
          query = query.order(order.column.toLowerCase(), { ascending: order.ascending ?? false });
        }

        if (limitValue) {
          query = query.limit(limitValue);
        }

        const { data, error } = await query;
        if (error) {
          // If it's a rate limit or restriction, don't crash, just use local
          const msg = (error.message || '').toLowerCase();
          if (msg.includes('rate limit') || msg.includes('too many requests') || msg.includes('quota')) {
            console.warn(`Supabase ${tableName} fetch restricted, using local data only.`);
          } else {
            throw error;
          }
        } else {
          remoteData = this.desanitize(data || []);
        }
      } catch (err: any) {
        const msg = (err.message || String(err)).toLowerCase();
        if (retries > 0 && (msg.includes('fetch') || msg.includes('network') || msg.includes('timeout') || err.code === 'fetch_error')) {
          await new Promise(r => setTimeout(r, 1000 * (4 - retries)));
          return this.list(table, filters, limitValue, order, retries - 1);
        }
        console.error(`Supabase List Error [${table}]:`, err);
      }
    }

    // 3. Merge hybrid data: Supabase data takes priority if IDs match
    if (remoteData.length === 0) return localData;
    if (localData.length === 0) return remoteData;

    const merged = [...remoteData];
    const remoteIdSet = new Set(remoteData.map(d => String(d.id).toLowerCase()));

    localData.forEach(l => {
      const lId = String(l.id).toLowerCase();
      if (!remoteIdSet.has(lId)) {
        merged.push(l);
      }
    });
    
    // De-duplicate any straggly ones by ID
    const finalMap = new Map();
    merged.forEach(item => {
      finalMap.set(String(item.id).toLowerCase(), item);
    });
    const finalMerged = Array.from(finalMap.values());

    // Re-apply ordering if needed after merge
    if (order) {
      const col = order.column;
      const asc = order.ascending ?? false;
      finalMerged.sort((a, b) => {
        if ((a[col] || '') < (b[col] || '')) return asc ? -1 : 1;
        if ((a[col] || '') > (b[col] || '')) return asc ? 1 : -1;
        return 0;
      });
    }

    return limitValue ? finalMerged.slice(0, limitValue) : finalMerged;
  }

  static async resetDatabase(keepAdminId: string) {
    console.log(`[Database] Initiating hard reset. Keeping admin: ${keepAdminId}`);
    
    const tables = [
      'users',
      'attendance',
      'mismatches',
      'calls',
      'ad_hoc_jobs',
      'paydays',
      'salary_history',
      'live_locations',
      'location_logs',
      'app_updates',
      'cash_reports',
      'messages',
      'broadcasts'
    ];

    // 1. Wipe LocalDB
    for (const table of tables) {
      if (table === 'users') {
        const users = LocalDB.get('users');
        const admin = users.find(u => u.id === keepAdminId || u.username === keepAdminId);
        if (admin) {
          LocalDB.set('users', [admin]);
        } else {
          // If admin not found in list (unlikely), clear but sign out is dangerous here
          // We'll trust the caller provided valid ID
          LocalDB.set('users', []);
        }
      } else {
        localStorage.removeItem('db_cockroach_' + table);
        localStorage.removeItem('db_' + table); // Just in case of old naming
        window.dispatchEvent(new Event('local_db_update_' + table));
      }
    }

    // 2. Try Supabase Wipe (if allowed by RLS)
    if (isConfigured && !getUseLocalFallback()) {
      try {
        for (const table of tables) {
          if (table === 'users') {
            await realSupabase.from('users').delete().neq('id', keepAdminId);
          } else if (['attendance', 'paydays', 'salary_history'].includes(table)) {
            // Delete all records from bigint-identity primary key tables
            await realSupabase.from(table).delete().gte('id', 0);
          } else {
            // Delete all records from uuid/text primary key tables
            await realSupabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
          }
        }
      } catch (err) {
        console.warn("Supabase wipe limited by RLS/Permissions, but LocalDB is cleared.", err);
      }
    }
  }

  static async getOne(table: string, id: string, retries = 3): Promise<any | null> {
    const tableName = table.toLowerCase();
    if (this.missingTables.has(tableName)) return null;

    // 1. Check LocalDB first (quickest)
    const localItem = LocalDB.getOne(tableName, id);

    // 2. Try Supabase
    if (isConfigured && !getUseLocalFallback()) {
      try {
        const { data, error } = await realSupabase
          .from(tableName)
          .select('*')
          .eq('id', id)
          .single();
        
        if (error) {
          if (error.code === 'PGRST116') {
             // Not found in Supabase, return local if available
             return localItem;
          }
          throw error;
        }
        return this.desanitize(data);
      } catch (err: any) {
        const msg = (err.message || String(err)).toLowerCase();
        if (retries > 0 && (msg.includes('fetch') || msg.includes('network') || msg.includes('timeout') || err.code === 'fetch_error')) {
          await new Promise(r => setTimeout(r, 1000 * (4 - retries)));
          return this.getOne(table, id, retries - 1);
        }
        console.error(`Supabase GetOne Error [${table}/${id}]:`, err.message || err);
      }
    }

    return localItem;
  }

  private static handleError(table: string, op: string, err: any): never {
    const msg = (err.message || String(err)).toLowerCase();
    const tableName = table.toLowerCase();

    if (msg.includes('could not find') && msg.includes('table')) {
      console.warn(`[Supabase] Table '${tableName}' not found. Adding to missing tables cache.`);
      this.missingTables.add(tableName);
      throw err;
    }

    // Silence background logging errors to avoid annoying popups
    if (tableName === 'location_logs' || tableName === 'live_locations') {
      console.warn(`Supabase Background ${op} Error [${table}]:`, msg);
      throw err;
    }

    console.error(`Supabase ${op} Error [${table}]:`, msg);
    
    if (msg.includes('fetch') || msg.includes('network')) {
      if (typeof window !== 'undefined' && !window.navigator.onLine) {
        throw new Error('Device is offline. Please check your internet connection.');
      }
      throw new Error('Database connection failed. Please retry in a moment.');
    }
    throw err;
  }

  static async create(table: string, data: any, retries = 3): Promise<any | null> {
    const tableName = table.toLowerCase();
    if (this.missingTables.has(tableName)) return null;

    try {
      // Only generate a string ID for 'users' (which uses strings/UUIDs from Auth)
      // Otherwise let Supabase handle it (for bigint identities or other defaults)
      const payload = { ...data };
      const identityTables = ['attendance', 'paydays', 'salary_history'];
      
      if (identityTables.includes(tableName)) {
        // Create a unique numeric-safe ID for BIGINT identity tables
        // providing a manual ID is safe for "GENERATED BY DEFAULT AS IDENTITY" 
        // and fixes "null value in column id" for tables created without identity sequences.
        if (!payload.id || typeof payload.id === 'string') {
          payload.id = Date.now() + Math.floor(Math.random() * 1000);
        }
      } else if (!payload.id) {
        // For all other tables with TEXT PRIMARY KEY, generate a string ID if missing
        payload.id = Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
      }
      
      if (tableName !== 'users') {
        const payloadToSave = { ...payload };
        try {
          if (tableName === 'attendance') {
            // Include placeholders or ensure all values are robust
            payloadToSave.status = payloadToSave.status || 'PRESENT';
          }
          LocalDB.upsert(tableName, payloadToSave.id, payloadToSave);
          window.dispatchEvent(new Event(`local_db_update_${tableName}`));
          
          const syncTabTypes = ['attendance', 'mismatches', 'ad_hoc_jobs'];
          if (syncTabTypes.includes(tableName)) {
            const sheetId = GoogleSheetsService.getStoredSpreadsheetId();
            const token = GoogleSheetsService.getAccessToken();
            if (sheetId && token) {
              console.log(`[Auto-Sheets Sync] Posting new ${tableName} record to Google Sheets in real-time...`);
              GoogleSheetsService.pushRecordByType(sheetId, tableName, payloadToSave)
                .then(() => console.log(`[Auto-Sheets Sync] ${tableName} sheet synchronized successfully.`))
                .catch(err => console.error(`[Auto-Sheets Sync] Error during real-time Google Sheet post for ${tableName}:`, err));
            }
          }
        } catch (cacheErr) {
          console.warn("[LocalDB Mirror] Failed to synchronize created item:", cacheErr);
        }
        return payloadToSave;
      }
      
      const sanitized = this.sanitize(payload);
      
      // Remove known missing columns
      if (this.columnCache[tableName]) {
        Object.keys(sanitized).forEach(key => {
          if (this.columnCache[tableName].has(key)) {
            delete sanitized[key];
          }
        });
      }
      
      const { data: result, error } = await supabase
        .from(tableName)
        .insert(sanitized)
        .select()
        .single();
        
      if (error) {
        if (error.message?.toLowerCase().includes('column') && (error.message?.includes('does not exist') || error.message?.includes('Could not find'))) {
          const match = error.message.match(/column ["'](.+?)["']/i) || error.message.match(/["'](.+?)["'] column/i);
          const colName = match ? (match[1] || match[2] || '').toLowerCase() : null;
          if (colName) {
            if (this.columnCache[tableName]?.has(colName)) {
              // We already knew this was missing, so this is a different error or we failed to skip it
              throw error;
            }
            console.warn(`[Supabase] Column '${colName}' not found in '${tableName}'. Skipping in future calls.`);
            if (!this.columnCache[tableName]) this.columnCache[tableName] = new Set();
            this.columnCache[tableName].add(colName);
            return this.create(table, data, retries); 
          }
        }
        if (error.message?.includes('Could not find') && error.message?.includes('table')) {
          this.missingTables.add(tableName);
          console.warn(`[Supabase] Table '${tableName}' not found. Skipped.`);
          return null;
        }
        throw error;
      }

      // Save local cache mirror to guarantee immediate UI reactivity and local persistence
      try {
        LocalDB.upsert(tableName, payload.id, payload);
      } catch (cacheErr) {
        console.warn("[LocalDB Mirror] Failed to synchronize created item:", cacheErr);
      }

      // Dispatch local update event for reactivity even if created remotely
      window.dispatchEvent(new Event(`local_db_update_${tableName}`));
      
      return this.desanitize(result);
    } catch (err: any) {
      const msg = (err.message || String(err)).toLowerCase();
      if (retries > 0 && (msg.includes('fetch') || msg.includes('network') || msg.includes('timeout') || err.code === 'fetch_error')) {
        await new Promise(r => setTimeout(r, 1000 * (4 - retries)));
        return this.create(table, data, retries - 1);
      }
      if (this.missingTables.has(tableName)) return null;
      return this.handleError(table, 'Create', err);
    }
  }

  static async update(table: string, id: string, data: any, retries = 3): Promise<void> {
    const tableName = table.toLowerCase();
    if (this.missingTables.has(tableName)) return;

    try {
      if (tableName !== 'users') {
        try {
          LocalDB.update(tableName, id, data);
          window.dispatchEvent(new Event(`local_db_update_${tableName}`));
          
          const syncTabTypes = ['attendance', 'mismatches', 'ad_hoc_jobs'];
          if (syncTabTypes.includes(tableName)) {
            const sheetId = GoogleSheetsService.getStoredSpreadsheetId();
            const token = GoogleSheetsService.getAccessToken();
            if (sheetId && token) {
              const fullRecord = LocalDB.getOne(tableName, id);
              if (fullRecord) {
                console.log(`[Auto-Sheets Sync] Updating changed ${tableName} record in Google Sheets...`, fullRecord);
                GoogleSheetsService.pushRecordByType(sheetId, tableName, fullRecord)
                  .then(() => console.log(`[Auto-Sheets Sync] ${tableName} update success.`))
                  .catch(err => console.error(`[Auto-Sheets Sync] Error during real-time Google Sheet update for ${tableName}:`, err));
              }
            }
          }
        } catch (cacheErr) {
          console.warn("[LocalDB Mirror] Failed to synchronize updated item:", cacheErr);
        }
        return;
      }

      const sanitized = this.sanitize(data);
      // NEVER update the ID column even if it's in the data object
      delete sanitized.id;

      if (this.columnCache[tableName]) {
        Object.keys(sanitized).forEach(key => {
          if (this.columnCache[tableName].has(key)) {
            delete sanitized[key];
          }
        });
      }

      const { error } = await supabase
        .from(tableName)
        .update(sanitized)
        .eq('id', id);
        
      if (error) {
        if (error.message?.toLowerCase().includes('column') && (error.message?.includes('does not exist') || error.message?.includes('Could not find'))) {
          const match = error.message.match(/column ["'](.+?)["']/i) || error.message.match(/["'](.+?)["'] column/i);
          const colName = match ? (match[1] || match[2] || '').toLowerCase() : null;
          if (colName) {
            if (this.columnCache[tableName]?.has(colName)) {
              throw error;
            }
            console.warn(`[Supabase] Column '${colName}' not found in '${tableName}'. Skipping in future calls.`);
            if (!this.columnCache[tableName]) this.columnCache[tableName] = new Set();
            this.columnCache[tableName].add(colName);
            return this.update(table, id, data, retries);
          }
        }
        if (error.message?.includes('Could not find') && error.message?.includes('table')) {
          this.missingTables.add(tableName);
          console.warn(`[Supabase] Table '${tableName}' not found. Skipped.`);
          return;
        }
        throw error;
      }

      // Save local cache mirror to guarantee immediate UI reactivity and local persistence
      try {
        LocalDB.update(tableName, id, data);
      } catch (cacheErr) {
        console.warn("[LocalDB Mirror] Failed to synchronize updated item:", cacheErr);
      }

      window.dispatchEvent(new Event(`local_db_update_${tableName}`));
    } catch (err: any) {
      const msg = (err.message || String(err)).toLowerCase();
      if (retries > 0 && (msg.includes('fetch') || msg.includes('network') || msg.includes('timeout') || err.code === 'fetch_error')) {
        await new Promise(r => setTimeout(r, 1000 * (4 - retries)));
        return this.update(table, id, data, retries - 1);
      }
      if (this.missingTables.has(tableName)) return;
      this.handleError(table, `Update/${id}`, err);
    }
  }

  /**
   * Upsert helper: Updates if exists, otherwise creates.
   */
  static async upsert(table: string, id: string, data: any, retries = 3): Promise<void> {
    const tableName = table.toLowerCase();
    if (this.missingTables.has(tableName)) return;

    try {
      if (tableName !== 'users') {
        try {
          LocalDB.upsert(tableName, id, data);
          window.dispatchEvent(new Event(`local_db_update_${tableName}`));
          
          const syncTabTypes = ['attendance', 'mismatches', 'ad_hoc_jobs'];
          if (syncTabTypes.includes(tableName)) {
            const sheetId = GoogleSheetsService.getStoredSpreadsheetId();
            const token = GoogleSheetsService.getAccessToken();
            if (sheetId && token) {
              const fullRecord = LocalDB.getOne(tableName, id);
              if (fullRecord) {
                console.log(`[Auto-Sheets Sync] Upserting ${tableName} record to Google Sheets...`, fullRecord);
                GoogleSheetsService.pushRecordByType(sheetId, tableName, fullRecord)
                  .then(() => console.log(`[Auto-Sheets Sync] ${tableName} upsert success.`))
                  .catch(err => console.error(`[Auto-Sheets Sync] Error during real-time Google Sheet upsert for ${tableName}:`, err));
              }
            }
          }
        } catch (cacheErr) {
          console.warn("[LocalDB Mirror] Failed to synchronize upserted item:", cacheErr);
        }
        return;
      }

      const payload = { ...data, id };
      const sanitized = this.sanitize(payload);

      if (this.columnCache[tableName]) {
        Object.keys(sanitized).forEach(key => {
          if (this.columnCache[tableName].has(key)) {
            delete sanitized[key];
          }
        });
      }

      const { error } = await supabase
        .from(tableName)
        .upsert(sanitized);
        
      if (error) {
        if (error.message?.includes('Could not find') || error.message?.toLowerCase().includes('column')) {
          const match = error.message.match(/column ["'](.+?)["']/i) || error.message.match(/["'](.+?)["'] column/i);
          const colName = match ? (match[1] || match[2] || '').toLowerCase() : null;
          if (colName) {
            console.warn(`[Supabase] Column '${colName}' not found in '${tableName}'. Retrying...`);
            if (!this.columnCache[tableName]) this.columnCache[tableName] = new Set();
            this.columnCache[tableName].add(colName);
            return this.upsert(table, id, data, retries); // Don't consume retries for schema errors
          }
        }
        if (error.message?.includes('Could not find') && error.message?.includes('table')) {
          this.missingTables.add(tableName);
          console.warn(`[Supabase] Table '${tableName}' not found. Skipped.`);
          return;
        }
        throw error;
      }

      // Save local cache mirror to guarantee immediate UI reactivity and local persistence
      try {
        LocalDB.upsert(tableName, id, data);
      } catch (cacheErr) {
        console.warn("[LocalDB Mirror] Failed to synchronize upserted item:", cacheErr);
      }

      window.dispatchEvent(new Event(`local_db_update_${tableName}`));
    } catch (err: any) {
      const msg = (err.message || String(err)).toLowerCase();
      if (retries > 0 && (msg.includes('fetch') || msg.includes('network') || msg.includes('timeout') || err.code === 'fetch_error')) {
        await new Promise(r => setTimeout(r, 1000 * (4 - retries)));
        return this.upsert(table, id, data, retries - 1);
      }
      if (this.missingTables.has(tableName)) return;
      this.handleError(table, `Upsert/${id}`, err);
    }
  }

  static async delete(table: string, id: string, retries = 3): Promise<void> {
    const tableName = table.toLowerCase();
    try {
      if (tableName !== 'users') {
        try {
          LocalDB.delete(tableName, id);
        } catch (cacheErr) {
          console.warn("[LocalDB Mirror] Failed to synchronize deleted item:", cacheErr);
        }
        window.dispatchEvent(new Event(`local_db_update_${tableName}`));
        return;
      }

      const { error } = await supabase
        .from(table.toLowerCase())
        .delete()
        .eq('id', id);
        
      if (error) throw error;

      // Save local cache mirror to guarantee immediate UI reactivity and local persistence
      try {
        LocalDB.delete(table.toLowerCase(), id);
      } catch (cacheErr) {
        console.warn("[LocalDB Mirror] Failed to synchronize deleted item:", cacheErr);
      }

      window.dispatchEvent(new Event(`local_db_update_${table.toLowerCase()}`));
    } catch (err: any) {
      const msg = (err.message || String(err)).toLowerCase();
      if (retries > 0 && (msg.includes('fetch') || msg.includes('network') || msg.includes('timeout') || err.code === 'fetch_error')) {
        await new Promise(r => setTimeout(r, 1000 * (4 - retries)));
        return this.delete(table, id, retries - 1);
      }
      throw err;
    }
  }

  /**
   * Deletes records matching a set of filters.
   */
  static async deleteWhere(table: string, filters: { column: string; value: any; operator?: string }[], retries = 3): Promise<void> {
    const tableName = table.toLowerCase();
    try {
      if (tableName !== 'users') {
        try {
          LocalDB.deleteWhere(tableName, filters);
        } catch (cacheErr) {
          console.warn("[LocalDB Mirror] Failed to synchronize deleteWhere items:", cacheErr);
        }
        window.dispatchEvent(new Event(`local_db_update_${tableName}`));
        return;
      }

      let query = supabase.from(tableName).delete();
      
      filters.forEach(f => {
        const op = f.operator || 'eq';
        if (op === 'eq') query = query.eq(f.column, f.value);
        else if (op === 'gte') query = query.gte(f.column, f.value);
        else if (op === 'lte') query = query.lte(f.column, f.value);
      });
      
      const { error } = await query;
      if (error) throw error;

      // Save local cache mirror to guarantee immediate UI reactivity and local persistence
      try {
        LocalDB.deleteWhere(table.toLowerCase(), filters);
      } catch (cacheErr) {
        console.warn("[LocalDB Mirror] Failed to synchronize deleteWhere items:", cacheErr);
      }

      window.dispatchEvent(new Event(`local_db_update_${table.toLowerCase()}`));
    } catch (err: any) {
      const msg = (err.message || String(err)).toLowerCase();
      if (retries > 0 && (msg.includes('fetch') || msg.includes('network') || msg.includes('timeout') || err.code === 'fetch_error')) {
        await new Promise(r => setTimeout(r, 1000 * (4 - retries)));
        return this.deleteWhere(table, filters, retries - 1);
      }
      this.handleError(table, 'DeleteWhere', err);
    }
  }

  /**
   * Uploads a file to Supabase Storage
   */
  static async uploadFile(bucket: string, path: string, file: File | Blob, retries = 3): Promise<string> {
    // ALWAYS bypass Supabase Storage to completely eliminate storage usage and save Supabase Storage space.
    // We convert everything directly to a Data URI (Base64) which is stored in Cockroach DB (localStorage).
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(reader.result as string);
      };
      reader.readAsDataURL(file);
    });
  }

  /**
   * Real-time Subscription Helper
   */
  static subscribe(table: string, callback: (payload: any) => void) {
    const tableName = table.toLowerCase();
    
    // 1. Always listen to LocalDB updates
    const localEventName = `local_db_update_${tableName}`;
    const localHandler = () => {
      this.list(table).then(callback).catch(err => console.error(`Local Subscription error [${table}]:`, err));
    };
    window.addEventListener(localEventName, localHandler);

    // 2. Try Supabase subscription if configured and not restricted
    let subChannel: any = null;
    const canSubscribeSupabase = isConfigured && !getUseLocalFallback();

    if (canSubscribeSupabase) {
      try {
        const channelId = `pub:${table}:${Math.random().toString(36).substring(2, 7)}`;
        const channel = realSupabase.channel(channelId);
        
        subChannel = channel.on(
          'postgres_changes',
          { event: '*', schema: 'public', table: table.toLowerCase() },
          () => {
            this.list(table).then(callback).catch(err => console.error(`Supabase Subscription fetch error [${table}]:`, err));
          }
        );
        
        subChannel.subscribe();
      } catch (err) {
        console.error("Supabase Subscription setup failed, relying on local tracker", err);
      }
    }

    return {
      unsubscribe: () => {
        window.removeEventListener(localEventName, localHandler);
        if (subChannel) {
          try {
            if (typeof subChannel.unsubscribe === 'function') {
              subChannel.unsubscribe();
            } else {
              realSupabase.removeChannel(subChannel);
            }
          } catch (e) {
            console.warn("Error unsubscribing channel", e);
          }
        }
      }
    };
  }

  private static broadcastChannels: Map<string, any> = new Map();

  /**
   * Broadcasts ephemeral data to a channel
   */
  static async sendBroadcast(channelName: string, event: string, payload: any) {
    if (!isSupabaseLive()) return;
    
    let channel = this.broadcastChannels.get(channelName);
    
    if (!channel) {
      channel = supabase.channel(channelName, {
        config: { broadcast: { self: false } }
      });
      
      const isSubscribed = await new Promise((resolve) => {
        channel.subscribe((status: string) => {
          if (status === 'SUBSCRIBED') resolve(true);
          else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') resolve(false);
        });
      });

      if (isSubscribed) {
        this.broadcastChannels.set(channelName, channel);
      } else {
        console.error('Failed to subscribe to broadcast channel');
        return;
      }
    }

    try {
      await channel.send({
        type: 'broadcast',
        event: event,
        payload: payload,
      });
    } catch (err) {
      console.error('Broadcast sending error:', err);
      // Clean up on error to retry next time
      supabase.removeChannel(channel);
      this.broadcastChannels.delete(channelName);
    }
  }

  /**
   * Listens to ephemeral broadcasts on a channel
   */
  static onBroadcast(channelName: string, event: string, callback: (payload: any) => void) {
    if (!isSupabaseLive()) return { unsubscribe: () => {} };
    
    const channel = supabase.channel(`sub:${channelName}:${Math.random().toString(36).substring(2, 7)}`, {
      config: { broadcast: { self: false } }
    });

    channel
      .on('broadcast', { event: event }, ({ payload }) => {
        callback(payload);
      })
      .subscribe();

    return {
      unsubscribe: () => {
        supabase.removeChannel(channel);
      }
    };
  }

  static async fetchFallbackItem(table: string, id: string): Promise<any | null> {
    if (!isSupabaseLive()) return null;
    try {
      const { data, error } = await supabase
        .from(table.toLowerCase())
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) {
        console.error(`Supabase Item Fetch Error [${table}/${id}]:`, error.message);
        return null;
      }
      return this.desanitize(data);
    } catch (err) {
      console.error(`Supabase Item Fetch Exception [${table}/${id}]:`, err);
      return null;
    }
  }

  static async fetchFallback(table: string): Promise<any[] | null> {
    if (!isSupabaseLive()) return null;
    try {
      const { data, error } = await supabase
        .from(table.toLowerCase())
        .select('*');
      
      if (error) {
        console.error(`Supabase Fetch Error [${table}]:`, error.message);
        return null;
      }
      return this.desanitize(data);
    } catch (err) {
      console.error(`Supabase Fetch Exception [${table}]:`, err);
      return null;
    }
  }

  static clearCache() {
    this.columnCache = {};
    this.missingTables = new Set();
  }

  static async checkSystemHealth(): Promise<{ [key: string]: boolean }> {
    const tables = ['users', 'attendance', 'mismatches', 'calls', 'ad_hoc_jobs', 'paydays'];
    const results: { [key: string]: boolean } = {};
    for (const table of tables) {
      try {
        const { error } = await supabase.from(table).select('id').limit(1);
        results[table] = !error;
      } catch {
        results[table] = false;
      }
    }
    return results;
  }
}
