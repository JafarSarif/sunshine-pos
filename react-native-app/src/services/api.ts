// Base API Client for Node.js Express Backend
// When connected via USB with "adb reverse tcp:3000 tcp:3000", localhost:3000 works directly!
export const API_BASE_URL = 'http://localhost:3000/api';

export interface Product {
  id: number;
  barcode: string;
  name: string;
  category: string;
  price: number;
  cost_price?: number;
  stock_count: number;
  low_stock_threshold: number;
  description?: string;
}

export interface CartItem extends Product {
  quantity: number;
}

export const fetchProducts = async (query?: string, category?: string): Promise<Product[]> => {
  const params = new URLSearchParams();
  if (query) params.append('q', query);
  if (category && category !== 'All') params.append('category', category);
  
  const res = await fetch(`${API_BASE_URL}/products?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to load products');
  return res.json();
};

export const fetchProductByBarcode = async (barcode: string): Promise<Product> => {
  const res = await fetch(`${API_BASE_URL}/products/${encodeURIComponent(barcode)}`);
  if (!res.ok) throw new Error('Product not found');
  return res.json();
};

export const createProduct = async (productData: Partial<Product>): Promise<Product> => {
  const res = await fetch(`${API_BASE_URL}/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(productData),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to create product');
  }
  return res.json();
};

export const completeCheckout = async (checkoutData: any): Promise<any> => {
  const res = await fetch(`${API_BASE_URL}/sales`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(checkoutData),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Checkout failed');
  }
  return res.json();
};

export const sendToLedgerWebhook = async (endpoint: string, saleData: any) => {
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(saleData),
    });
    return { success: res.ok, status: res.status };
  } catch (err: any) {
    // Fallback through backend forwarder
    const proxyRes = await fetch(`${API_BASE_URL}/ledger/forward`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint_url: endpoint, payload: saleData }),
    });
    return proxyRes.json();
  }
};
