import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  Alert,
} from 'react-native';
import { fetchProducts, createProduct, Product } from '../services/api';

export const AntigravityStockScreen = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [modalVisible, setModalVisible] = useState(false);

  // Form states
  const [barcode, setBarcode] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Accessories');
  const [price, setPrice] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [stockCount, setStockCount] = useState('');

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      const data = await fetchProducts(search);
      setProducts(data);
    } catch (err: any) {
      console.warn('Load products failed:', err.message);
    }
  };

  const handleSaveProduct = async () => {
    if (!barcode || !name || !price || !stockCount) {
      Alert.alert('Validation Error', 'Barcode, Name, Price, and Stock are required.');
      return;
    }

    try {
      await createProduct({
        barcode: barcode.trim(),
        name: name.trim(),
        category,
        price: parseFloat(price),
        cost_price: parseFloat(costPrice) || 0,
        stock_count: parseInt(stockCount, 10),
        low_stock_threshold: 5,
      });

      setModalVisible(false);
      resetForm();
      loadProducts();
      Alert.alert('Success', `Product "${name}" added to Antigravity inventory.`);
    } catch (err: any) {
      Alert.alert('Save Failed', err.message);
    }
  };

  const resetForm = () => {
    setBarcode('');
    setName('');
    setCategory('Accessories');
    setPrice('');
    setCostPrice('');
    setStockCount('');
  };

  return (
    <View style={styles.container}>
      {/* Metrics Row */}
      <View style={styles.metricsRow}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Total SKUs</Text>
          <Text style={styles.metricVal}>{products.length}</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Total Stock</Text>
          <Text style={styles.metricVal}>
            {products.reduce((acc, p) => acc + p.stock_count, 0)}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setModalVisible(true)}
        >
          <Text style={styles.addBtnText}>➕ Add Item</Text>
        </TouchableOpacity>
      </View>

      {/* Inventory Search */}
      <TextInput
        style={styles.searchInput}
        placeholder="Filter by name, barcode, or category..."
        placeholderTextColor="#64748b"
        value={search}
        onChangeText={(text) => {
          setSearch(text);
          fetchProducts(text).then(setProducts).catch(() => {});
        }}
      />

      {/* Products Table / List */}
      <FlatList
        data={products}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <View style={styles.productRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.barcodeText}>#{item.barcode}</Text>
              <Text style={styles.productName}>{item.name}</Text>
              <Text style={styles.categoryBadge}>{item.category}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.priceText}>₹{item.price.toFixed(2)}</Text>
              <Text style={[styles.stockTag, item.stock_count <= 5 && styles.stockLow]}>
                Stock: {item.stock_count}
              </Text>
            </View>
          </View>
        )}
      />

      {/* Add Product Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Add Product (Antigravity)</Text>

            <TextInput
              style={styles.input}
              placeholder="Barcode ID / SKU *"
              placeholderTextColor="#64748b"
              value={barcode}
              onChangeText={setBarcode}
            />
            <TextInput
              style={styles.input}
              placeholder="Product Name *"
              placeholderTextColor="#64748b"
              value={name}
              onChangeText={setName}
            />
            <TextInput
              style={styles.input}
              placeholder="Category (Accessories, Books, Pens...)"
              placeholderTextColor="#64748b"
              value={category}
              onChangeText={setCategory}
            />
            <TextInput
              style={styles.input}
              placeholder="Retail Selling Price (₹) *"
              placeholderTextColor="#64748b"
              keyboardType="numeric"
              value={price}
              onChangeText={setPrice}
            />
            <TextInput
              style={styles.input}
              placeholder="Wholesale Cost Price (₹)"
              placeholderTextColor="#64748b"
              keyboardType="numeric"
              value={costPrice}
              onChangeText={setCostPrice}
            />
            <TextInput
              style={styles.input}
              placeholder="Initial Stock Quantity *"
              placeholderTextColor="#64748b"
              keyboardType="numeric"
              value={stockCount}
              onChangeText={setStockCount}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleSaveProduct}
              >
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', padding: 12 },
  metricsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  metricCard: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  metricLabel: { color: '#94a3b8', fontSize: 11, fontWeight: '600' },
  metricVal: { color: '#f8fafc', fontSize: 18, fontWeight: '800', marginTop: 2 },
  addBtn: {
    backgroundColor: '#06b6d4',
    borderRadius: 8,
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addBtnText: { color: '#0f172a', fontWeight: '700', fontSize: 13 },
  searchInput: {
    backgroundColor: '#1e293b',
    color: '#f8fafc',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 42,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 10,
  },
  productRow: {
    backgroundColor: '#1e293b',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  barcodeText: { color: '#64748b', fontSize: 11, fontFamily: 'monospace' },
  productName: { color: '#f8fafc', fontSize: 14, fontWeight: '600', marginVertical: 2 },
  categoryBadge: { color: '#06b6d4', fontSize: 11, fontWeight: '600' },
  priceText: { color: '#38bdf8', fontSize: 14, fontWeight: '700' },
  stockTag: { color: '#34d399', fontSize: 12, marginTop: 4 },
  stockLow: { color: '#f59e0b', fontWeight: 'bold' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.85)',
    justifyContent: 'center',
    padding: 20,
  },
  modalBox: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalTitle: { color: '#f8fafc', fontSize: 16, fontWeight: '700', marginBottom: 14 },
  input: {
    backgroundColor: '#0f172a',
    color: '#f8fafc',
    borderRadius: 6,
    paddingHorizontal: 12,
    height: 40,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 10 },
  cancelBtn: { paddingVertical: 8, paddingHorizontal: 14 },
  cancelBtnText: { color: '#94a3b8' },
  saveBtn: { backgroundColor: '#10b981', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 6 },
  saveBtnText: { color: '#ffffff', fontWeight: '700' },
});
