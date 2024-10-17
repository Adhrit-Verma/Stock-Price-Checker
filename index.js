const express = require('express');
const axios = require('axios');
const yahooFinance = require('yahoo-finance2').default;
const fs = require('fs').promises;
const dns = require('dns');

const app = express();
const port = 3000;

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
      margin: 0 auto;
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
  <h1>Portfolio Value</h1>
  <table id="portfolioTable">
    <tr>
      <th>Stock Name</th>
      <th>Price</th>
      <th>Quantity</th>
      <th>Total Value</th>
    </tr>
  </table>
  <div class="total">
    <h2 id="totalValue">Total Portfolio Value: $0.00</h2>
  </div>
  <script>
    async function fetchPortfolioData() {
      try {
        const response = await fetch('/portfolio');
        const data = await response.json();
        const portfolioTable = document.getElementById('portfolioTable');
        const totalValueElement = document.getElementById('totalValue');
        let totalValue = 0;
        let rows = \`
          <tr>
            <th>Stock Name</th>
            <th>Price</th>
            <th>Quantity</th>
            <th>Total Value</th>
          </tr>
        \`;

        data.forEach(stock => {
          const stockValue = stock.price * stock.quantity;
          totalValue += stockValue;
          rows += \`
            <tr>
              <td>\${stock.stock_name}</td>
              <td>$\${stock.price ? stock.price.toFixed(2) : 'N/A'}</td>
              <td>\${stock.quantity}</td>
              <td>$\${stockValue.toFixed(2)}</td>
            </tr>
          \`;
        });

        portfolioTable.innerHTML = rows;
        totalValueElement.innerHTML = \`Total Portfolio Value: $\${totalValue.toFixed(2)}\`;
      } catch (error) {
        console.error('Error fetching portfolio data:', error);
        document.getElementById('portfolioTable').innerHTML = '<tr><td colspan="4">Error fetching data</td></tr>';
      }
    }

    // Initial fetch on page load
    fetchPortfolioData();
  </script>
`;


    res.send(html);
  } catch (error) {
    res.send(`<h1>Error: ${error}</h1>`);
  }
});

// Route to fetch updated portfolio data as JSON
app.get('/portfolio', async (req, res) => {
  try {
    await checkInternet();
    await checkAPI();

    const portfolio = await getPortfolio();
    const portfolioWithPrices = await Promise.all(
      portfolio.map(async stock => {
        try {
          const price = await getStockPrice(stock.symbol);
          return { ...stock, price }; // Include price in response
        } catch (error) {
          console.error(error);
          return { ...stock, price: null }; // If error occurs, set price to null
        }
      })
    );

    res.json(portfolioWithPrices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server and open the default browser automatically
app.listen(port, async () => {
  console.log(`Server running at http://localhost:${port}`);

  // Dynamically import the open package to launch the default browser
  const open = require('open'); // Static import
  await open(`http://localhost:${port}`);
});
