# PayAnalytics — Documentation

> **Last updated:** March 13, 2026  
> **Repository:** https://github.com/MjTuplano18/PayAnalytics  
> **Contributors:** Mj Tuplano (MjTuplano18), CMCSX

---

## Table of Contents

1. [What is PayAnalytics?](#1-what-is-payanalytics)
2. [Features](#2-features)
3. [How to Use](#3-how-to-use)
4. [Pages Overview](#4-pages-overview)
5. [Setup Guide](#5-setup-guide)
6. [Update History](#6-update-history)

---

## 1. What is PayAnalytics?

PayAnalytics is a web application for analyzing payment transaction data. You can upload Excel or CSV files containing payment records and instantly see interactive charts, summary statistics, and detailed breakdowns of your financial data.

**What it does:**
- Imports Excel/CSV files and automatically reads the data
- Shows a dashboard with total amounts, account counts, charts, and trends
- Lets you search, filter, and browse individual transactions
- Exports reports as Excel, CSV, or PDF files
- Supports multiple users with login accounts
- Works in dark mode and light mode

---

## 2. Features

### Uploading Data
- Drag and drop Excel (.xlsx/.xls) or CSV files to upload
- The system automatically figures out which columns are Bank, Account, Date, Amount, etc.
- You can upload multiple files and merge them together
- Choose a date range (FROM/TO) during upload to import only the records you need
- Previously uploaded files are saved and can be restored later

### Dashboard
- **Four stat cards** at the top: Total Payment Amount, Account Count, Transaction Count, Banks/Portfolio Count
- **Charts**: Bar charts, line charts, pie charts, and area charts showing data by bank and touchpoint
- **Date filtering**: Filter everything by Today, This Week, This Month, This Year, or a custom date range
- **Period comparison**: Compare current period vs. previous period with percentage change indicators
- **Welcome greeting**: Shows a personalized welcome message with your name

### Transactions Page
- Browse all transactions in a paginated table (25 per page)
- **Search** by bank name, account, or touchpoint
- **Filter** by specific bank or touchpoint using dropdown menus
- **Edit** any transaction by clicking the pencil icon on its row
- **Mass delete**: Click the red trash button to delete transactions within a date range (with confirmation)
- **Add** new transactions via the green floating "+" button
- **Export** the data as CSV or Excel

### Accounts Page
- View analytics grouped by account
- See which accounts have the most transactions or highest amounts

### Reports Page
- Generate and download reports in Excel, CSV, or PDF format

### Settings Page
- **Change your password** (must enter current password first)
- **Create new users** (admin only)
- **View audit log** — see who uploaded what, when, and how many records

### Search
- The search icon in the top-right corner opens a search bar
- Search for pages, banks, accounts, or transactions
- Results are grouped by category and clicking one takes you to the relevant page

### Dark Mode
- Toggle between dark and light themes using the sun/moon icon in the top-right corner

---

## 3. How to Use

### Uploading a File
1. Go to **Upload Data** in the sidebar
2. Drag and drop your Excel or CSV file (or click to browse)
3. A popup will ask you to select a date range — choose FROM and TO dates, or check "All Dates"
4. Click **Import** and the data will be loaded

### Merging Multiple Files
1. Drop 2 or more files at once onto the upload area
2. They'll be queued for merging — you can add more or remove them
3. Click **Merge** to combine them into one dataset

### Viewing the Dashboard
1. Click **Dashboard** in the sidebar
2. Use the date dropdown (top-right) to filter by time period
3. Hover over charts for detailed values

### Working with Transactions
1. Click **Transactions** in the sidebar
2. Use the search bar and filter dropdowns to find specific records
3. Click the pencil icon on any row to edit it
4. Click the green "+" button at the bottom-right to add a new transaction
5. Click the red trash button to mass-delete transactions by date range

### Exporting Data
1. On the Transactions page, click the **Export** button
2. Choose **CSV** or **XLSX** format
3. The file will download automatically

### Changing Your Password
1. Go to **Settings** in the sidebar
2. Enter your current password, then your new password
3. Click **Change Password**

---

## 4. Pages Overview

| Page | What It Shows |
|------|--------------|
| **Dashboard** | Summary stats, charts, and trends for all your data |
| **Transactions** | Searchable, filterable table of every payment record |
| **Accounts** | Analytics grouped by customer/account |
| **Reports** | Generate downloadable reports |
| **Upload Data** | Upload new Excel/CSV files or merge multiple files |
| **Settings** | Change password, manage users (admin), view audit log |

---

## 5. Setup Guide

### What You Need
- **Node.js** (version 18 or higher) — for the website
- **Python** (version 3.11 or higher) — for the server
- **A PostgreSQL database** — the app uses Neon (cloud) by default

### Starting the Server (Backend)

```bash
cd backend
python -m venv venv
venv\Scripts\Activate.ps1          # Windows
pip install -r requirements.txt
alembic upgrade head               # Set up the database
python create_admin.py             # Create an admin account
python -m uvicorn main:app --reload --port 8000
```

### Starting the Website (Frontend)

```bash
cd frontend
npm install
npm run dev
```

Then open **http://localhost:3000** in your browser.

### Configuration

The backend needs a `.env` file in the `backend/` folder with:
- `DATABASE_URL` — the database connection string
- `SECRET_KEY` — a secret key for login security

---

## 6. Update History

| Version | Date | What Changed |
|---------|------|-------------|
| **0.1.0** | Mar 7 | Project created from Next.js template |
| **0.2.0** | Mar 7 | Core app built: Excel upload, dashboard, data tables, date filters |
| **0.3.0** | Mar 9 | Reorganized into frontend/ and backend/ folders |
| **0.4.0** | Mar 9 | Dashboard and top bar improvements |
| **0.5.0** | Mar 9 | Login system added (accounts, passwords, admin users) |
| **0.5.1** | Mar 9 | Global search bar with navigation to results |
| **0.6.0** | Mar 10 | Data saved to database, upload history, real-time updates |
| **0.7.0** | Mar 11 | New teal color scheme, chart gradients, pie charts |
| **0.8.0** | Mar 11 | Calendar date picker, date range filtering on all pages |
| **0.8.1** | Mar 11 | Bug fixes: stats update with filters, skeleton loaders, empty states |
| **0.9.0** | Mar 12 | Security improvements, search performance, real-time auto-refresh |
| **1.0.0** | Mar 12 | Add/edit/delete transactions, export as CSV or Excel, UI polish |
| **1.0.1** | Mar 12 | Dashboard and upload page refinements (current version) |

---

## Summary

PayAnalytics was built over 6 days (March 7–12, 2026) and includes:
- 6 pages with a collapsible sidebar navigation
- Interactive charts (bar, line, pie, area)
- Full transaction management (add, edit, delete, mass delete)
- File upload with automatic column detection and date filtering
- Dark/light mode, global search, and real-time updates
- User accounts with login, admin controls, and audit logging
