// Example webhook trigger inside Infinatort
async function sendToLedger(saleData) {
  try {
    const response = await fetch('[https://your-ledger-portal-url.com/api/add-daily-sales](https://your-ledger-portal-url.com/api/add-daily-sales)', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
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