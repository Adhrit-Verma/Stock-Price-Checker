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
