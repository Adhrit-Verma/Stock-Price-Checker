```markdown
# Stock Portfolio Viewer

Stock Portfolio Viewer is a Node.js-based web application that lets you track and manage your stock investments in real time. It fetches current pricing data from Yahoo Finance, calculates your portfolio's value, and preserves historical data for comparison. The application now includes advanced features such as auto-refreshing data, comprehensive stock management (adding, editing, and deleting stocks), and a comparison tool (designed for dates within the same month).

---

## Usage

1. **Start the Application**  
   Start the Node.js server by running:
   ```bash
   npm start
   ```
   This will start the server on port 3000 (or the port specified in your environment).

2. **View in Browser**  
   Once the server is running, open your web browser and navigate to:
   ```
   http://localhost:3000
   ```
   You will see your stock portfolio with real-time prices, portfolio value, and additional management features.

3. **Auto-Refresh & Real-Time Updates**  
   The page automatically refreshes every 2 seconds, ensuring that stock prices and portfolio totals are always up-to-date—no manual refresh is needed after the initial load.

---

## Project Structure

- **index.js**: Main server code, including logic for fetching stock data, updating portfolio records, and serving the web interface.
- **portfolio.json**: Contains the user's stock portfolio with stock symbols and quantities.
- **package.json**: Lists project dependencies and scripts.
- **your_app.exe**: (Optional) A packaged executable version of the application.

---

## Portfolio JSON Structure

The `portfolio.json` file should follow the structure below. Modify it with your personal stock data as needed:

```json
{
  "portfolio": [
    {
      "stock_name": "Tata Consultancy Services (TCS)",
      "symbol": "TCS.NS",
      "quantity": 100
    },
    {
      "stock_name": "Infosys",
      "symbol": "INFY.NS",
      "quantity": 50
    },
    {
      "stock_name": "Wipro",
      "symbol": "WIPRO.NS",
      "quantity": 200
    },
    {
      "stock_name": "Tech Mahindra",
      "symbol": "TECHM.NS",
      "quantity": 75
    }
  ]
}
```

---

## New Features in v1.1

- **Real-Time Auto-Refresh**:  
  The interface auto-refreshes every 2 seconds, so you always see the latest stock prices and portfolio totals.

- **Enhanced UI & Modern Design**:  
  Enjoy an improved, clean, and responsive design with card-style panels, intuitive tables, and a user-friendly layout.

- **Comprehensive Stock Management**:  
  - **Add Stocks**: Easily add new stocks using the "Add Stock" form.
  - **Edit Stocks**: Update the quantity of existing stocks directly from the "Manage Stocks" section.
  - **Delete Stocks**: Remove unwanted stocks from your portfolio with a single click.

- **Portfolio Comparison**:  
  Compare portfolio totals between two dates (note: this comparison feature is intended for dates within the same month) to track how your investments evolve over time.

- **Historical Data Preservation**:  
  Historical portfolio totals are now retained, allowing for more meaningful long-term comparisons.

---

## Dependencies

The project uses the following major dependencies:
- **Express**: Web framework for serving the portfolio.
- **Axios**: HTTP client for making API requests to Yahoo Finance.
- **Yahoo Finance API**: Provides real-time stock data.
- **Open**: (Optional) Automatically opens the application in your default web browser.
- **SQLite3**: Stores historical portfolio data for comparisons.

---

## License

This project is licensed under the ISC License.

---

## Author

- **Adhrit Verma (KD)**

---

I hope you enjoy using Stock Portfolio Viewer v1.1! Your feedback is always appreciated as we continue to improve this tool.
```