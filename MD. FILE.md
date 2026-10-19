# Antigravity Inventory & Infinatort Billing System

## 🛠️ Recommended Tech Stack
*   **Frontend:** HTML5, CSS, Vanilla JavaScript (or React.js for a more dynamic UI)
*   **Backend:** Node.js with Express.js
*   **Database:** MongoDB (NoSQL) or PostgreSQL (Relational)
*   **Barcode Scanning:** `html5-qrcode` (JavaScript library to use the phone camera)

## 📱 Phone Camera Barcode Solution
You do not need a physical USB scanner. 
1. Embed the `html5-qrcode` library into the frontend.
2. When the "Scan Item" button is tapped on the Infinatort billing screen, it requests camera access.
3. The phone's camera reads the barcode/QR code on the smartwatch, book, or gadget box.
4. The decoded string is instantly queried against your database to add the item to the billing cart.

## 🗄️ Database Structure (Products)
Because the shop handles a wide variety of items, use a flexible schema with a `category` tag:
*   `id`: Unique alphanumeric code (or barcode number)
*   `name`: e.g., "Boat Neckband 255"
*   `category`: e.g., "Neckband", "Smartwatch", "Book", "Accessory"
*   `price`: Retail price
*   `stock_count`: Current inventory level
*   `cost_price`: (Optional) for calculating daily profit in the ledger

## 🔗 Ledger Portal Integration Process
Yes, the Infinatort billing system can automatically push data to your separate daily ledger portal. 

### Step 1: Create an API Endpoint on the Ledger Portal
Modify your existing HTML/JS ledger's backend to accept incoming data. Create a REST API endpoint (e.g., `POST /api/add-daily-sales`). 

### Step 2: Define the Data Payload
When a bill is completed in Infinatort, structure the transaction data in JSON format:
```json
{
  "timestamp": "2026-10-19T14:30:00Z",
  "invoice_id": "INF-1001",
  "total_amount": 1450.00,
  "payment_method": "UPI",
  "items_sold": [
    {"name": "Atomic Habits Book", "qty": 1, "price": 450},
    {"name": "Wireless Earbuds", "qty": 1, "price": 1000}
  ]
}