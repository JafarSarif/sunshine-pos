const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const db = require('./database');
const sunshineLedger = require('./sunshine-ledger-sync');
const cloudInventory = require('./cloud-inventory');
const customerSync = require('./customer-sync');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Serve static frontend assets
app.use(express.static(path.join(__dirname, 'public')));

// In-memory mock ledger storage for live inspection
const mockLedgerLogs = [];

// ==========================================
// 1. PRODUCTS & INVENTORY (Antigravity API)
// ==========================================

// Get all products with optional filters
app.get('/api/products', (req, res) => {
  try {
    const { q, category, low_stock } = req.query;
    let query = 'SELECT * FROM products WHERE 1=1';
    const params = [];

    if (q) {
      query += ' AND (name LIKE ? OR barcode LIKE ? OR category LIKE ?)';
      const term = `%${q.trim()}%`;
      params.push(term, term, term);
    }

    if (category && category !== 'All') {
      query += ' AND category = ?';
      params.push(category);
    }

    if (low_stock === 'true') {
      query += ' AND stock_count <= low_stock_threshold';
    }

    query += ' ORDER BY id DESC';

    const products = db.prepare(query).all(...params);
    res.json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: error.message });
  }
});

// Cloud Synchronization Endpoints (Supabase Cloud)
app.post('/api/products/cloud-sync', async (req, res) => {
  try {
    const result = await cloudInventory.syncInventory();
    res.json(result);
  } catch (err) {
    console.error('Cloud sync error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/products/cloud-status', (req, res) => {
  try {
    const status = cloudInventory.getCloudSyncStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Lookup product by Barcode (Crucial for Infinatort Scanner)
app.get('/api/products/:barcode', (req, res) => {
  try {
    const barcode = req.params.barcode.trim();
    const product = db.prepare('SELECT * FROM products WHERE barcode = ?').get(barcode);

    if (!product) {
      return res.status(404).json({ error: `Product with barcode '${barcode}' not found.` });
    }

    res.json(product);
  } catch (error) {
    console.error('Error searching barcode:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add new product
app.post('/api/products', (req, res) => {
  try {
    const {
      barcode,
      name,
      category,
      price,
      cost_price = 0,
      stock_count = 0,
      low_stock_threshold = 5,
      description = ''
    } = req.body;

    if (!barcode || !name || !category || price === undefined) {
      return res.status(400).json({ error: 'Barcode, Name, Category, and Price are required.' });
    }

    const stmt = db.prepare(`
      INSERT INTO products (barcode, name, category, price, cost_price, stock_count, low_stock_threshold, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      barcode.trim(),
      name.trim(),
      category.trim(),
      Number(price),
      Number(cost_price),
      Number(stock_count),
      Number(low_stock_threshold),
      description.trim()
    );

    const newProduct = db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid);
    
    // Asynchronously push new product to Supabase Cloud
    cloudInventory.pushProductChange(newProduct)
      .catch(err => console.warn('[Cloud Inventory] Cloud push warning:', err.message));

    res.status(201).json(newProduct);
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'A product with this barcode already exists.' });
    }
    console.error('Error creating product:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update product
app.put('/api/products/:id', (req, res) => {
  try {
    const id = req.params.id;
    const {
      barcode,
      name,
      category,
      price,
      cost_price,
      stock_count,
      low_stock_threshold,
      description
    } = req.body;

    const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    const stmt = db.prepare(`
      UPDATE products SET
        barcode = COALESCE(?, barcode),
        name = COALESCE(?, name),
        category = COALESCE(?, category),
        price = COALESCE(?, price),
        cost_price = COALESCE(?, cost_price),
        stock_count = COALESCE(?, stock_count),
        low_stock_threshold = COALESCE(?, low_stock_threshold),
        description = COALESCE(?, description),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    stmt.run(
      barcode ? barcode.trim() : null,
      name ? name.trim() : null,
      category ? category.trim() : null,
      price !== undefined ? Number(price) : null,
      cost_price !== undefined ? Number(cost_price) : null,
      stock_count !== undefined ? Number(stock_count) : null,
      low_stock_threshold !== undefined ? Number(low_stock_threshold) : null,
      description !== undefined ? description.trim() : null,
      id
    );

    const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(id);

    // Asynchronously push update to Supabase Cloud
    cloudInventory.pushProductChange(updated)
      .catch(err => console.warn('[Cloud Inventory] Cloud update warning:', err.message));

    res.json(updated);
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete product
app.delete('/api/products/:id', (req, res) => {
  try {
    const id = req.params.id;
    const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    const result = db.prepare('DELETE FROM products WHERE id = ?').run(id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    // Asynchronously push delete to Supabase Cloud
    cloudInventory.pushProductDelete(existing.barcode)
      .catch(err => console.warn('[Cloud Inventory] Cloud delete warning:', err.message));

    res.json({ success: true, message: 'Product deleted.' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get Categories List
app.get('/api/categories', (req, res) => {
  try {
    const defaultCategories = [
      'Accessories', 'Books', 'Pens', 'Gadgets',
      'Smartwatches', 'Phones', 'Earphones',
      'Earpods', 'Earbuds', 'Neckbands'
    ];
    const rows = db.prepare('SELECT DISTINCT category FROM products').all();
    const categoriesFromDb = rows.map(r => r.category);
    const combined = Array.from(new Set([...defaultCategories, ...categoriesFromDb]));
    res.json(combined);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 2. POS & BILLING API (Infinatort API)
// ==========================================

// Create Sale / Complete Transaction (Atomic Checkout)
app.post('/api/sales', async (req, res) => {
  const {
    items = [],
    payment_method = 'Cash',
    customer_name = 'Walk-in Customer',
    customer_phone = '',
    discount = 0,
    tax = 0
  } = req.body;

  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'Cart is empty. Please add items.' });
  }

  // Generate unique invoice number: INF-YYYYMMDD-XXXX
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const invoice_id = `INF-${today}-${randomSuffix}`;

  // Execute in an atomic SQLite transaction
  const checkoutTransaction = db.transaction(() => {
    // 1. Calculate subtotal and verify stock
    let subtotal = 0;
    const verifiedItems = [];

    for (const item of items) {
      const product = db.prepare('SELECT * FROM products WHERE barcode = ? OR id = ?').get(item.barcode, item.id || 0);

      if (!product) {
        throw new Error(`Product not found: ${item.name || item.barcode}`);
      }

      if (product.stock_count < item.quantity) {
        throw new Error(`Insufficient stock for "${product.name}". Available: ${product.stock_count}, Requested: ${item.quantity}`);
      }

      const itemTotal = Number(product.price) * Number(item.quantity);
      subtotal += itemTotal;

      verifiedItems.push({
        product_id: product.id,
        barcode: product.barcode,
        name: product.name,
        category: product.category,
        price: product.price,
        cost_price: product.cost_price || 0,
        quantity: item.quantity,
        total: itemTotal
      });
    }

    const finalSubtotal = Number(subtotal.toFixed(2));
    const finalDiscount = Number(discount) || 0;
    const finalTax = Number(tax) || 0;
    const total_amount = Number((finalSubtotal - finalDiscount + finalTax).toFixed(2));
    const nowIso = new Date().toISOString();

    // Distribute discount proportionally across items so that each item's selling price in the ledger reflects the discount
    let remainingDiscount = finalDiscount;
    const discountedItems = verifiedItems.map((vItem, index) => {
      let itemDiscount = 0;
      if (finalDiscount > 0 && finalSubtotal > 0) {
        if (index === verifiedItems.length - 1) {
          // Last item gets any leftover remainder to avoid 1-paisa rounding discrepancies
          itemDiscount = Number(remainingDiscount.toFixed(2));
        } else {
          itemDiscount = Number(((vItem.total / finalSubtotal) * finalDiscount).toFixed(2));
          remainingDiscount -= itemDiscount;
        }
      }

      // Ensure discount doesn't exceed item total
      itemDiscount = Math.min(vItem.total, Math.max(0, itemDiscount));
      const discountedTotal = Math.max(0, Number((vItem.total - itemDiscount).toFixed(2)));
      const discountedUnitPrice = vItem.quantity > 0 ? Number((discountedTotal / vItem.quantity).toFixed(2)) : 0;

      return {
        ...vItem,
        original_price: vItem.price,
        original_total: vItem.total,
        item_discount: itemDiscount,
        price: discountedUnitPrice, // discounted selling price (e.g. 1900 -> 1400)
        total: discountedTotal       // discounted total amount (e.g. 1900 -> 1400)
      };
    });

    // 2. Insert into sales
    const insertSale = db.prepare(`
      INSERT INTO sales (invoice_id, timestamp, subtotal, discount, tax, total_amount, payment_method, customer_name, customer_phone, ledger_synced)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `);

    const saleResult = insertSale.run(
      invoice_id,
      nowIso,
      finalSubtotal,
      finalDiscount,
      finalTax,
      total_amount,
      payment_method,
      customer_name,
      customer_phone
    );

    const saleId = saleResult.lastInsertRowid;

    // 3. Insert sale items & deduct stock (recording discounted price & total)
    const insertItem = db.prepare(`
      INSERT INTO sale_items (sale_id, product_id, barcode, name, category, price, cost_price, quantity, total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const updateStock = db.prepare(`
      UPDATE products SET stock_count = stock_count - ? WHERE id = ?
    `);

    for (const dItem of discountedItems) {
      insertItem.run(
        saleId,
        dItem.product_id,
        dItem.barcode,
        dItem.name,
        dItem.category,
        dItem.price, // discounted selling price
        dItem.cost_price,
        dItem.quantity,
        dItem.total  // discounted total
      );

      updateStock.run(dItem.quantity, dItem.product_id);
    }

    // Build the exact payload required for external ledger integration (carrying discounted prices)
    const ledgerPayload = {
      timestamp: nowIso,
      invoice_id: invoice_id,
      total_amount: total_amount,
      subtotal: finalSubtotal,
      discount: finalDiscount,
      tax: finalTax,
      payment_method: payment_method,
      items_sold: discountedItems.map(it => ({
        id: it.product_id,
        barcode: it.barcode,
        name: it.name,
        category: it.category,
        qty: it.quantity,
        price: it.price,             // discounted selling price (e.g. 1400)
        original_price: it.original_price, // pre-discount price (e.g. 1900)
        discount: it.item_discount,  // item discount (e.g. 500)
        cost_price: it.cost_price || 0,
        total: it.total              // discounted total amount (e.g. 1400)
      })),
      customer: {
        name: customer_name,
        phone: customer_phone
      }
    };

    return {
      sale_id: saleId,
      invoice_id,
      total_amount,
      payment_method,
      timestamp: nowIso,
      items_count: verifiedItems.length,
      ledgerPayload
    };
  });

  try {
    const saleInfo = checkoutTransaction();

    // Automatically synchronize sale with Sunshine Ledger Section 3A (Supabase)
    let sunshineSync = null;
    try {
      sunshineSync = await sunshineLedger.syncSaleToSunshineLedger(saleInfo.ledgerPayload);
      db.prepare('UPDATE sales SET ledger_synced = 1 WHERE id = ?').run(saleInfo.sale_id);
      db.prepare(`
        INSERT INTO ledger_logs (invoice_id, endpoint_url, status_code, success, payload, response_text)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        saleInfo.invoice_id,
        'https://soooxprxcmuxzcxyxvus.supabase.co/rest/v1/daily_ledgers',
        200,
        1,
        JSON.stringify(saleInfo.ledgerPayload),
        JSON.stringify(sunshineSync)
      );
    } catch (syncErr) {
      console.warn('[Sunshine Ledger Auto-Sync Warning]:', syncErr.message);
      db.prepare(`
        INSERT INTO ledger_logs (invoice_id, endpoint_url, status_code, success, payload, response_text)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        saleInfo.invoice_id,
        'https://soooxprxcmuxzcxyxvus.supabase.co/rest/v1/daily_ledgers',
        500,
        0,
        JSON.stringify(saleInfo.ledgerPayload),
        syncErr.message
      );
    }

    // Sync updated product stock counts to Supabase Cloud asynchronously
    const allProducts = db.prepare('SELECT * FROM products ORDER BY id ASC').all();
    cloudInventory.uploadAllToCloudDocument(allProducts)
      .catch(err => console.warn('[Cloud Stock Sync Warning]:', err.message));

    // Record customer in local SQLite & Supabase regular_clients
    if (customer_name && customer_name !== 'Walk-in Customer') {
      customerSync.recordCustomerFromSale(customer_name, customer_phone)
        .catch(err => console.warn('[Customer Sync Warning]:', err.message));
    }

    res.status(201).json({
      success: true,
      message: 'Sale completed successfully and inventory updated.',
      sale: saleInfo,
      sunshine_sync: sunshineSync
    });
  } catch (error) {
    console.error('Checkout error:', error);
    res.status(400).json({ error: error.message });
  }
});

// List Sales
app.get('/api/sales', (req, res) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const sales = db.prepare('SELECT * FROM sales ORDER BY id DESC LIMIT ?').all(limit);
    res.json(sales);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Sale details by Invoice or ID
app.get('/api/sales/:invoiceId', (req, res) => {
  try {
    const invoiceId = req.params.invoiceId;
    const sale = db.prepare('SELECT * FROM sales WHERE invoice_id = ? OR id = ?').get(invoiceId, invoiceId);

    if (!sale) {
      return res.status(404).json({ error: 'Sale record not found.' });
    }

    const items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(sale.id);
    res.json({ ...sale, items });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Dashboard Analytics / Metrics
app.get('/api/dashboard/stats', (req, res) => {
  try {
    const totalProducts = db.prepare('SELECT count(*) as count FROM products').get().count;
    const lowStockCount = db.prepare('SELECT count(*) as count FROM products WHERE stock_count <= low_stock_threshold').get().count;
    const totalStock = db.prepare('SELECT SUM(stock_count) as total FROM products').get().total || 0;
    const totalInventoryValue = db.prepare('SELECT SUM(price * stock_count) as total FROM products').get().total || 0;

    const todayStr = new Date().toISOString().slice(0, 10);
    const todaySales = db.prepare('SELECT count(*) as count, SUM(total_amount) as revenue FROM sales WHERE date(timestamp) = date(?)').get(todayStr);

    res.json({
      totalProducts,
      lowStockCount,
      totalStock,
      totalInventoryValue: Number(totalInventoryValue.toFixed(2)),
      todaySalesCount: todaySales.count || 0,
      todayRevenue: Number((todaySales.revenue || 0).toFixed(2))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 3. EXTERNAL LEDGER & WEBHOOK INTEGRATION
// ==========================================

// Built-in Mock Ledger Receiver for testing external integration
app.post('/api/ledger/mock-receiver', (req, res) => {
  const payload = req.body;
  const entry = {
    received_at: new Date().toISOString(),
    payload: payload,
    headers: req.headers
  };
  mockLedgerLogs.unshift(entry);
  if (mockLedgerLogs.length > 50) mockLedgerLogs.pop();

  console.log('\n======================================================');
  console.log('📬 [EXTERNAL LEDGER MOCK WEBHOOK RECEIVED]');
  console.log(`Invoice: ${payload.invoice_id} | Total: ₹${payload.total_amount} | Method: ${payload.payment_method}`);
  console.log(`Items Sold: ${payload.items_sold ? payload.items_sold.length : 0}`);
  console.log('Payload Data:', JSON.stringify(payload, null, 2));
  console.log('======================================================\n');

  res.status(200).json({
    status: 'success',
    message: 'Sale successfully recorded in the daily transaction ledger portal.',
    invoice_id: payload.invoice_id,
    logged_at: entry.received_at
  });
});

// Inspect mock ledger logs
app.get('/api/ledger/mock-receiver/logs', (req, res) => {
  res.json({
    total_received: mockLedgerLogs.length,
    recent_transactions: mockLedgerLogs
  });
});

// Server-side fallback proxy for ledger webhook (prevents browser CORS block if external portal lacks CORS headers)
app.post('/api/ledger/forward', async (req, res) => {
  try {
    const { endpoint_url, payload } = req.body;
    if (!endpoint_url || !payload) {
      return res.status(400).json({ error: 'endpoint_url and payload are required' });
    }

    const response = await fetch(endpoint_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Infinatort-POS-Webhook/1.0'
      },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = responseText;
    }

    // Log the sync attempt
    db.prepare(`
      INSERT INTO ledger_logs (invoice_id, endpoint_url, status_code, success, payload, response_text)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      payload.invoice_id || 'UNKNOWN',
      endpoint_url,
      response.status,
      response.ok ? 1 : 0,
      JSON.stringify(payload),
      responseText
    );

    if (response.ok && payload.invoice_id) {
      db.prepare('UPDATE sales SET ledger_synced = 1 WHERE invoice_id = ?').run(payload.invoice_id);
    }

    res.status(response.status).json({
      success: response.ok,
      status: response.status,
      data: responseData
    });
  } catch (error) {
    console.error('Ledger forward error:', error);
    res.status(502).json({
      success: false,
      error: `Failed to reach external ledger endpoint: ${error.message}`
    });
  }
});

// Dedicated Sunshine Ledger Portal Integration Endpoint (Section 3A Gadget Sales & Repairs)
app.post('/api/ledger/sync-sunshine-gadgets', async (req, res) => {
  try {
    const payload = req.body.payload || req.body;
    if (!payload || !payload.items_sold) {
      return res.status(400).json({ error: 'Invalid sale payload. items_sold is required.' });
    }

    const result = await sunshineLedger.syncSaleToSunshineLedger(payload);

    if (payload.invoice_id) {
      db.prepare('UPDATE sales SET ledger_synced = 1 WHERE invoice_id = ?').run(payload.invoice_id);
      db.prepare(`
        INSERT INTO ledger_logs (invoice_id, endpoint_url, status_code, success, payload, response_text)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        payload.invoice_id,
        'https://soooxprxcmuxzcxyxvus.supabase.co/rest/v1/daily_ledgers',
        200,
        1,
        JSON.stringify(payload),
        JSON.stringify(result)
      );
    }

    res.status(200).json(result);
  } catch (error) {
    console.error('Sunshine Ledger sync error:', error);
    res.status(500).json({
      success: false,
      error: `Failed to sync to Sunshine Ledger: ${error.message}`
    });
  }
});

// Test connection and get today's Section 3A status
app.get('/api/ledger/sunshine-status', async (req, res) => {
  try {
    const status = await sunshineLedger.testSunshineLedgerConnection();
    res.json(status);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Sunshine Ledger connection error: ${error.message}`
    });
  }
});

// Settings Management
app.get('/api/settings', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM settings').all();
    const settings = {};
    rows.forEach(r => settings[r.key] = r.value);
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/settings', (req, res) => {
  try {
    const updates = req.body;
    const upsert = db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);

    const tx = db.transaction(() => {
      for (const [k, v] of Object.entries(updates)) {
        upsert.run(k, String(v));
      }
    });

    tx();
    res.json({ success: true, message: 'Settings updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 4. SUNSHINE SAVED CUSTOMERS & DIRECTORY
// ==========================================

// Search or list customers synced from Sunshine regular_clients
app.get('/api/customers', (req, res) => {
  try {
    const q = req.query.q || '';
    const limit = Number(req.query.limit) || 40;
    const customers = customerSync.searchCustomers(q, limit);
    res.json({
      success: true,
      count: customers.length,
      customers: customers
    });
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ error: error.message });
  }
});

// Trigger on-demand sync from Supabase regular_clients
app.post('/api/customers/sync', async (req, res) => {
  try {
    const result = await customerSync.syncFromSupabase();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start Server (only when run directly via node, not when imported by Vercel serverless)
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n========================================================`);
    console.log(`🚀 Sunshine POS & Inventory Server Running`);
    console.log(`📡 Local URL:   http://localhost:${PORT}`);
    console.log(`📱 Mobile URL:  http://<YOUR-WIFI-IP>:${PORT}`);
    console.log(`📦 Database:    SQLite connected via WAL mode`);
    console.log(`☁️  Cloud Sync:  Supabase Cloud Inventory Connected`);
    console.log(`👥 Customers:   Supabase regular_clients Directory Connected`);
    console.log(`========================================================\n`);

    // Initial cloud inventory sync on server startup
    cloudInventory.syncInventory()
      .then(r => console.log(`[Startup] Cloud Inventory synced: ${r.total_products} products ready across all devices.`))
      .catch(e => console.warn('[Startup] Cloud Inventory sync warning:', e.message));

    // Initial customer directory sync on server startup
    customerSync.syncFromSupabase()
      .then(r => console.log(`[Startup] Customer Directory synced: ${r.total || r.count || 0} Sunshine clients loaded.`))
      .catch(e => console.warn('[Startup] Customer Directory sync warning:', e.message));

    // Periodic customer refresh every 5 minutes
    setInterval(() => {
      customerSync.syncFromSupabase().catch(() => {});
    }, 5 * 60 * 1000);
  });
}

// Export Express app for Vercel Serverless Functions
module.exports = app;
