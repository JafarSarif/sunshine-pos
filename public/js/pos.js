/**
 * Infinatort POS & Billing Controller
 * Handles Cart, Product Catalog, Checkout & External Ledger Webhook
 */

class InfinatortPOS {
  constructor() {
    this.cart = [];
    this.products = [];
    this.selectedCategory = 'All';
    this.searchQuery = '';
    this.paymentMethod = 'UPI'; // Default modern payment
    this.discount = 0;
    let storedUrl = localStorage.getItem('ledger_webhook_url');
    if (!storedUrl || storedUrl.includes('mock-receiver')) {
      storedUrl = '/api/ledger/sync-sunshine-gadgets';
      localStorage.setItem('ledger_webhook_url', storedUrl);
    }
    this.ledgerWebhookUrl = storedUrl;

    // Cache DOM Elements
    this.cartItemsContainer = document.getElementById('cartItemsList');
    this.cartCountBadge = document.getElementById('cartCountBadge');
    this.subtotalElem = document.getElementById('summarySubtotal');
    this.totalElem = document.getElementById('summaryTotal');
    this.btnCompleteSale = document.getElementById('btnCompleteSale');
    this.productsGrid = document.getElementById('productsGrid');
    this.categoryChips = document.getElementById('categoryChips');
    this.searchInput = document.getElementById('catalogSearchInput');
    this.btnSearchBarcode = document.getElementById('btnSearchBarcode');

    this.customers = [];
    this.selectedCustomer = null;

    this.bindEvents();
    this.bindCustomerEvents();
    this.loadSettings();
    this.loadCatalog();
    this.loadCustomers();
  }

  async loadSettings() {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const settings = await res.json();
        if (settings.ledger_webhook_url && !settings.ledger_webhook_url.includes('mock-receiver')) {
          this.ledgerWebhookUrl = settings.ledger_webhook_url;
        } else {
          this.ledgerWebhookUrl = '/api/ledger/sync-sunshine-gadgets';
        }
        if (settings.tax_rate) {
          this.taxRate = parseFloat(settings.tax_rate) || 0;
        }
      }
    } catch (e) {
      console.warn('Failed to load settings:', e);
    }
  }

  bindEvents() {
    // Payment method buttons
    const paymentButtons = document.querySelectorAll('.payment-btn');
    paymentButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        paymentButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.paymentMethod = btn.dataset.method;
      });
    });

    // Complete sale button
    if (this.btnCompleteSale) {
      this.btnCompleteSale.addEventListener('click', () => this.completeSale());
    }

    // Clear cart button
    const btnClearCart = document.getElementById('btnClearCart');
    if (btnClearCart) {
      btnClearCart.addEventListener('click', () => this.clearCart());
    }

    // Search bar typing with live filter
    if (this.searchInput) {
      this.searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.trim();
        this.renderCatalog();
      });

      // Quick enter key search
      this.searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && this.searchQuery) {
          this.quickSearchOrAdd(this.searchQuery);
        }
      });
    }

    // Discount input
    const discountInput = document.getElementById('discountInput');
    if (discountInput) {
      discountInput.addEventListener('input', (e) => {
        this.discount = parseFloat(e.target.value) || 0;
        this.updateCartSummary();
      });
    }

    // Auto-hide floating cart bar when cart panel is scrolled into view
    const cartPanel = document.querySelector('.cart-panel');
    const floatBar = document.getElementById('floatingCartBar');
    if (cartPanel && floatBar && 'IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.15) {
            floatBar.classList.add('floating-cart-hidden');
          } else {
            floatBar.classList.remove('floating-cart-hidden');
          }
        });
      }, { threshold: [0, 0.15, 0.4] });
      observer.observe(cartPanel);
    }

    // Auto-refresh POS catalog when switching tabs or window gets focus
    window.addEventListener('focus', () => this.loadCatalog());
  }

  async loadCatalog() {
    try {
      const res = await fetch('/api/products');
      if (!res.ok) throw new Error('Failed to load catalog');
      this.products = await res.json();
      this.renderCategoryChips();
      this.renderCatalog();
    } catch (err) {
      console.error('Catalog load error:', err);
      this.showToast('Failed to load products catalog.', 'error');
    }
  }

  renderCategoryChips() {
    if (!this.categoryChips) return;
    const allCats = window.SunshineCategories ? window.SunshineCategories.getAll() : [
      'Accessories', 'Books', 'Pens', 'Gadgets', 'Smartwatches', 'Phones', 'Earphones', 'Earpods', 'Earbuds', 'Neckbands'
    ];

    const categories = ['All', ...allCats];

    this.categoryChips.innerHTML = categories.map(cat => {
      if (cat === 'All') {
        const isActive = this.selectedCategory === 'All';
        return `
          <button class="chip ${isActive ? 'active' : ''}" data-cat="All"
                  style="--chip-color: #06b6d4; --chip-bg: rgba(6, 182, 212, 0.22); --chip-border: #06b6d4; --chip-glow: rgba(6, 182, 212, 0.4);">
            <span class="chip-icon">✨</span>
            <span class="chip-label">All</span>
          </button>
        `;
      }

      const meta = window.SunshineCategories ? window.SunshineCategories.get(cat) : {
        icon: '📦',
        color: '#38bdf8',
        bg: 'rgba(56, 189, 248, 0.16)',
        border: 'rgba(56, 189, 248, 0.4)',
        glow: 'rgba(56, 189, 248, 0.25)'
      };
      const isActive = this.selectedCategory === cat;

      return `
        <button class="chip ${isActive ? 'active' : ''}" data-cat="${cat}"
                style="--chip-color: ${meta.color}; --chip-bg: ${meta.bg}; --chip-border: ${meta.border}; --chip-glow: ${meta.glow};">
          <span class="chip-icon">${meta.icon}</span>
          <span class="chip-label">${cat}</span>
        </button>
      `;
    }).join('');

    this.categoryChips.querySelectorAll('.chip').forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedCategory = btn.dataset.cat;
        this.categoryChips.querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.renderCatalog();
      });
    });
  }

  renderCatalog() {
    if (!this.productsGrid) return;

    let filtered = this.products;

    if (this.selectedCategory !== 'All') {
      filtered = filtered.filter(p => p.category === this.selectedCategory);
    }

    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
      );
    }

    if (filtered.length === 0) {
      this.productsGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 2.5rem 1rem; color: var(--text-muted);">
          <div style="font-size: 2.2rem; margin-bottom: 0.5rem;">🔍</div>
          <strong style="color: #ffffff; display: block; margin-bottom: 0.25rem;">No products found</strong>
          <span style="font-size: 0.78rem;">Try selecting a different category or clearing your search.</span>
        </div>
      `;
      return;
    }

    this.productsGrid.innerHTML = filtered.map(p => {
      const catMeta = window.SunshineCategories ? window.SunshineCategories.get(p.category) : {
        icon: '📦',
        color: '#38bdf8',
        bg: 'rgba(56, 189, 248, 0.16)',
        border: 'rgba(56, 189, 248, 0.4)',
        glow: 'rgba(56, 189, 248, 0.25)'
      };

      let stockTagClass = '';
      let stockText = `${p.stock_count} in stock`;
      if (p.stock_count <= 0) {
        stockTagClass = 'out';
        stockText = 'Out of Stock';
      } else if (p.stock_count <= p.low_stock_threshold) {
        stockTagClass = 'low';
        stockText = `Low: ${p.stock_count} left`;
      }

      return `
        <div class="product-item" data-id="${p.id}" data-barcode="${p.barcode}"
             style="--item-cat-color: ${catMeta.color}; --item-cat-glow: ${catMeta.glow}; border-left: 3.5px solid ${catMeta.color} !important;">
          <div>
            <div class="product-category-tag" 
                 style="background: ${catMeta.bg}; color: ${catMeta.color}; border: 1px solid ${catMeta.border};">
              <span class="cat-tag-icon">${catMeta.icon}</span>
              <span>${p.category}</span>
            </div>
            <div class="product-name" title="${p.name}">${p.name}</div>
            <div class="product-barcode">#${p.barcode}</div>
          </div>
          <div class="product-bottom-row">
            <span class="product-price">₹${p.price.toFixed(2)}</span>
            <span class="stock-tag ${stockTagClass}">${stockText}</span>
          </div>
        </div>
      `;
    }).join('');

    // Attach click to add to cart
    this.productsGrid.querySelectorAll('.product-item').forEach(card => {
      card.addEventListener('click', () => {
        const barcode = card.dataset.barcode;
        this.handleScannedBarcode(barcode);
      });
    });
  }

  // Quick search or barcode submission from input
  async quickSearchOrAdd(term) {
    // Check if term matches exact barcode
    const match = this.products.find(p => p.barcode === term);
    if (match) {
      this.handleScannedBarcode(term);
      if (this.searchInput) this.searchInput.value = '';
      this.searchQuery = '';
      this.renderCatalog();
    } else {
      // Query server for barcode
      try {
        const res = await fetch(`/api/products/${encodeURIComponent(term)}`);
        if (res.ok) {
          const product = await res.json();
          this.addProductToCart(product);
          if (this.searchInput) this.searchInput.value = '';
          this.searchQuery = '';
          this.renderCatalog();
        } else {
          this.showToast(`No item with barcode: "${term}"`, 'error');
        }
      } catch {
        this.showToast('Product lookup error', 'error');
      }
    }
  }

  // =======================================================
  // BARCODE SCANNER HANDLER (Camera or Hardware scanner)
  // =======================================================
  async handleScannedBarcode(barcode) {
    const cleanBarcode = barcode.trim();
    if (!cleanBarcode) return;

    // 1. Look in cached products first
    let product = this.products.find(p => p.barcode === cleanBarcode);

    // 2. If not found in cache, query API directly
    if (!product) {
      try {
        const res = await fetch(`/api/products/${encodeURIComponent(cleanBarcode)}`);
        if (res.ok) {
          product = await res.json();
        }
      } catch (err) {
        console.error('Barcode fetch error:', err);
      }
    }

    if (product) {
      this.addProductToCart(product);
    } else {
      // Audio error buzz
      if (window.InfinatortScanner) {
        window.InfinatortScanner.playBeep('error');
      }
      this.showToastWithAction(
        `Barcode #${cleanBarcode} not in inventory.`,
        '➕ Add Product Now',
        () => {
          // Switch to Antigravity tab
          const tabBtn = document.querySelector('[data-target="viewAntigravity"]');
          if (tabBtn) tabBtn.click();
          if (window.AntigravityInventory) {
            window.AntigravityInventory.openProductModalWithBarcode(cleanBarcode);
          }
        }
      );
    }
  }

  addProductToCart(product) {
    if (product.stock_count <= 0) {
      this.showToast(`"${product.name}" is completely out of stock!`, 'error');
      if (window.InfinatortScanner) window.InfinatortScanner.playBeep('error');
      return;
    }

    const existingIndex = this.cart.findIndex(item => item.id === product.id);

    if (existingIndex > -1) {
      const item = this.cart[existingIndex];
      if (item.quantity + 1 > product.stock_count) {
        this.showToast(`Cannot add more. Only ${product.stock_count} units available in stock.`, 'error');
        return;
      }
      item.quantity += 1;
      this.showToast(`Added another ${product.name} (Qty: ${item.quantity})`, 'success');
      this.renderCart(product.id);
    } else {
      this.cart.push({
        id: product.id,
        barcode: product.barcode,
        name: product.name,
        category: product.category,
        price: product.price,
        cost_price: product.cost_price || 0,
        stock_count: product.stock_count,
        quantity: 1
      });
      this.showToast(`Added: ${product.name}`, 'success');
      this.renderCart(product.id);
    }
  }

  // Cart Management
  incrementQty(productId) {
    const item = this.cart.find(i => i.id === productId);
    if (!item) return;

    if (item.quantity + 1 > item.stock_count) {
      this.showToast(`Max available stock reached (${item.stock_count})`, 'error');
      return;
    }
    item.quantity += 1;
    this.renderCart();
  }

  decrementQty(productId) {
    const item = this.cart.find(i => i.id === productId);
    if (!item) return;

    if (item.quantity > 1) {
      item.quantity -= 1;
      this.renderCart();
    } else {
      this.removeItem(productId);
    }
  }

  removeItem(productId) {
    this.cart = this.cart.filter(i => i.id !== productId);
    this.renderCart();
  }

  clearCart() {
    if (this.cart.length === 0) return;
    this.cart = [];
    this.renderCart();
  }

  renderCart(highlightProductId = null) {
    if (!this.cartItemsContainer) return;

    if (this.cart.length === 0) {
      this.cartItemsContainer.innerHTML = `
        <div class="cart-empty-state">
          <div class="cart-empty-icon">🛒</div>
          <div>Your cart is empty.</div>
          <div style="font-size: 0.75rem; margin-top: 0.25rem;">Scan barcodes or select items from catalog.</div>
        </div>
      `;
      if (this.btnCompleteSale) this.btnCompleteSale.disabled = true;
      if (this.cartCountBadge) this.cartCountBadge.textContent = '0';
      this.updateCartSummary();
      return;
    }

    if (this.btnCompleteSale) this.btnCompleteSale.disabled = false;
    const totalItemsCount = this.cart.reduce((sum, item) => sum + item.quantity, 0);
    if (this.cartCountBadge) this.cartCountBadge.textContent = totalItemsCount;

    this.cartItemsContainer.innerHTML = this.cart.map(item => `
      <div class="cart-item ${item.id === highlightProductId ? 'just-added' : ''}" id="cart-item-${item.id}">
        <div class="cart-item-details">
          <h4>${item.name}</h4>
          <div class="cart-item-meta">₹${item.price.toFixed(2)} × ${item.quantity} | ${item.category}</div>
        </div>
        <div class="cart-item-actions">
          <button class="qty-btn" onclick="window.InfinatortPOS.decrementQty(${item.id})">-</button>
          <span class="qty-display">${item.quantity}</span>
          <button class="qty-btn" onclick="window.InfinatortPOS.incrementQty(${item.id})">+</button>
          <span class="cart-item-price">₹${(item.price * item.quantity).toFixed(2)}</span>
          <button class="btn-item-remove" onclick="window.InfinatortPOS.removeItem(${item.id})" title="Remove item">✕</button>
        </div>
      </div>
    `).join('');

    this.updateCartSummary();
  }

  updateCartSummary() {
    const totalItemsCount = this.cart.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const taxAmount = (subtotal * this.taxRate) / 100;
    const total = Math.max(0, subtotal - this.discount + taxAmount);

    if (this.subtotalElem) this.subtotalElem.textContent = `₹${subtotal.toFixed(2)}`;
    if (this.totalElem) this.totalElem.textContent = `₹${total.toFixed(2)}`;

    // Sync header badge & floating mobile cart bar
    const headerCartBadge = document.getElementById('headerCartCount');
    if (headerCartBadge) headerCartBadge.textContent = totalItemsCount;

    const floatBar = document.getElementById('floatingCartBar');
    const floatBadge = document.getElementById('floatCartBadge');
    const floatTotal = document.getElementById('floatCartTotal');

    if (floatBar) {
      if (totalItemsCount > 0) {
        floatBar.style.display = 'flex';
        if (floatBadge) floatBadge.textContent = `${totalItemsCount} item${totalItemsCount > 1 ? 's' : ''}`;
        if (floatTotal) floatTotal.textContent = `₹${total.toFixed(2)}`;
      } else {
        floatBar.style.display = 'none';
      }
    }
  }

  // =======================================================
  // CHECKOUT & EXTERNAL LEDGER WEBHOOK INTEGRATION
  // =======================================================
  async completeSale() {
    if (this.cart.length === 0) {
      alert('Cart is empty.');
      return;
    }

    const customerName = document.getElementById('customerNameInput')?.value.trim() || 'Walk-in Customer';
    const customerPhone = document.getElementById('customerPhoneInput')?.value.trim() || '';

    const subtotal = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const taxAmount = (subtotal * this.taxRate) / 100;
    const total_amount = Math.max(0, subtotal - this.discount + taxAmount);

    const salePayload = {
      items: this.cart.map(i => ({
        id: i.id,
        barcode: i.barcode,
        name: i.name,
        category: i.category,
        price: i.price,
        cost_price: i.cost_price,
        quantity: i.quantity,
        total: i.price * i.quantity
      })),
      payment_method: this.paymentMethod,
      customer_name: customerName,
      customer_phone: customerPhone,
      discount: this.discount,
      tax: taxAmount,
      total_amount: total_amount
    };

    // UI Loading state
    if (this.btnCompleteSale) {
      this.btnCompleteSale.disabled = true;
      this.btnCompleteSale.innerHTML = '⏳ Processing Sale & Syncing...';
    }

    try {
      // 1. Post to Express backend for atomic inventory decrement and receipt creation
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(salePayload)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Checkout failed');
      }

      const completedSale = data.sale;

      // 2. FIRE THE EXTERNAL LEDGER WEBHOOK FETCH REQUEST
      const ledgerResult = await this.sendToLedger(completedSale.ledgerPayload);

      // 3. Display Printable Receipt Modal with Webhook Delivery Status
      this.showReceiptModal(completedSale, ledgerResult);

      // 4. Reset Cart & Refresh Product Stock
      this.cart = [];
      this.discount = 0;
      if (document.getElementById('discountInput')) {
        document.getElementById('discountInput').value = '';
      }
      this.clearCustomer();
      this.renderCart();
      await this.loadCatalog(); // Refresh catalog to reflect new stock levels
      await this.loadCustomers(); // Refresh customer count

      this.showToast(`Sale Complete! Invoice #${completedSale.invoice_id}`, 'success');

    } catch (err) {
      console.error('Checkout error:', err);
      alert(`Error during checkout: ${err.message}`);
    } finally {
      if (this.btnCompleteSale) {
        this.btnCompleteSale.disabled = false;
        this.btnCompleteSale.innerHTML = `
          <span>✓ Complete Sale</span>
          <span class="ledger-pill">Sync Ledger</span>
        `;
      }
    }
  }

  /**
   * External Ledger Webhook
   * Executes a fetch() POST request sending transaction data to the external ledger API
   */
  async sendToLedger(saleData) {
    let endpoint = this.ledgerWebhookUrl;
    if (!endpoint || endpoint.includes('mock-receiver')) {
      endpoint = '/api/ledger/sync-sunshine-gadgets';
      this.ledgerWebhookUrl = endpoint;
    }
    console.log(`[Sunshine Ledger Sync] Dispatching sale data to: ${endpoint}`, saleData);

    let status = {
      success: false,
      message: 'Not initiated',
      endpoint: endpoint
    };

    try {
      // Direct client-side fetch to Sunshine Ledger endpoint
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(saleData)
      });

      if (response.ok) {
        const result = await response.json().catch(() => ({}));
        status.success = true;
        status.message = result.message || '✓ Recorded in Sunshine Ledger (Section 3A Gadgets & Repairs)';
        console.log('[Sunshine Ledger Sync] Sync successful:', result);
      } else {
        throw new Error(`Ledger server returned status ${response.status}`);
      }
    } catch (directError) {
      console.warn('[Sunshine Ledger Sync] Direct fetch failed. Trying backend proxy...', directError);

      // Fallback: If browser faces CORS restriction from external domain, forward through server-side proxy
      try {
        const proxyRes = await fetch('/api/ledger/forward', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint_url: endpoint,
            payload: saleData
          })
        });

        const proxyData = await proxyRes.json();
        if (proxyRes.ok && proxyData.success) {
          status.success = true;
          status.message = 'Successfully recorded in external ledger (via secure proxy)';
        } else {
          status.success = false;
          status.message = proxyData.error || 'Ledger portal unavailable';
        }
      } catch (proxyError) {
        status.success = false;
        status.message = `Ledger sync error: ${directError.message}`;
      }
    }

    return status;
  }

  // Receipt Modal Rendering
  showReceiptModal(saleInfo, ledgerStatus) {
    const modal = document.getElementById('receiptModal');
    const content = document.getElementById('receiptModalContent');
    if (!modal || !content) return;

    const payload = saleInfo.ledgerPayload;
    const itemsHtml = payload.items_sold.map(i => `
      <tr>
        <td>${i.name} (${i.qty})</td>
        <td class="num-col">₹${i.total.toFixed(2)}</td>
      </tr>
    `).join('');

    const webhookBadgeClass = ledgerStatus.success ? 'success' : 'error';
    const webhookIcon = ledgerStatus.success ? '✓' : '⚠';

    const customerMeta = (payload.customer && payload.customer.name && payload.customer.name !== 'Walk-in Customer')
      ? `<div class="receipt-meta">Customer: <strong>${this.escapeHtml(payload.customer.name)}</strong>${payload.customer.phone ? ` (${this.escapeHtml(payload.customer.phone)})` : ''}</div>`
      : '';

    content.innerHTML = `
      <div class="receipt-paper" id="printableReceipt">
        <div class="receipt-header">
          <img src="img/sunshine_logo.png" style="width: 44px; height: 44px; border-radius: 8px; margin-bottom: 4px; object-fit: contain;" alt="Sunshine Logo">
          <div class="receipt-title">SUNSHINE STORE</div>
          <div class="receipt-meta">Invoice: ${payload.invoice_id}</div>
          <div class="receipt-meta">${new Date(payload.timestamp).toLocaleString()}</div>
          ${customerMeta}
          <div class="receipt-meta">Payment: <strong>${payload.payment_method}</strong></div>
        </div>

        <table class="receipt-table">
          <thead>
            <tr>
              <th>Item</th>
              <th class="num-col">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="receipt-total-row">
          <span>GRAND TOTAL</span>
          <span>₹${payload.total_amount.toFixed(2)}</span>
        </div>

        <div class="receipt-webhook-badge ${webhookBadgeClass}">
          <span>${webhookIcon}</span>
          <span><strong>Ledger Webhook:</strong> ${ledgerStatus.message}</span>
        </div>
      </div>
    `;

    this.lastSaleInfo = saleInfo;
    modal.classList.add('active');

    // Bind Print and Share buttons
    const btnPrint = document.getElementById('btnPrintReceiptBtn');
    if (btnPrint) {
      btnPrint.onclick = () => this.printReceipt();
    }
    const btnShare = document.getElementById('btnShareReceiptBtn');
    if (btnShare) {
      btnShare.onclick = () => this.shareReceipt();
    }
  }

  // Receipt Printing (Android Native Bridge + Browser Fallback)
  printReceipt() {
    const receiptElem = document.getElementById('printableReceipt');
    if (!receiptElem) {
      this.showToast('No receipt found to print.', 'error');
      return;
    }

    const payload = (this.lastSaleInfo && this.lastSaleInfo.ledgerPayload) || {};
    const invoiceId = payload.invoice_id || 'RECEIPT';

    const printHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Receipt #${invoiceId}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    @page { size: 80mm auto; margin: 3mm; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Courier New", monospace;
      color: #000;
      background: #fff;
      margin: 0;
      padding: 6px;
      font-size: 13px;
      line-height: 1.4;
      max-width: 80mm;
      margin: 0 auto;
    }
    .receipt-header {
      text-align: center;
      border-bottom: 1px dashed #000;
      padding-bottom: 6px;
      margin-bottom: 6px;
    }
    .receipt-title {
      font-size: 16px;
      font-weight: 900;
      letter-spacing: 0.5px;
    }
    .receipt-meta {
      font-size: 11px;
      color: #333;
      margin-top: 2px;
    }
    .receipt-table {
      width: 100%;
      border-collapse: collapse;
      margin: 6px 0;
    }
    .receipt-table th {
      border-bottom: 1px dashed #000;
      text-align: left;
      padding: 3px 0;
      font-size: 11px;
    }
    .receipt-table td {
      padding: 4px 0;
      font-size: 12px;
      border-bottom: 1px dotted #ccc;
    }
    .num-col { text-align: right; }
    .receipt-total-row {
      border-top: 1px dashed #000;
      border-bottom: 2px solid #000;
      display: flex;
      justify-content: space-between;
      font-weight: 900;
      font-size: 15px;
      padding: 6px 0;
      margin: 6px 0;
    }
    .receipt-webhook-badge {
      font-size: 10px;
      border: 1px solid #10b981;
      background: #f0fdf4;
      color: #047857;
      padding: 4px 6px;
      border-radius: 4px;
      margin-top: 6px;
      text-align: center;
    }
    .receipt-footer {
      text-align: center;
      font-size: 11px;
      margin-top: 10px;
      border-top: 1px dashed #000;
      padding-top: 6px;
      color: #444;
    }
  </style>
</head>
<body>
  ${receiptElem.innerHTML}
  <div class="receipt-footer">
    *** THANK YOU FOR SHOPPING WITH US! ***<br>
    SUNSHINE STORE
  </div>
</body>
</html>`;

    // 1. Android Native App Print Bridge
    if (window.AndroidPOS && typeof window.AndroidPOS.printReceiptHtml === 'function') {
      window.AndroidPOS.printReceiptHtml(invoiceId, printHtml);
      return;
    }

    // 2. Browser fallback: print via isolated hidden iframe
    let printFrame = document.getElementById('receiptPrintIframe');
    if (!printFrame) {
      printFrame = document.createElement('iframe');
      printFrame.id = 'receiptPrintIframe';
      printFrame.style.position = 'fixed';
      printFrame.style.right = '0';
      printFrame.style.bottom = '0';
      printFrame.style.width = '0';
      printFrame.style.height = '0';
      printFrame.style.border = '0';
      document.body.appendChild(printFrame);
    }

    const doc = printFrame.contentWindow.document;
    doc.open();
    doc.write(printHtml);
    doc.close();

    setTimeout(() => {
      try {
        printFrame.contentWindow.focus();
        printFrame.contentWindow.print();
      } catch (e) {
        window.print();
      }
    }, 300);
  }

  // Share Receipt via WhatsApp or Native Android Share Intent
  shareReceipt() {
    if (!this.lastSaleInfo) {
      this.showToast('No receipt available to share.', 'error');
      return;
    }
    const payload = this.lastSaleInfo.ledgerPayload || {};
    const itemsText = (payload.items_sold || [])
      .map(i => `• ${i.name} (x${i.qty}) - ₹${i.total.toFixed(2)}`)
      .join('\n');

    const customerLine = (payload.customer && payload.customer.name && payload.customer.name !== 'Walk-in Customer')
      ? `Customer: ${payload.customer.name}${payload.customer.phone ? ` (${payload.customer.phone})` : ''}\n`
      : '';

    const shareText = 
`🧾 *SUNSHINE STORE RECEIPT*
Invoice: #${payload.invoice_id}
Date: ${new Date(payload.timestamp).toLocaleString()}
${customerLine}Payment Method: ${payload.payment_method}
------------------------------------
${itemsText}
------------------------------------
*GRAND TOTAL: ₹${Number(payload.total_amount).toFixed(2)}*
------------------------------------
Thank you for shopping at Sunshine Store!`;

    // 1. Android Native Share Sheet
    if (window.AndroidPOS && typeof window.AndroidPOS.shareReceiptText === 'function') {
      window.AndroidPOS.shareReceiptText(shareText);
      return;
    }

    // 2. Web Share API (mobile Chrome / Safari)
    if (navigator.share) {
      navigator.share({
        title: `Sunshine Store Receipt - #${payload.invoice_id}`,
        text: shareText
      }).catch(() => {});
      return;
    }

    // 3. Fallback: Copy to Clipboard
    if (navigator.clipboard) {
      navigator.clipboard.writeText(shareText).then(() => {
        this.showToast('Receipt copied to clipboard! Paste in WhatsApp.', 'success');
      }).catch(() => {
        prompt('Copy receipt details:', shareText);
      });
    } else {
      prompt('Copy receipt details:', shareText);
    }
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span>${type === 'success' ? '✓' : type === 'error' ? '⚠' : 'ℹ'}</span>
      <span>${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  showToastWithAction(message, actionText, actionCallback) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast error';
    toast.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.5rem;">
        <span>⚠</span>
        <span>${message}</span>
      </div>
      <button class="toast-action-btn" id="toastActionBtn">${actionText}</button>
    `;

    const btn = toast.querySelector('#toastActionBtn');
    if (btn) {
      btn.addEventListener('click', () => {
        toast.remove();
        if (typeof actionCallback === 'function') actionCallback();
      });
    }

    container.appendChild(toast);

    setTimeout(() => {
      if (document.body.contains(toast)) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
      }
    }, 6000); // 6 seconds visibility for action toast
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async loadCustomers() {
    try {
      const res = await fetch('/api/customers?limit=150');
      if (res.ok) {
        const data = await res.json();
        this.customers = data.customers || [];
        const badge = document.getElementById('savedCustomerBadgeCount');
        if (badge) badge.textContent = this.customers.length;
        const dirLabel = document.getElementById('directoryCountLabel');
        if (dirLabel) dirLabel.textContent = `Showing ${this.customers.length} customers`;
      }
    } catch (err) {
      console.warn('[POS] Failed to load customers:', err);
    }
  }

  bindCustomerEvents() {
    const nameInput = document.getElementById('customerNameInput');
    const phoneInput = document.getElementById('customerPhoneInput');
    const nameDropdown = document.getElementById('customerNameDropdown');
    const phoneDropdown = document.getElementById('customerPhoneDropdown');
    const btnClear = document.getElementById('btnClearCustomer');
    const btnOpenDir = document.getElementById('btnOpenCustomerDirectory');
    const dirModal = document.getElementById('customerDirectoryModal');
    const dirSearch = document.getElementById('directorySearchInput');
    const btnRefreshDir = document.getElementById('btnRefreshCustomerDirectory');
    const btnResetWalkIn = document.getElementById('btnResetToWalkIn');

    // Autocomplete on Customer Name
    if (nameInput) {
      nameInput.addEventListener('input', (e) => {
        const val = e.target.value.trim().toLowerCase();
        if (val.length === 0) {
          if (nameDropdown) nameDropdown.classList.add('hidden');
          return;
        }
        const matches = this.customers.filter(c => 
          (c.name && c.name.toLowerCase().includes(val)) ||
          (c.phone && c.phone.includes(val))
        ).slice(0, 10);
        this.renderCustomerDropdown(nameDropdown, matches);
      });

      nameInput.addEventListener('focus', (e) => {
        const val = e.target.value.trim().toLowerCase();
        if (val.length > 0) {
          const matches = this.customers.filter(c => 
            (c.name && c.name.toLowerCase().includes(val)) ||
            (c.phone && c.phone.includes(val))
          ).slice(0, 10);
          this.renderCustomerDropdown(nameDropdown, matches);
        }
      });
    }

    // Autocomplete on Mobile Number
    if (phoneInput) {
      phoneInput.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        if (val.length === 0) {
          if (phoneDropdown) phoneDropdown.classList.add('hidden');
          return;
        }
        const matches = this.customers.filter(c => 
          (c.phone && c.phone.includes(val)) ||
          (c.name && c.name.toLowerCase().includes(val.toLowerCase()))
        ).slice(0, 10);
        this.renderCustomerDropdown(phoneDropdown, matches);
      });

      phoneInput.addEventListener('focus', (e) => {
        const val = e.target.value.trim();
        if (val.length > 0) {
          const matches = this.customers.filter(c => 
            (c.phone && c.phone.includes(val)) ||
            (c.name && c.name.toLowerCase().includes(val.toLowerCase()))
          ).slice(0, 10);
          this.renderCustomerDropdown(phoneDropdown, matches);
        }
      });
    }

    // Close dropdowns on outside click
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.customer-autocomplete-wrap')) {
        if (nameDropdown) nameDropdown.classList.add('hidden');
        if (phoneDropdown) phoneDropdown.classList.add('hidden');
      }
    });

    // Clear Customer Button
    if (btnClear) {
      const doClear = (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        this.clearCustomer();
      };
      btnClear.addEventListener('click', doClear);
      btnClear.addEventListener('pointerdown', doClear);
    }

    // Open Directory Modal
    if (btnOpenDir && dirModal) {
      btnOpenDir.addEventListener('click', () => {
        dirModal.classList.add('active');
        if (dirSearch) {
          dirSearch.value = '';
          dirSearch.focus();
        }
        this.renderDirectoryList(this.customers);
      });
    }

    // Live search in Directory Modal
    if (dirSearch) {
      dirSearch.addEventListener('input', (e) => {
        const term = e.target.value.trim().toLowerCase();
        if (!term) {
          this.renderDirectoryList(this.customers);
          return;
        }
        const filtered = this.customers.filter(c => 
          (c.name && c.name.toLowerCase().includes(term)) ||
          (c.phone && c.phone.includes(term))
        );
        this.renderDirectoryList(filtered);
      });
    }

    // Refresh directory from Supabase
    if (btnRefreshDir) {
      btnRefreshDir.addEventListener('click', async () => {
        btnRefreshDir.style.transform = 'rotate(360deg)';
        btnRefreshDir.style.transition = 'transform 0.5s ease';
        try {
          const res = await fetch('/api/customers/sync', { method: 'POST' });
          const data = await res.json();
          await this.loadCustomers();
          if (dirSearch && dirSearch.value.trim()) {
            dirSearch.dispatchEvent(new Event('input'));
          } else {
            this.renderDirectoryList(this.customers);
          }
          this.showToast(`Synced ${data.total || this.customers.length} customers with Sunshine regular_clients!`, 'success');
        } catch (e) {
          this.showToast('Customer sync error: ' + e.message, 'error');
        } finally {
          setTimeout(() => { btnRefreshDir.style.transform = 'none'; }, 600);
        }
      });
    }

    // Reset to Walk-in
    if (btnResetWalkIn) {
      btnResetWalkIn.addEventListener('click', () => {
        this.clearCustomer();
        if (dirModal) dirModal.classList.remove('active');
      });
    }
  }

  renderCustomerDropdown(container, matches) {
    if (!container) return;
    if (matches.length === 0) {
      container.classList.add('hidden');
      return;
    }
    container.innerHTML = matches.map(c => `
      <div class="customer-dropdown-item" data-id="${c.id}">
        <div class="cust-item-row1">
          <span class="cust-item-name">${this.escapeHtml(c.name)}</span>
          <span class="cust-item-phone">${this.escapeHtml(c.phone || '')}</span>
        </div>
        <div class="cust-item-row2">
          <span>${this.escapeHtml(c.service_type || 'Regular Client')}</span>
          <span>${c.last_visited ? 'Visited ' + c.last_visited : ''}</span>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.customer-dropdown-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = parseInt(item.dataset.id);
        const selected = this.customers.find(c => c.id === id);
        if (selected) {
          this.selectCustomer(selected);
        }
        container.classList.add('hidden');
      });
    });

    container.classList.remove('hidden');
  }

  renderDirectoryList(list) {
    const container = document.getElementById('directoryListContainer');
    const countLabel = document.getElementById('directoryCountLabel');
    if (countLabel) countLabel.textContent = `Showing ${list.length} customers`;
    if (!container) return;

    if (list.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 2rem 1rem; color: var(--text-muted); font-size: 0.85rem;">
          No matching customers found.
        </div>
      `;
      return;
    }

    container.innerHTML = list.map(c => `
      <div class="directory-customer-item" data-id="${c.id}">
        <div class="dir-left">
          <span class="dir-name">${this.escapeHtml(c.name)}</span>
          <span class="dir-phone">📞 ${this.escapeHtml(c.phone || 'No phone')}</span>
          <span class="dir-tag">${this.escapeHtml(c.service_type || '')} ${c.bank ? '• ' + this.escapeHtml(c.bank) : ''}</span>
        </div>
        <div class="dir-right">
          <span class="dir-visit">${c.last_visited ? 'Visited ' + c.last_visited : ''}</span>
          <span class="dir-btn-select">Select →</span>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.directory-customer-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = parseInt(item.dataset.id);
        const selected = this.customers.find(c => c.id === id);
        if (selected) {
          this.selectCustomer(selected);
          document.getElementById('customerDirectoryModal')?.classList.remove('active');
        }
      });
    });
  }

  selectCustomer(customer) {
    this.selectedCustomer = customer;
    const nameInput = document.getElementById('customerNameInput');
    const phoneInput = document.getElementById('customerPhoneInput');
    const badge = document.getElementById('customerSelectedBadge');
    const badgeName = document.getElementById('badgeCustomerName');
    const badgeTag = document.getElementById('badgeCustomerTag');

    if (nameInput) nameInput.value = customer.name;
    if (phoneInput) phoneInput.value = customer.phone || '';

    if (badge && badgeName) {
      badgeName.textContent = customer.name + (customer.phone ? ` (${customer.phone})` : '');
      if (badgeTag) badgeTag.textContent = customer.service_type || 'Sunshine Client';
      badge.classList.remove('hidden');
    }

    document.getElementById('customerNameDropdown')?.classList.add('hidden');
    document.getElementById('customerPhoneDropdown')?.classList.add('hidden');
    this.showToast(`Selected customer: ${customer.name}`, 'info');
  }

  clearCustomer() {
    this.selectedCustomer = null;
    const nameInput = document.getElementById('customerNameInput');
    const phoneInput = document.getElementById('customerPhoneInput');
    const badge = document.getElementById('customerSelectedBadge');

    if (nameInput) nameInput.value = '';
    if (phoneInput) phoneInput.value = '';
    if (badge) badge.classList.add('hidden');

    document.getElementById('customerNameDropdown')?.classList.add('hidden');
    document.getElementById('customerPhoneDropdown')?.classList.add('hidden');
  }
}

// Instantiate globally
window.InfinatortPOS = new InfinatortPOS();

// Global print receipt hook
window.print = function() {
  if (window.InfinatortPOS) {
    window.InfinatortPOS.printReceipt();
  }
};

