import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Automated Salary Calculation
  app.post("/api/calculate-salaries", async (req, res) => {
    const { month } = req.body; // YYYY-MM

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: "Invalid month format. Expected YYYY-MM." });
    }

    try {
      console.log(`Calculating salaries for ${month}...`);
      
      const supabaseUrl = process.env.VITE_SUPABASE_URL;
      const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
      
      if (!supabaseUrl || !supabaseKey) {
        throw new Error("Supabase environment variables missing");
      }

      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseKey);

      // 1. Fetch all employees
      const { data: employees, error: empErr } = await supabase
        .from('users')
        .select('*')
        .eq('role', 'EMPLOYEE');

      if (empErr) throw empErr;
      if (!employees || employees.length === 0) {
        return res.json({ success: true, count: 0, message: "No employees found." });
      }

      // 2. Fetch all attendance for the month
      const { data: allAttendance, error: attErr } = await supabase
        .from('attendance')
        .select('*')
        .gte('date', `${month}-01`)
        .lte('date', `${month}-31`);
      
      if (attErr) throw attErr;

      // 2.5 Fetch all approved ad-hoc jobs for the month
      const { data: allAdHoc, error: adHocErr } = await supabase
        .from('ad_hoc_jobs')
        .select('*')
        .eq('status', 'APPROVED')
        .gte('date', `${month}-01`)
        .lte('date', `${month}-31`);
      
      if (adHocErr) throw adHocErr;

      const salaryRecords: any[] = [];
      let count = 0;

      for (const emp of employees) {
        const empAttendance = (allAttendance || []).filter(a => a.userid === emp.id && a.status !== 'FRAUDULENT');
        const empAdHoc = (allAdHoc || []).filter(j => j.userid === emp.id);
        
        let baseSalary = 0;
        let shipmentEarnings = 0;
        let adHocEarnings = 0;
        let totalHours = 0;
        let totalShipments = 0;
        let totalMileage = 0;
        let daysPresent = empAttendance.length;

        empAttendance.forEach(record => {
          if (emp.paymentbase === 'DAILY_FIXED' || emp.paymentbase === 'DRIVER') {
            baseSalary += (emp.rate || 0);
          } else if (emp.paymentbase === 'PER_SHIPMENT') {
            shipmentEarnings += (record.shipments || 0) * (emp.rate || 0);
          }
          totalHours += (record.hoursworked || 0);
          totalShipments += (record.shipments || 0);
          totalMileage += (record.distancedriven || 0);
        });

        empAdHoc.forEach(job => {
           adHocEarnings += (job.value || 0);
           totalHours += (job.totalhours || 0);
        });

        const totalEarnings = baseSalary + shipmentEarnings + adHocEarnings;
        const salaryId = `${emp.id}_${month}`;
        
        salaryRecords.push({
          id: salaryId,
          userid: emp.id,
          username: emp.name,
          month,
          basesalary: baseSalary,
          shipmentearnings: shipmentEarnings + adHocEarnings, // Combine for now
          totalearnings: totalEarnings,
          totalhours: totalHours,
          totalshipments: totalShipments,
          totalmileage: totalMileage,
          dayspresent: daysPresent,
          calculatedat: new Date().toISOString(),
          status: 'PENDING'
        });
        count++;
      }

      // 3. Save to Supabase
      if (salaryRecords.length > 0) {
        const { error: upsertErr } = await supabase
          .from('salary_history')
          .upsert(salaryRecords, { onConflict: 'id' });
        
        if (upsertErr) throw upsertErr;
      }

      console.log(`Successfully calculated salaries for ${count} employees.`);
      res.json({ success: true, count });
    } catch (error: any) {
      console.error("Salary calculation error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
