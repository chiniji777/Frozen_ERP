import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const timestamps = {
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`).notNull(),
};

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  password: text("password"),
  displayName: text("display_name").notNull(),
  role: text("role", { enum: ["admin", "manager", "staff"] }).notNull().default("staff"),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  googleId: text("google_id"),
  avatarUrl: text("avatar_url"),
  signatureUrl: text("signature_url"),
  ...timestamps,
});

export const uoms = sqliteTable("uoms", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  nameEn: text("name_en"),
  category: text("category"),
  isDefault: integer("is_default").default(0),
  sortOrder: integer("sort_order").default(0),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
});

export const customers = sqliteTable("customers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code"),
  name: text("name").notNull(),
  fullName: text("full_name"),
  nickName: text("nick_name"),
  address: text("address"),
  subDistrict: text("sub_district"),
  district: text("district"),
  province: text("province"),
  zipCode: text("zip_code"),
  phone: text("phone"),
  email: text("email"),
  taxId: text("tax_id"),
  territory: text("territory"),
  customerType: text("customer_type", { enum: ["Company", "Individual"] }).default("Company"),
  creditLimit: real("credit_limit").default(0),
  paymentTerms: text("payment_terms"),
  salesPartner: text("sales_partner"),
  commissionRate: real("commission_rate").default(0),
  locations: text("locations"),
  notes: text("notes"),
  ...timestamps,
});

export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  sku: text("sku").unique(),
  category: text("category"),
  salePrice: real("sale_price").notNull().default(0),
  unit: text("unit").notNull().default("ชิ้น"),
  stock: real("stock").notNull().default(0),
  imageUrl: text("image_url"),
  rawMaterial: text("raw_material"),
  rawMaterialYield: real("raw_material_yield"),
  hasVat: integer("has_vat").default(1),
  packingWeight: real("packing_weight"),
  packingUnit: text("packing_unit").default("kg"),
  description: text("description"),
  ...timestamps,
});

export const rawMaterials = sqliteTable("raw_materials", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").unique(),
  name: text("name").notNull(),
  pricePerUnit: real("price_per_unit").notNull().default(0),
  unit: text("unit").notNull().default("กก."),
  stock: real("stock").notNull().default(0),
  supplier: text("supplier"),
  notes: text("notes"),
  ...timestamps,
});

export const bom = sqliteTable("bom", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: integer("product_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  laborCost: real("labor_cost").notNull().default(0),
  overheadCost: real("overhead_cost").notNull().default(0),
  ...timestamps,
});

export const bomItems = sqliteTable("bom_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  bomId: integer("bom_id").notNull(),
  rawMaterialId: integer("raw_material_id").notNull(),
  quantity: real("quantity").notNull(),
  unit: text("unit").notNull().default("กก."),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
});

export const productionOrders = sqliteTable("production_orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  bomId: integer("bom_id").notNull(),
  productId: integer("product_id").notNull(),
  quantity: real("quantity").notNull(),
  status: text("status", { enum: ["draft", "in_progress", "completed", "cancelled"] }).notNull().default("draft"),
  laborCost: real("labor_cost").notNull().default(0),
  overheadCost: real("overhead_cost").notNull().default(0),
  totalMaterialCost: real("total_material_cost").notNull().default(0),
  totalCost: real("total_cost").notNull().default(0),
  costPerUnit: real("cost_per_unit").notNull().default(0),
  notes: text("notes"),
  ...timestamps,
});

export const salesOrders = sqliteTable("sales_orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerId: integer("customer_id").notNull(),
  orderNumber: text("order_number").notNull().unique(),
  status: text("status", { enum: ["draft", "confirmed", "delivered", "invoiced", "cancelled"] }).notNull().default("draft"),
  date: text("date"),
  deliveryStartDate: text("delivery_start_date"),
  deliveryEndDate: text("delivery_end_date"),
  customerAddress: text("customer_address"),
  shippingAddressName: text("shipping_address_name"),
  shippingAddress: text("shipping_address"),
  contactPerson: text("contact_person"),
  contact: text("contact"),
  mobileNo: text("mobile_no"),
  warehouse: text("warehouse").default("Ladprao 43 - FFP"),
  subtotal: real("subtotal").notNull().default(0),
  vatRate: real("vat_rate").notNull().default(7),
  vatAmount: real("vat_amount").notNull().default(0),
  totalAmount: real("total_amount").notNull().default(0),
  totalQuantity: real("total_quantity").default(0),
  totalNetWeight: real("total_net_weight").default(0),
  paymentTermsTemplate: text("payment_terms_template"),
  salesPartner: text("sales_partner"),
  commissionRate: real("commission_rate").default(0),
  locations: text("locations"),
  totalCommission: real("total_commission").default(0),
  poNumber: text("po_number"),
  poDate: text("po_date"),
  poNotes: text("po_notes"),
  notes: text("notes"),
  confirmedBy: integer("confirmed_by"),
  confirmedAt: text("confirmed_at"),
  cancelledAt: text("cancelled_at"),
  cancelledBy: integer("cancelled_by"),
  ...timestamps,
});

export const soAttachments = sqliteTable("so_attachments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  salesOrderId: integer("sales_order_id").notNull(),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type"),
  size: integer("size").default(0),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
});

export const soItems = sqliteTable("so_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  salesOrderId: integer("sales_order_id").notNull(),
  productId: integer("product_id").notNull(),
  itemCode: text("item_code"),
  quantity: real("quantity").notNull(),
  unitPrice: real("unit_price").notNull(),
  rate: real("rate"),
  uom: text("uom").default("Pcs."),
  weight: real("weight").default(0),
  packingDetail: text("packing_detail"),
  amount: real("amount").notNull(),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
});

export const soPaymentTerms = sqliteTable("so_payment_terms", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  salesOrderId: integer("sales_order_id").notNull(),
  paymentTerm: text("payment_term"),
  description: text("description"),
  dueDate: text("due_date"),
  invoicePortion: real("invoice_portion"),
  paymentAmount: real("payment_amount"),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
});

export const deliveryNotes = sqliteTable("delivery_notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  salesOrderId: integer("sales_order_id").notNull(),
  salesOrderIds: text("sales_order_ids"),
  dnNumber: text("dn_number").notNull().unique(),
  status: text("status", { enum: ["pending", "shipped", "delivered"] }).notNull().default("pending"),
  driverPhone: text("driver_phone"),
  pickupPoint: text("pickup_point"),
  shippedAt: text("shipped_at"),
  deliveredAt: text("delivered_at"),
  notes: text("notes"),
  confirmedBy: integer("confirmed_by"),
  confirmedAt: text("confirmed_at"),
  ...timestamps,
});

export const dnItems = sqliteTable("dn_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  deliveryNoteId: integer("delivery_note_id").notNull(),
  productId: integer("product_id").notNull(),
  quantity: real("quantity").notNull(),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
});

export const invoices = sqliteTable("invoices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  salesOrderId: integer("sales_order_id").notNull(),
  deliveryNoteId: integer("delivery_note_id"),
  invoiceNumber: text("invoice_number").notNull().unique(),
  status: text("status", { enum: ["draft", "sent", "partially_paid", "paid", "overdue", "cancelled"] }).notNull().default("draft"),
  subtotal: real("subtotal").notNull().default(0),
  vatRate: real("vat_rate").notNull().default(7),
  vatAmount: real("vat_amount").notNull().default(0),
  totalAmount: real("total_amount").notNull().default(0),
  dueDate: text("due_date"),
  notes: text("notes"),
  confirmedBy: integer("confirmed_by"),
  confirmedAt: text("confirmed_at"),
  ...timestamps,
});

export const invoiceItems = sqliteTable("invoice_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  invoiceId: integer("invoice_id").notNull(),
  productId: integer("product_id").notNull(),
  quantity: real("quantity").notNull(),
  unitPrice: real("unit_price").notNull(),
  amount: real("amount").notNull(),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
});

export const payments = sqliteTable("payments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  invoiceId: integer("invoice_id").notNull(),
  paymentNumber: text("payment_number").notNull().unique(),
  amount: real("amount").notNull(),
  method: text("method", { enum: ["cash", "transfer", "cheque"] }).notNull().default("transfer"),
  status: text("status", { enum: ["pending", "completed"] }).notNull().default("pending"),
  reference: text("reference"),
  paidAt: text("paid_at"),
  slipImage: text("slip_image"),
  paymentDate: text("payment_date"),
  bankName: text("bank_name"),
  payerName: text("payer_name"),
  notes: text("notes"),
  ...timestamps,
});

export const receipts = sqliteTable("receipts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  paymentId: integer("payment_id").notNull(),
  receiptNumber: text("receipt_number").notNull().unique(),
  amount: real("amount").notNull(),
  receiptCompanyName: text("receipt_company_name"),
  receiptAddress: text("receipt_address"),
  receiptTaxId: text("receipt_tax_id"),
  issuedAt: text("issued_at").default(sql`(datetime('now'))`).notNull(),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
});

export const companySettings = sqliteTable("company_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyName: text("company_name"),
  companyNameEn: text("company_name_en"),
  address: text("address"),
  addressEn: text("address_en"),
  taxId: text("tax_id"),
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  branch: text("branch"),
  logoUrl: text("logo_url"),
  isDefault: integer("is_default").notNull().default(0),
  ...timestamps,
});

export const expenses = sqliteTable("expenses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  expenseNumber: text("expense_number").unique(),
  category: text("category").notNull(),
  description: text("description").notNull(),
  amount: real("amount").notNull(),
  date: text("date").notNull(),
  dueDate: text("due_date"),
  paidAt: text("paid_at"),
  slipImage: text("slip_image"),
  paymentMethod: text("payment_method"),
  recurringExpenseId: integer("recurring_expense_id"),
  supplierId: integer("supplier_id"),
  rawMaterialId: integer("raw_material_id"),
  productId: integer("product_id"),
  itemType: text("item_type"), // 'raw_material' | 'product' | null
  itemQty: real("item_qty"),
  itemPricePerUnit: real("item_price_per_unit"),
  hasWithholdingTax: integer("has_withholding_tax").default(0),
  whtFormType: text("wht_form_type"),
  whtIncomeType: text("wht_income_type"),
  whtIncomeDescription: text("wht_income_description"),
  whtRate: real("wht_rate"),
  whtAmount: real("wht_amount"),
  whtNetAmount: real("wht_net_amount"),
  whtDocNumber: text("wht_doc_number"),
  notes: text("notes"),
  status: text("status").default("pending"),
  cancelledAt: text("cancelled_at"),
  cancelledBy: integer("cancelled_by"),
  ...timestamps,
});

export const purchaseOrders = sqliteTable("purchase_orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  poNumber: text("po_number").notNull().unique(),
  productionOrderId: integer("production_order_id"),
  status: text("status", { enum: ["draft", "confirmed", "received", "paid", "cancelled"] }).notNull().default("draft"),
  supplier: text("supplier"),
  totalAmount: real("total_amount").notNull().default(0),
  notes: text("notes"),
  cancelledAt: text("cancelled_at"),
  cancelledBy: integer("cancelled_by"),
  ...timestamps,
});


export const suppliers = sqliteTable("suppliers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").unique(),
  name: text("name").notNull(),
  fullName: text("full_name"),
  nickName: text("nick_name"),
  supplierType: text("supplier_type", { enum: ["Company", "Individual"] }).default("Company"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  taxId: text("tax_id"),
  paymentTerms: text("payment_terms"),
  bankName: text("bank_name"),
  bankAccountNumber: text("bank_account_number"),
  bankAccountName: text("bank_account_name"),
  promptPayId: text("prompt_pay_id"),
  paymentNotes: text("payment_notes"),
  notes: text("notes"),
  ...timestamps,
});

// ===== Delivery Tracking (QR Code) =====

export const deliveryTokens = sqliteTable("delivery_tokens", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  token: text("token").notNull().unique(),
  deliveryNoteId: integer("delivery_note_id").notNull(),
  salesOrderId: integer("sales_order_id"),
  expiresAt: text("expires_at"),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
});

export const deliveryPhotos = sqliteTable("delivery_photos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  deliveryNoteId: integer("delivery_note_id").notNull(),
  tokenId: integer("token_id"),
  photoUrl: text("photo_url").notNull(),
  latitude: real("latitude"),
  longitude: real("longitude"),
  takenAt: text("taken_at").default(sql`(datetime('now'))`).notNull(),
  notes: text("notes"),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
});

export const deliveryConfirmations = sqliteTable("delivery_confirmations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  deliveryNoteId: integer("delivery_note_id").notNull(),
  tokenId: integer("token_id"),
  signatureUrl: text("signature_url"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  macAddress: text("mac_address"),
  userAgent: text("user_agent"),
  confirmedAt: text("confirmed_at").default(sql`(datetime('now'))`).notNull(),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
});

// ===== Recurring Expenses =====

export const recurringExpenses = sqliteTable("recurring_expenses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  category: text("category").notNull(),
  amount: real("amount").notNull(),
  dueDay: integer("due_day"),
  payTo: text("pay_to"),
  paymentMethod: text("payment_method"),
  totalAmount: real("total_amount").default(0),
  principalAmount: real("principal_amount").default(0),
  totalDebt: real("total_debt").default(0),
  totalPaid: real("total_paid").default(0),
  remainingDebt: real("remaining_debt").default(0),
  startDate: text("start_date"),
  endDate: text("end_date"),
  isActive: integer("is_active").default(1),
  notes: text("notes"),
  ref1: text("ref1"),
  ref2: text("ref2"),
  bankAccount: text("bank_account"),
  bankName: text("bank_name"),
  accountName: text("account_name"),
  imageUrl: text("image_url"),
  hasWithholdingTax: integer("has_withholding_tax").default(0),
  whtFormType: text("wht_form_type"),
  whtIncomeType: text("wht_income_type"),
  whtIncomeDescription: text("wht_income_description"),
  whtRate: real("wht_rate"),
  supplierId: integer("supplier_id"),
  ...timestamps,
});

export const recurringExpensePayments = sqliteTable("recurring_expense_payments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  recurringExpenseId: integer("recurring_expense_id").notNull(),
  expenseId: integer("expense_id"),
  month: text("month").notNull(),
  amount: real("amount").notNull(),
  paidAt: text("paid_at"),
  status: text("status").default("pending"),
  slipImage: text("slip_image"),
  paymentMethod: text("payment_method"),
  notes: text("notes"),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
});

export const productCategories = sqliteTable("product_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  description: text("description"),
  sortOrder: integer("sort_order").default(0),
  isActive: integer("is_active").default(1),
  ...timestamps,
});

export const poItems = sqliteTable("po_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  purchaseOrderId: integer("purchase_order_id").notNull(),
  rawMaterialId: integer("raw_material_id").notNull(),
  quantity: real("quantity").notNull(),
  unit: text("unit").notNull().default("กก."),
  unitPrice: real("unit_price").notNull().default(0),
  amount: real("amount").notNull().default(0),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
});

// ===== Short-Term Loans =====

export const shortTermLoans = sqliteTable("short_term_loans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  borrowerName: text("borrower_name").notNull(),
  amount: real("amount").notNull(),
  date: text("date").notNull(),
  notes: text("notes"),
  status: text("status", { enum: ["active", "closed"] }).notNull().default("active"),
  imageUrl: text("image_url"),
  ...timestamps,
});

export const printLogs = sqliteTable("print_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  docType: text("doc_type").notNull(), // wht, invoice, receipt, po, etc.
  refId: integer("ref_id").notNull(), // expense id, PO id, etc.
  refNumber: text("ref_number"), // EXP-2026-001, WT-2026-001, etc.
  description: text("description"), // รายละเอียดสั้นๆ
  printedBy: text("printed_by"),
  printedAt: text("printed_at").default(sql`(datetime('now'))`).notNull(),
});

export const loanRepayments = sqliteTable("loan_repayments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  loanId: integer("loan_id").notNull(),
  amount: real("amount").notNull(),
  date: text("date").notNull(),
  notes: text("notes"),
  imageUrl: text("image_url"),
  ...timestamps,
});
