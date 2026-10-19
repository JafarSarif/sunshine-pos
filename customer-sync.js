/**
 * customer-sync.js
 * 
 * Sunshine Customer Directory & Supabase Regular Clients Synchronization
 * Connects directly to Supabase table `regular_clients` to provide
 * instant search by Name or Mobile number during billing / checkout.
 */

const db = require('./database');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://soooxprxcmuxzcxyxvus.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_t03kGTVyCJuO75tGm7FR_w__ye7dbkr';

function getHeaders() {
  return {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json'
  };
}

class CustomerSyncService {
  constructor() {
    this.isSyncing = false;
    this.lastSync = null;
    this.totalClients = 0;
  }

  /**
   * Sync all regular clients from Supabase into local SQLite database.
   */
  async syncFromSupabase() {
    if (this.isSyncing) return { status: 'already_syncing', count: this.totalClients };
    this.isSyncing = true;

    try {
      console.log('[Customer Sync] Fetching regular_clients from Supabase...');
      const res = await fetch(`${SUPABASE_URL}/rest/v1/regular_clients?select=*&order=last_visited.desc.nullslast,name.asc`, {
        headers: getHeaders()
      });

      if (!res.ok) {
        throw new Error(`Supabase regular_clients returned HTTP ${res.status}`);
      }

      const clients = await res.json();
      if (!Array.isArray(clients)) {
        throw new Error('Invalid response payload from Supabase');
      }

      console.log(`[Customer Sync] Received ${clients.length} clients from Supabase. Upserting into local database...`);

      // Ensure clean schema without phone uniqueness constraint
      db.exec(`
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
      `);

      const upsertStmt = db.prepare(`
        INSERT INTO customers (supabase_id, name, phone, bank, account_digits, service_type, agent, last_visited, updated_at)
        VALUES (@supabase_id, @name, @phone, @bank, @account_digits, @service_type, @agent, @last_visited, CURRENT_TIMESTAMP)
        ON CONFLICT(supabase_id) DO UPDATE SET
          name = excluded.name,
          phone = excluded.phone,
          bank = excluded.bank,
          account_digits = excluded.account_digits,
          service_type = excluded.service_type,
          agent = excluded.agent,
          last_visited = COALESCE(excluded.last_visited, customers.last_visited),
          updated_at = CURRENT_TIMESTAMP
      `);

      const insertTx = db.transaction((rows) => {
        for (const c of rows) {
          const item = {
            supabase_id: c.id,
            name: (c.name || '').trim(),
            phone: (c.phone || '').trim(),
            bank: (c.bank || '').trim(),
            account_digits: (c.account_digits || '').trim(),
            service_type: (c.service_type || '').trim(),
            agent: (c.agent || '').trim(),
            last_visited: c.last_visited || null
          };
          if (item.supabase_id) {
            upsertStmt.run(item);
          }
        }
      });

      insertTx(clients);

      this.lastSync = new Date().toISOString();
      const countResult = db.prepare('SELECT COUNT(*) as cnt FROM customers').get();
      this.totalClients = countResult ? countResult.cnt : clients.length;

      console.log(`✓ [Customer Sync] Total ${this.totalClients} customers synchronized with Sunshine Ledger.`);
      return { status: 'success', total: this.totalClients, last_sync: this.lastSync };
    } catch (err) {
      console.error('[Customer Sync] Error syncing customers:', err.message);
      return { status: 'error', error: err.message };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Search customers by name or phone number.
   * If query is empty, returns the top most recently visited customers.
   */
  searchCustomers(query = '', limit = 30) {
    const q = (query || '').trim();
    if (!q) {
      return db.prepare(`
        SELECT id, supabase_id, name, phone, bank, account_digits, service_type, agent, last_visited
        FROM customers
        ORDER BY last_visited DESC NULLS LAST, name ASC
        LIMIT ?
      `).all(limit);
    }

    const pattern = `%${q}%`;
    return db.prepare(`
      SELECT id, supabase_id, name, phone, bank, account_digits, service_type, agent, last_visited
      FROM customers
      WHERE name LIKE ? OR phone LIKE ?
      ORDER BY 
        CASE 
          WHEN phone = ? THEN 1
          WHEN phone LIKE ? THEN 2
          WHEN name LIKE ? THEN 3
          ELSE 4
        END,
        last_visited DESC NULLS LAST
      LIMIT ?
    `).all(pattern, pattern, q, `${q}%`, `${q}%`, limit);
  }

  /**
   * Save or update customer when a sale completes.
   * Pushes to Supabase regular_clients and updates local SQLite.
   */
  async recordCustomerFromSale(customerName, customerPhone, serviceType = 'Gadget / Retail Sale') {
    if (!customerName || customerName.trim() === 'Walk-in Customer') return;
    const cleanName = customerName.trim();
    const cleanPhone = (customerPhone || '').trim();
    const today = new Date().toISOString().split('T')[0];

    // 1. Update local SQLite
    try {
      const existing = cleanPhone ? db.prepare('SELECT id FROM customers WHERE phone = ?').get(cleanPhone) : null;
      if (existing) {
        db.prepare(`
          UPDATE customers 
          SET name = ?, service_type = ?, last_visited = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(cleanName, serviceType, today, existing.id);
      } else {
        db.prepare(`
          INSERT INTO customers (name, phone, service_type, agent, last_visited, updated_at)
          VALUES (?, ?, ?, 'SUNSHINE-POS', ?, CURRENT_TIMESTAMP)
        `).run(cleanName, cleanPhone || null, serviceType, today);
      }
    } catch (e) {
      console.warn('[Customer Sync] SQLite local customer record note:', e.message);
    }

    // 2. Push to Supabase regular_clients asynchronously
    try {
      if (cleanPhone) {
        await fetch(`${SUPABASE_URL}/rest/v1/regular_clients`, {
          method: 'POST',
          headers: {
            ...getHeaders(),
            'Prefer': 'resolution=merge-duplicates'
          },
          body: JSON.stringify({
            name: cleanName,
            phone: cleanPhone,
            service_type: serviceType,
            agent: 'SUNSHINE-POS',
            last_visited: today
          })
        });
      } else {
        await fetch(`${SUPABASE_URL}/rest/v1/regular_clients`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({
            name: cleanName,
            phone: null,
            service_type: serviceType,
            agent: 'SUNSHINE-POS',
            last_visited: today
          })
        });
      }
      console.log(`✓ [Customer Sync] Synced customer "${cleanName}" (${cleanPhone}) to Supabase regular_clients.`);
    } catch (err) {
      console.warn('[Customer Sync] Failed to push customer to Supabase:', err.message);
    }
  }
}

const customerSyncService = new CustomerSyncService();
module.exports = customerSyncService;
