/**
 * Core domain types for Digital Heroes Web-to-Print Platform.
 * Updated incrementally per build phase.
 */

export type UserRole = "customer" | "admin";

export type AccountType = "individual" | "corporate";

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  company: string | null;
  role: UserRole;
  account_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PricingConfig {
  currency: string;
  currency_symbol: string;
  tax_label: string;
  tax_rate_percent: number;
  tax_inclusive: boolean;
  min_order_value_minor: number;
}

export interface SettingRow<T = Record<string, unknown>> {
  id: string;
  key: string;
  value: T;
  description: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}
