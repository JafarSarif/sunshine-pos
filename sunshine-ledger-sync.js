/**
 * Sunshine Ledger & Supabase Synchronization Service
 * 
 * Directly connects Antigravity Inventory & Infinatort POS to the user's
 * Sunshine Ledger accounting portal (Section 3A: Gadget & Repair Sales).
 * 
 * Targets Supabase:
 * - Table 1: gadget_sales_entries (Individual product transaction & profit log)
 * - Table 2: daily_ledgers (Daily ledger document: updates Section 3A gadgetSale & gadgetSalesLog)
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://soooxprxcmuxzcxyxvus.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_t03kGTVyCJuO75tGm7FR_w__ye7dbkr';

// Clean default configuration matching Sunshine Ledger's schema
const CLEAN_DEFAULT_LEDGER = {
  accountantName: 'SUPERADMIN',
  morningCash: [
    { id: 'mc_cash', name: 'CASH', expr: '' },
    { id: 'mc_nawaz', name: 'NAWAZ', expr: '' },
    { id: 'mc_pay1maa', name: 'PAY 1 MAA', expr: '' },
    { id: 'mc_pay1', name: 'PAY1', expr: '' },
    { id: 'mc_bob', name: 'BOB', expr: '' },
    { id: 'mc_airtel', name: 'AIRTEL', expr: '' },
    { id: 'mc_slice', name: 'slice', expr: '' },
    { id: 'mc_sarfaraj', name: 'SARFARAJ', expr: '' }
  ],
  lafo: [
    { id: 'lafo_jio', name: 'JIO', start: '', end: '' },
    { id: 'lafo_airtel', name: 'AIRTEL', start: '', end: '' },
    { id: 'lafo_voda', name: 'VODAFONE', start: '', end: '' },
    { id: 'lafo_jio2', name: 'JIO 2', start: '', end: '' }
  ],
  cashOut: [],
  cashIn: [],
  recharge: [
    { id: 'rec_jio', name: 'JIO', expr: '' },
    { id: 'rec_jio2', name: 'JIO 2', expr: '' },
    { id: 'rec_airtel', name: 'AIRTEL', expr: '' },
    { id: 'rec_airpb', name: 'AIR PB', expr: '' },
    { id: 'rec_voda', name: 'VODAFONE', expr: '' },
    { id: 'rec_payone', name: 'PAY ONE', expr: '' },
    { id: 'rec_fpan', name: 'FPAN', expr: '' }
  ],
  closingAcc: [
    { id: 'cl_nawaz', name: 'NAWAZ', expr: '' },
    { id: 'cl_bob', name: 'BOB / SLICE', expr: '' },
    { id: 'cl_pay1', name: 'PAY1', expr: '' },
    { id: 'cl_ppb', name: 'PPB + PTMB + GPAYB', expr: '' },
    { id: 'cl_cash', name: 'CASH', expr: '' }
  ],
  totalSale: [
    { id: 'ts_0', name: 'CHARGES', expr: '' },
    { id: 'ts_1', name: 'ONLINE', expr: '' },
    { id: 'ts_2', name: 'XEROX & PRINT', expr: '' },
    { id: 'ts_3', name: 'PHOTO', expr: '' },
    { id: 'ts_4', name: 'LAMINATION', expr: '' },
    { id: 'ts_5', name: 'PAN CARD', expr: '' },
    { id: 'ts_6', name: 'AADHAAR', expr: '' },
    { id: 'ts_7', name: 'AIRTEL+FINO+INDU', expr: '' },
    { id: 'ts_8', name: 'PASSPORT APPLY', expr: '' },
    { id: 'ts_9', name: 'TICKET', expr: '' }
  ],
  gadgetSale: [
    { id: 'gs_0', name: 'BOOKS', expr: '' },
    { id: 'gs_1', name: 'PEN + PENCIL', expr: '' },
    { id: 'gs_2', name: 'PHONE REPAIR', expr: '' },
    { id: 'gs_3', name: 'ACCESSORIES SELL', expr: '' }
  ],
  nawazEarning: [
    { id: 'ne_0', name: 'POLICY', expr: '' },
    { id: 'ne_1', name: 'RETAILER ID SELL', expr: '' },
    { id: 'ne_2', name: 'ITR WORKS', expr: '' }
  ],
  gadgetSalesLog: [],
  salesInvoices: [],
  dues: [],
  debits: [],
  shopExpenses: [],
  lenDen: [],
  homeLoan: []
};

/**
 * Get current date string in IST timezone (YYYY-MM-DD)
 */
function getTodayISTDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/**
 * Map POS inventory categories to Sunshine Ledger's standard Section 3A types
 */
function mapProductCategoryToSunshineType(categoryName, productName = '') {
  const cat = (categoryName || '').toUpperCase();
  const name = (productName || '').toUpperCase();

  if (cat.includes('BOOK') || name.includes('BOOK')) return 'Books';
  if (cat.includes('PEN') || name.includes('PEN') || name.includes('PENCIL')) return 'Pen';
  if (cat.includes('PHONE') && !cat.includes('EARPHONE') && !cat.includes('HEADPHONE')) return 'Phone Sell';
  if (cat.includes('REPAIR') || name.includes('REPAIR') || name.includes('DISPLAY') || name.includes('BATTERY')) return 'Phone Repair';
  return 'Accessories';
}

/**
 * Test connectivity to Sunshine Ledger Supabase backend
 */
async function testSunshineLedgerConnection() {
  const saleDate = getTodayISTDate();
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`
  };

  const ledgerRes = await fetch(`${SUPABASE_URL}/rest/v1/daily_ledgers?date=eq.${saleDate}&select=date,accountant_name,data`, {
    headers
  });

  if (!ledgerRes.ok) {
    throw new Error(`Failed to query daily_ledgers: ${ledgerRes.status} ${ledgerRes.statusText}`);
  }

  const ledgerRows = await ledgerRes.json();
  const exists = ledgerRows.length > 0;
  const currentLedger = exists ? ledgerRows[0] : null;

  let todayGadgetSaleTotal = 0;
  if (currentLedger && currentLedger.data && Array.isArray(currentLedger.data.gadgetSale)) {
    currentLedger.data.gadgetSale.forEach(row => {
      if (row.expr) {
        const parts = String(row.expr).split('+');
        parts.forEach(p => {
          const num = parseFloat(p);
          if (!isNaN(num)) todayGadgetSaleTotal += num;
        });
      }
    });
  }

  const entriesRes = await fetch(`${SUPABASE_URL}/rest/v1/gadget_sales_entries?sale_date=eq.${saleDate}&select=id,product_name,total_sell_amount`, {
    headers
  });
  const entries = entriesRes.ok ? await entriesRes.json() : [];

  return {
    success: true,
    supabase_url: SUPABASE_URL,
    today_date_ist: saleDate,
    ledger_exists_for_today: exists,
    accountant: currentLedger ? currentLedger.accountant_name : 'SUPERADMIN',
    section_3a_today_total: todayGadgetSaleTotal,
    section_3a_items_count: entries.length,
    today_entries: entries
  };
}

/**
 * Sync an Infinatort POS completed sale into Sunshine Ledger Section 3A
 * 
 * @param {Object} payload Sale payload containing invoice_id, items_sold, payment_method, customer, etc.
 */
async function syncSaleToSunshineLedger(payload) {
  if (!payload || !Array.isArray(payload.items_sold) || payload.items_sold.length === 0) {
    throw new Error('Invalid sale payload: items_sold array is required');
  }

  const saleDate = getTodayISTDate();
  const timestampNow = payload.timestamp || new Date().toISOString();
  const invoiceNo = payload.invoice_id || `INF-${Date.now()}`;
  const customerName = (payload.customer && payload.customer.name) || 'Walk-in Customer';
  const customerPhone = (payload.customer && payload.customer.phone) || null;
  const paymentMethod = payload.payment_method || 'Cash Payment';

  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json'
  };

  console.log(`\n======================================================`);
  console.log(`⚡ [SUNSHINE LEDGER SYNC] Syncing Invoice #${invoiceNo} into Section 3A`);
  console.log(`📅 Date: ${saleDate} (IST) | Items: ${payload.items_sold.length} | Total: ₹${payload.total_amount}`);
  console.log(`======================================================`);

  // Idempotency check: If invoiceNo is already recorded in Supabase, return immediately to prevent double-logging
  try {
    const existingCheckRes = await fetch(`${SUPABASE_URL}/rest/v1/gadget_sales_entries?invoice_no=eq.${encodeURIComponent(invoiceNo)}&select=id`, {
      headers
    });
    if (existingCheckRes.ok) {
      const existingEntries = await existingCheckRes.json();
      if (existingEntries && existingEntries.length > 0) {
        console.log(`ℹ️ [Sunshine Ledger Sync] Invoice #${invoiceNo} is already recorded in Supabase. Skipping duplicate sync.`);
        return {
          success: true,
          message: `Recorded sale of ₹${payload.total_amount} into Sunshine Ledger Section 3A & Supabase!`,
          date: saleDate,
          invoice_no: invoiceNo,
          items_count: payload.items_sold.length,
          total_amount: payload.total_amount,
          synced_at: new Date().toISOString()
        };
      }
    }
  } catch (checkErr) {
    console.warn('[Sunshine Ledger Sync] Idempotency check note:', checkErr.message);
  }

  // -------------------------------------------------------------------------
  // STEP 0: ENSURE DISCOUNTED SELLING PRICES ARE APPLIED TO ITEMS
  // If discount was given, ensure item.price & item.total reflect the discounted price
  // e.g. Orig 1900 with 500 discount -> records 1400 in the ledger
  // -------------------------------------------------------------------------
  const discountTotal = Number(payload.discount) || 0;
  const subtotalAmount = Number(payload.subtotal) || payload.items_sold.reduce((sum, it) => sum + (Number(it.price) * (Number(it.qty) || 1)), 0);
  const itemsSum = payload.items_sold.reduce((sum, it) => sum + (Number(it.total) || (Number(it.price) * (Number(it.qty) || 1))), 0);

  if (discountTotal > 0 && subtotalAmount > 0 && Math.abs(itemsSum - Number(payload.total_amount)) > 0.05) {
    let remDisc = discountTotal;
    payload.items_sold.forEach((it, idx) => {
      const origTotal = Number(it.total) || (Number(it.price) * (Number(it.qty) || 1));
      let itDisc = 0;
      if (idx === payload.items_sold.length - 1) {
        itDisc = Number(remDisc.toFixed(2));
      } else {
        itDisc = Number(((origTotal / subtotalAmount) * discountTotal).toFixed(2));
        remDisc -= itDisc;
      }
      itDisc = Math.min(origTotal, Math.max(0, itDisc));
      const discTotal = Math.max(0, Number((origTotal - itDisc).toFixed(2)));
      const qty = Number(it.qty) || 1;
      it.original_price = it.price;
      it.discount = itDisc;
      it.total = discTotal;
      it.price = Number((discTotal / qty).toFixed(2));
    });
  }

  // -------------------------------------------------------------------------
  // STEP 1: PREPARE AND INSERT ROWS INTO gadget_sales_entries TABLE
  // -------------------------------------------------------------------------
  const createdLogItems = [];
  const dbEntries = [];

  payload.items_sold.forEach((item, idx) => {
    const qty = Number(item.qty) || 1;
    const sellPrice = Number(item.price) || 0;
    const buyPrice = Number(item.cost_price) || 0;
    const totalSell = Number(item.total) || (sellPrice * qty);
    const totalBuy = buyPrice * qty;
    const profit = totalSell - totalBuy;
    const unitProfit = sellPrice - buyPrice;
    const productType = mapProductCategoryToSunshineType(item.category, item.name);
    const entryId = `gsl_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`;
    const discountNote = (item.discount && item.discount > 0) ? ` [Disc: -₹${item.discount}, Orig: ₹${item.original_price || (sellPrice + item.discount)}]` : '';

    const logEntry = {
      id: entryId,
      date: saleDate,
      timestamp: timestampNow,
      productName: item.name.trim(),
      productType: productType,
      productCode: item.barcode || 'N/A',
      technicalSpecs: '',
      qty: qty,
      buyPrice: buyPrice,
      sellPrice: sellPrice,
      totalBuy: totalBuy,
      totalSell: totalSell,
      profit: profit,
      marginPct: totalSell > 0 ? ((profit / totalSell) * 100).toFixed(1) : '0.0',
      customerName: customerName,
      customerPhone: customerPhone || '',
      paymentMode: paymentMethod,
      notes: `Infinatort POS Sale [Invoice #${invoiceNo}]${discountNote}`,
      staff: 'Infinatort POS',
      invoiceNo: invoiceNo
    };

    createdLogItems.push(logEntry);

    dbEntries.push({
      id: entryId,
      invoice_no: invoiceNo,
      sale_date: saleDate,
      sale_timestamp: timestampNow,
      product_name: item.name.trim(),
      product_type: productType,
      product_code: item.barcode || null,
      customer_name: customerName,
      customer_phone: customerPhone,
      buy_price: buyPrice,
      sell_price: sellPrice,
      unit_profit: unitProfit,
      quantity: qty,
      total_sell_amount: totalSell,
      total_profit: profit,
      payment_mode: paymentMethod,
      notes: `Infinatort POS Sale [Invoice #${invoiceNo}]${discountNote}`,
      recorded_by: 'Infinatort POS'
    });
  });

  // Direct insert/upsert to gadget_sales_entries table
  try {
    const entriesRes = await fetch(`${SUPABASE_URL}/rest/v1/gadget_sales_entries`, {
      method: 'POST',
      headers: {
        ...headers,
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(dbEntries)
    });

    if (!entriesRes.ok) {
      const errText = await entriesRes.text();
      console.warn(`[Sunshine Ledger Sync] Warning inserting into gadget_sales_entries: ${entriesRes.status} ${errText}`);
    } else {
      console.log(`✓ [Sunshine Ledger Sync] Inserted ${dbEntries.length} items into gadget_sales_entries table.`);
    }
  } catch (err) {
    console.warn(`[Sunshine Ledger Sync] Error writing to gadget_sales_entries:`, err);
  }

  // -------------------------------------------------------------------------
  // STEP 2: FETCH TODAY'S RECORD FROM daily_ledgers (OR INITIALIZE DEFAULT)
  // -------------------------------------------------------------------------
  let ledgerData = null;
  let accountantName = 'Superadmin';

  try {
    const getRes = await fetch(`${SUPABASE_URL}/rest/v1/daily_ledgers?date=eq.${saleDate}&select=*`, {
      headers
    });

    if (getRes.ok) {
      const rows = await getRes.json();
      if (rows && rows.length > 0) {
        const row = rows[0];
        accountantName = row.accountant_name || row.accountant_id || 'Superadmin';
        ledgerData = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      }
    }
  } catch (err) {
    console.warn(`[Sunshine Ledger Sync] Note fetching today's daily_ledgers:`, err);
  }

  // Fallback to template if today's ledger was not yet started
  if (!ledgerData) {
    ledgerData = JSON.parse(JSON.stringify(CLEAN_DEFAULT_LEDGER));
    ledgerData.accountantName = accountantName;
  }

  // Ensure necessary arrays exist in ledgerData
  if (!Array.isArray(ledgerData.gadgetSale)) {
    ledgerData.gadgetSale = JSON.parse(JSON.stringify(CLEAN_DEFAULT_LEDGER.gadgetSale));
  }
  if (!Array.isArray(ledgerData.gadgetSalesLog)) {
    ledgerData.gadgetSalesLog = [];
  }
  if (!Array.isArray(ledgerData.salesInvoices)) {
    ledgerData.salesInvoices = [];
  }

  // -------------------------------------------------------------------------
  // STEP 3: UPDATE SECTION 3A DAILY SHEET TABLE (gadgetSale)
  // -------------------------------------------------------------------------
  // Follows Sunshine Ledger's exact matching rules:
  // Try exact uppercase name match -> otherwise fallback to category bucket:
  // 'BOOKS', 'PEN + PENCIL', 'PHONE REPAIR', or 'ACCESSORIES SELL'
  payload.items_sold.forEach(item => {
    const pNameUpper = item.name.trim().toUpperCase();
    const itemSell = Number(item.total) || (Number(item.price) * Number(item.qty));
    const pType = mapProductCategoryToSunshineType(item.category, item.name);

    let existingRow = ledgerData.gadgetSale.find(r => 
      (r.name || '').trim().toUpperCase() === pNameUpper
    );

    if (!existingRow) {
      if (pType === 'Books') existingRow = ledgerData.gadgetSale.find(r => r.name === 'BOOKS');
      else if (pType === 'Pen') existingRow = ledgerData.gadgetSale.find(r => r.name === 'PEN + PENCIL');
      else if (pType === 'Phone Repair') existingRow = ledgerData.gadgetSale.find(r => r.name === 'PHONE REPAIR');
      else existingRow = ledgerData.gadgetSale.find(r => r.name === 'ACCESSORIES SELL');
    }

    if (existingRow) {
      existingRow.expr = existingRow.expr ? `${existingRow.expr}+${itemSell}` : String(itemSell);
      console.log(`✓ [Sunshine Ledger Sync] Appended +₹${itemSell} to Section 3A row [${existingRow.name}] -> new expr: ${existingRow.expr}`);
    } else {
      const newRow = {
        id: 'gs_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        name: pNameUpper,
        expr: String(itemSell)
      };
      ledgerData.gadgetSale.push(newRow);
      console.log(`✓ [Sunshine Ledger Sync] Created new Section 3A row [${newRow.name}] with ₹${newRow.expr}`);
    }
  });

  // -------------------------------------------------------------------------
  // STEP 4: APPEND DETAILED LOGS TO gadgetSalesLog & salesInvoices
  // -------------------------------------------------------------------------
  createdLogItems.forEach(log => {
    ledgerData.gadgetSalesLog.push(log);
  });

  // Create Invoice record in Sunshine Ledger
  const invoiceObj = {
    id: 'inv_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    invoiceNo: invoiceNo,
    date: saleDate,
    formattedDate: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    customerName: customerName,
    customerPhone: customerPhone || '',
    placeOfSupply: 'Sonapur Hat, Chopra (West Bengal)',
    paymentMode: paymentMethod,
    paymentStatus: 'PAID',
    items: payload.items_sold.map(it => ({
      name: it.name.trim(),
      type: mapProductCategoryToSunshineType(it.category, it.name),
      code: it.barcode || '',
      specs: '',
      qty: Number(it.qty) || 1,
      rate: Number(it.price) || 0,
      amount: Number(it.total) || (Number(it.price) * Number(it.qty))
    })),
    subtotal: payload.subtotal || payload.total_amount,
    discount: payload.discount || 0,
    total: payload.total_amount,
    amountPaid: payload.total_amount,
    balanceDue: 0,
    staff: 'Infinatort POS',
    createdAt: timestampNow
  };
  ledgerData.salesInvoices.push(invoiceObj);

  // -------------------------------------------------------------------------
  // STEP 5: SAVE UPDATED LEDGER DOCUMENT BACK TO Supabase daily_ledgers
  // -------------------------------------------------------------------------
  const upsertBody = [{
    date: saleDate,
    data: ledgerData,
    accountant_name: accountantName,
    accountant_id: 'admin',
    updated_at: new Date().toISOString()
  }];

  const saveRes = await fetch(`${SUPABASE_URL}/rest/v1/daily_ledgers`, {
    method: 'POST',
    headers: {
      ...headers,
      'Prefer': 'resolution=merge-duplicates'
    },
    body: JSON.stringify(upsertBody)
  });

  if (!saveRes.ok) {
    const errText = await saveRes.text();
    throw new Error(`Failed to update daily_ledgers in Supabase: ${saveRes.status} ${errText}`);
  }

  console.log(`🎉 [SUNSHINE LEDGER SYNC COMPLETE] Successfully updated daily_ledgers for ${saleDate}!`);

  return {
    success: true,
    message: `Recorded sale of ₹${payload.total_amount} into Sunshine Ledger Section 3A & Supabase!`,
    date: saleDate,
    invoice_no: invoiceNo,
    items_count: dbEntries.length,
    total_amount: payload.total_amount,
    synced_at: new Date().toISOString()
  };
}

module.exports = {
  syncSaleToSunshineLedger,
  testSunshineLedgerConnection,
  getTodayISTDate,
  mapProductCategoryToSunshineType
};
