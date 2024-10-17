const express = require('express');
const axios = require('axios');
const yahooFinance = require('yahoo-finance2').default;
const fs = require('fs').promises;
const dns = require('dns');

const app = express();
const port = 3000;

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

const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./portfolio.db', (err) => {
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

      db.run(`CREATE TABLE IF NOT EXISTS pricedetails (
        Id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        quantity INTEGER,
        price REAL,
        value REAL,
        datetime TEXT
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

// Serve the main HTML page with JavaScript for periodic updates
app.get('/', async (req, res) => {
  try {
    // Fetching portfolio totals and price details
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

    // Construct HTML for price details
    let priceDetailsRows = priceDetails.map(row => `
      <tr>
        <td>${row.Id}</td>
        <td>${row.name}</td>
        <td>${row.quantity}</td>
        <td>${row.price}</td>
        <td>${row.value}</td>
        <td>${row.datetime}</td>
      </tr>
    `).join('');

    // Construct HTML for portfolio totals
    let portfolioTotalRows = portfolioTotals.map(row => {
      // Format difference with + or - sign
      const formattedDifference = row.difference >= 0 ? `+${row.difference}` : `${row.difference}`;
      return `
        <tr>
          <td>${row.id}</td>
          <td>${row.FinalTotal}</td>
          <td>${row.date}</td>
          <td>${formattedDifference}</td>
        </tr>
      `;
    }).join('');

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
  </style>
  <h1>Price Details</h1>
  <table>
    <tr>
      <th>Id</th>
      <th>Name</th>
      <th>Quantity</th>
      <th>Price (INR)</th>
      <th>Value (INR)</th>
      <th>Date</th>
    </tr>
    ${priceDetailsRows}
  </table>

  <h1>Portfolio Total</h1>
  <table>
    <tr>
      <th>Id</th>
      <th>Final Total (INR)</th>
      <th>Date</th>
      <th>Difference (INR)</th>
    </tr>
    ${portfolioTotalRows}
  </table>

  <div class="total">
    <h2 id="totalValue">Total Portfolio Value: ₹0.00</h2>
  </div>

  <script>
    async function fetchPortfolioData() {
      try {
        const response = await fetch('/portfolio');
        const data = await response.json();
        const totalValueElement = document.getElementById('totalValue');
        let totalValue = 0;

        data.forEach(stock => {
          const stockValue = stock.price * stock.quantity;
          totalValue += stockValue;
        });

        totalValueElement.innerHTML = \`Total Portfolio Value: ₹\${totalValue.toFixed(2)}\`;
      } catch (error) {
        console.error('Error fetching portfolio data:', error);
        document.getElementById('totalValue').innerHTML = 'Error fetching total value';
      }
    }

    async function fetchLatestPortfolioTotal() {
      try {
        const response = await fetch('/latestPortfolioTotal'); // Endpoint to get the latest total
        const data = await response.json();
        const totalValueElement = document.getElementById('totalValue');
        const latestTotal = data.latestTotal || 0; // Default to 0 if not found

        totalValueElement.innerHTML = \`Total Portfolio Value: ₹\${latestTotal.toFixed(2)}\`;
      } catch (error) {
        console.error('Error fetching latest total:', error);
      }
    }

    // Initial fetch on page load
    fetchPortfolioData();
    fetchLatestPortfolioTotal(); // Fetch latest portfolio total
  </script>
`;

    res.send(html);
  } catch (error) {
    res.send(`<h1>Error: ${error}</h1>`);
  }
});

const oneMonthAgo = new Date();
oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1); // Set the date to one month ago

app.get('/portfolio', async (req, res) => {
  try {
    await checkInternet();
    await checkAPI();

    const conversionRate = await fetchConversionRate(); // Fetch conversion rate dynamically
    if (!conversionRate) {
      return res.status(500).json({ error: 'Failed to fetch conversion rate' });
    }

    const portfolio = await getPortfolio();
    const currentDate = new Date().toISOString().split('T')[0]; // Get the current date

    const portfolioWithPrices = await Promise.all(
      portfolio.map(async stock => {
        try {
          const price = await getStockPrice(stock.symbol);
          const value = price * stock.quantity;

          // Convert price and value to rupees
          const priceInRupees = price * conversionRate;
          const valueInRupees = value * conversionRate;

          return new Promise((resolve, reject) => {
            // Check if the price detail already exists for the stock and date
            db.get(`SELECT * FROM pricedetails WHERE name = ? AND datetime = ?`, [stock.stock_name, currentDate], (err, row) => {
              if (err) {
                console.error('Error checking pricedetails:', err.message);
                return reject(err);
              }

              if (row) {
                // Update existing entry
                db.run(`UPDATE pricedetails SET quantity = ?, price = ?, value = ? WHERE Id = ?`,
                  [stock.quantity, priceInRupees, valueInRupees, row.Id],
                  (err) => {
                    if (err) {
                      console.error('Error updating price details:', err.message);
                      return reject(err);
                    }
                    resolve({ ...stock, price: priceInRupees }); // Include price in response
                  });
              } else {
                // Insert new entry
                db.run(`INSERT INTO pricedetails (name, quantity, price, value, datetime) VALUES (?, ?, ?, ?, ?)`,
                  [stock.stock_name, stock.quantity, priceInRupees, valueInRupees, currentDate],
                  (err) => {
                    if (err) {
                      console.error('Error inserting price details:', err.message);
                      return reject(err);
                    }
                    resolve({ ...stock, price: priceInRupees }); // Include price in response
                  });
              }
            });
          });
        } catch (error) {
          console.error(error);
          return { ...stock, price: null }; // If error occurs, set price to null
        }
      })
    );

    // Calculate total in rupees
    const totalValueInRupees = portfolioWithPrices.reduce((acc, stock) => acc + (stock.price * stock.quantity || 0), 0);

    // Get previous total for calculating difference
    db.get(`SELECT FinalTotal FROM portfoliototal WHERE date = ?`, [currentDate], (err, row) => {
      let previousTotal = row ? row.FinalTotal : 0; // Default to 0 if no previous total
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

app.get('/latestPortfolioTotal', (req, res) => {
  db.get(`SELECT FinalTotal FROM portfoliototal ORDER BY date DESC LIMIT 1`, (err, row) => {
    if (err) {
      console.error('Error fetching latest total:', err.message);
      return res.status(500).json({ error: 'Failed to fetch latest total' });
    }

    res.json({ latestTotal: row ? row.FinalTotal : 0 }); // Send the latest total or 0
  });
});


// Start server and open the default browser automatically
app.listen(port, async () => {
  console.log(`Server running at http://localhost:${port}`);

  // Dynamically import the open package to launch the default browser
  const open = require('open'); // Static import
  await open(`http://localhost:${port}`);
});
