const express = require('express');
const axios = require('axios');
const yahooFinance = require('yahoo-finance2').default;
const fs = require('fs').promises;
const dns = require('dns');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const port = process.env.PORT || 5001;
const dbPath = process.env.DB_PATH || './portfolio.db';

// Middleware to parse JSON and URL-encoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Function to fetch current conversion rate from USD to INR
async function fetchConversionRate() {
  try {
    const response = await axios.get('https://api.exchangerate-api.com/v4/latest/USD');
    return response.data.rates.INR;
  } catch (error) {
    console.error('Error fetching conversion rate:', error);
    return null;
  }
}

// Open (or create) SQLite database and create tables with proper constraints
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database ' + err.message);
  } else {
    console.log('Connected to the SQLite database.');
    db.serialize(() => {
      db.run(`CREATE TABLE IF NOT EXISTS portfoliototal (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        FinalTotal REAL,
        date TEXT,
        difference REAL
      )`);
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
    const data = await fs.readFile('./portfolio.json', 'utf8');
    return JSON.parse(data).portfolio;
  } catch (error) {
    throw 'Error reading portfolio.json: ' + error.message;
  }
}

// Function to write the portfolio JSON file
async function savePortfolio(portfolio) {
  const data = JSON.stringify({ portfolio }, null, 2);
  await fs.writeFile('./portfolio.json', data, 'utf8');
}

// Function to fetch stock price for each stock
async function getStockPrice(symbol) {
  try {
    const quote = await yahooFinance.quote(symbol);
    if (!quote || !quote.regularMarketPrice) {
      throw new Error(`Price not found for ${symbol}`);
    }
    // Return both price and currency (defaulting to 'USD' if currency is not provided)
    return { price: quote.regularMarketPrice, currency: quote.currency || 'USD' };
  } catch (error) {
    throw `Error fetching price for ${symbol}: ${error.message}`;
  }
}


// Serve the main HTML page with improved UI, Add Stock form, and Manage Stocks section
app.get('/', async (req, res) => {
  try {
    // Fetch historical data from database
    const portfolioTotals = await new Promise((resolve, reject) => {
      db.all(`SELECT * FROM portfoliototal ORDER BY date ASC`, [], (err, rows) => {
        if (err) {
          return reject('Error fetching portfolio totals: ' + err.message);
        }
        resolve(rows);
      });
    });
    const priceDetails = await new Promise((resolve, reject) => {
      db.all(`SELECT * FROM pricedetails ORDER BY datetime ASC`, [], (err, rows) => {
        if (err) {
          return reject('Error fetching price details: ' + err.message);
        }
        resolve(rows);
      });
    });

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
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>Stock Price Checker</title>
    <style>
      body {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        background: #f0f2f5;
        margin: 0;
        padding: 20px;
        color: #333;
      }
      .container {
        max-width: 1000px;
        margin: 0 auto;
      }
      header {
        text-align: center;
        margin-bottom: 20px;
      }
      header h1 {
        margin: 0;
        padding: 20px;
        background: #4CAF50;
        color: #fff;
        border-radius: 8px;
      }
      .card {
        background: #fff;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        margin-bottom: 20px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 10px;
      }
      table, th, td {
        border: 1px solid #ddd;
      }
      th, td {
        padding: 10px;
        text-align: center;
      }
      th {
        background: #4CAF50;
        color: #fff;
      }
      tr:nth-child(even) {
        background: #f9f9f9;
      }
      .total {
        font-size: 1.2em;
        margin-top: 10px;
        color: #4CAF50;
      }
      form {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 10px;
      }
      form input, form button {
        padding: 10px;
        border: 1px solid #ccc;
        border-radius: 4px;
      }
      form input {
        flex: 1;
      }
      form button {
        background: #4CAF50;
        color: #fff;
        border: none;
        cursor: pointer;
      }
      form button:hover {
        background: #45a049;
      }
      .message {
        color: red;
        margin: 10px 0;
      }
      .note {
        font-size: 0.9em;
        color: gray;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <header>
        <h1>Stock Price Checker</h1>
      </header>
      
      <div class="card">
        <h2>Price Details</h2>
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
      </div>
      
      <div class="card">
        <h2>Portfolio Total</h2>
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
      </div>
      
      <div class="card">
        <h2>Add Stock</h2>
        <form id="addStockForm">
          <input type="text" id="stockName" placeholder="Stock Name" required>
          <input type="text" id="stockSymbol" placeholder="Stock Symbol" required>
          <input type="number" id="stockQuantity" placeholder="Quantity" required>
          <button type="submit">Add Stock</button>
        </form>
        <div class="message" id="addStockMsg"></div>
      </div>
      
      <div class="card">
        <h2>Manage Stocks</h2>
        <table>
          <thead>
            <tr>
              <th>Stock Name</th>
              <th>Symbol</th>
              <th>Quantity</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="manageStocksBody">
            <!-- Filled dynamically -->
          </tbody>
        </table>
      </div>
      
      <div class="card">
        <h2>Compare Portfolio Totals</h2>
        <p class="note">Note: This comparison feature is intended for dates within the same month only.</p>
        <p>Enter two dates in YYYY-MM-DD format:</p>
        <form id="compareForm">
          <input type="text" id="date1" placeholder="Start Date (YYYY-MM-DD)" required>
          <input type="text" id="date2" placeholder="End Date (YYYY-MM-DD)" required>
          <button type="submit">Compare</button>
        </form>
        <div id="compareResult"></div>
      </div>
    </div>
    
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
      
      // Handle the Add Stock form submission
      document.getElementById('addStockForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const stockName = document.getElementById('stockName').value.trim();
        const stockSymbol = document.getElementById('stockSymbol').value.trim();
        const stockQuantity = document.getElementById('stockQuantity').value.trim();
        const msgElem = document.getElementById('addStockMsg');
        try {
          const response = await fetch('/addStock', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              stock_name: stockName,
              symbol: stockSymbol,
              quantity: Number(stockQuantity)
            })
          });
          const result = await response.json();
          if (response.ok) {
            msgElem.style.color = 'green';
            msgElem.textContent = 'Stock added successfully!';
            document.getElementById('addStockForm').reset();
            loadStocks(); // Refresh Manage Stocks table
          } else {
            msgElem.style.color = 'red';
            msgElem.textContent = result.error || 'Error adding stock.';
          }
        } catch (error) {
          msgElem.style.color = 'red';
          msgElem.textContent = 'Error adding stock.';
          console.error('Error in Add Stock:', error);
        }
      });
      
      // Manage Stocks functions
      async function loadStocks() {
        try {
          const response = await fetch('/stocks');
          const data = await response.json();
          let rowsHtml = '';
          if (data && data.length > 0) {
            data.forEach((stock) => {
              rowsHtml += \`<tr>
                <td>\${stock.stock_name}</td>
                <td>\${stock.symbol}</td>
                <td>
                  <input type="number" id="qty-\${stock.symbol}" value="\${stock.quantity}" style="width: 80px;" />
                </td>
                <td>
                  <button onclick="updateStock('\${stock.symbol}')">Update</button>
                  <button onclick="deleteStock('\${stock.symbol}')">Delete</button>
                </td>
              </tr>\`;
            });
          } else {
            rowsHtml = '<tr><td colspan="4">No stocks found.</td></tr>';
          }
          document.getElementById('manageStocksBody').innerHTML = rowsHtml;
        } catch (error) {
          console.error('Error loading stocks:', error);
        }
      }
      
      async function updateStock(symbol) {
        const newQuantity = document.getElementById(\`qty-\${symbol}\`).value;
        try {
          const response = await fetch('/editStock', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbol, quantity: Number(newQuantity) })
          });
          const result = await response.json();
          if(response.ok) {
            alert('Stock updated successfully!');
            loadStocks();
          } else {
            alert(result.error || 'Error updating stock.');
          }
        } catch(error) {
          alert('Error updating stock.');
          console.error('Error in updateStock:', error);
        }
      }
      
      async function deleteStock(symbol) {
        if(!confirm('Are you sure you want to delete this stock?')) return;
        try {
          const response = await fetch('/deleteStock', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbol })
          });
          const result = await response.json();
          if(response.ok) {
            alert('Stock deleted successfully!');
            loadStocks();
          } else {
            alert(result.error || 'Error deleting stock.');
          }
        } catch(error) {
          alert('Error deleting stock.');
          console.error('Error in deleteStock:', error);
        }
      }
      
      // Handle the Compare form submission
      document.getElementById('compareForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const date1 = document.getElementById('date1').value.trim();
        const date2 = document.getElementById('date2').value.trim();
        const resultElem = document.getElementById('compareResult');
        try {
          const response = await fetch(\`/compare?date1=\${date1}&date2=\${date2}\`);
          const result = await response.json();
          if (response.ok) {
            resultElem.innerHTML = \`<p>On \${result.date1}: ₹\${result.total1} <br>On \${result.date2}: ₹\${result.total2} <br>Difference: ₹\${result.difference}</p>\`;
          } else {
            resultElem.innerHTML = \`<p style="color:red;">\${result.error}</p>\`;
          }
        } catch (error) {
          resultElem.innerHTML = '<p style="color:red;">Error comparing dates.</p>';
          console.error('Error in Compare:', error);
        }
      });
      
      // Initial fetch on page load
      updatePriceDetailsTable();
      fetchLatestPortfolioTotal();
      updatePortfolioTotalTable();
      loadStocks();
      
      // Automatically update every 2 seconds (for price details and totals)
      setInterval(() => {
        updatePriceDetailsTable();
        fetchLatestPortfolioTotal();
        updatePortfolioTotalTable();
      }, 2000);
    </script>
  </body>
  </html>
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
    const currentDate = new Date().toISOString().split('T')[0];
    const portfolioWithPrices = await Promise.all(
      portfolio.map(async stock => {
        try {
          const { price, currency } = await getStockPrice(stock.symbol);
          // Convert the price only if it's not already in INR
          const priceInRupees = currency === 'INR' ? price : price * conversionRate;
          const valueInRupees = priceInRupees * stock.quantity;
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
    const totalValueInRupees = portfolioWithPrices.reduce((acc, stock) => acc + (stock.price * stock.quantity || 0), 0);
    db.get(`SELECT FinalTotal FROM portfoliototal WHERE date = ?`, [currentDate], (err, row) => {
      let previousTotal = row ? row.FinalTotal : 0;
      const difference = totalValueInRupees - previousTotal;
      if (row) {
        db.run(`UPDATE portfoliototal SET FinalTotal = ?, difference = ? WHERE date = ?`,
          [totalValueInRupees, difference, currentDate],
          (err) => {
            if (err) {
              console.error('Error updating total:', err.message);
            }
          });
      } else {
        db.run(`INSERT INTO portfoliototal (FinalTotal, date, difference) VALUES (?, ?, ?)`,
          [totalValueInRupees, currentDate, difference]
        );
      }
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

// New endpoint to add a new stock to portfolio.json
app.post('/addStock', async (req, res) => {
  try {
    const { stock_name, symbol, quantity } = req.body;
    if (!stock_name || !symbol || !quantity) {
      return res.status(400).json({ error: 'stock_name, symbol, and quantity are required.' });
    }
    let portfolioData;
    try {
      const data = await fs.readFile('./portfolio.json', 'utf8');
      portfolioData = JSON.parse(data);
    } catch (e) {
      portfolioData = { portfolio: [] };
    }
    portfolioData.portfolio.push({ stock_name, symbol, quantity });
    await fs.writeFile('./portfolio.json', JSON.stringify(portfolioData, null, 2), 'utf8');
    res.json({ message: 'Stock added successfully!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// New endpoint to edit an existing stock's quantity in portfolio.json
app.put('/editStock', async (req, res) => {
  try {
    const { symbol, quantity } = req.body;
    if (!symbol || quantity == null) {
      return res.status(400).json({ error: 'symbol and quantity are required.' });
    }
    let portfolioData;
    try {
      const data = await fs.readFile('./portfolio.json', 'utf8');
      portfolioData = JSON.parse(data);
    } catch (e) {
      return res.status(500).json({ error: 'Portfolio file not found.' });
    }
    let updated = false;
    portfolioData.portfolio = portfolioData.portfolio.map(stock => {
      if (stock.symbol === symbol) {
        stock.quantity = quantity;
        updated = true;
      }
      return stock;
    });
    if (!updated) {
      return res.status(404).json({ error: 'Stock not found.' });
    }
    await fs.writeFile('./portfolio.json', JSON.stringify(portfolioData, null, 2), 'utf8');
    res.json({ message: 'Stock updated successfully!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// New endpoint to delete a stock from portfolio.json
app.delete('/deleteStock', async (req, res) => {
  try {
    const { symbol } = req.body;
    if (!symbol) {
      return res.status(400).json({ error: 'symbol is required.' });
    }
    let portfolioData;
    try {
      const data = await fs.readFile('./portfolio.json', 'utf8');
      portfolioData = JSON.parse(data);
    } catch (e) {
      return res.status(500).json({ error: 'Portfolio file not found.' });
    }
    const originalLength = portfolioData.portfolio.length;
    portfolioData.portfolio = portfolioData.portfolio.filter(stock => stock.symbol !== symbol);
    if (portfolioData.portfolio.length === originalLength) {
      return res.status(404).json({ error: 'Stock not found.' });
    }
    await fs.writeFile('./portfolio.json', JSON.stringify(portfolioData, null, 2), 'utf8');
    res.json({ message: 'Stock deleted successfully!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// New endpoint to return the portfolio stocks (for Manage Stocks section)
app.get('/stocks', async (req, res) => {
  try {
    const data = await fs.readFile('./portfolio.json', 'utf8');
    const portfolioData = JSON.parse(data);
    res.json(portfolioData.portfolio);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// New endpoint to compare portfolio totals from two different dates
app.get('/compare', (req, res) => {
  const { date1, date2 } = req.query;
  if (!date1 || !date2) {
    return res.status(400).json({ error: 'Both date1 and date2 query parameters are required in YYYY-MM-DD format.' });
  }
  db.get(`SELECT FinalTotal FROM portfoliototal WHERE date = ?`, [date1], (err, row1) => {
    if (err) return res.status(500).json({ error: err.message });
    db.get(`SELECT FinalTotal FROM portfoliototal WHERE date = ?`, [date2], (err, row2) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row1 || !row2) {
        return res.status(404).json({ error: 'One or both of the specified dates were not found in records.' });
      }
      const diff = row2.FinalTotal - row1.FinalTotal;
      res.json({
        date1,
        total1: row1.FinalTotal,
        date2,
        total2: row2.FinalTotal,
        difference: diff
      });
    });
  });
});

// Start server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
