import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  Alert,
  ScrollView,
} from 'react-native';
import {
  fetchProducts,
  fetchProductByBarcode,
  completeCheckout,
  sendToLedgerWebhook,
  Product,
  CartItem,
} from '../services/api';

export const InfinatortPOSScreen = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'UPI' | 'Cash' | 'Card'>('UPI');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [discount, setDiscount] = useState('0');

  const categories = [
    'All', 'Accessories', 'Books', 'Pens', 'Gadgets',
    'Smartwatches', 'Phones', 'Earphones', 'Earpods', 'Earbuds', 'Neckbands'
  ];

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      const data = await fetchProducts();
      setProducts(data);
    } catch (err: any) {
      console.warn('Load products failed:', err.message);
    }
  };

  // Called when camera scanner or manual input decodes a barcode
  const handleBarcodeScanned = async (barcode: string) => {
    const clean = barcode.trim();
    let product = products.find((p) => p.barcode === clean);

    if (!product) {
      try {
        product = await fetchProductByBarcode(clean);
      } catch {
        Alert.alert(
          'Product Not Found',
          `Barcode #${clean} is not registered in the inventory.`,
          [{ text: 'OK' }]
        );
        return;
      }
    }

    if (product) {
      addToCart(product);
    }
  };

  const addToCart = (product: Product) => {
    if (product.stock_count <= 0) {
      Alert.alert('Out of Stock', `"${product.name}" has 0 stock remaining.`);
      return;
    }

    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        if (existing.quantity + 1 > product.stock_count) {
          Alert.alert('Stock Limit', `Only ${product.stock_count} units available in stock.`);
          return prev;
        }
        return prev.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const updateQuantity = (id: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.id === id) {
            const newQty = item.quantity + delta;
            if (newQty > item.stock_count) {
              Alert.alert('Limit Reached', `Only ${item.stock_count} available.`);
              return item;
            }
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discountVal = parseFloat(discount) || 0;
  const totalAmount = Math.max(0, subtotal - discountVal);

  const handleCheckout = async () => {
    if (cart.length === 0) {
      Alert.alert('Cart is empty', 'Please scan or add products first.');
      return;
    }

    const payload = {
      items: cart.map((i) => ({
        id: i.id,
        barcode: i.barcode,
        name: i.name,
        category: i.category,
        price: i.price,
        quantity: i.quantity,
        total: i.price * i.quantity,
      })),
      payment_method: paymentMethod,
      customer_name: 'Walk-in Customer',
      discount: discountVal,
      total_amount: totalAmount,
    };

    try {
      const result = await completeCheckout(payload);
      const sale = result.sale;

      // Dispatch Webhook to External Ledger Portal
      const ledgerRes = await sendToLedgerWebhook(
        'http://localhost:3000/api/ledger/mock-receiver',
        sale.ledgerPayload
      );

      Alert.alert(
        'Sale Completed! 🎉',
        `Invoice: ${sale.invoice_id}\nTotal: ₹${sale.total_amount}\nLedger Sync: ${ledgerRes.success ? 'Success ✓' : 'Queued'}`,
        [{ text: 'New Sale', onPress: () => { setCart([]); setDiscount('0'); loadProducts(); } }]
      );
    } catch (err: any) {
      Alert.alert('Checkout Failed', err.message);
    }
  };

  return (
    <View style={styles.container}>
      {/* Search & Quick Barcode Scan Input */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Scan or enter barcode / search item..."
          placeholderTextColor="#64748b"
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={() => {
            if (search) {
              handleBarcodeScanned(search);
              setSearch('');
            }
          }}
        />
        <TouchableOpacity
          style={styles.scanBtn}
          onPress={() => {
            Alert.prompt
              ? Alert.prompt('Barcode Scanner', 'Enter or scan barcode:', (val) => val && handleBarcodeScanned(val))
              : Alert.alert('Camera Scanner', 'Aim phone camera at packaging to decode.');
          }}
        >
          <Text style={styles.scanBtnText}>📷</Text>
        </TouchableOpacity>
      </View>

      {/* Category Pills */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
        {categories.map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[styles.pill, selectedCategory === cat && styles.pillActive]}
            onPress={() => setSelectedCategory(cat)}
          >
            <Text style={[styles.pillText, selectedCategory === cat && styles.pillTextActive]}>
              {cat}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Cart Section */}
      <View style={styles.cartSection}>
        <Text style={styles.sectionTitle}>Current Bill ({cart.length} items)</Text>
        <FlatList
          data={cart}
          keyExtractor={(item) => item.id.toString()}
          ListEmptyComponent={<Text style={styles.emptyCart}>Cart is empty. Scan items to add.</Text>}
          renderItem={({ item }) => (
            <View style={styles.cartItem}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemMeta}>₹{item.price} × {item.quantity}</Text>
              </View>
              <View style={styles.qtyRow}>
                <TouchableOpacity style={styles.qtyBtn} onPress={() => updateQuantity(item.id, -1)}>
                  <Text style={styles.qtyBtnText}>-</Text>
                </TouchableOpacity>
                <Text style={styles.qtyVal}>{item.quantity}</Text>
                <TouchableOpacity style={styles.qtyBtn} onPress={() => updateQuantity(item.id, 1)}>
                  <Text style={styles.qtyBtnText}>+</Text>
                </TouchableOpacity>
                <Text style={styles.itemTotal}>₹{(item.price * item.quantity).toFixed(2)}</Text>
              </View>
            </View>
          )}
        />
      </View>

      {/* Checkout Footer */}
      <View style={styles.checkoutFooter}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total Amount</Text>
          <Text style={styles.totalValue}>₹{totalAmount.toFixed(2)}</Text>
        </View>

        {/* Payment Methods */}
        <View style={styles.paymentRow}>
          {(['UPI', 'Cash', 'Card'] as const).map((method) => (
            <TouchableOpacity
              key={method}
              style={[styles.payMethodBtn, paymentMethod === method && styles.payMethodActive]}
              onPress={() => setPaymentMethod(method)}
            >
              <Text style={[styles.payMethodText, paymentMethod === method && styles.payMethodTextActive]}>
                {method}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.checkoutBtn} onPress={handleCheckout}>
          <Text style={styles.checkoutBtnText}>✓ Complete Sale & Sync Ledger</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', padding: 12 },
  searchRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  searchInput: {
    flex: 1,
    backgroundColor: '#1e293b',
    color: '#f8fafc',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: '#334155',
  },
  scanBtn: {
    backgroundColor: '#06b6d4',
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanBtnText: { fontSize: 20 },
  categoryScroll: { maxHeight: 38, marginBottom: 10 },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#1e293b',
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  pillActive: { backgroundColor: '#06b6d4', borderColor: '#06b6d4' },
  pillText: { color: '#94a3b8', fontSize: 12, fontWeight: '600' },
  pillTextActive: { color: '#0f172a' },
  cartSection: { flex: 1, backgroundColor: '#1e293b', borderRadius: 12, padding: 12, marginBottom: 12 },
  sectionTitle: { color: '#f8fafc', fontSize: 15, fontWeight: '700', marginBottom: 8 },
  emptyCart: { color: '#64748b', textAlign: 'center', marginTop: 30 },
  cartItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    paddingVertical: 8,
  },
  itemName: { color: '#f8fafc', fontSize: 13, fontWeight: '600' },
  itemMeta: { color: '#94a3b8', fontSize: 11, marginTop: 2 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qtyBtn: {
    backgroundColor: '#334155',
    width: 26,
    height: 26,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnText: { color: '#f8fafc', fontWeight: 'bold' },
  qtyVal: { color: '#f8fafc', fontWeight: 'bold', minWidth: 18, textAlign: 'center' },
  itemTotal: { color: '#38bdf8', fontWeight: '700', minWidth: 60, textAlign: 'right' },
  checkoutFooter: { backgroundColor: '#1e293b', borderRadius: 12, padding: 12 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  totalLabel: { color: '#94a3b8', fontSize: 14, fontWeight: '600' },
  totalValue: { color: '#34d399', fontSize: 18, fontWeight: '800' },
  paymentRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  payMethodBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  payMethodActive: { backgroundColor: 'rgba(6,182,212,0.15)', borderColor: '#06b6d4' },
  payMethodText: { color: '#94a3b8', fontWeight: '600', fontSize: 13 },
  payMethodTextActive: { color: '#06b6d4' },
  checkoutBtn: {
    backgroundColor: '#10b981',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  checkoutBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
});
