/**
 * Report definitions — shared between report-generator.js (CLI) and server.js (web UI).
 * Each report: id, title, description, columns[], sql(db, filters).
 */

const REPORTS = [

  // 1 -------------------------------------------------------------------------
  {
    id: 1,
    title: 'Open Service Orders by Status',
    description: 'All open service orders grouped by status and priority, with customer and assigned technician.',
    columns: ['Order #','Customer','Address','Status','Priority','Order Type','Assigned Tech','Scheduled Date','Days Open','Est. Revenue'],
    sql: (db, f) => `
      SELECT TOP 500
        so.OrderNo            AS [Order #],
        c.CustomerName        AS [Customer],
        c.Address             AS [Address],
        so.Status             AS [Status],
        so.Priority           AS [Priority],
        so.OrderType          AS [Order Type],
        ISNULL(e.FullName,'Unassigned') AS [Assigned Tech],
        CONVERT(varchar,so.ScheduledDate,101) AS [Scheduled Date],
        DATEDIFF(day, so.CreatedDate, GETDATE()) AS [Days Open],
        ISNULL(so.EstimatedRevenue, 0) AS [Est. Revenue]
      FROM   [${db}]..ServiceOrder so
      JOIN   [${db}]..Customer     c  ON c.CustomerID = so.CustomerID
      LEFT JOIN [${db}]..Employee  e  ON e.EmployeeID = so.TechID
      WHERE  so.Status NOT IN ('Closed','Cancelled','Invoiced')
        ${f.company('c')}
        ${f.customer('c')}
        ${f.dates('so', 'ScheduledDate')}
      ORDER BY so.Priority DESC, so.ScheduledDate ASC
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
    title: 'Contract Renewal Pipeline',
    description: 'Active maintenance contracts expiring within the selected date range (default: next 90 days).',
    columns: ['Customer','Contract #','Contract Type','Asset Covered','Start Date','Expiry Date','Days Until Expiry','Annual Value','Auto-Renew'],
    sql: (db, f) => `
      SELECT TOP 500
        c.CustomerName      AS [Customer],
        ct.ContractNo       AS [Contract #],
        ct.ContractType     AS [Contract Type],
        ISNULL(ct.AssetDescription,'Multiple') AS [Asset Covered],
        CONVERT(varchar,ct.StartDate,  101) AS [Start Date],
        CONVERT(varchar,ct.ExpiryDate, 101) AS [Expiry Date],
        DATEDIFF(day,GETDATE(),ct.ExpiryDate) AS [Days Until Expiry],
        ct.AnnualValue      AS [Annual Value],
        CASE ct.AutoRenew WHEN 1 THEN 'Yes' ELSE 'No' END AS [Auto-Renew]
      FROM   [${db}]..Contract ct
      JOIN   [${db}]..Customer  c ON c.CustomerID = ct.CustomerID
      WHERE  ct.Status = 'Active'
        ${f.company('c')}
        ${f.customer('c')}
        ${f.datesOrDefault('ct', 'ExpiryDate',
            'ct.ExpiryDate >= GETDATE()',
            'ct.ExpiryDate <= DATEADD(day,90,GETDATE())')}
      ORDER BY ct.ExpiryDate ASC
    `,
  },

  // 4 -------------------------------------------------------------------------
  {
    id: 4,
    title: 'Asset Service History',
    description: 'Full service history per asset — great for warranty tracking and failure pattern analysis.',
    columns: ['Customer','Asset ID','Asset Class','Make / Model','Serial #','Install Date','Service Date','Order #','Order Type','Tech','Labour Hrs','Parts Cost','Total Cost'],
    sql: (db, f) => `
      SELECT TOP 500
        c.CustomerName   AS [Customer],
        a.AssetID        AS [Asset ID],
        a.AssetClass     AS [Asset Class],
        CONCAT(a.Make,' ',a.Model) AS [Make / Model],
        a.SerialNo       AS [Serial #],
        CONVERT(varchar,a.InstallDate,101)    AS [Install Date],
        CONVERT(varchar,so.CompletedDate,101) AS [Service Date],
        so.OrderNo       AS [Order #],
        so.OrderType     AS [Order Type],
        e.FullName       AS [Tech],
        ol.LaborHours    AS [Labour Hrs],
        ol.PartsCost     AS [Parts Cost],
        ol.TotalCost     AS [Total Cost]
      FROM   [${db}]..Asset        a
      JOIN   [${db}]..Customer      c   ON c.CustomerID  = a.CustomerID
      JOIN   [${db}]..ServiceOrder  so  ON so.AssetID    = a.AssetID
      LEFT JOIN [${db}]..Employee   e   ON e.EmployeeID  = so.TechID
      LEFT JOIN [${db}]..OrderLabour ol ON ol.OrderID    = so.OrderID
      WHERE  so.Status IN ('Closed','Invoiced')
        ${f.company('c')}
        ${f.customer('c')}
        ${f.dates('so', 'CompletedDate')}
      ORDER BY a.AssetID, so.CompletedDate DESC
    `,
  },

  // 5 -------------------------------------------------------------------------
  {
    id: 5,
    title: 'Technician Productivity Report',
    description: 'Orders completed, billable hours, and revenue per technician. Default: current month.',
    columns: ['Technician','Specialty','Orders Completed','Billable Hrs','Avg Hrs/Order','Labour Revenue','Parts Revenue','Total Revenue','Rework Rate %'],
    sql: (db, f) => `
      SELECT
        e.FullName        AS [Technician],
        e.Specialty       AS [Specialty],
        COUNT(so.OrderID)             AS [Orders Completed],
        SUM(ol.BillableHours)         AS [Billable Hrs],
        AVG(ol.BillableHours)         AS [Avg Hrs/Order],
        SUM(ol.LaborRevenue)          AS [Labour Revenue],
        SUM(ol.PartsRevenue)          AS [Parts Revenue],
        SUM(ol.TotalRevenue)          AS [Total Revenue],
        CAST(
          100.0 * SUM(CASE WHEN so.IsRework = 1 THEN 1 ELSE 0 END)
          / NULLIF(COUNT(so.OrderID),0)
        AS decimal(5,1))              AS [Rework Rate %]
      FROM   [${db}]..Employee       e
      JOIN   [${db}]..ServiceOrder   so ON so.TechID     = e.EmployeeID
      LEFT JOIN [${db}]..OrderLabour ol ON ol.OrderID    = so.OrderID
      WHERE  so.Status IN ('Closed','Invoiced')
        ${f.company('c')}
        ${f.datesOrDefault('so', 'CompletedDate',
            'so.CompletedDate >= DATEADD(month, DATEDIFF(month,0,GETDATE()), 0)',
            'so.CompletedDate <  DATEADD(month, DATEDIFF(month,0,GETDATE())+1, 0)')}
      GROUP BY e.FullName, e.Specialty
      ORDER BY [Total Revenue] DESC
    `,
  },

  // 6 -------------------------------------------------------------------------
  {
    id: 6,
    title: 'Project Cost vs. Budget',
    description: 'Actual vs. budgeted cost breakdown per project — flags over-budget items.',
    columns: ['Project #','Project Name','Customer','Manager','Start Date','Labor Budget','Labor Actual','Materials Budget','Materials Actual','Total Budget','Total Actual','Variance $','Variance %'],
    sql: (db, f) => `
      SELECT TOP 200
        p.ProjectNo         AS [Project #],
        p.ProjectName       AS [Project Name],
        c.CustomerName      AS [Customer],
        m.FullName          AS [Manager],
        CONVERT(varchar,p.StartDate,101) AS [Start Date],
        p.LaborBudget       AS [Labor Budget],
        p.LaborActual       AS [Labor Actual],
        p.MaterialBudget    AS [Materials Budget],
        p.MaterialActual    AS [Materials Actual],
        p.TotalBudget       AS [Total Budget],
        p.TotalActual       AS [Total Actual],
        p.TotalActual - p.TotalBudget AS [Variance $],
        CAST(
          100.0 * (p.TotalActual - p.TotalBudget)
          / NULLIF(p.TotalBudget, 0)
        AS decimal(7,1))    AS [Variance %]
      FROM   [${db}]..Project   p
      JOIN   [${db}]..Customer   c  ON c.CustomerID  = p.CustomerID
      LEFT JOIN [${db}]..Employee m  ON m.EmployeeID = p.ManagerID
      WHERE  p.Status IN ('Active','Completed')
        ${f.company('c')}
        ${f.customer('c')}
        ${f.dates('p', 'StartDate')}
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
    description: 'Maintenance visits due within the selected date range. Default: next 60 days plus overdue.',
    columns: ['Due Date','Days Until Due','Customer','Asset','Serial #','Maintenance Type','Frequency','Last Serviced','Assigned Tech','Contract #'],
    sql: (db, f) => `
      SELECT TOP 300
        CONVERT(varchar,ms.NextDueDate,101)    AS [Due Date],
        DATEDIFF(day,GETDATE(),ms.NextDueDate) AS [Days Until Due],
        c.CustomerName  AS [Customer],
        CONCAT(a.Make,' ',a.Model,' — ',a.AssetClass) AS [Asset],
        a.SerialNo      AS [Serial #],
        ms.MaintenanceType AS [Maintenance Type],
        ms.Frequency    AS [Frequency],
        CONVERT(varchar,ms.LastServiceDate,101)  AS [Last Serviced],
        ISNULL(e.FullName,'Unassigned')          AS [Assigned Tech],
        ISNULL(ct.ContractNo,'N/A')              AS [Contract #]
      FROM   [${db}]..MaintenanceSchedule ms
      JOIN   [${db}]..Asset                a  ON a.AssetID     = ms.AssetID
      JOIN   [${db}]..Customer              c  ON c.CustomerID  = a.CustomerID
      LEFT JOIN [${db}]..Employee           e  ON e.EmployeeID  = ms.DefaultTechID
      LEFT JOIN [${db}]..Contract          ct  ON ct.ContractID = ms.ContractID
      WHERE  ms.Status = 'Active'
        ${f.company('c')}
        ${f.customer('c')}
        ${f.datesOrDefault('ms', 'NextDueDate',
            null,
            'ms.NextDueDate <= DATEADD(day,60,GETDATE())')}
      ORDER BY ms.NextDueDate ASC
    `,
  },

  // 9 -------------------------------------------------------------------------
  {
    id: 9,
    title: 'Parts Usage & Inventory Report',
    description: 'Top parts consumed in service orders. Default: current quarter. Stock alerts included.',
    columns: ['Part #','Description','Category','Qty Used (QTR)','Stock Qty','Min Stock Level','Status','Unit Cost','Total Cost Used','Avg per Order'],
    sql: (db, f) => `
      SELECT TOP 200
        p.PartNo          AS [Part #],
        p.Description     AS [Description],
        p.Category        AS [Category],
        SUM(op.QtyUsed)   AS [Qty Used (QTR)],
        p.StockQty        AS [Stock Qty],
        p.MinStockLevel   AS [Min Stock Level],
        CASE
          WHEN p.StockQty <= 0               THEN 'OUT OF STOCK'
          WHEN p.StockQty <= p.MinStockLevel THEN 'REORDER NOW'
          ELSE 'OK'
        END               AS [Status],
        p.UnitCost        AS [Unit Cost],
        SUM(op.QtyUsed * p.UnitCost) AS [Total Cost Used],
        CAST(AVG(CAST(op.QtyUsed AS float)) AS decimal(7,2)) AS [Avg per Order]
      FROM   [${db}]..Part         p
      JOIN   [${db}]..OrderPart    op ON op.PartID   = p.PartID
      JOIN   [${db}]..ServiceOrder so ON so.OrderID  = op.OrderID
      JOIN   [${db}]..Customer      c ON c.CustomerID = so.CustomerID
      WHERE  1=1
        ${f.company('c')}
        ${f.customer('c')}
        ${f.datesOrDefault('so', 'CompletedDate',
            'so.CompletedDate >= DATEADD(quarter, DATEDIFF(quarter,0,GETDATE()), 0)',
            null)}
      GROUP BY p.PartNo, p.Description, p.Category, p.StockQty, p.MinStockLevel, p.UnitCost
      ORDER BY [Qty Used (QTR)] DESC
    `,
  },

  // 10 ------------------------------------------------------------------------
  {
    id: 10,
    title: 'Customer Profitability Summary',
    description: 'Revenue, cost of revenue, and gross margin per customer. Default: current year-to-date.',
    columns: ['Customer','City','Segment','Orders Completed','Contracts','YTD Revenue','YTD Cost','Gross Profit','Margin %','Avg Order Value'],
    sql: (db, f) => {
      const dateFromExpr = f.dateFrom
        ? '@dateFrom'
        : `DATEADD(year,DATEDIFF(year,0,GETDATE()),0)`;
      const dateToExpr = f.dateTo
        ? '@dateTo'
        : 'GETDATE()';
      return `
        SELECT TOP 200
          c.CustomerName    AS [Customer],
          c.City            AS [City],
          c.ClientSegment   AS [Segment],
          COUNT(DISTINCT so.OrderID)    AS [Orders Completed],
          COUNT(DISTINCT ct.ContractID) AS [Contracts],
          SUM(i.InvoiceTotal)           AS [YTD Revenue],
          SUM(i.CostOfRevenue)          AS [YTD Cost],
          SUM(i.InvoiceTotal - i.CostOfRevenue) AS [Gross Profit],
          CAST(
            100.0 * SUM(i.InvoiceTotal - i.CostOfRevenue)
            / NULLIF(SUM(i.InvoiceTotal),0)
          AS decimal(5,1))              AS [Margin %],
          CAST(AVG(CAST(i.InvoiceTotal AS float)) AS decimal(10,2)) AS [Avg Order Value]
        FROM   [${db}]..Customer      c
        LEFT JOIN [${db}]..Invoice     i  ON i.CustomerID  = c.CustomerID
                                        AND i.InvoiceDate BETWEEN ${dateFromExpr} AND ${dateToExpr}
        LEFT JOIN [${db}]..ServiceOrder so ON so.CustomerID = c.CustomerID
                                        AND so.Status IN ('Closed','Invoiced')
                                        AND so.CompletedDate BETWEEN ${dateFromExpr} AND ${dateToExpr}
        LEFT JOIN [${db}]..Contract   ct  ON ct.CustomerID = c.CustomerID AND ct.Status = 'Active'
        WHERE  1=1
          ${f.company('c')}
          ${f.customer('c')}
        GROUP BY c.CustomerName, c.City, c.ClientSegment
        HAVING SUM(i.InvoiceTotal) > 0
        ORDER BY [YTD Revenue] DESC
      `;
    },
  },
];

module.exports = REPORTS;
