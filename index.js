const express = require('express');
const session = require('express-session');
const axios = require('axios');
const yahooFinance = require('yahoo-finance2').default;
const fs = require('fs').promises;
const dns = require('dns');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const port = process.env.PORT || 5001;
const dbPath = process.env.DB_PATH || './portfolio.db';

// Session middleware configuration
app.use(session({
  secret: 'your-secret-key', // Change to a strong secret in production
  resave: false,
  saveUninitialized: false
}));

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

// Open (or create) SQLite database and create tables
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database ' + err.message);
  } else {
    console.log('Connected to the SQLite database.');
    db.serialize(() => {
      db.run(`CREATE TABLE IF NOT EXISTS portfoliototal (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER,
        FinalTotal REAL,
        date TEXT,
        difference REAL
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS pricedetails (
        Id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER,
        name TEXT,
        quantity INTEGER,
        price REAL,
        value REAL,
        datetime TEXT,
        UNIQUE(account_id, name, datetime)
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS pms_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_name TEXT UNIQUE,
        password TEXT,
        description TEXT
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

// Functions to get and save an account’s portfolio from a file
async function getPortfolio(accountId) {
  const filePath = `./portfolios/portfolio_${accountId}.json`;
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data).portfolio;
  } catch (error) {
    return []; // Return empty portfolio if file not found
  }
}

async function savePortfolio(portfolio, accountId) {
  const filePath = `./portfolios/portfolio_${accountId}.json`;
  const data = JSON.stringify({ portfolio }, null, 2);
  await fs.writeFile(filePath, data, 'utf8');
}

// Function to fetch stock price along with currency info
async function getStockPrice(symbol) {
  try {
    const quote = await yahooFinance.quote(symbol);
    if (!quote || !quote.regularMarketPrice) {
      throw new Error(`Price not found for ${symbol}`);
    }
    return { price: quote.regularMarketPrice, currency: quote.currency || 'USD' };
  } catch (error) {
    throw `Error fetching price for ${symbol}: ${error.message}`;
  }
}

// ------------------------
// (Old) Real-Time Price Endpoint
// ------------------------
app.get('/currentPrice', async (req, res) => {
  const symbol = req.query.symbol;
  if (!symbol) return res.status(400).json({ error: 'Symbol is required' });
  try {
    await checkInternet();
    await checkAPI();
    const conversionRate = await fetchConversionRate();
    if (!conversionRate) {
      return res.status(500).json({ error: 'Failed to fetch conversion rate' });
    }
    const { price, currency } = await getStockPrice(symbol);
    const priceInRupees = currency === 'INR' ? price : price * conversionRate;
    res.json({ symbol, price: priceInRupees, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ------------------------
// Authentication Routes
// ------------------------
app.get('/login', (req, res) => {
  const html = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>Login</title>
    <style>
      body { 
        background: #f7f7f7; 
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
        display: flex; 
        justify-content: center; 
        align-items: center; 
        height: 100vh;
        margin: 0;
      }
      .login-container {
        background: #fff;
        padding: 30px;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        width: 350px;
      }
      h1 { text-align: center; color: #4CAF50; }
      form { display: flex; flex-direction: column; }
      input { padding: 10px; margin-bottom: 15px; border: 1px solid #ccc; border-radius: 4px; }
      button { padding: 10px; background: #4CAF50; color: #fff; border: none; border-radius: 4px; cursor: pointer; }
      button:hover { background: #45a049; }
      .signup-link { text-align: center; margin-top: 10px; }
    </style>
  </head>
  <body>
    <div class="login-container">
      <h1>Login</h1>
      <form method="POST" action="/login">
        <input type="text" name="account_name" placeholder="Account Name" required />
        <input type="password" name="password" placeholder="Password" required />
        <button type="submit">Login</button>
      </form>
      <div class="signup-link">
        <p>Don't have an account? <a href="/signup">Sign Up</a></p>
      </div>
    </div>
  </body>
  </html>
  `;
  res.send(html);
});

app.post('/login', (req, res) => {
  const { account_name, password } = req.body;
  if (!account_name || !password) {
    return res.send("Account name and password required");
  }
  db.get(
    "SELECT * FROM pms_accounts WHERE account_name = ? AND password = ?",
    [account_name, password],
    (err, account) => {
      if (err || !account) {
        return res.send("Invalid credentials. <a href='/login'>Try again</a>");
      }
      req.session.account = { id: account.id, account_name: account.account_name };
      res.redirect('/');
    }
  );
});

// Sign Up
app.get('/signup', (req, res) => {
  const html = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>Sign Up</title>
    <style>
      body { 
        background: #f7f7f7; 
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
        display: flex; 
        justify-content: center; 
        align-items: center; 
        height: 100vh;
        margin: 0;
      }
      .signup-container {
        background: #fff;
        padding: 30px;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        width: 350px;
      }
      h1 { text-align: center; color: #4CAF50; }
      form { display: flex; flex-direction: column; }
      input { padding: 10px; margin-bottom: 15px; border: 1px solid #ccc; border-radius: 4px; }
      button { padding: 10px; background: #4CAF50; color: #fff; border: none; border-radius: 4px; cursor: pointer; }
      button:hover { background: #45a049; }
      .login-link { text-align: center; margin-top: 10px; }
    </style>
  </head>
  <body>
    <div class="signup-container">
      <h1>Sign Up</h1>
      <form method="POST" action="/signup">
        <input type="text" name="account_name" placeholder="Account Name" required />
        <input type="password" name="password" placeholder="Password" required />
        <input type="text" name="description" placeholder="Description (Optional)" />
        <button type="submit">Sign Up</button>
      </form>
      <div class="login-link">
        <p>Already have an account? <a href="/login">Login</a></p>
      </div>
    </div>
  </body>
  </html>
  `;
  res.send(html);
});

app.post('/signup', (req, res) => {
  const { account_name, password, description } = req.body;
  if (!account_name || !password) {
    return res.send("Account name and password required");
  }
  db.run(
    "INSERT INTO pms_accounts (account_name, password, description) VALUES (?, ?, ?)",
    [account_name, password, description],
    function (err) {
      if (err) {
        return res.send("Error creating account: " + err.message);
      }
      const newAccountId = this.lastID;
      const portfolioData = { portfolio: [] };
      fs.writeFile(
        `./portfolios/portfolio_${newAccountId}.json`,
        JSON.stringify(portfolioData, null, 2),
        'utf8'
      )
        .then(() => {
          res.redirect('/login');
        })
        .catch((err) => {
          res.send("Account created but error initializing portfolio: " + err.message);
        });
    }
  );
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// ----------------------------------------------
// Portfolio & Stock Management (Protected)
// ----------------------------------------------
app.get('/', async (req, res) => {
  if (!req.session.account) {
    return res.redirect('/login');
  }
  try {
    // Fetch data for initial page load
    const portfolioTotals = await new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM portfoliototal WHERE account_id = ? ORDER BY date ASC`,
        [req.session.account.id],
        (err, rows) => {
          if (err) return reject('Error fetching portfolio totals: ' + err.message);
          resolve(rows);
        }
      );
    });

    const priceDetails = await new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM pricedetails WHERE account_id = ? ORDER BY datetime ASC`,
        [req.session.account.id],
        (err, rows) => {
          if (err) return reject('Error fetching price details: ' + err.message);
          resolve(rows);
        }
      );
    });

    // Build initial HTML table rows (server‐side)
    let priceDetailsRows = priceDetails.length
      ? priceDetails
          .map((row) => {
            return `
              <tr>
                <td>${row.Id}</td>
                <td>${row.name}</td>
                <td>${row.quantity}</td>
                <td>${Number(row.price).toLocaleString('en-IN', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                })}</td>
                <td>${Number(row.value).toLocaleString('en-IN', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                })}</td>
                <td>${row.datetime}</td>
              </tr>
            `;
          })
          .join('')
      : `<tr><td colspan="6">No price details found. Please refresh the page.</td></tr>`;

    let portfolioTotalRows = portfolioTotals.length
      ? portfolioTotals
          .map((row) => {
            const formattedFinalTotal = Number(row.FinalTotal).toLocaleString('en-IN', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            });
            const formattedDifference =
              row.difference >= 0
                ? `${Number(row.difference).toLocaleString('en-IN', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}`
                : Number(row.difference).toLocaleString('en-IN', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  });
            return `
              <tr>
                <td>${row.id}</td>
                <td>${formattedFinalTotal}</td>
                <td>${row.date}</td>
                <td>${formattedDifference}</td>
              </tr>
            `;
          })
          .join('')
      : `<tr><td colspan="4">No portfolio totals found. Please refresh the page.</td></tr>`;

    // Return the full HTML
    const html = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <title>Stock Price Checker - ${req.session.account.account_name}</title>
      <!-- Include Chart.js from CDN -->
      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
      <style>
          body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              background: #f0f2f5;
              margin: 0;
              padding: 20px;
              color: #333;
          }

          .header-info {
              text-align: right;
              margin-bottom: 10px;
          }

          header {
              text-align: center;
              margin-bottom: 20px;
          }

          header h1 {
              margin: 0;
              padding: 10px;
              background: #4CAF50;
              color: #fff;
              border-radius: 8px;
          }

          .grid-container {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 20px;
              width: 100%;
              margin: 0 auto;
          }

          .card {
              background: #fff;
              padding: 20px;
              border-radius: 8px;
              box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
          }

          table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 10px;
          }

          table,
          th,
          td {
              border: 1px solid #ddd;
          }

          th,
          td {
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

          form input,
          form button {
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

          canvas {
              width: 100% !important;
              height: 250px !important;
          }
      </style>
  </head>
  <body>
      <div class="header-info">
          Logged in as: ${req.session.account.account_name} | <a href="/logout">Logout</a>
      </div>
      <header>
          <h1>Stock Price Checker</h1>
      </header>
      <div class="grid-container">
          <div class="card" style="grid-column: span 2;">
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
          <div class="card" style="grid-column: span 2;">
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
          <div class="card" style="grid-column: span 1;">
              <h2>Add Stock</h2>
              <form id="addStockForm">
                  <input type="text" id="stockName" placeholder="Stock Name" required>
                  <input type="text" id="stockSymbol" placeholder="Stock Symbol" required>
                  <input type="number" id="stockQuantity" placeholder="Quantity" required>
                  <button type="submit">Add Stock</button>
              </form>
              <div class="message" id="addStockMsg"></div>
          </div>
          <div class="card" style="grid-column: span 3;">
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
          <div class="card" style="grid-column: span 1;">
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
          <!-- Card for Portfolio Growth Over Time -->
          <div class="card" style="grid-column: span 3;">
              <h2>Portfolio Growth Over Time</h2>
              <button onclick="loadPortfolioHistory()">Show Portfolio Growth</button>
              <canvas id="portfolioChart"></canvas>
          </div>
      </div>
      
      <script>
        // ---------- Portfolio Growth Chart Setup ----------
        let portfolioChart;
        async function loadPortfolioHistory() {
          try {
            const response = await fetch('/portfolioHistory');
            const data = await response.json();
            if (response.ok) {
              // data is an array of { date, FinalTotal }
              const labels = data.map(item => item.date);
              const totals = data.map(item => item.FinalTotal);

              if (portfolioChart) {
                // If the chart already exists, just update it
                portfolioChart.data.labels = labels;
                portfolioChart.data.datasets[0].data = totals;
                portfolioChart.update();
              } else {
                // Otherwise, create a new chart
                const ctx = document.getElementById('portfolioChart').getContext('2d');
                portfolioChart = new Chart(ctx, {
                  type: 'line',
                  data: {
                    labels: labels,
                    datasets: [{
                      label: 'Portfolio Total (INR)',
                      data: totals,
                      borderColor: '#4CAF50',
                      fill: false,
                      tension: 0.1,
                      showLine: true,
                      pointRadius: 5
                    }]
                  },
                  options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                      x: { display: true },
                      y: { display: true }
                    }
                  }
                });
              }
            } else {
              console.error(data.error);
            }
          } catch (error) {
            console.error('Error loading portfolio history:', error);
          }
        }

        // Update the price details table by fetching latest stock data
        async function updatePriceDetailsTable() {
          try {
            const response = await fetch('/portfolio');
            const data = await response.json();
            let rowsHtml = '';
            if (data && data.length > 0) {
              data.forEach((stock, index) => {
                const priceFormatted = Number(stock.price).toLocaleString('en-IN', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                });
                const valueFormatted = Number(stock.price * stock.quantity).toLocaleString('en-IN', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                });
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
        
        // Update the big green heading with the latest total
        async function fetchLatestPortfolioTotal() {
          try {
            const response = await fetch('/latestPortfolioTotal');
            const data = await response.json();
            const totalValueElement = document.getElementById('totalValue');
            const latestTotal = data.latestTotal || 0;
            const difference = data.difference || 0;
            totalValueElement.innerHTML = \`Total Portfolio Value: ₹\${Number(latestTotal).toLocaleString('en-IN', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })} (Diff: ₹\${Number(difference).toLocaleString('en-IN', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })})\`;
          } catch (error) {
            console.error('Error fetching latest total:', error);
          }
        }
        
        // Fetch *all* portfolio totals to show in the table
        async function updatePortfolioTotalTable() {
          try {
            const response = await fetch('/allPortfolioTotals');
            const totals = await response.json();

            let rowHtml = '';
            if (totals && totals.length > 0) {
              rowHtml = totals.map((row) => {
                const formattedFinalTotal = Number(row.FinalTotal).toLocaleString('en-IN', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                });
                const diffFormatted =
                  row.difference >= 0
                    ? '+' +
                      Number(row.difference).toLocaleString('en-IN', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })
                    : Number(row.difference).toLocaleString('en-IN', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      });

                return \`
                  <tr>
                    <td>\${row.id}</td>
                    <td>\${formattedFinalTotal}</td>
                    <td>\${row.date}</td>
                    <td>\${diffFormatted}</td>
                  </tr>\`;
              }).join('');
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
        
        // Manage Stocks
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
        
        // Compare form
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
        
        // Refresh tables every 2 seconds
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

// ---------------------
// Portfolio Endpoints
// ---------------------
app.get('/portfolio', async (req, res) => {
  if (!req.session.account) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    // 1) Check connectivity & conversion rate
    await checkInternet();
    await checkAPI();
    const conversionRate = await fetchConversionRate();
    if (!conversionRate) {
      return res.status(500).json({ error: 'Failed to fetch conversion rate' });
    }

    // 2) Fetch user’s portfolio from JSON
    const portfolio = await getPortfolio(req.session.account.id);
    const currentDate = new Date().toISOString().split('T')[0];

    // 3) For each stock, fetch its price (in INR) and upsert into pricedetails
    const portfolioWithPrices = await Promise.all(
      portfolio.map(async (stock) => {
        try {
          const { price, currency } = await getStockPrice(stock.symbol);
          const priceInRupees = currency === 'INR' ? price : price * conversionRate;
          const valueInRupees = priceInRupees * stock.quantity;
          
          return new Promise((resolve, reject) => {
            db.run(
              `INSERT INTO pricedetails (account_id, name, quantity, price, value, datetime)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(account_id, name, datetime)
               DO UPDATE SET
                 quantity = excluded.quantity,
                 price = excluded.price,
                 value = excluded.value;`,
              [
                req.session.account.id,
                stock.stock_name,
                stock.quantity,
                priceInRupees,
                valueInRupees,
                currentDate
              ],
              function (err) {
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

    // 4) Compute the day’s total value
    const totalValueInRupees = portfolioWithPrices.reduce(
      (acc, stock) => acc + (stock.price * stock.quantity || 0),
      0
    );

    // 5) Find the last day *before* today to compute the difference
    db.get(
      `SELECT FinalTotal, date
         FROM portfoliototal
        WHERE account_id = ?
          AND date < ?
     ORDER BY date DESC
        LIMIT 1`,
      [req.session.account.id, currentDate],
      (err, prevRow) => {
        if (err) {
          console.error('Error fetching previous portfolio total:', err.message);
          return res.status(500).json({ error: 'Error fetching portfolio total' });
        }

        // If no previous row is found, we treat previousTotal = 0
        const previousTotal = prevRow ? prevRow.FinalTotal : 0;
        const difference = totalValueInRupees - previousTotal;

        // 6) Check if we already have a row for *today*
        db.get(
          `SELECT id
             FROM portfoliototal
            WHERE account_id = ?
              AND date = ?`,
          [req.session.account.id, currentDate],
          (err2, todayRow) => {
            if (err2) {
              console.error('Error checking today’s total:', err2.message);
              return res.status(500).json({ error: 'Error checking today’s total' });
            }

            if (todayRow) {
              // Update the existing row for today
              db.run(
                `UPDATE portfoliototal
                    SET FinalTotal = ?,
                        difference = ?
                  WHERE id = ?`,
                [totalValueInRupees, difference, todayRow.id],
                (err3) => {
                  if (err3) {
                    console.error('Error updating today’s total:', err3.message);
                  }
                  // Return the updated portfolio info to the client
                  res.json(portfolioWithPrices);
                }
              );
            } else {
              // Insert a new row for today
              db.run(
                `INSERT INTO portfoliototal (account_id, FinalTotal, date, difference)
                 VALUES (?, ?, ?, ?)`,
                [req.session.account.id, totalValueInRupees, currentDate, difference],
                (err4) => {
                  if (err4) {
                    console.error('Error inserting today’s total:', err4.message);
                  }
                  // Return the updated portfolio info
                  res.json(portfolioWithPrices);
                }
              );
            }
          }
        );
      }
    );
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Return the latest portfolio total
app.get('/latestPortfolioTotal', (req, res) => {
  if (!req.session.account) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  db.get(
    `SELECT FinalTotal, difference FROM portfoliototal WHERE account_id = ? ORDER BY date DESC LIMIT 1`,
    [req.session.account.id],
    (err, row) => {
      if (err) {
        console.error('Error fetching latest total:', err.message);
        return res.status(500).json({ error: 'Failed to fetch latest total' });
      }
      res.json({ latestTotal: row ? row.FinalTotal : 0, difference: row ? row.difference : 0 });
    }
  );
});

// Return *all* portfolio totals (for the table showing past dates)
app.get('/allPortfolioTotals', (req, res) => {
  if (!req.session.account) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  db.all(
    `SELECT * FROM portfoliototal WHERE account_id = ? ORDER BY date ASC`,
    [req.session.account.id],
    (err, rows) => {
      if (err) {
        console.error('Error fetching portfolio totals:', err.message);
        return res.status(500).json({ error: 'Failed to fetch portfolio totals' });
      }
      res.json(rows);
    }
  );
});

// Return the full portfolio total for each date (so you can chart growth over time)
app.get('/portfolioHistory', (req, res) => {
  if (!req.session.account) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  db.all(
    `SELECT date, FinalTotal
       FROM portfoliototal
      WHERE account_id = ?
   ORDER BY date ASC`,
    [req.session.account.id],
    (err, rows) => {
      if (err) {
        console.error('Error fetching portfolio history:', err.message);
        return res.status(500).json({ error: 'Failed to fetch portfolio history' });
      }
      res.json(rows);
    }
  );
});

// Add Stock
app.post('/addStock', async (req, res) => {
  if (!req.session.account) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const { stock_name, symbol, quantity } = req.body;
    if (!stock_name || !symbol || !quantity) {
      return res.status(400).json({ error: 'stock_name, symbol, and quantity are required.' });
    }
    // Fetch initial price to store as purchasePrice
    const { price, currency } = await getStockPrice(symbol);
    const conversionRate = await fetchConversionRate();
    if (!conversionRate) {
      return res.status(500).json({ error: 'Failed to fetch conversion rate' });
    }
    const priceInRupees = currency === 'INR' ? price : price * conversionRate;
    
    let portfolioData;
    const filePath = `./portfolios/portfolio_${req.session.account.id}.json`;
    try {
      const data = await fs.readFile(filePath, 'utf8');
      portfolioData = JSON.parse(data);
    } catch (e) {
      portfolioData = { portfolio: [] };
    }
    // Store purchasePrice along with the stock details
    portfolioData.portfolio.push({ stock_name, symbol, quantity, purchasePrice: priceInRupees });
    await fs.writeFile(filePath, JSON.stringify(portfolioData, null, 2), 'utf8');
    res.json({ message: 'Stock added successfully!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Edit Stock
app.put('/editStock', async (req, res) => {
  if (!req.session.account) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const { symbol, quantity } = req.body;
    if (!symbol || quantity == null) {
      return res.status(400).json({ error: 'symbol and quantity are required.' });
    }
    let portfolioData;
    const filePath = `./portfolios/portfolio_${req.session.account.id}.json`;
    try {
      const data = await fs.readFile(filePath, 'utf8');
      portfolioData = JSON.parse(data);
    } catch (e) {
      return res.status(500).json({ error: 'Portfolio file not found.' });
    }
    let updated = false;
    portfolioData.portfolio = portfolioData.portfolio.map((stock) => {
      if (stock.symbol === symbol) {
        stock.quantity = quantity;
        updated = true;
      }
      return stock;
    });
    if (!updated) {
      return res.status(404).json({ error: 'Stock not found.' });
    }
    await fs.writeFile(filePath, JSON.stringify(portfolioData, null, 2), 'utf8');
    res.json({ message: 'Stock updated successfully!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete Stock
app.delete('/deleteStock', async (req, res) => {
  if (!req.session.account) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const { symbol } = req.body;
    if (!symbol) {
      return res.status(400).json({ error: 'symbol is required.' });
    }
    let portfolioData;
    const filePath = `./portfolios/portfolio_${req.session.account.id}.json`;
    try {
      const data = await fs.readFile(filePath, 'utf8');
      portfolioData = JSON.parse(data);
    } catch (e) {
      return res.status(500).json({ error: 'Portfolio file not found.' });
    }
    const originalLength = portfolioData.portfolio.length;
    portfolioData.portfolio = portfolioData.portfolio.filter((stock) => stock.symbol !== symbol);
    if (portfolioData.portfolio.length === originalLength) {
      return res.status(404).json({ error: 'Stock not found.' });
    }
    await fs.writeFile(filePath, JSON.stringify(portfolioData, null, 2), 'utf8');
    res.json({ message: 'Stock deleted successfully!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Return the account's portfolio stocks
app.get('/stocks', async (req, res) => {
  if (!req.session.account) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const data = await fs.readFile(`./portfolios/portfolio_${req.session.account.id}.json`, 'utf8');
    const portfolioData = JSON.parse(data);
    res.json(portfolioData.portfolio);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// (Removed the /profitloss route entirely)

// Compare portfolio totals from two dates
app.get('/compare', (req, res) => {
  if (!req.session.account) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { date1, date2 } = req.query;
  if (!date1 || !date2) {
    return res
      .status(400)
      .json({ error: 'Both date1 and date2 query parameters are required in YYYY-MM-DD format.' });
  }
  db.get(
    `SELECT FinalTotal FROM portfoliototal WHERE account_id = ? AND date = ?`,
    [req.session.account.id, date1],
    (err, row1) => {
      if (err) return res.status(500).json({ error: err.message });
      db.get(
        `SELECT FinalTotal FROM portfoliototal WHERE account_id = ? AND date = ?`,
        [req.session.account.id, date2],
        (err, row2) => {
          if (err) return res.status(500).json({ error: err.message });
          if (!row1 || !row2) {
            return res
              .status(404)
              .json({ error: 'One or both of the specified dates were not found in records.' });
          }
          const diff = row2.FinalTotal - row1.FinalTotal;
          res.json({
            date1,
            total1: row1.FinalTotal,
            date2,
            total2: row2.FinalTotal,
            difference: diff
          });
        }
      );
    }
  );
});

// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
