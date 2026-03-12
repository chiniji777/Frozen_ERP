// Shared print utilities for document HTML generation
import { db } from "./db.js";
import { companySettings, users } from "./schema.js";
import { eq } from "drizzle-orm";
import QRCode from "qrcode";

export function escapeHtml(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function fmt(n: number | null | undefined): string {
  if (n == null) return '0';
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export interface CompanyInfo {
  companyName: string;
  companyNameEn: string;
  address: string;
  addressEn: string;
  taxId: string;
  phone: string;
  email: string;
  branch: string;
}

export async function getCompanyInfo(companyId?: number): Promise<CompanyInfo> {
  let company;
  if (companyId) {
    company = await db.select().from(companySettings).where(eq(companySettings.id, companyId)).get();
  }
  if (!company) {
    company = await db.select().from(companySettings).where(eq(companySettings.isDefault, 1)).get();
  }
  if (!company) {
    company = await db.select().from(companySettings).get();
  }
  return {
    companyName: company?.companyName || "บริษัท (ไม่ได้ตั้งค่า)",
    companyNameEn: company?.companyNameEn || "Company (Not Configured)",
    address: company?.address || "",
    addressEn: company?.addressEn || "",
    taxId: company?.taxId || "",
    phone: company?.phone || "",
    email: company?.email || "",
    branch: company?.branch || "สำนักงานใหญ่",
  };
}

export async function getSignatureInfo(userId?: number | null): Promise<{ name: string; signatureUrl: string | null; date: string | null } | null> {
  if (!userId) return null;
  const user = await db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) return null;
  return {
    name: user.displayName,
    signatureUrl: user.signatureUrl || null,
    date: null, // will be set from document confirmedAt
  };
}

// Color themes per document type
export const THEMES = {
  so: { primary: "#1e40af", light: "#dbeafe", accent: "#2563eb", label: "ใบสั่งขาย / Sales Order" },
  dn: { primary: "#047857", light: "#d1fae5", accent: "#059669", label: "ใบส่งของ / Delivery Note" },
  inv: { primary: "#7c3aed", light: "#ede9fe", accent: "#8b5cf6", label: "ใบแจ้งหนี้ / Invoice" },
  receipt: { primary: "#b45309", light: "#fef3c7", accent: "#d97706", label: "ใบเสร็จรับเงิน / Receipt" },
} as const;

type ThemeKey = keyof typeof THEMES;

export function printCSS(theme: ThemeKey) {
  const t = THEMES[theme];
  return `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page { size: A4; margin: 12mm 15mm; }
  body { font-family: 'Sarabun', 'Noto Sans Thai', 'Segoe UI', sans-serif; font-size: 12px; color: #1e293b; line-height: 1.5; }

  .page { max-width: 210mm; margin: 0 auto; padding: 20px; }

  /* Header */
  .doc-header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 16px; margin-bottom: 16px; border-bottom: 2px solid ${t.primary}; }
  .company-info h1 { font-size: 17px; color: ${t.primary}; font-weight: 700; letter-spacing: 0.3px; }
  .company-info .sub { font-size: 11px; color: #64748b; margin-top: 2px; }
  .company-info .detail { font-size: 10px; color: #94a3b8; margin-top: 4px; line-height: 1.6; }
  .doc-title { text-align: right; }
  .doc-title h2 { font-size: 15px; color: ${t.primary}; font-weight: 700; margin-bottom: 6px; }
  .doc-title .doc-number { font-size: 18px; font-weight: 800; color: ${t.primary}; letter-spacing: 1px; }
  .doc-title .meta { font-size: 10px; color: #64748b; margin-top: 4px; }
  .doc-title .meta span { display: block; }

  /* Info Grid */
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
  .info-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; }
  .info-card h4 { font-size: 9px; color: ${t.primary}; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 700; margin-bottom: 6px; }
  .info-card p { font-size: 11px; line-height: 1.7; color: #334155; }
  .info-card .name { font-size: 13px; font-weight: 700; color: #0f172a; }

  /* Table */
  .items-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 11px; }
  .items-table thead th { background: ${t.primary}; color: white; padding: 8px 6px; font-size: 9px; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 600; text-align: left; }
  .items-table thead th:first-child { border-radius: 6px 0 0 0; }
  .items-table thead th:last-child { border-radius: 0 6px 0 0; }
  .items-table tbody td { padding: 7px 6px; border-bottom: 1px solid #f1f5f9; }
  .items-table tbody tr:nth-child(even) { background: #f8fafc; }
  .items-table tbody tr:hover { background: ${t.light}; }
  .text-right { text-align: right; }
  .text-center { text-align: center; }

  /* Totals */
  .totals-section { display: flex; justify-content: flex-end; margin-bottom: 16px; }
  .totals-box { width: 260px; }
  .totals-row { display: flex; justify-content: space-between; padding: 3px 0; font-size: 11px; color: #475569; }
  .totals-row.grand { border-top: 2px solid ${t.primary}; margin-top: 6px; padding-top: 8px; font-size: 15px; font-weight: 800; color: ${t.primary}; }

  /* Notes */
  .notes-box { background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; font-size: 11px; }
  .notes-box strong { color: #92400e; }

  /* Footer Grid */
  .footer-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
  .footer-card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; }
  .footer-card h4 { font-size: 9px; color: ${t.primary}; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 700; margin-bottom: 6px; }

  /* Signature Area */
  .sign-section { display: flex; justify-content: space-around; margin-top: 30px; padding-top: 10px; }
  .sign-block { text-align: center; width: 200px; }
  .sign-img { height: 60px; margin-bottom: 4px; }
  .sign-img img { max-height: 60px; max-width: 180px; }
  .sign-line { border-top: 1px solid #334155; padding-top: 6px; font-size: 10px; color: #475569; }
  .sign-name { font-size: 11px; font-weight: 600; color: #0f172a; margin-top: 2px; }
  .sign-date { font-size: 9px; color: #94a3b8; margin-top: 1px; }

  /* Watermark */
  .doc-status { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-30deg); font-size: 80px; font-weight: 900; color: rgba(0,0,0,0.04); pointer-events: none; text-transform: uppercase; letter-spacing: 10px; }

  @media print {
    body { padding: 0; }
    .page { padding: 0; max-width: none; }
    .no-print { display: none !important; }
  }
  @media screen {
    body { background: #e2e8f0; padding: 20px; }
    .page { background: white; box-shadow: 0 4px 20px rgba(0,0,0,0.1); border-radius: 4px; padding: 30px; position: relative; }
  }
`;
}

export function companyHeader(company: CompanyInfo, theme: ThemeKey, docNumber: string, meta: string) {
  const t = THEMES[theme];
  return `
  <div class="doc-header">
    <div class="company-info">
      <h1>${escapeHtml(company.companyNameEn)}</h1>
      <div class="sub">${escapeHtml(company.companyName)}</div>
      <div class="detail">
        ${company.address ? escapeHtml(company.address) + "<br>" : ""}
        ${company.taxId ? `เลขประจำตัวผู้เสียภาษี: ${escapeHtml(company.taxId)}` : ""}
        ${company.branch ? ` (${escapeHtml(company.branch)})` : ""}
        ${company.phone ? `<br>โทร: ${escapeHtml(company.phone)}` : ""}
        ${company.email ? ` | ${escapeHtml(company.email)}` : ""}
      </div>
    </div>
    <div class="doc-title">
      <h2>${t.label}</h2>
      <div class="doc-number">${escapeHtml(docNumber)}</div>
      <div class="meta">${meta}</div>
    </div>
  </div>`;
}

export function signatureSection(
  leftLabel: string,
  rightLabel: string,
  rightSig?: { name: string; signatureUrl: string | null; date: string | null } | null
) {
  return `
  <div class="sign-section">
    <div class="sign-block">
      <div class="sign-img"></div>
      <div class="sign-line">${escapeHtml(leftLabel)}</div>
      <div class="sign-name">................................</div>
      <div class="sign-date">วันที่ ......../......../........</div>
    </div>
    <div class="sign-block">
      <div class="sign-img">${rightSig?.signatureUrl ? `<img src="${escapeHtml(rightSig.signatureUrl)}" alt="signature">` : ""}</div>
      <div class="sign-line">${escapeHtml(rightLabel)}</div>
      <div class="sign-name">${rightSig?.name ? escapeHtml(rightSig.name) : "................................"}</div>
      <div class="sign-date">${rightSig?.date ? `วันที่ ${escapeHtml(rightSig.date.slice(0, 10))}` : "วันที่ ......../......../........"}</div>
    </div>
  </div>`;
}

/** Generate QR code as inline SVG (no external API needed) */
export async function qrCodeImg(url: string, size = 120): Promise<string> {
  try {
    const svg = await QRCode.toString(url, { type: "svg", width: size, margin: 1 });
    return `<div style="width:${size}px;height:${size}px;display:inline-block">${svg}</div>`;
  } catch {
    return `<div style="width:${size}px;height:${size}px;display:inline-flex;align-items:center;justify-content:center;border:1px solid #ccc;font-size:9px;color:#999">QR Error</div>`;
  }
}

/** QR code section for document prints */
export async function qrSection(trackingUrl: string, label = "สแกนเพื่อติดตามการส่ง"): Promise<string> {
  const qr = await qrCodeImg(trackingUrl, 100);
  return `
  <div style="text-align:center;margin-top:16px;padding:12px;border:1px dashed #cbd5e1;border-radius:8px;background:#f8fafc">
    ${qr}
    <div style="font-size:9px;color:#64748b;margin-top:4px">${escapeHtml(label)}</div>
  </div>`;
}

export function wrapHtml(title: string, theme: ThemeKey, body: string, statusWatermark?: string) {
  return `<!DOCTYPE html>
<html lang="th"><head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;600;700;800&display=swap" rel="stylesheet">
<style>${printCSS(theme)}</style>
</head><body>
<div class="page">
  ${statusWatermark ? `<div class="doc-status">${escapeHtml(statusWatermark)}</div>` : ""}
  ${body}
</div>
<script>window.onload=()=>window.print()</script>
</body></html>`;
}
