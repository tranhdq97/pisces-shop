# Pisces Shop — User Guide

> **Version:** 2.0 · **Last updated:** 2026-04-02

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Store Setup](#2-store-setup)
   - [Tables](#21-tables)
   - [Menu (Categories & Items)](#22-menu-categories--items)
   - [Suppliers](#23-suppliers)
   - [Inventory](#24-inventory)
   - [Recipes](#25-recipes)
3. [Daily Operations](#3-daily-operations)
   - [Creating and Managing Orders](#31-creating-and-managing-orders)
   - [Kitchen Display System (KDS)](#32-kitchen-display-system-kds)
   - [Processing Payments](#33-processing-payments)
   - [Table Clearing](#34-table-clearing)
4. [Inventory Management](#4-inventory-management)
   - [Stock Entries](#41-stock-entries)
   - [Low-Stock Alerts](#42-low-stock-alerts)
   - [Supplier Tracking](#43-supplier-tracking)
5. [Staff Management](#5-staff-management)
   - [Staff Profiles](#51-staff-profiles)
   - [Work Entries](#52-work-entries)
   - [Payroll Breakdown](#53-payroll-breakdown)
   - [Payroll Records](#54-payroll-records)
6. [Reporting](#6-reporting)
   - [Dashboard](#61-dashboard)
   - [Financials & P&L](#62-financials--pl)
   - [CSV Exports](#63-csv-exports)
7. [Admin Tasks](#7-admin-tasks)
   - [User Management & Approval](#71-user-management--approval)
   - [Roles & Permissions](#72-roles--permissions)
   - [SOP Checklists](#73-sop-checklists)
8. [Roles Quick Reference](#8-roles-quick-reference)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Getting Started

### First Login

1. Navigate to **http://localhost:5173** (or your deployment URL).
2. Click **Register** to create an account. Your account will be in *pending* state until a Superadmin approves it.
3. Once approved, log in with your email and password.
4. Use the language toggle (**EN / VI**) in the sidebar footer to switch languages.

### Initial Superadmin Setup

Run the following command once to create the first Superadmin account:

```bash
PYTHONPATH=. venv/bin/python scripts/create_superadmin.py \
  --email admin@shop.com --full_name "Admin" --password "Admin1234"
```

After logging in as Superadmin, go to **Users** → **Pending Approvals** to approve staff accounts.

---

## 2. Store Setup

### 2.1 Tables

**Path:** Sidebar → *Tables*
**Required role:** Manager or Admin (to create/edit); any logged-in staff (to view)

1. Click **+ Add Table** to create a table.
2. Enter the table **name** (e.g., "Table 1", "Patio 3") and a **sort order** (lower number = displayed first).
3. Toggle **Active** off to hide a table from the ordering screen.
4. To reorder tables, update each table's sort order.

> **Table Statuses**
> - 🟢 **Free** — no active orders, clean
> - 🔴 **Occupied** — has pending, in-progress, or delivered orders
> - 🧹 **Needs Clearing** — payment processed, awaiting cleanup
> - ⚫ **Closed** — deactivated by an admin

---

### 2.2 Menu (Categories & Items)

**Path:** Sidebar → *Menu*
**Required role:** Manager or Admin

#### Creating a Category

1. Click **+ Add Category**.
2. Enter a **name** and optional **sort order**.
3. Click **Save**.

#### Adding Menu Items

1. Click **+ Add Item** within a category (or use the global add button and select a category).
2. Fill in:
   - **Name** — displayed to customers and on order tickets
   - **Price** — selling price (used for P&L calculations)
   - **Category** — the category this item belongs to
   - **Available** — uncheck to temporarily hide from ordering
3. Click **Save**.

#### Editing and Deleting

- Click a category/item row to edit.
- Click the **trash icon** to delete. Categories with items cannot be deleted until all items are removed.

---

### 2.3 Suppliers

**Path:** Sidebar → *Suppliers*
**Required role:** Manager or Admin (to create/edit/delete); any logged-in staff (to view)

Suppliers represent vendors who provide your stock ingredients.

1. Click **+ Add Supplier**.
2. Enter:
   - **Name** — required, must be unique
   - **Phone** — optional contact number
   - **Notes** — optional free-text notes (e.g., delivery schedule, MOQ)
3. Click **Save**.

To update a supplier, click the **Edit** (pencil) icon on its row.
To delete a supplier, click the **Delete** (trash) icon. Stock items linked to the supplier will have their supplier reference cleared (not deleted).

---

### 2.4 Inventory

**Path:** Sidebar → *Inventory*
**Required role:** Manager or Admin

The inventory module tracks raw ingredients and stock items used in the kitchen.

#### Adding a Stock Item

1. Click **+ Add Item**.
2. Fill in:
   - **Name** — e.g., "Chicken Breast", "Rice", "Salt"
   - **Unit** — e.g., kg, g, pcs, litre
   - **Low-stock threshold** — optional; triggers an alert when quantity falls at or below this level
   - **Supplier** — optional; link to a supplier from your supplier list
3. Click **Save**.

#### Editing a Stock Item

Click the **Edit** icon on any row to update name, unit, threshold, or supplier.

---

### 2.5 Recipes

**Path:** Sidebar → *Recipes*
**Required role:** Manager or Admin (to edit); Kitchen, Waiter (to view)

Recipes define how much of each stock item is consumed when a menu item is sold. This enables:
- **Auto-deduction** of inventory when an order is delivered
- **Cost & margin calculation** per menu item

#### Setting Up a Recipe

1. In the Recipes page, select a **menu item** from the left panel.
2. Click **Edit Recipe**.
3. Add each ingredient:
   - Select the **stock item**
   - Enter the **quantity per serving** (in the stock item's unit)
   - Optional: add a **note** (e.g., "adjust for large serving")
4. Click **Save Recipe**.

#### Viewing Cost & Margin

1. Click on a menu item to open its detail panel.
2. Switch to the **Cost** tab.
3. The system calculates:
   - **Total cost** — based on the most recent unit price of each stock entry
   - **Selling price** — from the menu
   - **Gross margin %** — color-coded:
     - 🟢 Green: ≥ 40%
     - 🟡 Yellow: 20–39%
     - 🔴 Red: < 20%

> **Note:** If no stock entries with a unit price exist, cost data will show as *N/A*.

---

## 3. Daily Operations

### 3.1 Creating and Managing Orders

**Path:** Sidebar → *Orders*
**Required role:** Any logged-in staff (view); Waiter+ (create/edit)

#### Creating an Order

1. Click **+ New Order**.
2. Select a **table**.
3. Add items by clicking **+ Add Item**, choosing from the menu, and setting quantities.
4. Click **Create Order**. Status is set to **Pending**.

#### Updating an Order

- **Add/remove items** (Pending or In-Progress orders only): Click the order, then **Edit Items**.
- **Change status**: Use the status action buttons (see FSM below).
- **Cancel order**: Available from any active status. Requires Waiter+ permission.

#### Order Status Flow

```
PENDING → IN_PROGRESS → DELIVERED → COMPLETED
    └──────────────────────────────→ CANCELLED
```

| Status | Description | Who can transition |
|---|---|---|
| **Pending** | Order created, not yet started | — |
| **In Progress** | Kitchen is preparing | Kitchen, Admin, Manager |
| **Delivered** | Food delivered to table | Waiter, Admin, Manager |
| **Completed** | Payment processed | Via Tables → Pay |
| **Cancelled** | Order cancelled | Waiter, Admin, Manager |

> **Auto Inventory Deduction:** When an order transitions to **Delivered**, the system automatically deducts stock based on each ordered item's recipe. If a stock item drops below zero, the deduction is **skipped** (soft-fail) and a warning is displayed — the order still completes.

#### Filtering Orders

Use the filter bar at the top of the Orders page:
- **Status tabs** — filter by Pending / In-Progress / Delivered / Completed / Cancelled
- **Table** — filter by a specific table
- **Date range** — filter by date (defaults to today)

#### Deleting Cancelled Orders

Select a cancelled order and click the **Delete** (trash) button. Only cancelled orders can be deleted.

#### CSV Export

Click the **Export** (download) icon to download the current filtered order list as a CSV file, useful for accounting or reviews.

---

### 3.2 Kitchen Display System (KDS)

**Path:** Sidebar → *Kitchen*
**Required role:** Kitchen, Admin, Manager

The KDS page shows all **Pending** and **In-Progress** orders in real time, refreshing automatically every 10 seconds.

- **Yellow cards** — Pending orders awaiting preparation
- **Orange cards** — In-progress orders being prepared

Each card shows:
- Table name
- Time since order was created
- List of ordered items

**Actions:**
- Click **Start** on a pending order to mark it In-Progress
- Click **Done** on an in-progress order to mark it Delivered

---

### 3.3 Processing Payments

**Path:** Sidebar → *Tables* (click an occupied table)
**Required role:** Waiter, Admin, Manager

1. Click on an **occupied** table to open the bill view.
2. The bill shows all delivered/in-progress orders and a **grand total**.

#### Applying a Discount (display only — not stored)

Below the total, you can apply an optional discount:
- Select **Fixed amount** or **Percentage**
- Enter the discount value
- The **After Discount** total updates instantly

#### Split Bill

Below the discount section:
- Enter the number of people splitting the bill
- The system shows the **amount per person**

> **Note:** Discounts and split amounts are display-only for printing purposes. The stored revenue reflects the full order total.

#### Confirming Payment

1. Click **Pay** to mark all active orders as **Completed** and set the table to *Needs Clearing*.
2. A printable bill window opens automatically.

---

### 3.4 Table Clearing

After payment is processed, the table shows **Needs Clearing**.

1. Staff physically clean the table.
2. In the Tables page, click the **Clear** button on the table.
3. The table returns to **Free** status.

> Only Waiter, Admin, and Manager roles can clear tables.

---

## 4. Inventory Management

### 4.1 Stock Entries

**Path:** Sidebar → *Inventory* → click any item → **History** or **Add Entry**
**Required role:** Manager or Admin

Stock entries record every movement of a stock item (intake or consumption).

#### Adding a Stock Entry

1. Click on a stock item row.
2. Click **Add Entry**.
3. Fill in:
   - **Quantity** — positive for intake, negative for manual adjustment/removal
   - **Unit Price** — optional cost per unit (used for recipe cost calculations)
   - **Note** — optional memo (e.g., "Weekly delivery", "Spillage adjustment")
4. Click **Save**.

> The **Current Quantity** on each item is the running total of all entries.

#### Viewing Entry History

Click a stock item, then **History** to see all past entries. Use the date filter to narrow the range.

---

### 4.2 Low-Stock Alerts

Any item with a **low-stock threshold** set will trigger an alert when `current_quantity ≤ threshold`.

- In the Inventory list, low-stock items are highlighted with an **amber background**.
- The page header shows an amber badge with the **count of low-stock items** (e.g., "⚠ 3 Low Stock").

To manage thresholds, edit the stock item and update the **Low-stock threshold** field.

---

### 4.3 Supplier Tracking

Each stock item can be linked to a supplier. In the Inventory page:

1. When creating or editing a stock item, select a supplier from the **Supplier** dropdown.
2. The supplier information is visible on the item detail and in the item list.

This helps quickly identify which vendor to contact when reordering a low-stock item.

---

## 5. Staff Management

### 5.1 Staff Profiles

**Path:** Sidebar → *Payroll* → **Setup** tab
**Required role:** Admin or Manager

Before recording work hours, create a staff profile for each employee:

1. Select a **staff member** from the dropdown (must be a registered, approved user).
2. Enter:
   - **Position** — job title (e.g., "Head Chef", "Floor Staff")
   - **Monthly base salary** — fixed monthly amount
   - **Hourly rate** — used to calculate overtime and work-entry pay
3. Click **Save Profile**.

---

### 5.2 Work Entries

**Path:** Sidebar → *Payroll* → **Hours** tab
**Required role:** Admin or Manager

Work entries record daily hours worked per staff member.

1. Select the **year** and **month** using the navigation controls.
2. Click **+ Add Entry**.
3. Select the staff member, enter the **work date** and **hours worked**.
4. Click **Save**.

Entries can be edited or deleted. Only approved entries count toward payroll calculations.

---

### 5.3 Payroll Breakdown

**Path:** Sidebar → *Payroll* → **Breakdown** tab

Shows a monthly summary per staff member:
- **Basic pay** — base salary
- **Overtime pay** — hours × hourly rate (above base threshold)
- **Bonus / Deduction** — manual adjustments (see Adjustments tab)
- **Total pay**

Click the **Export** icon to download the breakdown as a CSV file.

---

### 5.4 Payroll Records

**Path:** Sidebar → *Payroll* → **Records** tab
**Required role:** Admin or Manager

Payroll records formalize the monthly payroll for each staff member and track their payment status.

| Status | Meaning |
|---|---|
| **Draft** | Calculated but not yet confirmed |
| **Confirmed** | Verified by manager, ready for payment |
| **Paid** | Payment has been processed |

**Workflow:**

1. After reviewing the breakdown, click **Confirm** on each record to move it from *Draft* to *Confirmed*.
2. Once payment is sent, click **Mark Paid** to move to *Paid*.

---

## 6. Reporting

### 6.1 Dashboard

**Path:** Sidebar → *Dashboard*
**Required role:** Admin, Manager

The dashboard provides a snapshot of store performance for the selected date range:

| KPI | Description |
|---|---|
| Revenue | Total from completed orders |
| Orders | Number of completed orders |
| Avg Order Value | Revenue ÷ Orders |
| Inventory Cost | Total cost of stock entries in period |
| Peak Hour | Hour of day with highest order volume |
| Best Day | Day of week with highest revenue |

**Sections (collapsible):**

- **Table Performance** — top tables by revenue, sessions, and avg session time
- **Staff Performance** — hours worked, orders taken, and revenue handled per staff member
- **Menu Performance** — top-selling items by category
- **Trend Charts** — hourly order distribution bar chart

---

### 6.2 Financials & P&L

**Path:** Sidebar → *Financials*
**Required role:** Admin, Manager, Superadmin

The Financials page provides Profit & Loss reporting by month or year.

#### Monthly View

Navigate months using **← / →** buttons. The P&L summary shows:
- **Revenue** — from completed orders
- **Inventory cost** — from stock entries with unit prices
- **Payroll cost** — from confirmed/paid payroll records
- **Custom costs** — manually entered one-off or recurring costs
- **Net profit** — Revenue − Total Costs

#### Yearly View

Click **Year** mode to see full-year data with a chart:
- **Bars** — monthly revenue
- **Line** — monthly net profit

Hover over data points for exact values.

#### Cost Templates

Recurring costs (rent, utilities, etc.) can be set up as **templates**:

1. Go to *Cost Templates* section → click **+ Add Template**.
2. Enter a **name** and **default amount**.
3. When entering monthly costs, select from templates to pre-fill the amount.

#### Monthly Cost Entries

Additional one-off costs:

1. Click **+ Add Cost Entry**.
2. Select a template (or enter a custom name), amount, and note.
3. Click **Save**.

---

### 6.3 CSV Exports

The following pages support CSV export via the **Download** icon:

| Page | What's exported |
|---|---|
| **Orders** | Current filtered order list (status, table, total, date) |
| **Inventory** | All stock items (name, unit, quantity, threshold, supplier) |
| **Payroll → Breakdown** | Monthly payroll breakdown per staff member |

Exported files include a UTF-8 BOM for compatibility with Excel/Google Sheets (important for Vietnamese characters).

---

## 7. Admin Tasks

### 7.1 User Management & Approval

**Path:** Sidebar → *Users*
**Required role:** Superadmin (approvals); Admin or Manager (view list)

#### Approving New Users

When staff register, their accounts are placed in *Pending* state. To approve:

1. Go to **Users** → **Pending Approvals** tab.
2. Click **Approve** to grant access or **Reject** to deny.

#### Viewing All Users

The **All Users** tab lists every approved user, their role, and account status. Superadmins can deactivate accounts here.

---

### 7.2 Roles & Permissions

Pisces uses five roles with fixed permission sets:

| Role | Description |
|---|---|
| **Superadmin** | Full access including user approvals and all admin functions |
| **Admin** | Full operational access; cannot manage users |
| **Manager** | Same as Admin for most features |
| **Waiter** | Create orders, process payments, view menu/inventory |
| **Kitchen** | View orders; start (PENDING→IN_PROGRESS) and complete (→DELIVERED) orders via KDS |

**Key Permissions:**

| Permission | Waiter | Kitchen | Manager | Admin | Superadmin |
|---|---|---|---|---|---|
| View Menu | ✓ | ✓ | ✓ | ✓ | ✓ |
| Edit Menu | | | ✓ | ✓ | ✓ |
| Create Orders | ✓ | | ✓ | ✓ | ✓ |
| Start Orders (KDS) | | ✓ | ✓ | ✓ | ✓ |
| Process Payment | ✓ | | ✓ | ✓ | ✓ |
| View Inventory | ✓ | | ✓ | ✓ | ✓ |
| Edit Inventory | | | ✓ | ✓ | ✓ |
| View/Edit Recipes | view | view | ✓ | ✓ | ✓ |
| View Payroll | | | ✓ | ✓ | ✓ |
| Edit Payroll | | | ✓ | ✓ | ✓ |
| View Financials | | | ✓ | ✓ | ✓ |
| Manage Suppliers | | | ✓ | ✓ | ✓ |
| Approve Users | | | | | ✓ |

---

### 7.3 SOP Checklists

**Path:** Sidebar → *SOP*
**Required role:** Any logged-in staff (view/check off); Admin+ (create categories/tasks)

SOPs (Standard Operating Procedures) provide daily checklists for opening, service, and closing procedures.

#### Creating an SOP Category

1. Click **+ Add Category** (Admin or Manager only).
2. Enter a name (e.g., "Opening Procedure", "Closing Checklist").
3. Click **Save**.

#### Adding Tasks

1. Within a category, click **+ Add Task**.
2. Enter the task description.
3. Click **Save**.

#### Using the Checklist

All staff can check off SOP tasks. Each task shows:
- Task description
- Who last completed it and when

Checkboxes reset at the start of each new day.

---

## 8. Roles Quick Reference

| Feature | Waiter | Kitchen | Manager | Admin | Superadmin |
|---|---|---|---|---|---|
| Dashboard | | | ✓ | ✓ | ✓ |
| Menu — view | ✓ | ✓ | ✓ | ✓ | ✓ |
| Menu — edit | | | ✓ | ✓ | ✓ |
| Orders — view | ✓ | ✓ | ✓ | ✓ | ✓ |
| Orders — create | ✓ | | ✓ | ✓ | ✓ |
| Orders — start (KDS) | | ✓ | ✓ | ✓ | ✓ |
| Orders — deliver | ✓ | | ✓ | ✓ | ✓ |
| Tables — view | ✓ | ✓ | ✓ | ✓ | ✓ |
| Tables — pay | ✓ | | ✓ | ✓ | ✓ |
| Tables — clear | ✓ | | ✓ | ✓ | ✓ |
| Tables — config | | | ✓ | ✓ | ✓ |
| Kitchen (KDS) | | ✓ | ✓ | ✓ | ✓ |
| Inventory — view | ✓ | | ✓ | ✓ | ✓ |
| Inventory — edit | | | ✓ | ✓ | ✓ |
| Recipes — view | ✓ | ✓ | ✓ | ✓ | ✓ |
| Recipes — edit | | | ✓ | ✓ | ✓ |
| Suppliers | view | | ✓ | ✓ | ✓ |
| Payroll | | | ✓ | ✓ | ✓ |
| Financials | | | ✓ | ✓ | ✓ |
| SOP — use | ✓ | ✓ | ✓ | ✓ | ✓ |
| SOP — manage | | | ✓ | ✓ | ✓ |
| Users — view | | | ✓ | ✓ | ✓ |
| Users — approve/reject | | | | | ✓ |

---

## 9. Troubleshooting

### "Insufficient stock" warning on order delivery

The system tried to auto-deduct inventory but the available quantity was too low. The order was still completed. Check the inventory page for the affected item and add a new stock entry to correct the balance.

### Order stuck in "Pending"

Only Kitchen staff (or Managers/Admins) can move orders to *In Progress*. Make sure the user trying to start the order has the **Kitchen** role or higher.

### Cannot delete a category

Categories can only be deleted when they have no menu items. Remove or reassign all items in the category first.

### Stock quantity appears wrong

Check the item's entry history for unexpected negative entries (auto-deductions). If a large deduction was incorrectly applied, add a positive corrective entry with a note explaining the adjustment.

### CSV opens with garbled characters in Excel

The exported CSV includes a UTF-8 BOM which Excel should auto-detect. If characters still appear garbled, when opening in Excel use **Data → From Text/CSV** and select **UTF-8** as the encoding.

### Cannot log in after registration

Your account is pending approval. Contact your Superadmin to approve it from the **Users → Pending Approvals** screen.

### Server won't start

```bash
# Check if the database is running
pg_isready

# Run migrations
alembic upgrade head

# Start the server
PYTHONPATH=. venv/bin/uvicorn app.main:app --reload
```

### Frontend shows blank page or API errors

```bash
# Ensure backend is running on port 8000
# Start the frontend dev server
cd frontend && npm run dev
```

Check the browser console for specific error messages. If you see 401 errors, your session may have expired — log in again.

---

*Pisces Shop is built with FastAPI + React. For technical details see the project README.*
