const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const dataDir = isServerless ? '/tmp/data' : path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'store.db');

// In serverless/Vercel, copy seed database from bundle if /tmp/data/store.db is empty
if (isServerless && !fs.existsSync(dbPath)) {
  const seedDb = path.join(__dirname, 'data', 'store.db');
  if (fs.existsSync(seedDb)) {
    try {
      fs.copyFileSync(seedDb, dbPath);
    } catch (e) {
      console.warn('[Database] Seed DB copy warning:', e.message);
    }
  }
}

const db = new Database(dbPath);

// Enable WAL mode & foreign keys for high performance and integrity
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 1. Initialize Tables
function initDatabase() {
  db.exec(`
    -- Products table (Antigravity Inventory)
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      barcode TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      price REAL NOT NULL,
      cost_price REAL DEFAULT 0,
      stock_count INTEGER NOT NULL DEFAULT 0,
      low_stock_threshold INTEGER DEFAULT 5,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);

    -- Sales table (Infinatort Invoices)
    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id TEXT UNIQUE NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      subtotal REAL NOT NULL,
      discount REAL DEFAULT 0,
      tax REAL DEFAULT 0,
      total_amount REAL NOT NULL,
      payment_method TEXT NOT NULL, -- 'Cash', 'UPI', 'Card'
      customer_name TEXT,
      customer_phone TEXT,
      ledger_synced INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_sales_invoice ON sales(invoice_id);

    -- Sale Items (Detailed breakdown for ledger & receipts)
    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id),
      barcode TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT,
      price REAL NOT NULL,
      cost_price REAL DEFAULT 0,
      quantity INTEGER NOT NULL,
      total REAL NOT NULL
    );

    -- Ledger Webhook Audit Logs
    CREATE TABLE IF NOT EXISTS ledger_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      endpoint_url TEXT NOT NULL,
      status_code INTEGER,
      success INTEGER NOT NULL,
      payload TEXT NOT NULL,
      response_text TEXT
    );

    -- Customers table (Synced from Sunshine regular_clients)
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supabase_id INTEGER UNIQUE,
      name TEXT NOT NULL,
      phone TEXT,
      bank TEXT,
      account_digits TEXT,
      service_type TEXT,
      agent TEXT,
      last_visited TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
    CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);

    -- System Configuration Key-Value Store
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Default Settings
  const insertSetting = db.prepare(`
    INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)
  `);
  insertSetting.run('ledger_webhook_url', '/api/ledger/sync-sunshine-gadgets');
  insertSetting.run('shop_name', 'Sunshine Store');
  insertSetting.run('currency_symbol', '₹');
  insertSetting.run('tax_rate', '0');

  // If already initialized with mock-receiver, upgrade to Sunshine Ledger sync endpoint
  db.prepare(`
    UPDATE settings 
    SET value = '/api/ledger/sync-sunshine-gadgets' 
    WHERE key = 'ledger_webhook_url' AND (value LIKE '%mock-receiver%' OR value = '')
  `).run();

  // Seed sample products across required categories if empty
  const count = db.prepare('SELECT count(*) as count FROM products').get().count;
  if (count === 0) {
    seedProducts();
  }
}

function seedProducts() {
  const insert = db.prepare(`
    INSERT INTO products (barcode, name, category, price, cost_price, stock_count, low_stock_threshold, description)
    VALUES (@barcode, @name, @category, @price, @cost_price, @stock_count, @low_stock_threshold, @description)
  `);

  const initialProducts = [
    // Accessories
    { barcode: '8901001001', name: 'Anker 65W GaN Fast Charger', category: 'Accessories', price: 2499, cost_price: 1800, stock_count: 25, low_stock_threshold: 5, description: 'High-speed compact GaN multi-port wall charger' },
    { barcode: '8901001002', name: 'Braided Type-C Fast Charging Cable 2m', category: 'Accessories', price: 399, cost_price: 150, stock_count: 50, low_stock_threshold: 10, description: 'Durable nylon braided 60W cable' },
    { barcode: '8901001003', name: 'Tempered Glass 9H Screen Protector', category: 'Accessories', price: 199, cost_price: 45, stock_count: 60, low_stock_threshold: 15, description: 'Anti-scratch 9H tempered glass' },

    // Books
    { barcode: '8902002001', name: 'Atomic Habits - James Clear', category: 'Books', price: 499, cost_price: 280, stock_count: 20, low_stock_threshold: 4, description: 'Tiny changes, remarkable results hardcover' },
    { barcode: '8902002002', name: 'The Psychology of Money - Morgan Housel', category: 'Books', price: 399, cost_price: 210, stock_count: 18, low_stock_threshold: 4, description: 'Timeless lessons on wealth and greed' },
    { barcode: '8902002003', name: 'Deep Work - Cal Newport', category: 'Books', price: 450, cost_price: 250, stock_count: 12, low_stock_threshold: 3, description: 'Rules for focused success in a distracted world' },

    // Pens
    { barcode: '8903003001', name: 'Parker Vector Matte Black Fountain Pen', category: 'Pens', price: 550, cost_price: 320, stock_count: 30, low_stock_threshold: 5, description: 'Classic fine stainless steel nib fountain pen' },
    { barcode: '8903003002', name: 'Pilot G2 0.7mm Gel Pens (Pack of 3)', category: 'Pens', price: 270, cost_price: 140, stock_count: 40, low_stock_threshold: 10, description: 'Super smooth quick-drying gel ink pens' },

    // Gadgets
    { barcode: '8904004001', name: 'Tile Mate Bluetooth Item Tracker', category: 'Gadgets', price: 1899, cost_price: 1200, stock_count: 15, low_stock_threshold: 3, description: 'Smart key and bag finder with replaceable battery' },
    { barcode: '8904004002', name: 'Portronics 4-Port High Speed USB 3.0 Hub', category: 'Gadgets', price: 599, cost_price: 350, stock_count: 22, low_stock_threshold: 5, description: 'Super-speed 5Gbps multi-port splitter' },

    // Smartwatches
    { barcode: '8905005001', name: 'Noise ColorFit Pulse 3 Smartwatch', category: 'Smartwatches', price: 1999, cost_price: 1250, stock_count: 16, low_stock_threshold: 4, description: '1.96-inch TFT display, Bluetooth calling' },
    { barcode: '8905005002', name: 'Fire-Boltt Ninja Call Pro Plus', category: 'Smartwatches', price: 1499, cost_price: 900, stock_count: 14, low_stock_threshold: 4, description: '1.83-inch HD screen, AI voice assistant' },

    // Phones
    { barcode: '8906006001', name: 'Samsung Galaxy M14 5G (128GB)', category: 'Phones', price: 12499, cost_price: 10500, stock_count: 8, low_stock_threshold: 2, description: '6000mAh Battery, 50MP triple camera' },
    { barcode: '8906006002', name: 'Redmi 13C 5G (128GB Starshine Green)', category: 'Phones', price: 9999, cost_price: 8400, stock_count: 10, low_stock_threshold: 2, description: 'Dimensity 6100+ 5G, 90Hz display' },

    // Earphones
    { barcode: '8907007001', name: 'Sony MDR-EX155AP In-Ear Wired Earphones', category: 'Earphones', price: 899, cost_price: 520, stock_count: 28, low_stock_threshold: 6, description: '9mm neodymium drivers with inline mic' },
    { barcode: '8907007002', name: 'JBL C100SI Wired Earphones with Mic', category: 'Earphones', price: 599, cost_price: 320, stock_count: 35, low_stock_threshold: 8, description: 'Signature JBL Pure Bass sound' },

    // Earpods
    { barcode: '8908008001', name: 'Apple EarPods with USB-C Connector', category: 'Earpods', price: 1900, cost_price: 1550, stock_count: 12, low_stock_threshold: 3, description: 'Original Apple wired EarPods for modern iPhone/iPad' },
    { barcode: '8908008002', name: 'Apple EarPods with Lightning Connector', category: 'Earpods', price: 1900, cost_price: 1550, stock_count: 10, low_stock_threshold: 3, description: 'Original Apple lightning wired EarPods' },

    // Earbuds
    { barcode: '8909009001', name: 'boAt Airdopes 141 TWS Earbuds', category: 'Earbuds', price: 1299, cost_price: 780, stock_count: 30, low_stock_threshold: 6, description: '42H playtime, ENx tech, IPX4 water resistance' },
    { barcode: '8909009002', name: 'OnePlus Nord Buds 2r True Wireless', category: 'Earbuds', price: 1999, cost_price: 1390, stock_count: 20, low_stock_threshold: 5, description: '12.4mm driver, Dual Mic AI noise cancellation' },

    // Neckbands
    { barcode: '8910010001', name: 'boAt Rockerz 255 Pro+ Wireless Neckband', category: 'Neckbands', price: 1499, cost_price: 880, stock_count: 25, low_stock_threshold: 5, description: 'ASAP charge, 40 hours playtime, IPX7' },
    { barcode: '8910010002', name: 'OnePlus Bullets Wireless Z2', category: 'Neckbands', price: 1999, cost_price: 1350, stock_count: 18, low_stock_threshold: 4, description: 'Bombastic bass, 30H battery life, fast charging' }
  ];

  const seedTx = db.transaction((items) => {
    for (const item of items) {
      insert.run(item);
    }
  });

  seedTx(initialProducts);
  console.log(`[Database] Seeded ${initialProducts.length} default products across all categories.`);
}

initDatabase();

module.exports = db;
