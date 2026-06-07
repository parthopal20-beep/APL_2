import { supabase, realSupabase, isConfigured } from '../lib/supabase';
import { socketService } from './SocketService';

export class SupabaseService {
  private static columnCache: { [key: string]: Set<string> } = {};
  private static missingTables: Set<string> = new Set();
  private static listCache: { [key: string]: { data: any, timestamp: number } } = {};
  private static CACHE_TTL = 3000; // 3 seconds cache for the same query
  private static subCooldowns: { [key: string]: number } = {};

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
      'totalnotes': 'totalNotes',
      'username': 'userName'
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
   * Primary Fetch: Reads data from Supabase (or CockroachDB via Proxy).
   */
  static async list(table: string, filters?: { column: string; value: any; operator?: string }[], limitValue?: number, order?: { column: string; ascending?: boolean }, retries = 3): Promise<any[]> {
    const tableName = table.toLowerCase();
    
    // Cache key based on table and parameters
    const cacheKey = `list_${tableName}_${JSON.stringify(filters || [])}_${limitValue || 'no_limit'}_${JSON.stringify(order || 'no_order')}`;
    
    // EXEMPT users table from caching to ensure login reliability
    if (tableName !== 'users') {
      const cached = this.listCache[cacheKey];
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        return cached.data;
      }
    }

    if (this.missingTables.has(tableName)) return [];

    // Redirect to CockroachDB for non-user tables
    if (tableName !== 'users') {
      try {
        const response = await fetch('/api/db/' + tableName + '/select', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filters, limit: limitValue, orderBy: order })
        });
        
        if (!response.ok) {
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const errData = await response.json();
            throw new Error(errData.error || `Server error ${response.status}`);
          } else {
            throw new Error(`Server returned HTML/Non-JSON response (${response.status}). Potential bridge crash.`);
          }
        }

        const result = await response.json();
        if (result.error) throw new Error(result.error);
        
        const results = this.desanitize(result.data || []);
        
        // Update Cache
        this.listCache[cacheKey] = { data: results, timestamp: Date.now() };
        return results;
      } catch (err) {
        console.error(`CockroachDB List Error [${table}]:`, err);
        return [];
      }
    }

    try {
      let query = supabase.from(tableName).select('*');
      
      if (filters) {
        filters.forEach(f => {
          const col = f.column.toLowerCase();
          const op = f.operator || 'eq';
          if (op === 'eq') query = query.eq(col, f.value);
          else if (op === 'neq') query = query.neq(col, f.value);
          else if (op === 'gte') query = query.gte(col, f.value);
          else if (op === 'lte') query = query.lte(col, f.value);
          else if (op === 'contains') query = query.contains(col, f.value);
          else if (op === 'like') query = query.ilike(col, f.value);
        });
      }

      if (order) query = query.order(order.column.toLowerCase(), { ascending: order.ascending ?? false });
      if (limitValue) query = query.limit(limitValue);

      const { data, error } = await query;
      if (error) throw error;

      const finalResults = this.desanitize(data || []);
      this.listCache[cacheKey] = { data: finalResults, timestamp: Date.now() };
      return finalResults;
    } catch (err: any) {
      if (retries > 0) {
        await new Promise(r => setTimeout(r, 500));
        return this.list(table, filters, limitValue, order, retries - 1);
      }
      console.error(`Database List Error [${table}]:`, err);
      return [];
    }
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

    // Try Supabase Wipe
    if (isConfigured) {
      try {
        for (const table of tables) {
          if (table === 'users') {
            await realSupabase.from('users').delete().neq('id', keepAdminId);
          } else if (['attendance', 'paydays', 'salary_history'].includes(table)) {
            await realSupabase.from(table).delete().gte('id', 0);
          } else {
            await realSupabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
          }
        }
      } catch (err) {
        console.warn("Supabase wipe limited by RLS/Permissions.", err);
      }
    }
  }

  static async getOne(table: string, id: string, retries = 3): Promise<any | null> {
    const tableName = table.toLowerCase();
    if (this.missingTables.has(tableName)) return null;

    // CockroachDB Bridge
    if (tableName !== 'users') {
      try {
        const response = await fetch('/api/db/' + tableName + '/select', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            filters: [{ column: 'id', value: id }],
            limit: 1
          })
        });
        const result = await response.json();
        if (result.error) throw new Error(result.error);
        
        const data = result.data?.[0];
        return data ? this.desanitize(data) : null;
      } catch (err) {
        console.error(`CockroachDB GetOne Error [${table}/${id}]:`, err);
        return null;
      }
    }

    // Try Supabase directly for users
    if (isConfigured) {
      try {
        const { data, error } = await realSupabase
          .from(tableName)
          .select('*')
          .eq('id', id)
          .single();
        
        if (error) {
          if (error.code === 'PGRST116') {
             return null;
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

    return null;
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
      const payload = { ...data };
      const identityTables = ['attendance', 'paydays', 'salary_history'];
      
      if (identityTables.includes(tableName)) {
        if (!payload.id || typeof payload.id === 'string') {
          payload.id = Date.now() + Math.floor(Math.random() * 1000);
        }
      } else if (!payload.id) {
        payload.id = Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
      }
      
      if (tableName === 'attendance') {
        payload.status = payload.status || 'PRESENT';
      }
      
      const sanitized = this.sanitize(payload);
      
      // CockroachDB Bridge
      if (tableName !== 'users') {
        try {
          const response = await fetch('/api/db/' + tableName + '/upsert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: sanitized })
          });
          
          if (!response.ok) {
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
              const errData = await response.json();
              throw new Error(errData.error || `Server error ${response.status}`);
            } else {
              throw new Error(`Server returned non-JSON response (${response.status} ${response.statusText})`);
            }
          }

          const result = await response.json();
          if (result.error) throw new Error(result.error);
          
          const cloudData = this.desanitize(result.data);
          
          // Clear column and list cache for this table on successful interaction
          if (this.columnCache[tableName]) this.columnCache[tableName].clear();
          Object.keys(this.listCache).forEach(key => {
            if (key.startsWith(`list_${tableName}_`)) delete this.listCache[key];
          });
          
          return cloudData;
        } catch (err: any) {
          console.error(`CockroachDB Create Error [${table}]:`, err);
          throw err;
        }
      }
      
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
      const sanitized = this.sanitize(data);
      // NEVER update the ID column حتى if it's in the data object
      delete sanitized.id;

      // CockroachDB Bridge
      if (tableName !== 'users') {
        try {
          const response = await fetch('/api/db/' + tableName + '/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              data: sanitized,
              filters: [{ column: 'id', value: id }]
            })
          });
          
          if (!response.ok) {
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
              const errData = await response.json();
              throw new Error(errData.error || `Server error ${response.status}`);
            } else {
              throw new Error(`Server returned non-JSON response (${response.status} ${response.statusText})`);
            }
          }

          const result = await response.json();
          if (result.error) throw new Error(result.error);
          
          window.dispatchEvent(new Event(`local_db_update_${tableName}`));
          return;
        } catch (err) {
          console.error(`CockroachDB Update Error [${table}]:`, err);
          throw err;
        }
      }

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

      // Notify others via broadcast if it's a mirrored/cockroach table
      if (tableName !== 'users' && isConfigured) {
        this.sendBroadcast(`table_update_${tableName}`, 'UPDATE', { table: tableName, id });
      }
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
      const payload = { ...data, id };
      const sanitized = this.sanitize(payload);

      // CockroachDB Bridge
      if (tableName !== 'users') {
        try {
          const response = await fetch('/api/db/' + tableName + '/upsert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: sanitized })
          });
          
          if (!response.ok) {
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
              const errData = await response.json();
              throw new Error(errData.error || `Server error ${response.status}`);
            } else {
              throw new Error(`Server returned non-JSON response (${response.status} ${response.statusText})`);
            }
          }

          const result = await response.json();
          if (result.error) throw new Error(result.error);
          
          window.dispatchEvent(new Event(`local_db_update_${tableName}`));
          return;
        } catch (err) {
          console.error(`CockroachDB Upsert Error [${table}]:`, err);
          throw err;
        }
      }

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

      // Notify others via broadcast if it's a mirrored/cockroach table
      if (tableName !== 'users' && isConfigured) {
        this.sendBroadcast(`table_update_${tableName}`, 'UPSERT', { table: tableName, id });
      }
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
      // CockroachDB Bridge
      if (tableName !== 'users') {
        try {
          const response = await fetch('/api/db/' + tableName + '/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filters: [{ column: 'id', value: id }] })
          });
          
          if (!response.ok) {
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
              const errData = await response.json();
              throw new Error(errData.error || `Server error ${response.status}`);
            } else {
              throw new Error(`Server returned non-JSON response (${response.status} ${response.statusText})`);
            }
          }

          const result = await response.json();
          if (result.error) throw new Error(result.error);
          
          window.dispatchEvent(new Event(`local_db_update_${tableName}`));
          return;
        } catch (err) {
          console.error(`CockroachDB Delete Error [${table}]:`, err);
          throw err;
        }
      }

      const { error } = await supabase
        .from(tableName)
        .delete()
        .eq('id', id);

      // Notify others via broadcast if it's a mirrored/cockroach table
      if (tableName !== 'users' && isConfigured) {
        this.sendBroadcast(`table_update_${tableName}`, 'DELETE', { table: tableName, id });
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
      // CockroachDB Bridge
      if (tableName !== 'users') {
        try {
          const response = await fetch('/api/db/' + tableName + '/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filters })
          });
          
          if (!response.ok) {
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
              const errData = await response.json();
              throw new Error(errData.error || `Server error ${response.status}`);
            } else {
              throw new Error(`Server returned non-JSON response (${response.status} ${response.statusText})`);
            }
          }

          const result = await response.json();
          if (result.error) throw new Error(result.error);
          
          window.dispatchEvent(new Event(`local_db_update_${tableName}`));
          return;
        } catch (err) {
          console.error(`CockroachDB DeleteWhere Error [${table}]:`, err);
          throw err;
        }
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

      // Notify others via broadcast if it's a mirrored/cockroach table
      if (tableName !== 'users' && isConfigured) {
        this.sendBroadcast(`table_update_${tableName}`, 'DELETE_WHERE', { table: tableName });
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
    
    // Smarter handler with cooldown to prevent rapid UI flashing & lag
    const handler = () => {
      const now = Date.now();
      const lastCall = this.subCooldowns[tableName] || 0;
      if (now - lastCall < 150) return; // 150ms throttle (faster response than 300ms)
      this.subCooldowns[tableName] = now;
      
      this.list(table).then(callback).catch(e => {
        // Only log if it's not a temporary error
        if (!String(e).includes('rate limit')) {
           console.error(`Subscription fetch error [${table}]:`, e);
        }
      });
    };

      const unsubSocket = socketService.on(`table_update_${tableName}`, handler);

      let subChannel: any = null;
      if (tableName === 'users' && isConfigured) {
        const channel = realSupabase.channel(`pub:users_realtime`);
        subChannel = channel.on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, handler).subscribe();
      }

      return {
        unsubscribe: () => {
          unsubSocket();
          if (subChannel) realSupabase.removeChannel(subChannel);
        }
      };
  }

  private static broadcastChannels: Map<string, any> = new Map();

  /**
   * Broadcasts ephemeral data to a channel
   */
  static async sendBroadcast(channelName: string, event: string, payload: any) {
    if (!isConfigured) return;
    
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
    if (!isConfigured) return { unsubscribe: () => {} };
    
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
    if (!isConfigured) return null;
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
    if (!isConfigured) return null;
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

  static async syncPendingRecords() {
    // Disabled as per user request to always use direct DB
    return;
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
