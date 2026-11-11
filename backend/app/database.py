import csv
import os
import sqlite3
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data" / "sample_prices.csv"
DB_PATH = Path(os.getenv("PORTFOLIO_DB_PATH", str(DATA.parent / "portfolio.db")))
ASSETS = [
    ("SPY", "S&P 500 ETF", "US equities", 68, 0.35),
    ("AGG", "US Aggregate Bond ETF", "Fixed income", 73, 0.25),
    ("GLD", "Gold Trust", "Commodities", 45, 0.15),
    ("QQQ", "Nasdaq-100 ETF", "Growth equities", 64, 0.20),
    ("CASH", "Cash reserve", "Cash", 50, 0.05),
]

def connect():
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    return db

def initialize():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with connect() as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS assets (
          symbol TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
          illustrative_esg REAL NOT NULL, default_weight REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS prices (
          date TEXT NOT NULL, symbol TEXT NOT NULL REFERENCES assets(symbol),
          price REAL NOT NULL CHECK(price > 0), PRIMARY KEY(date, symbol));
        """)
        db.executemany("INSERT OR IGNORE INTO assets VALUES (?, ?, ?, ?, ?)", ASSETS)
        with DATA.open(newline="") as file:
            db.executemany("INSERT OR IGNORE INTO prices VALUES (:date, :symbol, :price)", csv.DictReader(file))
