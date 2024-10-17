Here’s a modified version of your README that includes the specified JSON structure for the `portfolio.json` file. I've added a section detailing the structure of the `portfolio.json` to ensure users know how to format their stock portfolio:

```markdown
## Usage

1. **Start the Application**
   Start the Node.js server by running:
   ```bash
   npm start
   ```
   This will start the server on port 3000.

2. **View in Browser**
   Once the server is running, open your web browser and navigate to:
   ```
   http://localhost:3000
   ```
   You will see your stock portfolio with real-time prices and portfolio value.

---

## Project Structure

- **index.js**: Main server code and logic for fetching stock data and serving the web page.
- **portfolio.json**: Contains the user's stock portfolio with stock symbols and quantities.
- **package.json**: Lists project dependencies and scripts.

---

## Portfolio JSON Structure

The `portfolio.json` file should follow the structure below:

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

Make sure to replace the example stocks with your own stock data as needed.

---

## Dependencies

The project uses the following major dependencies:
- **Express**: Web framework for serving the portfolio.
- **Axios**: HTTP client for making API requests to Yahoo Finance.
- **Yahoo Finance API**: To fetch real-time stock data.
- **Open**: Automatically opens the application in the default web browser.

---

## License

This project is licensed under the ISC License.

---

## Author

- **Adhrit Verma (KD)**

---
```