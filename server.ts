import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import pg from "pg";
const { Pool } = pg;
import { format, startOfMonth } from "date-fns";
import { createServer } from "http";
import { Server } from "socket.io";

// CockroachDB connection pool
let pool: any = null;

const getPool = () => {
  if (!pool) {
    const url = process.env.COCKROACH_URL;
    if (!url || url === 'base' || url.includes('placeholder') || url.includes('@base:')) {
      return null;
    }
    
    pool = new Pool({
      connectionString: url,
      ssl: {
        rejectUnauthorized: false
      }
    });
  }
  return pool;
};

// Initialize CockroachDB tables if they don't exist
const initDb = async () => {
  const currentPool = getPool();
  if (!currentPool) {
    console.warn("COCKROACH_URL missing or invalid (placeholder detected). Skipping DB initialization.");
    return;
  }
  
  let client;
  try {
    client = await currentPool.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS attendance (
        id TEXT PRIMARY KEY,
        userid TEXT NOT NULL,
        username TEXT,
        date TEXT,
        status TEXT,
        checkintime TEXT,
        checkouttime TEXT,
        hoursworked DECIMAL,
        shipments INTEGER,
        distancedriven DECIMAL,
        odometerstart INTEGER,
        odometerend INTEGER,
        checkinphoto TEXT,
        checkoutphoto TEXT,
        customerphoto TEXT,
        notes TEXT,
        timestamp TEXT
      );

      CREATE TABLE IF NOT EXISTS mismatches (
        id TEXT PRIMARY KEY,
        userid TEXT,
        username TEXT,
        employeename TEXT,
        date TEXT,
        barcodes JSONB,
        customervalue DECIMAL,
        erpvalue DECIMAL,
        valuedifference DECIMAL,
        reason TEXT,
        customerphoto TEXT,
        erpphoto TEXT,
        status TEXT,
        timestamp TEXT
      );

      CREATE TABLE IF NOT EXISTS ad_hoc_jobs (
        id TEXT PRIMARY KEY,
        userid TEXT,
        username TEXT,
        employeename TEXT,
        date TEXT,
        jobtitle TEXT,
        vehicletype TEXT,
        starttime TEXT,
        endtime TEXT,
        value DECIMAL,
        totalhours DECIMAL,
        status TEXT,
        timestamp TEXT
      );

      CREATE TABLE IF NOT EXISTS cash_reports (
        id TEXT PRIMARY KEY,
        userid TEXT,
        username TEXT,
        employeename TEXT,
        date TEXT,
        totalamount DECIMAL,
        totalnotes INTEGER,
        onlinecash DECIMAL,
        valuemismatch DECIMAL,
        denominations JSONB,
        status TEXT,
        timestamp TEXT
      );
      
      ALTER TABLE ad_hoc_jobs ADD COLUMN IF NOT EXISTS vehicletype TEXT;
      ALTER TABLE ad_hoc_jobs ADD COLUMN IF NOT EXISTS starttime TEXT;
      ALTER TABLE ad_hoc_jobs ADD COLUMN IF NOT EXISTS endtime TEXT;
      ALTER TABLE ad_hoc_jobs ADD COLUMN IF NOT EXISTS employeename TEXT;
      ALTER TABLE mismatches ADD COLUMN IF NOT EXISTS employeename TEXT;
      ALTER TABLE mismatches ADD COLUMN IF NOT EXISTS barcodes JSONB;
      ALTER TABLE mismatches ADD COLUMN IF NOT EXISTS customervalue DECIMAL;
      ALTER TABLE mismatches ADD COLUMN IF NOT EXISTS erpvalue DECIMAL;
      ALTER TABLE cash_reports ADD COLUMN IF NOT EXISTS employeename TEXT;

      CREATE TABLE IF NOT EXISTS salary_history (
        id TEXT PRIMARY KEY,
        userid TEXT,
        username TEXT,
        month TEXT,
        basesalary DECIMAL,
        shipmentearnings DECIMAL,
        totalearnings DECIMAL,
        totalhours DECIMAL,
        totalshipments INTEGER,
        totalmileage DECIMAL,
        dayspresent INTEGER,
        calculatedat TEXT,
        status TEXT
      );

      CREATE TABLE IF NOT EXISTS paydays (
        id TEXT PRIMARY KEY,
        date TEXT,
        month TEXT,
        description TEXT
      );

      CREATE TABLE IF NOT EXISTS live_locations (
        id TEXT PRIMARY KEY,
        userid TEXT,
        username TEXT,
        latitude DECIMAL,
        longitude DECIMAL,
        battery INTEGER,
        speed DECIMAL,
        lastseen TEXT
      );

      CREATE TABLE IF NOT EXISTS location_logs (
        id TEXT PRIMARY KEY,
        userid TEXT,
        username TEXT,
        latitude DECIMAL,
        longitude DECIMAL,
        timestamp TEXT
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        userid TEXT,
        action TEXT,
        details TEXT,
        timestamp TEXT
      );
    `);
    console.log("CockroachDB tables initialized successfully.");
  } catch (err) {
    console.error("Failed to initialize CockroachDB:", err);
    console.warn("Continuing server startup without database connectivity. Some features may be degraded.");
  } finally {
    if (client) client.release();
  }
};

initDb();

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);
    socket.on("disconnect", () => console.log("Client disconnected:", socket.id));
  });

  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // Request logging for debugging
  app.use((req, res, next) => {
    if (req.url.startsWith('/api')) {
      console.log(`${new Date().toISOString()} [API] ${req.method} ${req.url}`);
    }
    next();
  });

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", db: !!getPool() });
  });

  // System status for Admin (Automatic Indicator logic)
  app.get("/api/admin/system-status", async (req, res) => {
    const today = new Date();
    const day = today.getDate();
    const isPurgeDay = day === 15 || day === 1;
    
    let stats = { attendance: 0, mismatches: 0, adHoc: 0 };
    let dbUsage = { sizeFormatted: "0 B", sizeBytes: 0, limitBytes: 1024 * 1024 * 1024 * 5 }; // Default 5GB limit for free tier
    
    const currentPool = getPool();
    if (currentPool) {
      const client = await currentPool.connect();
      try {
        const att = await client.query("SELECT COUNT(*) FROM attendance");
        const mis = await client.query("SELECT COUNT(*) FROM mismatches");
        const adhoc = await client.query("SELECT COUNT(*) FROM ad_hoc_jobs");
        
        // Try to get database size - only works if permissions allow
        try {
           const sizeRes = await client.query("SELECT pg_database_size(current_database()) as size");
           const bytes = parseInt(sizeRes.rows[0].size);
           dbUsage.sizeBytes = bytes;
           
           if (bytes < 1024) dbUsage.sizeFormatted = bytes + " B";
           else if (bytes < 1024 * 1024) dbUsage.sizeFormatted = (bytes / 1024).toFixed(2) + " KB";
           else if (bytes < 1024 * 1024 * 1024) dbUsage.sizeFormatted = (bytes / (1024 * 1024)).toFixed(2) + " MB";
           else dbUsage.sizeFormatted = (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
        } catch (e) {
           console.warn("Could not retrieve DB size via pg_database_size. Using fallback estimate.");
           // Estimate size based on row counts (very rough)
           const estimated = (parseInt(att.rows[0].count) + parseInt(mis.rows[0].count) + parseInt(adhoc.rows[0].count)) * 1024 * 5; // 5KB per record avg
           dbUsage.sizeBytes = estimated;
           dbUsage.sizeFormatted = "~" + (estimated / (1024 * 1024)).toFixed(2) + " MB";
        }

        stats = {
          attendance: parseInt(att.rows[0].count),
          mismatches: parseInt(mis.rows[0].count),
          adHoc: parseInt(adhoc.rows[0].count)
        };
      } finally {
        client.release();
      }
    }

    res.json({
      day,
      isPurgeDay,
      stats,
      dbUsage,
      message: isPurgeDay ? "Data download and purge required today." : "System operational."
    });
  });

  // Atomic Purge Endpoint
  app.post("/api/admin/purge-data", async (req, res) => {
    const currentPool = getPool();
    if (!currentPool) return res.status(503).json({ error: "DB offline" });
    
    const client = await currentPool.connect();
    try {
      await client.query("BEGIN");
      // Purge all records from operational tables
      // The user wants a clean slate after download
      await client.query("DELETE FROM attendance");
      await client.query("DELETE FROM mismatches");
      await client.query("DELETE FROM ad_hoc_jobs");
      await client.query("DELETE FROM location_logs");
      await client.query("DELETE FROM audit_logs");
      // We keep users and salary history (salary history acts as the ARCHIVE)
      await client.query("COMMIT");
      res.json({ success: true, message: "Database purged successfully." });
    } catch (err: any) {
      await client.query("ROLLBACK");
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  });

  // CockroachDB Generic Bridge
  app.post("/api/db/:table/:action", async (req, res) => {
    const { table: rawTable, action } = req.params;
    const table = rawTable.toLowerCase();
    const { filters, data, limit, orderBy } = req.body;

    // Helper to normalize keys to lowercase to match DB schema
    const normalizeObj = (obj: any) => {
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
      return Object.keys(obj).reduce((acc: any, key) => {
        acc[key.toLowerCase()] = obj[key];
        return acc;
      }, {});
    };

    const nData = normalizeObj(data);
    const nFilters = Array.isArray(filters) ? filters.map((f: any) => ({ ...f, column: f.column?.toLowerCase() })) : filters;
    const nOrderBy = orderBy ? { ...orderBy, column: orderBy.column?.toLowerCase() } : orderBy;

    const currentPool = getPool();
    if (!currentPool) {
      console.warn(`[Bridge] Database requested but not configured: ${table}/${action}`);
      return res.status(503).json({ error: "Database not configured" });
    }

    try {
      const client = await currentPool.connect();
      try {
        let query = "";
        let values: any[] = [];
        
        // Helper to stringify JSON for jsonb columns if needed by the driver
        const processedNData = { ...nData };
        const jsonColumns = ['barcodes', 'denominations', 'attendance_history']; // List known jsonb columns
        Object.keys(processedNData).forEach(key => {
          const lowerKey = key.toLowerCase();
          if (jsonColumns.includes(lowerKey) && typeof processedNData[key] === 'object' && processedNData[key] !== null) {
            processedNData[key] = JSON.stringify(processedNData[key]);
          }
        });

        if (action === "select") {
          query = `SELECT * FROM "${table}"`;
          if (nFilters && nFilters.length > 0) {
            query += " WHERE " + nFilters.map((f: any) => {
               const op = f.operator === 'eq' || !f.operator ? '=' : 
                          f.operator === 'neq' ? '!=' :
                          f.operator === 'gte' ? '>=' :
                          f.operator === 'lte' ? '<=' :
                          f.operator === 'like' ? 'ILIKE' : '=';
               values.push(f.value);
               return `"${f.column}" ${op} $${values.length}`;
            }).join(" AND ");
          }
          if (nOrderBy && nOrderBy.column) {
            query += ` ORDER BY "${nOrderBy.column}" ${nOrderBy.ascending ? 'ASC' : 'DESC'}`;
          } else if (table.toLowerCase().includes('logs') || table.toLowerCase().includes('location')) {
             query += ` ORDER BY "id" DESC`;
          }
          if (limit) {
            query += ` LIMIT ${limit}`;
          }
        } 
        else if (action === "insert" || action === "create" || action === "upsert") {
          const columns = Object.keys(processedNData);
          if (columns.length === 0) throw new Error("No data provided for write action");
          
          values = Object.values(processedNData);
          const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
          const setClause = columns
            .filter(c => c !== 'id')
            .map(c => `"${c}" = EXCLUDED."${c}"`)
            .join(", ");
          
          query = `INSERT INTO "${table}" (${columns.map(c => `"${c}"`).join(", ")}) 
                   VALUES (${placeholders}) 
                   ON CONFLICT (id) DO UPDATE SET ${setClause || '"id" = EXCLUDED."id"'} 
                   RETURNING *`;
        }
        else if (action === "update") {
          const columns = Object.keys(processedNData).filter(c => c !== 'id');
          if (columns.length === 0) throw new Error("No data provided for update action");
          
          values = columns.map(c => processedNData[c]);
          query = `UPDATE "${table}" SET ${columns.map((c, i) => `"${c}" = $${i + 1}`).join(", ")}`;
          
          if (nFilters && nFilters.length > 0) {
            query += " WHERE " + nFilters.map((f: any) => {
              values.push(f.value);
              const op = f.operator === 'neq' ? '!=' : (f.operator === 'gte' ? '>=' : (f.operator === 'lte' ? '<=' : '='));
              return `"${f.column}" ${op} $${values.length}`;
            }).join(" AND ");
          } else if (nData.id) {
             values.push(nData.id);
             query += ` WHERE "id" = $${values.length}`;
          } else {
             throw new Error("Update operation requires filters or an ID");
          }
          query += " RETURNING *";
        }
        else if (action === "delete") {
          query = `DELETE FROM "${table}"`;
          if (nFilters && nFilters.length > 0) {
             query += " WHERE " + nFilters.map((f: any) => {
               values.push(f.value);
               return `"${f.column}" = $${values.length}`;
             }).join(" AND ");
          } else {
             throw new Error("Delete operation requires filters to prevent accidental full table wipe");
          }
          query += " RETURNING *";
        } else {
          throw new Error(`Unsupported action: ${action}`);
        }

        const result = await client.query(query, values);
        const responseData = (action === 'select') ? result.rows : (result.rows[0] || null);
        
        // Broadcast updates
        if (action !== "select") {
          io.emit("db_change", { table, action, data: responseData });
          io.emit(`table_update_${table}`, { action, table, timestamp: new Date().toISOString() });
          if (table === "attendance") io.emit("attendance_update", responseData);
        }

        res.json({ data: responseData, error: null });
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.error(`[Bridge Error] ${action} on ${table} failed:`, err);
      return res.status(500).json({ 
        error: err.message || "Unknown database error",
        details: String(err)
      });
    }
  });

  // API 404 Handler (Prevents falling through to Vite for broken API calls)
  app.use("/api/*", (req, res) => {
    res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
  });

  // Automated Salary Calculation (Updated for CockroachDB)
  app.post("/api/calculate-salaries", async (req, res) => {
    const { month } = req.body; // YYYY-MM
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: "Invalid month format. Expected YYYY-MM." });
    }

    try {
      const supabaseUrl = process.env.VITE_SUPABASE_URL;
      const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
      
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl!, supabaseKey!);

      // Fetch employees from Supabase
      const { data: employees, error: empErr } = await supabase.from('users').select('*').eq('role', 'EMPLOYEE');
      if (empErr) throw empErr;

      // Fetch attendance and ad-hoc from CockroachDB
      const currentPool = getPool();
      if (!currentPool) throw new Error("Database offline");
      const client = await currentPool.connect();
      try {
        const attRes = await client.query("SELECT * FROM attendance WHERE date >= $1 AND date <= $2", [`${month}-01`, `${month}-31`]);
        const adHocRes = await client.query("SELECT * FROM ad_hoc_jobs WHERE date >= $1 AND date <= $2 AND status = 'APPROVED'", [`${month}-01`, `${month}-31`]);

        const salaryRecords = [];
        for (const emp of employees || []) {
          const empAttendance = attRes.rows.filter(a => a.userid === emp.id && a.status !== 'FRAUDULENT');
          const empAdHoc = adHocRes.rows.filter(j => j.userid === emp.id);
          
          let baseSalary = 0, shipmentEarnings = 0, adHocEarnings = 0, totalHours = 0, totalShipments = 0, totalMileage = 0;
          
          empAttendance.forEach(a => {
            if (emp.paymentbase === 'DAILY_FIXED' || emp.paymentbase === 'DRIVER') baseSalary += (Number(emp.rate) || 0);
            else if (emp.paymentbase === 'PER_SHIPMENT') shipmentEarnings += (Number(a.shipments) || 0) * (Number(emp.rate) || 0);
            totalHours += Number(a.hoursworked) || 0;
            totalShipments += Number(a.shipments) || 0;
            totalMileage += Number(a.distancedriven) || 0;
          });

          empAdHoc.forEach(j => {
            adHocEarnings += Number(j.value) || 0;
            totalHours += Number(j.totalhours) || 0;
          });

          salaryRecords.push({
            id: `${emp.id}_${month}`,
            userid: emp.id,
            username: emp.name,
            month,
            basesalary: baseSalary,
            shipmentearnings: shipmentEarnings + adHocEarnings,
            totalearnings: baseSalary + shipmentEarnings + adHocEarnings,
            totalhours: totalHours,
            totalshipments: totalShipments,
            totalmileage: totalMileage,
            dayspresent: empAttendance.length,
            calculatedat: new Date().toISOString(),
            status: 'PENDING'
          });
        }

        // Upsert to CockroachDB
        for (const record of salaryRecords) {
          const cols = Object.keys(record);
          const vals = Object.values(record);
          await client.query(`
            INSERT INTO salary_history (${cols.join(", ")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")})
            ON CONFLICT (id) DO UPDATE SET ${cols.map(c => `${c} = EXCLUDED.${c}`).join(", ")}
          `, vals);
        }

        res.json({ success: true, count: salaryRecords.length });
      } finally {
        client.release();
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Vite/Static serving
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), 'dist')));
    app.get('*', (req, res) => res.sendFile(path.join(process.cwd(), 'dist/index.html')));
  }

  // Automated photo cleanup: Delete photos from previous months on the 10th
  const cleanupOldPhotos = async () => {
    const currentPool = getPool();
    if (!currentPool) return;
    
    const today = new Date();
    // Only run if today is the 10th (or after 10th to be safe if server just started)
    if (today.getDate() >= 10) {
      console.log("Running scheduled photo cleanup...");
      let client;
      try {
        client = await currentPool.connect();
        // Find records from BEFORE this month
        const thisMonthStart = format(startOfMonth(today), 'yyyy-MM-dd');
        
        // We set photo columns to null to save space, but keep the record
        // The user said "সব ফটো পার্মানেন্ট ভাবে ডিলেট হয়ে যাবে"
        await client.query(`
          UPDATE attendance SET checkinphoto = NULL, checkoutphoto = NULL, customerphoto = NULL 
          WHERE date < $1
        `, [thisMonthStart]);

        await client.query(`
          UPDATE mismatches SET customerphoto = NULL, erpphoto = NULL 
          WHERE date < $1
        `, [thisMonthStart]);

        console.log("Old photos cleared successfully.");
      } catch (err) {
        console.error("Cleanup failed:", err);
      } finally {
        if (client) client.release();
      }
    }
  };

  // Run cleanup once on start
  cleanupOldPhotos();
  // And every 24 hours
  setInterval(cleanupOldPhotos, 24 * 60 * 60 * 1000);

  httpServer.listen(PORT, "0.0.0.0", () => console.log(`Server running on port ${PORT}`));
}

startServer();
