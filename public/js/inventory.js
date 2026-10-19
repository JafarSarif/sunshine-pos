/**
 * Antigravity Inventory Management Controller
 * Handles Product Catalog CRUD, Stock Audits, Dashboard Metrics, and Barcode Label Generation
 */

class AntigravityInventory {
  constructor() {
    this.products = [];
    this.tableBody = document.getElementById('inventoryTableBody');
    this.statsTotalProducts = document.getElementById('statTotalProducts');
    this.statsLowStock = document.getElementById('statLowStock');
    this.statsTotalStock = document.getElementById('statTotalStock');
    this.statsTotalValue = document.getElementById('statTotalValue');
    this.searchFilter = document.getElementById('inventorySearchInput');
    this.categoryFilter = document.getElementById('inventoryCategoryFilter');
    this.lowStockCheckbox = document.getElementById('inventoryLowStockOnly');
    this.cloudStatusBadge = document.getElementById('cloudSyncStatusBadge');
    this.cloudDetailText = document.getElementById('cloudSyncDetailText');
    this.btnManualCloudSync = document.getElementById('btnManualCloudSync');
    this.syncIconSpin = document.getElementById('syncIconSpin');
    this.syncBtnText = document.getElementById('syncBtnText');

    this.bindEvents();
    this.loadStats();
    this.loadProducts();
    this.checkCloudStatus();

    // Auto-refresh on focus so changes from other devices appear immediately
    window.addEventListener('focus', () => {
      this.loadProducts();
      this.checkCloudStatus();
    });

    // Check cloud sync status every 20 seconds
    setInterval(() => this.checkCloudStatus(), 20000);
  }

  bindEvents() {
    // Manual Cloud Sync button
    if (this.btnManualCloudSync) {
      this.btnManualCloudSync.addEventListener('click', () => this.syncWithCloudNow());
    }

    // Add product button
    const btnAddProduct = document.getElementById('btnAddProduct');
    if (btnAddProduct) {
      btnAddProduct.addEventListener('click', () => this.openProductModal());
    }

    // Scan Barcode to Add/Edit Product button in toolbar
    const btnScanToAdd = document.getElementById('btnScanToAddProduct');
    if (btnScanToAdd) {
      btnScanToAdd.addEventListener('click', () => {
        if (window.InfinatortScanner) {
          window.InfinatortScanner.openModalScanner((code) => {
            this.handleBarcodeScanToAddOrEdit(code);
          }, '📷 Scan Barcode to Add or Edit');
        }
      });
    }

    // Scan Barcode button inside Add/Edit modal form
    const btnScanForm = document.getElementById('btnScanBarcodeForForm');
    if (btnScanForm) {
      btnScanForm.addEventListener('click', () => {
        if (window.InfinatortScanner) {
          window.InfinatortScanner.openModalScanner((code) => {
            const input = document.getElementById('formBarcode');
            if (input) input.value = code;
            document.getElementById('formName')?.focus();
          }, '📷 Scan Barcode for Product');
        }
      });
    }

    // Product form submission
    const formProduct = document.getElementById('productForm');
    if (formProduct) {
      formProduct.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveProduct();
      });
    }

    // Generate random barcode button
    const btnGenBarcode = document.getElementById('btnGenerateBarcode');
    if (btnGenBarcode) {
      btnGenBarcode.addEventListener('click', () => {
        const barcodeInput = document.getElementById('formBarcode');
        if (barcodeInput) {
          // Generate realistic 12-digit EAN/UPC style numeric barcode
          const rand = Math.floor(100000000000 + Math.random() * 900000000000);
          barcodeInput.value = rand.toString();
        }
      });
    }

    // Search and filters
    if (this.searchFilter) {
      this.searchFilter.addEventListener('input', () => this.renderTable());
    }
    if (this.categoryFilter) {
      this.categoryFilter.addEventListener('change', () => this.renderTable());
    }
    if (this.lowStockCheckbox) {
      this.lowStockCheckbox.addEventListener('change', () => this.renderTable());
    }
  }

  async checkCloudStatus() {
    try {
      const res = await fetch('/api/products/cloud-status');
      if (!res.ok) return;
      const status = await res.json();

      if (this.cloudStatusBadge) {
        this.cloudStatusBadge.textContent = `Cloud Synced (${status.local_count} Products in Supabase)`;
      }
      if (this.cloudDetailText) {
        const timeStr = status.last_synced_at ? new Date(status.last_synced_at).toLocaleTimeString() : 'Active';
        this.cloudDetailText.textContent = `Supabase Cloud Active • All devices synchronized (Last sync: ${timeStr})`;
      }
    } catch (e) {
      console.warn('Cloud status check warning:', e);
    }
  }

  async syncWithCloudNow() {
    if (this.syncIconSpin) this.syncIconSpin.style.animation = 'spin 1s linear infinite';
    if (this.syncBtnText) this.syncBtnText.textContent = 'Syncing...';
    if (this.btnManualCloudSync) this.btnManualCloudSync.disabled = true;

    try {
      const res = await fetch('/api/products/cloud-sync', { method: 'POST' });
      const data = await res.json();

      await this.loadProducts();
      await this.checkCloudStatus();

      if (window.InfinatortPOS) {
        window.InfinatortPOS.loadCatalog();
        window.InfinatortPOS.showToast(`Cloud Sync Complete! ${data.total_products || this.products.length} products synced with Supabase.`, 'success');
      }
    } catch (e) {
      console.error('Cloud sync error:', e);
      if (window.InfinatortPOS) {
        window.InfinatortPOS.showToast('Cloud sync failed: ' + e.message, 'error');
      }
    } finally {
      if (this.syncIconSpin) this.syncIconSpin.style.animation = 'none';
      if (this.syncBtnText) this.syncBtnText.textContent = 'Sync Cloud Now';
      if (this.btnManualCloudSync) this.btnManualCloudSync.disabled = false;
    }
  }

  async loadStats() {
    try {
      const res = await fetch('/api/dashboard/stats');
      if (!res.ok) return;
      const data = await res.json();

      if (this.statsTotalProducts) this.statsTotalProducts.textContent = data.totalProducts;
      if (this.statsLowStock) this.statsLowStock.textContent = data.lowStockCount;
      if (this.statsTotalStock) this.statsTotalStock.textContent = data.totalStock;
      if (this.statsTotalValue) this.statsTotalValue.textContent = `₹${data.totalInventoryValue.toLocaleString()}`;
    } catch (e) {
      console.warn('Failed to load stats:', e);
    }
  }

  async loadProducts() {
    try {
      const res = await fetch('/api/products');
      if (!res.ok) throw new Error('Failed to load inventory');
      this.products = await res.json();
      this.populateCategoryFilter();
      this.renderTable();
      this.loadStats();
      this.checkCloudStatus();
    } catch (err) {
      console.error('Inventory load error:', err);
    }
  }

  populateCategoryFilter() {
    if (!this.categoryFilter) return;
    const categories = Array.from(new Set(this.products.map(p => p.category))).sort();
    const currentVal = this.categoryFilter.value;

    this.categoryFilter.innerHTML = '<option value="">All Categories</option>' +
      categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');

    this.categoryFilter.value = currentVal;
  }

  renderTable() {
    if (!this.tableBody) return;

    const query = (this.searchFilter?.value || '').toLowerCase().trim();
    const selectedCat = this.categoryFilter?.value || '';
    const lowStockOnly = this.lowStockCheckbox?.checked || false;

    let filtered = this.products.filter(p => {
      const matchesSearch = !query ||
        p.name.toLowerCase().includes(query) ||
        p.barcode.toLowerCase().includes(query) ||
        p.category.toLowerCase().includes(query);

      const matchesCat = !selectedCat || p.category === selectedCat;
      const matchesLow = !lowStockOnly || (p.stock_count <= p.low_stock_threshold);

      return matchesSearch && matchesCat && matchesLow;
    });

    if (filtered.length === 0) {
      this.tableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 2rem; color: var(--text-muted);">
            No inventory items matching criteria.
          </td>
        </tr>
      `;
      return;
    }

    this.tableBody.innerHTML = filtered.map(p => {
      let stockStatusBadge = `<span style="color: #34d399; font-weight: 600;">${p.stock_count}</span>`;
      if (p.stock_count <= 0) {
        stockStatusBadge = `<span style="color: #ef4444; font-weight: 700;">0 (Out of Stock)</span>`;
      } else if (p.stock_count <= p.low_stock_threshold) {
        stockStatusBadge = `<span style="color: #f59e0b; font-weight: 700;">${p.stock_count} (Low Alert)</span>`;
      }

      return `
        <tr>
          <td><code style="font-size: 0.82rem; background: var(--bg-input); padding: 2px 6px; border-radius: 4px;">${p.barcode}</code></td>
          <td><strong>${p.name}</strong></td>
          <td><span class="badge-cat">${p.category}</span></td>
          <td>₹${p.price.toFixed(2)}</td>
          <td>${stockStatusBadge}</td>
          <td>
            <div style="display: flex; gap: 0.35rem;">
              <button class="btn-icon" style="width: 28px; height: 28px;" onclick="window.AntigravityInventory.openProductModal(${p.id})" title="Edit Product">✏️</button>
              <button class="btn-icon" style="width: 28px; height: 28px;" onclick="window.AntigravityInventory.quickRestock(${p.id}, '${p.name.replace(/'/g, "\\'")}', ${p.stock_count})" title="Quick Restock">➕</button>
              <button class="btn-icon" style="width: 28px; height: 28px;" onclick="window.AntigravityInventory.deleteProduct(${p.id})" title="Delete Product">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  openProductModal(productId = null) {
    const modal = document.getElementById('productModal');
    const form = document.getElementById('productForm');
    const modalTitle = document.getElementById('productModalTitle');
    if (!modal || !form) return;

    form.reset();
    document.getElementById('formProductId').value = '';

    if (productId) {
      const prod = this.products.find(p => p.id === productId);
      if (prod) {
        modalTitle.textContent = 'Edit Product (Inventory)';
        document.getElementById('formProductId').value = prod.id;
        document.getElementById('formBarcode').value = prod.barcode;
        document.getElementById('formName').value = prod.name;
        document.getElementById('formCategory').value = prod.category;
        document.getElementById('formPrice').value = prod.price;
        document.getElementById('formCostPrice').value = prod.cost_price || 0;
        document.getElementById('formStockCount').value = prod.stock_count;
        document.getElementById('formThreshold').value = prod.low_stock_threshold;
        document.getElementById('formDescription').value = prod.description || '';
      }
    } else {
      modalTitle.textContent = 'Add New Product (Inventory)';
    }

    modal.classList.add('active');
  }

  openProductModalWithBarcode(barcode) {
    this.openProductModal();
    const barcodeInput = document.getElementById('formBarcode');
    if (barcodeInput) barcodeInput.value = barcode;
    const nameInput = document.getElementById('formName');
    if (nameInput) setTimeout(() => nameInput.focus(), 200);
  }

  handleBarcodeScanToAddOrEdit(barcode) {
    const cleanBarcode = barcode.trim();
    if (!cleanBarcode) return;

    const existing = this.products.find(p => p.barcode === cleanBarcode);
    if (existing) {
      this.openProductModal(existing.id);
      if (window.InfinatortPOS) {
        window.InfinatortPOS.showToast(`Found "${existing.name}" (Barcode: ${cleanBarcode}). Edit or restock below.`, 'info');
      }
    } else {
      this.openProductModalWithBarcode(cleanBarcode);
      if (window.InfinatortPOS) {
        window.InfinatortPOS.showToast(`New barcode ${cleanBarcode} scanned! Enter details to save.`, 'success');
      }
    }
  }

  async saveProduct() {
    const id = document.getElementById('formProductId').value;
    const barcode = document.getElementById('formBarcode').value.trim();
    const name = document.getElementById('formName').value.trim();
    const category = document.getElementById('formCategory').value;
    const price = parseFloat(document.getElementById('formPrice').value);
    const cost_price = parseFloat(document.getElementById('formCostPrice').value) || 0;
    const stock_count = parseInt(document.getElementById('formStockCount').value) || 0;
    const low_stock_threshold = parseInt(document.getElementById('formThreshold').value) || 5;
    const description = document.getElementById('formDescription').value.trim();

    if (!barcode || !name || !category || isNaN(price)) {
      alert('Please fill out all required fields.');
      return;
    }

    const payload = {
      barcode,
      name,
      category,
      price,
      cost_price,
      stock_count,
      low_stock_threshold,
      description
    };

    try {
      const url = id ? `/api/products/${id}` : '/api/products';
      const method = id ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save product');
      }

      document.getElementById('productModal').classList.remove('active');
      await this.loadProducts();

      // Also reload POS catalog so it reflects immediately
      if (window.InfinatortPOS) {
        window.InfinatortPOS.loadCatalog();
      }

      alert(id ? 'Product updated successfully!' : 'Product added to inventory!');
    } catch (err) {
      alert(`Error saving product: ${err.message}`);
    }
  }

  async quickRestock(id, name, currentStock) {
    const addedStr = prompt(`Restock "${name}"\nCurrent Stock: ${currentStock}\n\nEnter quantity to add:`, '10');
    if (addedStr === null) return;
    const added = parseInt(addedStr);
    if (isNaN(added) || added <= 0) {
      alert('Invalid quantity entered.');
      return;
    }

    try {
      const res = await fetch(`/api/products/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stock_count: currentStock + added })
      });

      if (res.ok) {
        await this.loadProducts();
        if (window.InfinatortPOS) window.InfinatortPOS.loadCatalog();
      }
    } catch (err) {
      alert('Failed to restock: ' + err.message);
    }
  }

  async deleteProduct(id) {
    if (!confirm('Are you sure you want to delete this product?')) return;

    try {
      const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await this.loadProducts();
        if (window.InfinatortPOS) window.InfinatortPOS.loadCatalog();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to delete');
      }
    } catch (e) {
      alert('Error deleting: ' + e.message);
    }
  }
}

// Instantiate globally
window.AntigravityInventory = new AntigravityInventory();
