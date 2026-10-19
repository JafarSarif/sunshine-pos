# Antigravity Inventory & Infinatort POS System

A fast, responsive web-based shop management system built with **Node.js (Express)**, **SQLite (via `better-sqlite3`)**, and **vanilla HTML5/CSS/JavaScript**.

---

## 🏗️ System Overview

1. **Antigravity (Inventory Management System)**
   - Tracks stock levels, prices, cost prices, barcode IDs/SKUs, low-stock thresholds, and categories.
   - Handles 10 distinct categories: *Accessories, Books, Pens, Gadgets, Smartwatches, Phones, Earphones, Earpods, Earbuds, Neckbands*.
   - **Scan to Add/Edit Products**: Tap the **"📷 Scan to Add/Edit"** button in Antigravity or the **"📷 Scan"** button next to the barcode field to scan product packaging with your phone's camera. The system auto-fills the barcode and focuses on product details!
   - Live search, filtering, quick stock adjustments, and barcode generation.

2. **Infinatort (Point of Sale & Billing System)**
   - **Smartphone Camera Barcode Scanning**: Uses the `html5-qrcode` library to turn any mobile phone's camera into a high-speed barcode reader with zero hardware scanners required.
   - **Audio & Haptic Feedback**: Synthesizes a crisp retail POS beep via the browser's Web Audio API (`AudioContext`) on successful scan.
   - **Debounced Continuous Scanning**: Prevents accidental duplicate scans when holding an item in front of the lens.
   - **Quick Add from Checkout**: If an unregistered barcode is scanned during billing, a 1-tap **"➕ Add Product Now"** banner appears, letting you register the item in seconds without typing the barcode.
   - **Real-time Cart**: Instantly adds scanned items, calculates subtotals, discounts, tax, and supports multiple payment methods (UPI, Cash, Card).
   - **External Ledger Webhook**: Immediately dispatches an HTTP `fetch()` `POST` request with the complete transaction payload to your external daily ledger portal.

---

## 📁 Project File Structure

```
SUNSHINE INVENTRY MANAGEMENT SYSTEM/
├── package.json               # Project manifest & npm scripts
├── server.js                  # Express backend, REST APIs & webhook proxy
├── database.js                # SQLite schema, tables, indices & seed data
├── data/
│   └── store.db               # SQLite database file (auto-generated in WAL mode)
├── public/
│   ├── index.html             # Unified responsive SPA (Infinatort & Antigravity)
│   ├── css/
│   │   └── style.css          # Mobile-first retail dark/modern stylesheet
│   └── js/
│       ├── html5-qrcode.min.js# Offline-ready camera barcode scanner engine
│       ├── scanner.js         # Camera lifecycle, rear camera selector, audio synthesizer
│       ├── pos.js             # Cart controller, checkout & external ledger webhook
│       └── inventory.js       # Antigravity stock CRUD, restock & analytics
└── README.md
```

---

## 🚀 Setup & Installation

### 1. Install Dependencies
```bash
npm install
```

Installed packages:
- `express`: REST API web server.
- `better-sqlite3`: Ultra-fast, synchronous, crash-safe SQLite driver.
- `cors`: Cross-Origin Resource Sharing middleware.
- `morgan`: HTTP request logger.
- `dotenv`: Environment configuration.
- `html5-qrcode`: In-browser camera barcode/QR code reader.

### 2. Start the Server
```bash
npm start
```
Or for auto-reloading during development:
```bash
npm run dev
```

The application will start on:
- **Local Machine**: `http://localhost:3000`
- **Smartphone (Same Wi-Fi)**: `http://<YOUR_COMPUTER_IP>:3000`

---

## 📱 How to Use on a Smartphone (Camera Barcode Scanning)

1. Connect your smartphone to the **same Wi-Fi network** as your computer.
2. Find your computer's local IP address (`ipconfig` on Windows or `ifconfig | grep "inet "` on Mac/Linux).
3. Open the browser on your phone and navigate to: `http://<YOUR_COMPUTER_IP>:3000`.
4. Tap **"Start Camera"** under the Infinatort tab:
   - Your browser will prompt: *"Allow sunshine-system to use your camera?"* -> Tap **Allow**.
   - Point your phone's camera at any barcode (e.g. the barcode on a book, smartwatch box, or earphone pack).
   - As soon as the barcode is aligned in the reticle, you will hear a **crisp POS beep** and the item will be added to your cart instantly!

> [!TIP]
> **Mobile Browser Security Note**:
> Modern mobile browsers (iOS Safari and Android Chrome) require a secure context (HTTPS or `localhost`) to grant camera access (`getUserMedia`).
> If you test on an Android phone over local HTTP (`http://192.168.x.x:3000`), open Chrome on your phone, go to `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, enter `http://<YOUR_IP>:3000`, and relaunch Chrome. Or use a tool like `ngrok http 3000` to get an instant HTTPS URL.

---

## 🔗 External Ledger Integration

When you tap **"Complete Sale"** in Infinatort, the frontend fires a webhook to your daily transaction ledger:

### Webhook Function (`pos.js`):
```javascript
async function sendToLedger(saleData) {
  const endpoint = "https://your-ledger-portal.com/api/add-daily-sales";

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(saleData)
    });

    if (response.ok) {
      console.log("Successfully logged in daily ledger!");
    }
  } catch (error) {
    console.error("Ledger sync failed:", error);
  }
}
```

### Webhook JSON Payload Schema:
```json
{
  "timestamp": "2026-10-19T02:30:00.000Z",
  "invoice_id": "INF-20261019-4821",
  "total_amount": 1499.00,
  "subtotal": 1499.00,
  "discount": 0.00,
  "tax": 0.00,
  "payment_method": "UPI",
  "items_sold": [
    {
      "id": 21,
      "barcode": "8910010001",
      "name": "boAt Rockerz 255 Pro+ Wireless Neckband",
      "category": "Neckbands",
      "qty": 1,
      "price": 1499.00,
      "total": 1499.00
    }
  ],
  "customer": {
    "name": "Walk-in Customer",
    "phone": ""
  }
}
```

> [!NOTE]
> The app comes with a built-in mock receiver (`POST /api/ledger/mock-receiver`). You can change the webhook URL at any time in the **"Ledger Portal"** tab inside the web interface without restarting the server.
