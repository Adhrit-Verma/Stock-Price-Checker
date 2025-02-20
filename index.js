const express = require('express');
const axios = require('axios');
const yahooFinance = require('yahoo-finance2').default;
const fs = require('fs').promises;
const dns = require('dns');
const sqlite3 = require('sqlite3').verbose();

const app = express();
// Use Render's PORT environment variable; default to 3000 if not set.
const port = process.env.PORT || 3000;

// Set the database path from an environment variable for persistent storage if available.
const dbPath = process.env.DB_PATH || './portfolio.db';

// Function to fetch current conversion rate from USD to INR
async function fetchConversionRate() {
  try {
    const response = await axios.get('https://api.exchangerate-api.com/v4/latest/USD'); // Replace with your chosen API
    return response.data.rates.INR; // Adjust based on the API's response structure
  } catch (error) {
    console.error('Error fetching conversion rate:', error);
    return null; // Handle error appropriately
  }
}

// Open (or create) SQLite database and create tables with proper constraints
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database ' + err.message);
  } else {
    console.log('Connected to the SQLite database.');

    // Create tables
    db.serialize(() => {
      db.run(`CREATE TABLE IF NOT EXISTS portfoliototal (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        FinalTotal REAL,
        date TEXT,
        difference REAL
      )`);

      // Add a UNIQUE constraint on (name, datetime) to avoid duplicate entries
      db.run(`CREATE TABLE IF NOT EXISTS pricedetails (
        Id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        quantity INTEGER,
        price REAL,
        value REAL,
        datetime TEXT,
        UNIQUE(name, datetime)
      )`);
    });
  }
});

// Check for internet connectivity
function checkInternet() {
  return new Promise((resolve, reject) => {
    dns.lookup('google.com', (err) => {
      if (err && err.code === 'ENOTFOUND') {
        reject('No internet connection.');
      } else {
        resolve('Internet is working.');
      }
    });
  });
}

// Check if the Yahoo Finance API is reachable
async function checkAPI() {
  try {
    await axios.get('https://finance.yahoo.com');
    return 'API is working.';
  } catch (error) {
    throw 'Yahoo Finance API is not reachable.';
  }
}

// Function to read portfolio from the JSON file
async function getPortfolio() {
  try {
    const data = await fs.readFile('./portfolio.json', 'utf8'); // Ensure correct path
    return JSON.parse(data).portfolio;
  } catch (error) {
    throw 'Error reading portfolio.json: ' + error.message;
  }
}

// Function to fetch stock price for each stock
async function getStockPrice(symbol) {
  try {
    const quote = await yahooFinance.quote(symbol);
    if (!quote || !quote.regularMarketPrice) {
      throw new Error(`Price not found for ${symbol}`);
    }
    return quote.regularMarketPrice; // Fetch latest closing price
  } catch (error) {
    throw `Error fetching price for ${symbol}: ${error.message}`;
  }
}

const oneMonthAgo = new Date();
oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1); // Set the date to one month ago

// Serve the main HTML page with JavaScript for periodic updates
app.get('/', async (req, res) => {
  try {
    // Fetching existing portfolio totals and price details from the database
    const portfolioTotals = await new Promise((resolve, reject) => {
      db.all(`SELECT * FROM portfoliototal`, [], (err, rows) => {
        if (err) {
          return reject('Error fetching portfolio totals: ' + err.message);
        }
        resolve(rows);
      });
    });

    const priceDetails = await new Promise((resolve, reject) => {
      db.all(`SELECT * FROM pricedetails`, [], (err, rows) => {
        if (err) {
          return reject('Error fetching price details: ' + err.message);
        }
        resolve(rows);
      });
    });

    // Build table rows or display a placeholder if no data is present.
    let priceDetailsRows = '';
    if (priceDetails && priceDetails.length > 0) {
      priceDetailsRows = priceDetails.map(row => `
        <tr>
          <td>${row.Id}</td>
          <td>${row.name}</td>
          <td>${row.quantity}</td>
          <td>${Number(row.price).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td>${Number(row.value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td>${row.datetime}</td>
        </tr>
      `).join('');
    } else {
      priceDetailsRows = `<tr><td colspan="6">No price details found. Please refresh the page.</td></tr>`;
    }

    let portfolioTotalRows = '';
    if (portfolioTotals && portfolioTotals.length > 0) {
      portfolioTotalRows = portfolioTotals.map(row => {
        const formattedFinalTotal = Number(row.FinalTotal).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const formattedDifference = row.difference >= 0 
          ? `+${Number(row.difference).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` 
          : Number(row.difference).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return `
          <tr>
            <td>${row.id}</td>
            <td>${formattedFinalTotal}</td>
            <td>${row.date}</td>
            <td>${formattedDifference}</td>
          </tr>
        `;
      }).join('');
    } else {
      portfolioTotalRows = `<tr><td colspan="4">No portfolio totals found. Please refresh the page.</td></tr>`;
    }

    const html = `
  <style>
    body {
      font-family: Arial, sans-serif;
      background-color: #f4f4f9;
      color: #333;
      margin: 0;
      padding: 20px;
      text-align: center;
    }
    h1 {
      color: #4CAF50;
    }
    table {
      width: 60%;
      margin: 20px auto;
      border-collapse: collapse;
    }
    table, th, td {
      border: 1px solid #ddd;
      padding: 8px;
    }
    th {
      background-color: #4CAF50;
      color: white;
    }
    tr:nth-child(even) {
      background-color: #f2f2f2;
    }
    tr:hover {
      background-color: #ddd;
    }
    .total {
      font-weight: bold;
      color: #4CAF50;
      margin-top: 20px;
    }
    .message {
      color: red;
      margin: 10px;
    }
  </style>
  <h1>Price Details</h1>
  <table>
    <thead>
      <tr>
        <th>Id</th>
        <th>Name</th>
        <th>Quantity</th>
        <th>Price (INR)</th>
        <th>Value (INR)</th>
        <th>Date</th>
      </tr>
    </thead>
    <tbody id="priceDetailsBody">
      ${priceDetailsRows}
    </tbody>
  </table>

  <h1>Portfolio Total</h1>
  <table>
    <thead>
      <tr>
        <th>Id</th>
        <th>Final Total (INR)</th>
        <th>Date</th>
        <th>Difference (INR)</th>
      </tr>
    </thead>
    <tbody id="portfolioTotalBody">
      ${portfolioTotalRows}
    </tbody>
  </table>

  <div class="total">
    <h2 id="totalValue">Total Portfolio Value: ₹0.00 (Diff: ₹0.00)</h2>
  </div>
  
  <div class="message" id="refreshMsg"></div>

  <script>
    // Update the price details table by fetching latest stock data
    async function updatePriceDetailsTable() {
      try {
        const response = await fetch('/portfolio');
        const data = await response.json();
        let rowsHtml = '';
        if (data && data.length > 0) {
          data.forEach((stock, index) => {
            const priceFormatted = Number(stock.price).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const valueFormatted = Number(stock.price * stock.quantity).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            rowsHtml += \`<tr>
              <td>\${index + 1}</td>
              <td>\${stock.stock_name}</td>
              <td>\${stock.quantity}</td>
              <td>\${priceFormatted}</td>
              <td>\${valueFormatted}</td>
              <td>\${new Date().toISOString().split('T')[0]}</td>
            </tr>\`;
          });
        } else {
          rowsHtml = '<tr><td colspan="6">No price details found. Please refresh the page.</td></tr>';
        }
        document.getElementById('priceDetailsBody').innerHTML = rowsHtml;
      } catch (error) {
        console.error('Error updating price details table:', error);
      }
    }

    // Update the portfolio summary (total value and difference)
    async function fetchLatestPortfolioTotal() {
      try {
        const response = await fetch('/latestPortfolioTotal');
        const data = await response.json();
        const totalValueElement = document.getElementById('totalValue');
        const latestTotal = data.latestTotal || 0;
        const difference = data.difference || 0;
        totalValueElement.innerHTML = \`Total Portfolio Value: ₹\${Number(latestTotal).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (Diff: ₹\${Number(difference).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})\`;
      } catch (error) {
        console.error('Error fetching latest total:', error);
      }
    }

    // Update the portfolio total table (latest row) dynamically
    async function updatePortfolioTotalTable() {
      try {
        const response = await fetch('/latestPortfolioTotal');
        const data = await response.json();
        let rowHtml = '';
        if (data && data.latestTotal !== undefined) {
          const formattedFinalTotal = Number(data.latestTotal).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          const formattedDifference = data.difference >= 0 
            ? \`+\${Number(data.difference).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\`
            : Number(data.difference).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          rowHtml = \`<tr>
                        <td>Latest</td>
                        <td>\${formattedFinalTotal}</td>
                        <td>\${new Date().toISOString().split('T')[0]}</td>
                        <td>\${formattedDifference}</td>
                      </tr>\`;
        } else {
          rowHtml = '<tr><td colspan="4">No portfolio totals found. Please refresh the page.</td></tr>';
        }
        document.getElementById('portfolioTotalBody').innerHTML = rowHtml;
      } catch (error) {
        console.error('Error updating portfolio total table:', error);
      }
    }

    // Initial fetch on page load
    updatePriceDetailsTable();
    fetchLatestPortfolioTotal();
    updatePortfolioTotalTable();

    // Automatically update every 2 seconds
    setInterval(() => {
      updatePriceDetailsTable();
      fetchLatestPortfolioTotal();
      updatePortfolioTotalTable();
    }, 2000);
  </script>
`;

    res.send(html);
  } catch (error) {
    res.send(`<h1>Error: ${error}</h1>`);
  }
});

// Endpoint to update/insert stock price details and return updated portfolio data
app.get('/portfolio', async (req, res) => {
  try {
    await checkInternet();
    await checkAPI();

    const conversionRate = await fetchConversionRate();
    if (!conversionRate) {
      return res.status(500).json({ error: 'Failed to fetch conversion rate' });
    }

    const portfolio = await getPortfolio();
    const currentDate = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD

    // Process each stock in the portfolio
    const portfolioWithPrices = await Promise.all(
      portfolio.map(async stock => {
        try {
          const price = await getStockPrice(stock.symbol);
          const value = price * stock.quantity;
          const priceInRupees = price * conversionRate;
          const valueInRupees = value * conversionRate;

          // Upsert the price details using the UNIQUE constraint on (name, datetime)
          return new Promise((resolve, reject) => {
            db.run(
              `INSERT INTO pricedetails (name, quantity, price, value, datetime)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(name, datetime) DO UPDATE SET 
                 quantity = excluded.quantity,
                 price = excluded.price,
                 value = excluded.value;`,
              [stock.stock_name, stock.quantity, priceInRupees, valueInRupees, currentDate],
              function(err) {
                if (err) {
                  console.error('Error upserting price details:', err.message);
                  return reject(err);
                }
                resolve({ ...stock, price: priceInRupees });
              }
            );
          });
        } catch (error) {
          console.error(error);
          return { ...stock, price: null };
        }
      })
    );

    // Calculate total portfolio value in rupees
    const totalValueInRupees = portfolioWithPrices.reduce((acc, stock) => acc + (stock.price * stock.quantity || 0), 0);

    // Get previous total for calculating difference and update portfoliototal accordingly
    db.get(`SELECT FinalTotal FROM portfoliototal WHERE date = ?`, [currentDate], (err, row) => {
      let previousTotal = row ? row.FinalTotal : 0;
      const difference = totalValueInRupees - previousTotal;

      if (row) {
        // Update existing entry
        db.run(`UPDATE portfoliototal SET FinalTotal = ?, difference = ? WHERE date = ?`,
          [totalValueInRupees, difference, currentDate],
          (err) => {
            if (err) {
              console.error('Error updating total:', err.message);
            }
          });
      } else {
        // Insert new entry
        db.run(`INSERT INTO portfoliototal (FinalTotal, date, difference) VALUES (?, ?, ?)`,
          [totalValueInRupees, currentDate, difference]
        );
      }

      // Delete entries older than one month
      db.run(`DELETE FROM portfoliototal WHERE date < ?`, [oneMonthAgo.toISOString().split('T')[0]], (err) => {
        if (err) {
          console.error('Error deleting old entries:', err.message);
        }
      });

      res.json(portfolioWithPrices);
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Updated endpoint to return the latest portfolio total including the difference
app.get('/latestPortfolioTotal', (req, res) => {
  db.get(`SELECT FinalTotal, difference FROM portfoliototal ORDER BY date DESC LIMIT 1`, (err, row) => {
    if (err) {
      console.error('Error fetching latest total:', err.message);
      return res.status(500).json({ error: 'Failed to fetch latest total' });
    }
    res.json({ latestTotal: row ? row.FinalTotal : 0, difference: row ? row.difference : 0 });
  });
});

// Start server without automatically opening the browser
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
