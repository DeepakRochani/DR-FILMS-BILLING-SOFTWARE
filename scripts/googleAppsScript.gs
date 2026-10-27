/**
 * =========================================================================
 * DR FILMS BILLING SOFTWARE — GOOGLE APPS SCRIPT BACKUP WEB APP
 * =========================================================================
 * 
 * SETUP INSTRUCTIONS:
 * 1. Open Google Sheets (https://sheets.new) and name it:
 *    "DR FILMS Billing Backup"
 * 2. Click "Extensions" > "Apps Script" in the top menu.
 * 3. Delete any default code in Code.gs, paste this entire file, and save (Cmd+S / Ctrl+S).
 * 4. (Optional) Customize DEFAULT_SECRET below if you wish.
 * 5. Click the blue "Deploy" button (top right) > "New deployment".
 * 6. Click the gear icon next to "Select type" > choose "Web app".
 * 7. Set:
 *    - Description: "DR FILMS Backup Sync"
 *    - Execute as: "Me" (your Google account)
 *    - Who has access: "Anyone" (crucial so your offline PWA can reach it)
 * 8. Click "Deploy", authorize permissions when prompted, and copy the "Web app URL".
 * 9. Paste the Web app URL and Secret Key into DR FILMS Billing > Settings > Google Sheets Backup!
 * =========================================================================
 */

var DEFAULT_SECRET = "drfilms_backup_secret_2026";

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ success: false, error: "Empty request payload" });
    }

    var payload = JSON.parse(e.postData.contents);
    var secret = payload.secret;
    var action = payload.action;

    // Check secret key (from Script Properties or fallback to DEFAULT_SECRET)
    var expectedSecret = PropertiesService.getScriptProperties().getProperty("BACKUP_SECRET") || DEFAULT_SECRET;
    if (!secret || secret !== expectedSecret) {
      return jsonResponse({ 
        success: false, 
        error: "Unauthorized: Invalid or missing secret key" 
      });
    }

    // Resolve target spreadsheet:
    // 1. If payload contains a specific sheetId or spreadsheetId, open that exact spreadsheet
    // 2. Otherwise fallback to the container-bound spreadsheet via getActiveSpreadsheet()
    var ss = null;
    var targetSheetId = (payload.sheetId || payload.spreadsheetId || "").toString().trim();

    // Auto-extract ID if full URL was provided (e.g. https://docs.google.com/spreadsheets/d/1cEcd.../edit)
    if (targetSheetId.indexOf("/d/") !== -1) {
      var match = targetSheetId.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (match && match[1]) {
        targetSheetId = match[1];
      }
    }

    if (targetSheetId) {
      try {
        ss = SpreadsheetApp.openById(targetSheetId);
      } catch (errOpen) {
        return jsonResponse({
          success: false,
          error: "Could not open Google Sheet with ID '" + targetSheetId + "'. Error: " + errOpen.message + ". Please verify that your Google account has edit permission to this spreadsheet."
        });
      }
    }

    if (!ss) {
      try {
        ss = SpreadsheetApp.getActiveSpreadsheet();
      } catch (e) {}
    }

    if (!ss) {
      return jsonResponse({
        success: false,
        error: "No Google Sheet found. If your Apps Script was deployed as standalone, please provide your Google Sheet ID or URL in the app, or open Apps Script directly inside your spreadsheet via Extensions > Apps Script."
      });
    }

    // 1. ACTION: PING (Test connection)
    if (action === "ping") {
      return jsonResponse({ 
        success: true, 
        message: "Connected to Google Sheet successfully!", 
        sheetName: ss.getName(),
        sheetId: ss.getId(),
        sheetUrl: ss.getUrl(),
        timestamp: new Date().toISOString()
      });
    }

    // 2. ACTION: SYNC ALL (Upsert Invoices & Payments; Append Deleted Bills; Update other tables; Keep 30-day BackupHistory)
    if (action === "syncAll") {
      var tables = payload.tables || {};
      
      // Update each table tab using archive/upsert logic
      for (var tableName in tables) {
        if (tables.hasOwnProperty(tableName)) {
          var table = tables[tableName];
          if (tableName === "Invoices") {
            upsertInvoicesTable(ss, table.headers, table.rows);
          } else if (tableName === "Payments") {
            upsertPaymentsTable(ss, table.headers, table.rows);
          } else if (tableName === "Deleted Bills") {
            updateDeletedBillsTab(ss, table.headers, table.rows);
          } else {
            updateStandardTable(ss, tableName, table.headers, table.rows);
          }
        }
      }

      // If the spreadsheet still has an untouched default "Sheet1" that is empty, remove it for a clean look
      try {
        var defaultSheet = ss.getSheetByName("Sheet1");
        if (defaultSheet && defaultSheet.getLastRow() === 0 && ss.getSheets().length > 1) {
          ss.deleteSheet(defaultSheet);
        }
      } catch (e) {}

      // Save raw JSON backup into latest hidden tab (_BACKUP_DATA)
      if (payload.backupJson) {
        saveRawBackupJson(ss, payload.backupJson);
        // Save 30-day daily rolling history snapshot (_BackupHistory)
        saveBackupHistory(ss, payload.backupJson);
      }

      return jsonResponse({
        success: true,
        message: "All tables and backup snapshot synchronized successfully",
        sheetName: ss.getName(),
        sheetId: ss.getId(),
        sheetUrl: ss.getUrl(),
        syncedAt: new Date().toISOString()
      });
    }

    // 3. ACTION: GET BACKUP (Restore)
    if (action === "getBackup") {
      var backupJson = loadRawBackupJson(ss);
      if (!backupJson) {
        return jsonResponse({ 
          success: false, 
          error: "No backup snapshot found in '" + ss.getName() + "'. Click 'Sync now' in DR FILMS Billing first." 
        });
      }
      return jsonResponse({
        success: true,
        sheetName: ss.getName(),
        sheetId: ss.getId(),
        sheetUrl: ss.getUrl(),
        backupJson: backupJson
      });
    }

    return jsonResponse({ success: false, error: "Unknown action: " + action });

  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

/**
 * Format header row with dark slate branding and bold text
 */
function formatHeaderRow(sheet, numCols) {
  var headerRange = sheet.getRange(1, 1, 1, numCols);
  headerRange.setFontWeight("bold");
  headerRange.setBackground("#0f172a"); // Dark slate
  headerRange.setFontColor("#f8fafc");
  headerRange.setHorizontalAlignment("center");
  sheet.setFrozenRows(1);
}

/**
 * Format individual data row: soft red background for Deleted rows, zebra striping for Active
 */
function formatDataRow(sheet, rowIndex, numCols, recordStatusVal) {
  var rowRange = sheet.getRange(rowIndex, 1, 1, numCols);
  rowRange.setWrap(true);
  rowRange.setVerticalAlignment("top");

  var status = String(recordStatusVal || '').toLowerCase();
  if (status.indexOf('deleted') !== -1) {
    // Shaded soft red for deleted and permanently deleted bills
    rowRange.setBackground("#fee2e2");
    rowRange.setFontColor("#991b1b");
  } else {
    // Normal zebra striping
    if (rowIndex % 2 === 0) {
      rowRange.setBackground("#f8fafc");
    } else {
      rowRange.setBackground("#ffffff");
    }
    rowRange.setFontColor("#0f172a");
  }
}

/**
 * Apply auto-resize and comfortable widths to columns
 */
function applySheetStyling(sheet, headers) {
  try {
    for (var c = 1; c <= Math.min(headers.length, 25); c++) {
      sheet.autoResizeColumn(c);
      var headerText = String(headers[c - 1] || '');
      if (headerText.toLowerCase().includes('items summary') || headerText.toLowerCase().includes('service / description')) {
        if (sheet.getColumnWidth(c) < 350) {
          sheet.setColumnWidth(c, 450);
        }
      }
    }
  } catch (errResize) {}
}

/**
 * Upsert Invoices by "Invoice No":
 * - Existing invoices in Sheet are updated in-place.
 * - New invoices in payload are appended.
 * - Invoices existing in Sheet but missing from payload are KEPT UNTOUCHED.
 * - Deleted bills get Record Status = Deleted / Deleted permanently and row shaded red.
 */
function upsertInvoicesTable(ss, headers, rows) {
  var sheetName = "Invoices";
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  // Ensure headers are written and formatted
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  formatHeaderRow(sheet, headers.length);

  var invColIdx = 0; // 'Invoice No' is col 0
  var recordStatusIdx = -1;
  for (var h = 0; h < headers.length; h++) {
    if (String(headers[h]).toLowerCase() === 'record status') {
      recordStatusIdx = h;
      break;
    }
  }

  var lastRow = sheet.getLastRow();
  var existingMap = {};
  if (lastRow > 1) {
    var existingVals = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    for (var r = 0; r < existingVals.length; r++) {
      var invKey = String(existingVals[r][invColIdx] || '').trim();
      if (invKey) {
        existingMap[invKey] = r + 2; // actual row in sheet
      }
    }
  }

  if (rows && rows.length > 0) {
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var key = String(row[invColIdx] || '').trim();
      var targetRow = existingMap[key];

      if (targetRow) {
        // Update existing row in place; preserve rows not in payload
        sheet.getRange(targetRow, 1, 1, row.length).setValues([row]);
        formatDataRow(sheet, targetRow, row.length, row[recordStatusIdx]);
      } else {
        // Append new row
        var nextRow = sheet.getLastRow() + 1;
        sheet.getRange(nextRow, 1, 1, row.length).setValues([row]);
        existingMap[key] = nextRow;
        formatDataRow(sheet, nextRow, row.length, row[recordStatusIdx]);
      }
    }
  }

  applySheetStyling(sheet, headers);
}

/**
 * Upsert Payments by "Payment ID":
 * - Existing payments in Sheet are updated in-place.
 * - New payments in payload are appended.
 * - Payments existing in Sheet but missing from payload are KEPT UNTOUCHED.
 * - Deleted payments get Record Status = Deleted and row shaded red.
 */
function upsertPaymentsTable(ss, headers, rows) {
  var sheetName = "Payments";
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  formatHeaderRow(sheet, headers.length);

  var paymentIdIdx = 0; // 'Payment ID' is col 0
  var recordStatusIdx = -1;
  for (var h = 0; h < headers.length; h++) {
    if (String(headers[h]).toLowerCase() === 'record status') {
      recordStatusIdx = h;
      break;
    }
  }

  var lastRow = sheet.getLastRow();
  var existingMap = {};
  if (lastRow > 1) {
    var existingVals = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    for (var r = 0; r < existingVals.length; r++) {
      var pmtKey = String(existingVals[r][paymentIdIdx] || '').trim();
      if (pmtKey) {
        existingMap[pmtKey] = r + 2;
      }
    }
  }

  if (rows && rows.length > 0) {
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var key = String(row[paymentIdIdx] || '').trim();
      var targetRow = existingMap[key];

      if (targetRow) {
        sheet.getRange(targetRow, 1, 1, row.length).setValues([row]);
        formatDataRow(sheet, targetRow, row.length, row[recordStatusIdx]);
      } else {
        var nextRow = sheet.getLastRow() + 1;
        sheet.getRange(nextRow, 1, 1, row.length).setValues([row]);
        existingMap[key] = nextRow;
        formatDataRow(sheet, nextRow, row.length, row[recordStatusIdx]);
      }
    }
  }

  applySheetStyling(sheet, headers);
}

/**
 * Append-only "Deleted Bills" tab:
 * - Appends one row per deleted bill with full details.
 * - If restored later, updates the "Restored At" and "Notes" columns but NEVER removes the row.
 */
function updateDeletedBillsTab(ss, headers, rows) {
  var sheetName = "Deleted Bills";
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  formatHeaderRow(sheet, headers.length);

  var lastRow = sheet.getLastRow();
  var existingMap = {};
  if (lastRow > 1) {
    var existingVals = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    for (var r = 0; r < existingVals.length; r++) {
      var invKey = String(existingVals[r][0] || '').trim();
      if (invKey) {
        existingMap[invKey] = r + 2;
      }
    }
  }

  // Row format: [Invoice No, Client, Phone, Date, Items summary, Total, Paid, Balance, Deleted At, Restored At, Notes]
  if (rows && rows.length > 0) {
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var key = String(row[0] || '').trim();
      var targetRow = existingMap[key];

      if (targetRow) {
        // If restored, record Restored At and Notes, never remove row
        var restoredAt = row[9];
        var notes = row[10];
        if (restoredAt) {
          sheet.getRange(targetRow, 10).setValue(restoredAt);
        }
        if (notes) {
          sheet.getRange(targetRow, 11).setValue(notes);
        }
      } else {
        // Brand new deleted bill: append row to bottom
        var nextRow = sheet.getLastRow() + 1;
        sheet.getRange(nextRow, 1, 1, row.length).setValues([row]);
        existingMap[key] = nextRow;

        var newRange = sheet.getRange(nextRow, 1, 1, row.length);
        newRange.setBackground("#fff1f2");
        newRange.setFontColor("#991b1b");
        newRange.setWrap(true);
        newRange.setVerticalAlignment("top");
      }
    }
  }

  applySheetStyling(sheet, headers);
}

/**
 * Format and populate standard sheet tabs (Bill Items, Clients, Services)
 */
function updateStandardTable(ss, sheetName, headers, rows) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  } else {
    sheet.clear();
  }

  if (!headers || headers.length === 0) return;

  var data = [headers];
  if (rows && rows.length > 0) {
    for (var i = 0; i < rows.length; i++) {
      data.push(rows[i]);
    }
  }

  var range = sheet.getRange(1, 1, data.length, headers.length);
  range.setValues(data);
  range.setWrap(true);
  range.setVerticalAlignment("top");

  formatHeaderRow(sheet, headers.length);

  if (rows && rows.length > 0) {
    for (var r = 2; r <= data.length; r++) {
      var rowRange = sheet.getRange(r, 1, 1, headers.length);
      if (r % 2 === 0) {
        rowRange.setBackground("#f8fafc");
      } else {
        rowRange.setBackground("#ffffff");
      }
    }
  }

  applySheetStyling(sheet, headers);
}

/**
 * Save raw JSON backup into latest dedicated hidden tab (_BACKUP_DATA)
 */
function saveRawBackupJson(ss, jsonStr) {
  var sheet = ss.getSheetByName("_BACKUP_DATA");
  if (!sheet) {
    sheet = ss.insertSheet("_BACKUP_DATA");
    try {
      sheet.hideSheet();
    } catch (e) {}
  } else {
    sheet.clear();
  }

  var chunkSize = 30000;
  var chunks = [];
  for (var i = 0; i < jsonStr.length; i += chunkSize) {
    chunks.push([jsonStr.substring(i, i + chunkSize)]);
  }

  if (chunks.length > 0) {
    sheet.getRange(1, 1, chunks.length, 1).setValues(chunks);
  }
}

/**
 * Save daily backup history (_BackupHistory):
 * - Keeps 1 full snapshot per day for the last 30 days.
 * - Chunks under 30,000 characters per cell (safely below 40,000 cell limit).
 * - Prunes snapshots older than 30 days.
 */
function saveBackupHistory(ss, jsonStr) {
  var sheetName = "_BackupHistory";
  var sheet = ss.getSheetByName(sheetName);
  var headers = ["Snapshot Date", "Timestamp", "Chunk Index", "Total Chunks", "JSON Chunk"];

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    try {
      sheet.hideSheet();
    } catch (e) {}
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    formatHeaderRow(sheet, headers.length);
  }

  var todayDateStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  var nowTimestamp = new Date().toISOString();

  var chunkSize = 30000;
  var chunks = [];
  for (var c = 0; c < jsonStr.length; c += chunkSize) {
    chunks.push(jsonStr.substring(c, c + chunkSize));
  }
  var totalChunks = chunks.length;

  var lastRow = sheet.getLastRow();
  var rowsToKeep = [];

  // Prune older than 30 days and replace today's snapshot if already saved today
  var cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 30);
  var cutoffDateStr = cutoffDate.toISOString().split("T")[0];

  if (lastRow > 1) {
    var existingHistory = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    for (var i = 0; i < existingHistory.length; i++) {
      var row = existingHistory[i];
      var snapshotDate = String(row[0] || '').trim();
      if (snapshotDate >= cutoffDateStr && snapshotDate !== todayDateStr) {
        rowsToKeep.push(row);
      }
    }
  }

  for (var k = 0; k < chunks.length; k++) {
    rowsToKeep.push([
      todayDateStr,
      nowTimestamp,
      k + 1,
      totalChunks,
      chunks[k]
    ]);
  }

  sheet.clear();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  formatHeaderRow(sheet, headers.length);

  if (rowsToKeep.length > 0) {
    sheet.getRange(2, 1, rowsToKeep.length, headers.length).setValues(rowsToKeep);
  }
}

/**
 * Load raw JSON backup from chunks
 */
function loadRawBackupJson(ss) {
  var sheet = ss.getSheetByName("_BACKUP_DATA");
  if (sheet && sheet.getLastRow() > 0) {
    var lastRow = sheet.getLastRow();
    var values = sheet.getRange(1, 1, lastRow, 1).getValues();
    var result = "";
    for (var i = 0; i < values.length; i++) {
      result += values[i][0];
    }
    if (result && result.trim().length > 0) return result;
  }

  // Fallback to latest snapshot in _BackupHistory if _BACKUP_DATA is empty
  var historySheet = ss.getSheetByName("_BackupHistory");
  if (historySheet && historySheet.getLastRow() > 1) {
    var hVals = historySheet.getRange(2, 1, historySheet.getLastRow() - 1, 5).getValues();
    if (hVals.length > 0) {
      var latestDate = "";
      for (var j = 0; j < hVals.length; j++) {
        var d = String(hVals[j][0] || '');
        if (d > latestDate) latestDate = d;
      }
      var latestChunks = hVals.filter(function(r) { return String(r[0]) === latestDate; });
      latestChunks.sort(function(a, b) { return Number(a[2]) - Number(b[2]); });
      var histResult = "";
      for (var k = 0; k < latestChunks.length; k++) {
        histResult += latestChunks[k][4];
      }
      if (histResult) return histResult;
    }
  }

  return null;
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  return jsonResponse({
    success: true,
    message: "DR FILMS Billing Google Sheets Sync Service is active. Send POST requests to sync."
  });
}
