/**
 * Sunshine Inventory Management Controller
 * Handles Product Catalog CRUD, Stock Audits, Glass Dashboard Metrics,
 * Category Intelligence Grid, Stock Health Monitoring, and Barcode Label Operations.
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
    this.searchClearBtn = document.getElementById('btnInventorySearchClear');
    this.categoryFilter = document.getElementById('inventoryCategoryFilter');
    this.lowStockCheckbox = document.getElementById('inventoryLowStockOnly');
    this.categoryDashboardGrid = document.getElementById('categoryDashboardGrid');
    this.btnResetCategoryFilter = document.getElementById('btnResetCategoryFilter');
    this.healthBarInStock = document.getElementById('healthBarInStock');
    this.healthBarLowStock = document.getElementById('healthBarLowStock');
    this.healthBarOutStock = document.getElementById('healthBarOutStock');
    this.healthInStockCount = document.getElementById('healthInStockCount');
    this.healthLowStockCount = document.getElementById('healthLowStockCount');
    this.healthOutStockCount = document.getElementById('healthOutStockCount');
    this.stockFilterChips = document.getElementById('inventoryStockFilterChips');
    this.cloudStatusBadge = document.getElementById('cloudSyncStatusBadge');
    this.cloudDetailText = document.getElementById('cloudSyncDetailText');
    this.btnManualCloudSync = document.getElementById('btnManualCloudSync');
    this.syncIconSpin = document.getElementById('syncIconSpin');
    this.syncBtnText = document.getElementById('syncBtnText');

    this.activeCategoryFilter = '';
    this.activeStockFilter = 'all'; // 'all' | 'healthy' | 'low' | 'out'

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
          const rand = Math.floor(100000000000 + Math.random() * 900000000000);
          barcodeInput.value = rand.toString();
        }
      });
    }

    // Search input typing and clear button
    if (this.searchFilter) {
      this.searchFilter.addEventListener('input', () => {
        if (this.searchClearBtn) {
          this.searchClearBtn.style.display = this.searchFilter.value.trim() ? 'block' : 'none';
        }
        this.renderTable();
      });
    }

    if (this.searchClearBtn) {
      this.searchClearBtn.addEventListener('click', () => {
        this.searchFilter.value = '';
        this.searchClearBtn.style.display = 'none';
        this.renderTable();
        this.searchFilter.focus();
      });
    }

    // Category filter select change
    if (this.categoryFilter) {
      this.categoryFilter.addEventListener('change', () => {
        this.activeCategoryFilter = this.categoryFilter.value;
        this.updateCategoryCardActiveState();
        this.renderTable();
      });
    }

    // Reset Category filter button
    if (this.btnResetCategoryFilter) {
      this.btnResetCategoryFilter.addEventListener('click', () => {
        this.activeCategoryFilter = '';
        if (this.categoryFilter) this.categoryFilter.value = '';
        this.updateCategoryCardActiveState();
        this.renderTable();
      });
    }

    // Stock Filter Chips
    if (this.stockFilterChips) {
      this.stockFilterChips.querySelectorAll('.filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          this.stockFilterChips.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
          this.activeStockFilter = chip.dataset.filter || 'all';
          this.renderTable();
        });
      });
    }

    // Interactive Legend in Stock Health Monitor
    const legIn = document.getElementById('legendInStock');
    if (legIn) {
      legIn.style.cursor = 'pointer';
      legIn.addEventListener('click', () => this.toggleStockFilter('healthy'));
    }
    const legLow = document.getElementById('legendLowStock');
    if (legLow) {
      legLow.style.cursor = 'pointer';
      legLow.addEventListener('click', () => this.toggleStockFilter('low'));
    }
    const legOut = document.getElementById('legendOutStock');
    if (legOut) {
      legOut.style.cursor = 'pointer';
      legOut.addEventListener('click', () => this.toggleStockFilter('out'));
    }
  }

  toggleStockFilter(filterKey) {
    if (this.activeStockFilter === filterKey) {
      this.activeStockFilter = 'all';
    } else {
      this.activeStockFilter = filterKey;
    }

    if (this.stockFilterChips) {
      this.stockFilterChips.querySelectorAll('.filter-chip').forEach(c => {
        c.classList.toggle('active', (c.dataset.filter || 'all') === this.activeStockFilter);
      });
    }
    this.renderTable();
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
      if (this.statsTotalValue) this.statsTotalValue.textContent = `₹${data.totalInventoryValue.toLocaleString('en-IN')}`;
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
      this.renderCategoryDashboard();
      this.updateStockHealthMonitor();
      this.renderTable();
      this.loadStats();
      this.checkCloudStatus();
    } catch (err) {
      console.error('Inventory load error:', err);
    }
  }

  updateStockHealthMonitor() {
    const total = this.products.length;
    const out = this.products.filter(p => p.stock_count <= 0).length;
    const low = this.products.filter(p => p.stock_count > 0 && p.stock_count <= p.low_stock_threshold).length;
    const healthy = this.products.filter(p => p.stock_count > p.low_stock_threshold).length;

    if (this.healthInStockCount) this.healthInStockCount.textContent = healthy;
    if (this.healthLowStockCount) this.healthLowStockCount.textContent = low;
    if (this.healthOutStockCount) this.healthOutStockCount.textContent = out;

    if (total === 0) {
      if (this.healthBarInStock) this.healthBarInStock.style.width = '100%';
      if (this.healthBarLowStock) this.healthBarLowStock.style.width = '0%';
      if (this.healthBarOutStock) this.healthBarOutStock.style.width = '0%';
      return;
    }

    const pctIn = ((healthy / total) * 100).toFixed(1);
    const pctLow = ((low / total) * 100).toFixed(1);
    const pctOut = ((out / total) * 100).toFixed(1);

    if (this.healthBarInStock) this.healthBarInStock.style.width = `${pctIn}%`;
    if (this.healthBarLowStock) this.healthBarLowStock.style.width = `${pctLow}%`;
    if (this.healthBarOutStock) this.healthBarOutStock.style.width = `${pctOut}%`;
  }

  renderCategoryDashboard() {
    if (!this.categoryDashboardGrid) return;

    const allCats = window.SunshineCategories ? window.SunshineCategories.getAll() : [];
    // Also include any categories present in products
    const productCats = Array.from(new Set(this.products.map(p => p.category))).filter(Boolean);
    productCats.forEach(c => {
      if (!allCats.includes(c)) allCats.push(c);
    });

    const cardsHtml = allCats.map(catName => {
      const meta = window.SunshineCategories ? window.SunshineCategories.get(catName) : {
        name: catName,
        icon: '📦',
        color: '#38bdf8',
        bg: 'rgba(56, 189, 248, 0.16)',
        border: 'rgba(56, 189, 248, 0.4)',
        glow: 'rgba(56, 189, 248, 0.25)'
      };

      const prodsInCat = this.products.filter(p => p.category === catName);
      const skuCount = prodsInCat.length;
      const totalUnits = prodsInCat.reduce((acc, p) => acc + (p.stock_count || 0), 0);
      const totalVal = prodsInCat.reduce((acc, p) => acc + ((p.stock_count || 0) * (p.price || 0)), 0);
      const isActive = this.activeCategoryFilter === catName;

      return `
        <div class="category-card ${isActive ? 'active' : ''}" 
             data-cat="${catName}"
             style="--cat-color: ${meta.color}; --cat-bg: ${meta.bg}; --cat-border: ${meta.border}; --cat-glow: ${meta.glow};">
          <div class="cat-card-icon-wrap">
            <span>${meta.icon}</span>
          </div>
          <div class="cat-card-info">
            <div class="cat-card-name" title="${catName}">${catName}</div>
            <div class="cat-card-meta">${skuCount} SKU${skuCount === 1 ? '' : 's'} • ${totalUnits} units</div>
            <div class="cat-card-val">₹${totalVal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
          </div>
        </div>
      `;
    }).join('');

    this.categoryDashboardGrid.innerHTML = cardsHtml;

    // Attach click listener to each card
    this.categoryDashboardGrid.querySelectorAll('.category-card').forEach(card => {
      card.addEventListener('click', () => {
        const cat = card.dataset.cat;
        if (this.activeCategoryFilter === cat) {
          this.activeCategoryFilter = '';
        } else {
          this.activeCategoryFilter = cat;
        }

        if (this.categoryFilter) this.categoryFilter.value = this.activeCategoryFilter;
        this.updateCategoryCardActiveState();
        this.renderTable();
      });
    });

    this.updateCategoryCardActiveState();
  }

  updateCategoryCardActiveState() {
    if (this.categoryDashboardGrid) {
      this.categoryDashboardGrid.querySelectorAll('.category-card').forEach(card => {
        card.classList.toggle('active', card.dataset.cat === this.activeCategoryFilter);
      });
    }

    if (this.btnResetCategoryFilter) {
      this.btnResetCategoryFilter.style.display = this.activeCategoryFilter ? 'inline-flex' : 'none';
      if (this.activeCategoryFilter) {
        this.btnResetCategoryFilter.textContent = `Clear Filter (${this.activeCategoryFilter}) ✕`;
      }
    }
  }

  populateCategoryFilter() {
    const allCats = window.SunshineCategories ? window.SunshineCategories.getAll() : [];
    const productCats = Array.from(new Set(this.products.map(p => p.category))).filter(Boolean);
    productCats.forEach(c => {
      if (!allCats.includes(c)) allCats.push(c);
    });

    if (this.categoryFilter) {
      const currentVal = this.categoryFilter.value || this.activeCategoryFilter;
      this.categoryFilter.innerHTML = '<option value="">🏷️ All Categories</option>' +
        allCats.map(cat => {
          const meta = window.SunshineCategories ? window.SunshineCategories.get(cat) : { icon: '📦' };
          return `<option value="${cat}">${meta.icon} ${cat}</option>`;
        }).join('');
      this.categoryFilter.value = currentVal;
    }

    // Modal form category dropdown
    const formCat = document.getElementById('formCategory');
    if (formCat) {
      const curFormVal = formCat.value;
      formCat.innerHTML = allCats.map(cat => {
        const meta = window.SunshineCategories ? window.SunshineCategories.get(cat) : { icon: '📦' };
        return `<option value="${cat}">${meta.icon} ${cat}</option>`;
      }).join('');
      if (curFormVal) formCat.value = curFormVal;
    }
  }

  renderTable() {
    if (!this.tableBody) return;

    const query = (this.searchFilter?.value || '').toLowerCase().trim();
    const selectedCat = this.activeCategoryFilter || this.categoryFilter?.value || '';
    const stockFilter = this.activeStockFilter;

    let filtered = this.products.filter(p => {
      const matchesSearch = !query ||
        p.name.toLowerCase().includes(query) ||
        p.barcode.toLowerCase().includes(query) ||
        p.category.toLowerCase().includes(query);

      const matchesCat = !selectedCat || p.category === selectedCat;

      let matchesStock = true;
      if (stockFilter === 'healthy') {
        matchesStock = p.stock_count > p.low_stock_threshold;
      } else if (stockFilter === 'low') {
        matchesStock = p.stock_count > 0 && p.stock_count <= p.low_stock_threshold;
      } else if (stockFilter === 'out') {
        matchesStock = p.stock_count <= 0;
      }

      return matchesSearch && matchesCat && matchesStock;
    });

    if (filtered.length === 0) {
      this.tableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 2.5rem 1rem; color: var(--text-muted);">
            <div style="font-size: 2.2rem; margin-bottom: 0.5rem;">🔍</div>
            <strong style="color: #ffffff; font-size: 0.95rem; display: block; margin-bottom: 0.25rem;">No inventory items found</strong>
            <span style="font-size: 0.78rem;">Try clearing your filters or search keywords to view all items.</span>
          </td>
        </tr>
      `;
      return;
    }

    this.tableBody.innerHTML = filtered.map(p => {
      const catMeta = window.SunshineCategories ? window.SunshineCategories.get(p.category) : {
        color: '#38bdf8',
        icon: '📦',
        bg: 'rgba(56, 189, 248, 0.16)',
        border: 'rgba(56, 189, 248, 0.4)'
      };

      const badgeHtml = window.SunshineCategories
        ? window.SunshineCategories.getBadgeHtml(p.category)
        : `<span class="badge-cat">${p.category}</span>`;

      let stockBadge = `<span class="status-badge" style="background: rgba(16, 185, 129, 0.18); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.35);"><span class="status-pulse" style="background: #34d399;"></span>${p.stock_count} In Stock</span>`;
      if (p.stock_count <= 0) {
        stockBadge = `<span class="status-badge" style="background: rgba(239, 68, 68, 0.18); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.35);"><span class="status-pulse" style="background: #ef4444;"></span>0 Out of Stock</span>`;
      } else if (p.stock_count <= p.low_stock_threshold) {
        stockBadge = `<span class="status-badge" style="background: rgba(245, 158, 11, 0.18); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.35);"><span class="status-pulse" style="background: #f59e0b;"></span>${p.stock_count} Low Alert</span>`;
      }

      return `
        <tr style="--row-cat-color: ${catMeta.color};">
          <td class="td-barcode" data-label="Barcode"><code style="font-size: 0.8rem; background: var(--bg-input); padding: 3px 8px; border-radius: 4px; border: 1px solid var(--glass-border-light); font-family: monospace; color: var(--text-secondary);">#${p.barcode}</code></td>
          <td class="td-name" data-label="Product"><strong>${p.name}</strong></td>
          <td class="td-cat" data-label="Category">${badgeHtml}</td>
          <td class="td-price" data-label="Retail Price"><span style="font-weight: 800; color: #38bdf8; font-family: monospace; font-size: 0.95rem;">₹${p.price.toFixed(2)}</span></td>
          <td class="td-stock" data-label="Stock Units">${stockBadge}</td>
          <td class="td-actions" data-label="Actions">
            <div style="display: flex; gap: 0.4rem; justify-content: flex-end;">
              <button class="btn-icon" style="width: 32px; height: 32px; font-size: 0.85rem;" onclick="window.AntigravityInventory.openProductModal(${p.id})" title="Edit Product">✏️</button>
              <button class="btn-icon" style="width: 32px; height: 32px; font-size: 0.85rem;" onclick="window.AntigravityInventory.quickRestock(${p.id}, '${p.name.replace(/'/g, "\\'")}', ${p.stock_count})" title="Quick Restock">➕</button>
              <button class="btn-icon" style="width: 32px; height: 32px; font-size: 0.85rem;" onclick="window.AntigravityInventory.deleteProduct(${p.id})" title="Delete Product">🗑️</button>
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
