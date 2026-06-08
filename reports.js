/**
 * Report definitions — shared between report-generator.js (CLI) and server.js (web UI).
 * Each report: id, title, description, columns[], sql(db, filters).
 */

const REPORTS = [

  // 1 -------------------------------------------------------------------------
  {
    id: 1,
    title: 'Open Work Orders by Status',
    description: 'All open service orders grouped by status and priority, with customer and assigned technician.',
    columns: ['WO Number','Customer','Address','Status','Priority','Service Type','Assigned Tech','Scheduled Date','Days Open','Est. Revenue'],
    sql: (db, f) => `
      SELECT TOP 500
        wo.WorkOrderNo        AS [WO Number],
        c.CustomerName        AS [Customer],
        c.Address             AS [Address],
        wo.Status             AS [Status],
        wo.Priority           AS [Priority],
        wo.ServiceType        AS [Service Type],
        ISNULL(e.FullName,'Unassigned') AS [Assigned Tech],
        CONVERT(varchar,wo.ScheduledDate,101) AS [Scheduled Date],
        DATEDIFF(day, wo.CreatedDate, GETDATE()) AS [Days Open],
        ISNULL(wo.EstimatedRevenue, 0) AS [Est. Revenue]
      FROM   [${db}]..WorkOrder wo
      JOIN   [${db}]..Customer  c  ON c.CustomerID  = wo.CustomerID
      LEFT JOIN [${db}]..Employee e ON e.EmployeeID = wo.TechnicianID
      WHERE  wo.Status NOT IN ('Closed','Cancelled','Invoiced')
        ${f.company('c')}
        ${f.customer('c')}
        ${f.dates('wo', 'ScheduledDate')}
      ORDER BY wo.Priority DESC, wo.ScheduledDate ASC
    `,
  },

  // 2 -------------------------------------------------------------------------
  {
    id: 2,
    title: 'Accounts Receivable Aging',
    description: 'Outstanding invoices bucketed into Current, 1-30, 31-60, 61-90, and 90+ day aging columns.',
    columns: ['Customer','Invoice #','Invoice Date','Due Date','Total','Current','1-30 Days','31-60 Days','61-90 Days','90+ Days'],
    sql: (db, f) => `
      SELECT TOP 500
        c.CustomerName   AS [Customer],
        i.InvoiceNo      AS [Invoice #],
        CONVERT(varchar, i.InvoiceDate, 101)  AS [Invoice Date],
        CONVERT(varchar, i.DueDate,     101)  AS [Due Date],
        i.InvoiceTotal   AS [Total],
        CASE WHEN DATEDIFF(day,i.DueDate,GETDATE()) <= 0   THEN i.Balance ELSE 0 END AS [Current],
        CASE WHEN DATEDIFF(day,i.DueDate,GETDATE()) BETWEEN  1 AND 30 THEN i.Balance ELSE 0 END AS [1-30 Days],
        CASE WHEN DATEDIFF(day,i.DueDate,GETDATE()) BETWEEN 31 AND 60 THEN i.Balance ELSE 0 END AS [31-60 Days],
        CASE WHEN DATEDIFF(day,i.DueDate,GETDATE()) BETWEEN 61 AND 90 THEN i.Balance ELSE 0 END AS [61-90 Days],
        CASE WHEN DATEDIFF(day,i.DueDate,GETDATE()) > 90              THEN i.Balance ELSE 0 END AS [90+ Days]
      FROM   [${db}]..Invoice  i
      JOIN   [${db}]..Customer c ON c.CustomerID = i.CustomerID
      WHERE  i.Balance > 0
        ${f.company('c')}
        ${f.customer('c')}
        ${f.dates('i', 'InvoiceDate')}
      ORDER BY DATEDIFF(day,i.DueDate,GETDATE()) DESC
    `,
  },

  // 3 -------------------------------------------------------------------------
  {
    id: 3,
    title: 'Service Contract Renewal Pipeline',
    description: 'Active service contracts expiring within the selected date range (default: next 90 days).',
    columns: ['Customer','Contract #','Contract Type','Equipment Covered','Start Date','Expiry Date','Days Until Expiry','Annual Value','Auto-Renew'],
    sql: (db, f) => `
      SELECT TOP 500
        c.CustomerName      AS [Customer],
        sc.ContractNo       AS [Contract #],
        sc.ContractType     AS [Contract Type],
        ISNULL(sc.EquipmentDescription,'Multiple') AS [Equipment Covered],
        CONVERT(varchar,sc.StartDate,  101) AS [Start Date],
        CONVERT(varchar,sc.ExpiryDate, 101) AS [Expiry Date],
        DATEDIFF(day,GETDATE(),sc.ExpiryDate) AS [Days Until Expiry],
        sc.AnnualValue      AS [Annual Value],
        CASE sc.AutoRenew WHEN 1 THEN 'Yes' ELSE 'No' END AS [Auto-Renew]
      FROM   [${db}]..ServiceContract sc
      JOIN   [${db}]..Customer         c ON c.CustomerID = sc.CustomerID
      WHERE  sc.Status = 'Active'
        ${f.company('c')}
        ${f.customer('c')}
        ${f.datesOrDefault('sc', 'ExpiryDate',
            'sc.ExpiryDate >= GETDATE()',
            'sc.ExpiryDate <= DATEADD(day,90,GETDATE())')}
      ORDER BY sc.ExpiryDate ASC
    `,
  },

  // 4 -------------------------------------------------------------------------
  {
    id: 4,
    title: 'Equipment Service History',
    description: 'Full service history per equipment unit — great for warranty tracking and failure patterns.',
    columns: ['Customer','Equipment ID','Equipment Type','Make / Model','Serial #','Install Date','Service Date','WO Number','Service Type','Tech','Labour Hrs','Parts Cost','Total Cost'],
    sql: (db, f) => `
      SELECT TOP 500
        c.CustomerName   AS [Customer],
        eq.EquipmentID   AS [Equipment ID],
        eq.EquipmentType AS [Equipment Type],
        CONCAT(eq.Make,' ',eq.Model) AS [Make / Model],
        eq.SerialNo      AS [Serial #],
        CONVERT(varchar,eq.InstallDate,101)   AS [Install Date],
        CONVERT(varchar,wo.CompletedDate,101) AS [Service Date],
        wo.WorkOrderNo   AS [WO Number],
        wo.ServiceType   AS [Service Type],
        e.FullName       AS [Tech],
        wol.LabourHours  AS [Labour Hrs],
        wol.PartsCost    AS [Parts Cost],
        wol.TotalCost    AS [Total Cost]
      FROM   [${db}]..Equipment   eq
      JOIN   [${db}]..Customer     c   ON c.CustomerID   = eq.CustomerID
      JOIN   [${db}]..WorkOrder    wo  ON wo.EquipmentID  = eq.EquipmentID
      LEFT JOIN [${db}]..Employee   e  ON e.EmployeeID   = wo.TechnicianID
      LEFT JOIN [${db}]..WorkOrderLabour wol ON wol.WorkOrderID = wo.WorkOrderID
      WHERE  wo.Status IN ('Closed','Invoiced')
        ${f.company('c')}
        ${f.customer('c')}
        ${f.dates('wo', 'CompletedDate')}
      ORDER BY eq.EquipmentID, wo.CompletedDate DESC
    `,
  },

  // 5 -------------------------------------------------------------------------
  {
    id: 5,
    title: 'Technician Productivity Report',
    description: 'Work orders completed, billable hours, and revenue per technician. Default: current month.',
    columns: ['Technician','Trade','WOs Completed','Billable Hrs','Avg Hrs/WO','Labour Revenue','Parts Revenue','Total Revenue','Callback Rate %'],
    sql: (db, f) => `
      SELECT
        e.FullName        AS [Technician],
        e.Trade           AS [Trade],
        COUNT(wo.WorkOrderID)         AS [WOs Completed],
        SUM(wol.BillableHours)        AS [Billable Hrs],
        AVG(wol.BillableHours)        AS [Avg Hrs/WO],
        SUM(wol.LabourRevenue)        AS [Labour Revenue],
        SUM(wol.PartsRevenue)         AS [Parts Revenue],
        SUM(wol.TotalRevenue)         AS [Total Revenue],
        CAST(
          100.0 * SUM(CASE WHEN wo.IsCallback = 1 THEN 1 ELSE 0 END)
          / NULLIF(COUNT(wo.WorkOrderID),0)
        AS decimal(5,1))              AS [Callback Rate %]
      FROM   [${db}]..Employee       e
      JOIN   [${db}]..WorkOrder      wo  ON wo.TechnicianID = e.EmployeeID
      LEFT JOIN [${db}]..WorkOrderLabour wol ON wol.WorkOrderID = wo.WorkOrderID
      WHERE  wo.Status IN ('Closed','Invoiced')
        ${f.company('c')}
        ${f.datesOrDefault('wo', 'CompletedDate',
            'wo.CompletedDate >= DATEADD(month, DATEDIFF(month,0,GETDATE()), 0)',
            'wo.CompletedDate <  DATEADD(month, DATEDIFF(month,0,GETDATE())+1, 0)')}
      GROUP BY e.FullName, e.Trade
      ORDER BY [Total Revenue] DESC
    `,
  },

  // 6 -------------------------------------------------------------------------
  {
    id: 6,
    title: 'Job Cost vs. Budget',
    description: 'Actual vs. budgeted cost breakdown per construction job — flags over-budget items.',
    columns: ['Job #','Job Name','Customer','PM','Start Date','Budget Labour','Actual Labour','Budget Materials','Actual Materials','Budget Total','Actual Total','Variance $','Variance %'],
    sql: (db, f) => `
      SELECT TOP 200
        j.JobNo           AS [Job #],
        j.JobName         AS [Job Name],
        c.CustomerName    AS [Customer],
        pm.FullName       AS [PM],
        CONVERT(varchar,j.StartDate,101) AS [Start Date],
        j.BudgetLabour    AS [Budget Labour],
        j.ActualLabour    AS [Actual Labour],
        j.BudgetMaterials AS [Budget Materials],
        j.ActualMaterials AS [Actual Materials],
        j.BudgetTotal     AS [Budget Total],
        j.ActualTotal     AS [Actual Total],
        j.ActualTotal - j.BudgetTotal AS [Variance $],
        CAST(
          100.0 * (j.ActualTotal - j.BudgetTotal)
          / NULLIF(j.BudgetTotal, 0)
        AS decimal(7,1))  AS [Variance %]
      FROM   [${db}]..Job       j
      JOIN   [${db}]..Customer   c  ON c.CustomerID  = j.CustomerID
      LEFT JOIN [${db}]..Employee pm ON pm.EmployeeID = j.ProjectManagerID
      WHERE  j.Status IN ('Active','Completed')
        ${f.company('c')}
        ${f.customer('c')}
        ${f.dates('j', 'StartDate')}
      ORDER BY [Variance %] DESC
    `,
  },

  // 7 -------------------------------------------------------------------------
  {
    id: 7,
    title: 'Monthly Revenue by Customer (12 Months)',
    description: 'Pivot of invoiced revenue per customer for each month. Default: current calendar year.',
    columns: ['Customer','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','YTD Total'],
    sql: (db, f) => `
      SELECT TOP 200
        c.CustomerName AS [Customer],
        SUM(CASE WHEN MONTH(i.InvoiceDate)=1  THEN i.InvoiceTotal ELSE 0 END) AS [Jan],
        SUM(CASE WHEN MONTH(i.InvoiceDate)=2  THEN i.InvoiceTotal ELSE 0 END) AS [Feb],
        SUM(CASE WHEN MONTH(i.InvoiceDate)=3  THEN i.InvoiceTotal ELSE 0 END) AS [Mar],
        SUM(CASE WHEN MONTH(i.InvoiceDate)=4  THEN i.InvoiceTotal ELSE 0 END) AS [Apr],
        SUM(CASE WHEN MONTH(i.InvoiceDate)=5  THEN i.InvoiceTotal ELSE 0 END) AS [May],
        SUM(CASE WHEN MONTH(i.InvoiceDate)=6  THEN i.InvoiceTotal ELSE 0 END) AS [Jun],
        SUM(CASE WHEN MONTH(i.InvoiceDate)=7  THEN i.InvoiceTotal ELSE 0 END) AS [Jul],
        SUM(CASE WHEN MONTH(i.InvoiceDate)=8  THEN i.InvoiceTotal ELSE 0 END) AS [Aug],
        SUM(CASE WHEN MONTH(i.InvoiceDate)=9  THEN i.InvoiceTotal ELSE 0 END) AS [Sep],
        SUM(CASE WHEN MONTH(i.InvoiceDate)=10 THEN i.InvoiceTotal ELSE 0 END) AS [Oct],
        SUM(CASE WHEN MONTH(i.InvoiceDate)=11 THEN i.InvoiceTotal ELSE 0 END) AS [Nov],
        SUM(CASE WHEN MONTH(i.InvoiceDate)=12 THEN i.InvoiceTotal ELSE 0 END) AS [Dec],
        SUM(i.InvoiceTotal) AS [YTD Total]
      FROM   [${db}]..Invoice  i
      JOIN   [${db}]..Customer c ON c.CustomerID = i.CustomerID
      WHERE  1=1
        ${f.company('c')}
        ${f.customer('c')}
        ${f.datesOrDefault('i', 'InvoiceDate',
            'i.InvoiceDate >= DATEADD(year, DATEDIFF(year,0,GETDATE()), 0)',
            null)}
      GROUP BY c.CustomerName
      ORDER BY [YTD Total] DESC
    `,
  },

  // 8 -------------------------------------------------------------------------
  {
    id: 8,
    title: 'Preventive Maintenance Schedule',
    description: 'PM visits due within the selected date range. Default: next 60 days plus overdue.',
    columns: ['Due Date','Days Until Due','Customer','Equipment','Serial #','PM Type','Frequency','Last Completed','Assigned Tech','Contract #'],
    sql: (db, f) => `
      SELECT TOP 300
        CONVERT(varchar,pm.NextDueDate,101)   AS [Due Date],
        DATEDIFF(day,GETDATE(),pm.NextDueDate) AS [Days Until Due],
        c.CustomerName  AS [Customer],
        CONCAT(eq.Make,' ',eq.Model,' — ',eq.EquipmentType) AS [Equipment],
        eq.SerialNo     AS [Serial #],
        pm.PMType       AS [PM Type],
        pm.Frequency    AS [Frequency],
        CONVERT(varchar,pm.LastCompletedDate,101) AS [Last Completed],
        ISNULL(e.FullName,'Unassigned')          AS [Assigned Tech],
        ISNULL(sc.ContractNo,'N/A')              AS [Contract #]
      FROM   [${db}]..PMSchedule      pm
      JOIN   [${db}]..Equipment        eq ON eq.EquipmentID  = pm.EquipmentID
      JOIN   [${db}]..Customer          c ON c.CustomerID    = eq.CustomerID
      LEFT JOIN [${db}]..Employee        e ON e.EmployeeID   = pm.DefaultTechID
      LEFT JOIN [${db}]..ServiceContract sc ON sc.ContractID = pm.ContractID
      WHERE  pm.Status = 'Active'
        ${f.company('c')}
        ${f.customer('c')}
        ${f.datesOrDefault('pm', 'NextDueDate',
            null,
            'pm.NextDueDate <= DATEADD(day,60,GETDATE())')}
      ORDER BY pm.NextDueDate ASC
    `,
  },

  // 9 -------------------------------------------------------------------------
  {
    id: 9,
    title: 'Parts Usage & Inventory Report',
    description: 'Top parts consumed in service calls. Default: current quarter. Stock alerts included.',
    columns: ['Part #','Description','Category','Qty Used (QTR)','Qty On Hand','Reorder Point','Status','Unit Cost','Total Cost Used','Avg per WO'],
    sql: (db, f) => `
      SELECT TOP 200
        p.PartNo          AS [Part #],
        p.Description     AS [Description],
        p.Category        AS [Category],
        SUM(wop.QuantityUsed) AS [Qty Used (QTR)],
        p.QtyOnHand       AS [Qty On Hand],
        p.ReorderPoint    AS [Reorder Point],
        CASE
          WHEN p.QtyOnHand <= 0              THEN 'OUT OF STOCK'
          WHEN p.QtyOnHand <= p.ReorderPoint THEN 'REORDER NOW'
          ELSE 'OK'
        END               AS [Status],
        p.UnitCost        AS [Unit Cost],
        SUM(wop.QuantityUsed * p.UnitCost) AS [Total Cost Used],
        CAST(AVG(CAST(wop.QuantityUsed AS float)) AS decimal(7,2)) AS [Avg per WO]
      FROM   [${db}]..Part          p
      JOIN   [${db}]..WorkOrderPart wop ON wop.PartID     = p.PartID
      JOIN   [${db}]..WorkOrder     wo  ON wo.WorkOrderID = wop.WorkOrderID
      JOIN   [${db}]..Customer       c  ON c.CustomerID   = wo.CustomerID
      WHERE  1=1
        ${f.company('c')}
        ${f.customer('c')}
        ${f.datesOrDefault('wo', 'CompletedDate',
            'wo.CompletedDate >= DATEADD(quarter, DATEDIFF(quarter,0,GETDATE()), 0)',
            null)}
      GROUP BY p.PartNo, p.Description, p.Category, p.QtyOnHand, p.ReorderPoint, p.UnitCost
      ORDER BY [Qty Used (QTR)] DESC
    `,
  },

  // 10 ------------------------------------------------------------------------
  {
    id: 10,
    title: 'Customer Profitability Summary',
    description: 'Revenue, direct cost, and gross margin per customer. Default: current year-to-date.',
    columns: ['Customer','City','Customer Type','WOs Completed','Contracts','YTD Revenue','YTD Direct Cost','Gross Profit','Margin %','Avg WO Value'],
    sql: (db, f) => {
      const dateFromExpr = f.dateFrom
        ? '@dateFrom'
        : `DATEADD(year,DATEDIFF(year,0,GETDATE()),0)`;
      const dateToExpr = f.dateTo
        ? '@dateTo'
        : 'GETDATE()';
      return `
        SELECT TOP 200
          c.CustomerName   AS [Customer],
          c.City           AS [City],
          c.CustomerType   AS [Customer Type],
          COUNT(DISTINCT wo.WorkOrderID)   AS [WOs Completed],
          COUNT(DISTINCT sc.ContractID)    AS [Contracts],
          SUM(i.InvoiceTotal)              AS [YTD Revenue],
          SUM(i.DirectCost)                AS [YTD Direct Cost],
          SUM(i.InvoiceTotal - i.DirectCost) AS [Gross Profit],
          CAST(
            100.0 * SUM(i.InvoiceTotal - i.DirectCost)
            / NULLIF(SUM(i.InvoiceTotal),0)
          AS decimal(5,1))                 AS [Margin %],
          CAST(AVG(CAST(i.InvoiceTotal AS float)) AS decimal(10,2)) AS [Avg WO Value]
        FROM   [${db}]..Customer        c
        LEFT JOIN [${db}]..Invoice        i  ON i.CustomerID  = c.CustomerID
                                           AND i.InvoiceDate BETWEEN ${dateFromExpr} AND ${dateToExpr}
        LEFT JOIN [${db}]..WorkOrder      wo ON wo.CustomerID = c.CustomerID
                                           AND wo.Status IN ('Closed','Invoiced')
                                           AND wo.CompletedDate BETWEEN ${dateFromExpr} AND ${dateToExpr}
        LEFT JOIN [${db}]..ServiceContract sc ON sc.CustomerID = c.CustomerID AND sc.Status = 'Active'
        WHERE  1=1
          ${f.company('c')}
          ${f.customer('c')}
        GROUP BY c.CustomerName, c.City, c.CustomerType
        HAVING SUM(i.InvoiceTotal) > 0
        ORDER BY [YTD Revenue] DESC
      `;
    },
  },
];

module.exports = REPORTS;
