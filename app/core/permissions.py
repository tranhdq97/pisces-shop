from __future__ import annotations

from enum import StrEnum


class Permission(StrEnum):
    DASHBOARD_VIEW  = "dashboard.view"
    MENU_VIEW       = "menu.view"
    MENU_EDIT       = "menu.edit"
    ORDERS_VIEW     = "orders.view"
    ORDERS_EDIT     = "orders.edit"
    ORDERS_START    = "orders.start"    # kitchen: PENDING → IN_PROGRESS
    SOP_VIEW        = "sop.view"
    SOP_EDIT        = "sop.edit"
    TABLES_VIEW     = "tables.view"
    TABLES_EDIT     = "tables.edit"
    TABLES_CLEAR    = "tables.clear"   # waiter: mark table as cleared after cleaning
    TABLES_PAY      = "tables.pay"     # cashier/waiter: process payment + print bill
    INVENTORY_VIEW  = "inventory.view"
    INVENTORY_EDIT  = "inventory.edit"
    RECIPE_VIEW     = "recipe.view"
    RECIPE_EDIT     = "recipe.edit"
    PAYROLL_HOURS_SUBMIT  = "payroll.hours_submit"  # any staff: submit own work hours
    PAYROLL_HOURS_APPROVE = "payroll.hours_approve" # manager+: view & approve work hours
    PAYROLL_VIEW    = "payroll.view"   # view salary records & staff profiles
    PAYROLL_EDIT    = "payroll.edit"   # manage salary records & staff profiles
    USERS_MANAGE    = "users.manage"
    ROLES_MANAGE    = "roles.manage"
    FINANCIALS_VIEW = "financials.view"
    FINANCIALS_EDIT = "financials.edit"


ALL_PERMISSIONS: list[str] = [p.value for p in Permission]

# Default permissions seeded for built-in roles on first startup
DEFAULT_ROLE_PERMISSIONS: dict[str, list[str]] = {
    "superadmin": ALL_PERMISSIONS,
    "admin": [
        Permission.DASHBOARD_VIEW,
        Permission.MENU_VIEW, Permission.MENU_EDIT,
        Permission.ORDERS_VIEW, Permission.ORDERS_EDIT, Permission.ORDERS_START,
        Permission.SOP_VIEW, Permission.SOP_EDIT,
        Permission.TABLES_VIEW, Permission.TABLES_EDIT,
        Permission.TABLES_CLEAR, Permission.TABLES_PAY,
        Permission.INVENTORY_VIEW, Permission.INVENTORY_EDIT,
        Permission.RECIPE_VIEW, Permission.RECIPE_EDIT,
        Permission.PAYROLL_HOURS_SUBMIT, Permission.PAYROLL_HOURS_APPROVE,
        Permission.PAYROLL_VIEW, Permission.PAYROLL_EDIT,
        Permission.FINANCIALS_VIEW, Permission.FINANCIALS_EDIT,
    ],
    "manager": [
        Permission.DASHBOARD_VIEW,
        Permission.MENU_VIEW, Permission.MENU_EDIT,
        Permission.ORDERS_VIEW, Permission.ORDERS_EDIT, Permission.ORDERS_START,
        Permission.SOP_VIEW, Permission.SOP_EDIT,
        Permission.TABLES_VIEW, Permission.TABLES_EDIT,
        Permission.TABLES_CLEAR, Permission.TABLES_PAY,
        Permission.INVENTORY_VIEW, Permission.INVENTORY_EDIT,
        Permission.RECIPE_VIEW, Permission.RECIPE_EDIT,
        Permission.PAYROLL_HOURS_SUBMIT, Permission.PAYROLL_HOURS_APPROVE,
        Permission.PAYROLL_VIEW, Permission.PAYROLL_EDIT,
        Permission.FINANCIALS_VIEW, Permission.FINANCIALS_EDIT,
    ],
    "waiter": [
        Permission.ORDERS_VIEW, Permission.ORDERS_EDIT,
        Permission.TABLES_VIEW, Permission.TABLES_CLEAR, Permission.TABLES_PAY,
        Permission.SOP_VIEW,
        Permission.INVENTORY_VIEW,
        Permission.RECIPE_VIEW,
        Permission.PAYROLL_HOURS_SUBMIT,
    ],
    "kitchen": [
        Permission.ORDERS_VIEW, Permission.ORDERS_START,
        Permission.SOP_VIEW,
        Permission.INVENTORY_VIEW,
        Permission.RECIPE_VIEW,
        Permission.PAYROLL_HOURS_SUBMIT,
    ],
}
