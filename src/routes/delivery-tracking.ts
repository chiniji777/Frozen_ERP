import { Hono } from "hono";
import { db } from "../db.js";
import { deliveryTokens, deliveryPhotos, deliveryConfirmations, deliveryNotes, dnItems, salesOrders, soItems, customers, products } from "../schema.js";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { join } from "path";
import { writeFile, mkdir } from "fs/promises";

const trackingRoute = new Hono();

// ===== Generate Token (internal — called from print routes) =====
export async function getOrCreateToken(deliveryNoteId: number, salesOrderId?: number): Promise<string> {
  // Check for existing token
  const existing = await db.select().from(deliveryTokens)
    .where(eq(deliveryTokens.deliveryNoteId, deliveryNoteId)).get();
  if (existing) return existing.token;

  const token = randomUUID().replace(/-/g, "").slice(0, 12);
  await db.insert(deliveryTokens).values({
    token,
    deliveryNoteId,
    salesOrderId: salesOrderId ?? null,
  }).run();
  return token;
}

// ===== GET /track/:token — Landing page (choose action) =====
trackingRoute.get("/:token", async (c) => {
  const token = c.req.param("token");
  const t = await db.select().from(deliveryTokens).where(eq(deliveryTokens.token, token)).get();
  if (!t) return c.html(errorPage("ลิงก์ไม่ถูกต้องหรือหมดอายุ"));

  const dn = await db.select().from(deliveryNotes).where(eq(deliveryNotes.id, t.deliveryNoteId)).get();
  if (!dn) return c.html(errorPage("ไม่พบข้อมูลใบส่งของ"));

  const so = dn.salesOrderId
    ? await db.select().from(salesOrders).where(eq(salesOrders.id, dn.salesOrderId)).get()
    : null;
  const customer = so
    ? await db.select().from(customers).where(eq(customers.id, so.customerId)).get()
    : null;

  // Check existing photo/confirmation
  const existingPhoto = await db.select().from(deliveryPhotos)
    .where(eq(deliveryPhotos.deliveryNoteId, dn.id)).get();
  const existingConfirm = await db.select().from(deliveryConfirmations)
    .where(eq(deliveryConfirmations.deliveryNoteId, dn.id)).get();

  return c.html(landingPage(token, dn.dnNumber, customer?.name || "-", existingPhoto, existingConfirm));
});

// ===== GET /track/:token/photo — Delivery photo page =====
trackingRoute.get("/:token/photo", async (c) => {
  const token = c.req.param("token");
  const t = await db.select().from(deliveryTokens).where(eq(deliveryTokens.token, token)).get();
  if (!t) return c.html(errorPage("ลิงก์ไม่ถูกต้อง"));

  const dn = await db.select().from(deliveryNotes).where(eq(deliveryNotes.id, t.deliveryNoteId)).get();
  if (!dn) return c.html(errorPage("ไม่พบข้อมูล"));

  return c.html(photoPage(token, dn.dnNumber));
});

// ===== POST /track/:token/photo — Upload delivery photo =====
trackingRoute.post("/:token/photo", async (c) => {
  const token = c.req.param("token");
  const t = await db.select().from(deliveryTokens).where(eq(deliveryTokens.token, token)).get();
  if (!t) return c.json({ error: "Invalid token" }, 404);

  const body = await c.req.parseBody();
  const photo = body["photo"] as File | undefined;
  const latitude = body["latitude"] ? Number(body["latitude"]) : null;
  const longitude = body["longitude"] ? Number(body["longitude"]) : null;
  const notes = (body["notes"] as string) || null;

  if (!photo) return c.json({ error: "No photo uploaded" }, 400);

  // Save photo file
  const dir = join(process.cwd(), "data", "delivery-photos");
  await mkdir(dir, { recursive: true });
  const ext = photo.name?.split(".").pop() || "jpg";
  const filename = `${token}_${Date.now()}.${ext}`;
  const buffer = Buffer.from(await photo.arrayBuffer());
  await writeFile(join(dir, filename), buffer);

  await db.insert(deliveryPhotos).values({
    deliveryNoteId: t.deliveryNoteId,
    tokenId: t.id,
    photoUrl: `/api/delivery-photos/${filename}`,
    latitude,
    longitude,
    notes,
  }).run();

  return c.html(successPage("📸 บันทึกรูปสำเร็จ!", "รูปถ่ายส่งสินค้าถูกบันทึกเรียบร้อยแล้ว"));
});

// ===== GET /track/:token/confirm — Customer confirmation page =====
trackingRoute.get("/:token/confirm", async (c) => {
  const token = c.req.param("token");
  const t = await db.select().from(deliveryTokens).where(eq(deliveryTokens.token, token)).get();
  if (!t) return c.html(errorPage("ลิงก์ไม่ถูกต้อง"));

  const dn = await db.select().from(deliveryNotes).where(eq(deliveryNotes.id, t.deliveryNoteId)).get();
  if (!dn) return c.html(errorPage("ไม่พบข้อมูล"));

  // Get items for this DN
  const items = await db.select().from(dnItems).where(eq(dnItems.deliveryNoteId, dn.id)).all();
  const itemsWithProduct = [];
  for (const item of items) {
    const prod = await db.select().from(products).where(eq(products.id, item.productId)).get();
    itemsWithProduct.push({ ...item, productName: prod?.name || "-" });
  }

  const so = dn.salesOrderId
    ? await db.select().from(salesOrders).where(eq(salesOrders.id, dn.salesOrderId)).get()
    : null;
  const customer = so
    ? await db.select().from(customers).where(eq(customers.id, so.customerId)).get()
    : null;

  // Check existing confirmation
  const existing = await db.select().from(deliveryConfirmations)
    .where(eq(deliveryConfirmations.deliveryNoteId, dn.id)).get();

  return c.html(confirmPage(token, dn.dnNumber, customer?.name || "-", itemsWithProduct, existing));
});

// ===== POST /track/:token/confirm — Submit confirmation =====
trackingRoute.post("/:token/confirm", async (c) => {
  const token = c.req.param("token");
  const t = await db.select().from(deliveryTokens).where(eq(deliveryTokens.token, token)).get();
  if (!t) return c.json({ error: "Invalid token" }, 404);

  // Check for duplicate
  const existing = await db.select().from(deliveryConfirmations)
    .where(eq(deliveryConfirmations.deliveryNoteId, t.deliveryNoteId)).get();
  if (existing) return c.html(successPage("✅ ยืนยันแล้ว", "การรับสินค้าถูกยืนยันก่อนหน้านี้แล้ว"));

  const body = await c.req.parseBody();
  const signatureData = body["signature"] as string | undefined;
  const latitude = body["latitude"] ? Number(body["latitude"]) : null;
  const longitude = body["longitude"] ? Number(body["longitude"]) : null;
  const macAddress = (body["macAddress"] as string) || null;
  const userAgent = c.req.header("User-Agent") || null;

  // Save signature image if provided
  let signatureUrl: string | null = null;
  if (signatureData && signatureData.startsWith("data:image/")) {
    const dir = join(process.cwd(), "data", "signatures");
    await mkdir(dir, { recursive: true });
    const base64 = signatureData.split(",")[1];
    const filename = `confirm_${token}_${Date.now()}.png`;
    await writeFile(join(dir, filename), Buffer.from(base64, "base64"));
    signatureUrl = `/api/signatures/${filename}`;
  }

  await db.insert(deliveryConfirmations).values({
    deliveryNoteId: t.deliveryNoteId,
    tokenId: t.id,
    signatureUrl,
    latitude,
    longitude,
    macAddress,
    userAgent,
  }).run();

  // Auto-update DN status to delivered
  await db.update(deliveryNotes)
    .set({ status: "delivered", deliveredAt: new Date().toISOString() })
    .where(eq(deliveryNotes.id, t.deliveryNoteId)).run();

  return c.html(successPage("✅ ยืนยันรับสินค้าสำเร็จ!", "ขอบคุณที่ยืนยันการรับสินค้า"));
});

// ===== Serve delivery photo files =====
trackingRoute.get("/photos/:filename", async (c) => {
  const filename = c.req.param("filename");
  if (filename.includes("..") || filename.includes("/")) return c.json({ error: "Invalid" }, 400);
  try {
    const { readFile: rf } = await import("fs/promises");
    const data = await rf(join(process.cwd(), "data", "delivery-photos", filename));
    return new Response(data, { headers: { "Content-Type": "image/jpeg" } });
  } catch { return c.json({ error: "Not found" }, 404); }
});

// ===== HTML Pages =====
function pageShell(title: string, body: string) {
  return `<!DOCTYPE html><html lang="th"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<title>${title}</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Sarabun',sans-serif;background:#f0f4f8;color:#1a202c;min-height:100vh}
.container{max-width:480px;margin:0 auto;padding:16px}
.card{background:#fff;border-radius:16px;padding:24px;box-shadow:0 2px 12px rgba(0,0,0,.08);margin-bottom:16px}
.header{text-align:center;padding:24px 16px;background:linear-gradient(135deg,#1e40af,#3b82f6);color:#fff;border-radius:16px;margin-bottom:16px}
.header h1{font-size:20px;font-weight:700}
.header p{font-size:13px;opacity:.85;margin-top:4px}
.btn{display:block;width:100%;padding:16px;border:none;border-radius:12px;font-size:16px;font-weight:600;cursor:pointer;text-align:center;text-decoration:none;margin-bottom:12px;transition:all .2s}
.btn-primary{background:#3b82f6;color:#fff}.btn-primary:hover{background:#2563eb}
.btn-green{background:#10b981;color:#fff}.btn-green:hover{background:#059669}
.btn-orange{background:#f59e0b;color:#fff}.btn-orange:hover{background:#d97706}
.btn-outline{background:#fff;color:#374151;border:2px solid #e5e7eb}.btn-outline:hover{border-color:#3b82f6}
.icon-box{display:flex;align-items:center;gap:16px;padding:20px;background:#f8fafc;border-radius:12px;margin-bottom:12px;border:2px solid transparent;cursor:pointer;transition:all .2s}
.icon-box:hover{border-color:#3b82f6;background:#eff6ff}
.icon-box .emoji{font-size:36px}
.icon-box .text h3{font-size:16px;font-weight:600;margin-bottom:2px}
.icon-box .text p{font-size:13px;color:#6b7280}
.badge-done{display:inline-block;padding:4px 12px;background:#dcfce7;color:#166534;border-radius:20px;font-size:12px;font-weight:600}
.badge-pending{display:inline-block;padding:4px 12px;background:#fef3c7;color:#92400e;border-radius:20px;font-size:12px;font-weight:600}
canvas{border:2px solid #e5e7eb;border-radius:8px;touch-action:none;width:100%;height:200px}
.items-table{width:100%;font-size:13px;border-collapse:collapse}
.items-table th{text-align:left;padding:8px;border-bottom:2px solid #e5e7eb;color:#6b7280;font-weight:600}
.items-table td{padding:8px;border-bottom:1px solid #f3f4f6}
.success-icon{font-size:64px;text-align:center;margin:24px 0}
input[type="file"]{display:none}
.photo-upload{display:flex;flex-direction:column;align-items:center;gap:12px;padding:32px;border:3px dashed #d1d5db;border-radius:12px;cursor:pointer;transition:all .2s}
.photo-upload:hover{border-color:#3b82f6;background:#eff6ff}
.photo-upload .emoji{font-size:48px}
.preview-img{max-width:100%;border-radius:8px;margin-top:12px}
textarea{width:100%;padding:12px;border:2px solid #e5e7eb;border-radius:8px;font-family:inherit;font-size:14px;resize:vertical;min-height:60px}
.loc-info{font-size:11px;color:#9ca3af;text-align:center;margin-top:8px}
</style></head><body>
<div class="container">${body}</div>
</body></html>`;
}

function errorPage(msg: string) {
  return pageShell("ข้อผิดพลาด", `
    <div class="header" style="background:linear-gradient(135deg,#dc2626,#ef4444)">
      <h1>❌ ข้อผิดพลาด</h1>
    </div>
    <div class="card" style="text-align:center">
      <p style="font-size:16px;color:#6b7280">${msg}</p>
    </div>`);
}

function successPage(title: string, msg: string) {
  return pageShell("สำเร็จ", `
    <div class="header" style="background:linear-gradient(135deg,#059669,#10b981)">
      <h1>${title}</h1>
    </div>
    <div class="card" style="text-align:center">
      <div class="success-icon">🎉</div>
      <p style="font-size:16px;color:#374151">${msg}</p>
      <p style="font-size:13px;color:#9ca3af;margin-top:12px">${new Date().toLocaleString("th-TH")}</p>
    </div>`);
}

function landingPage(token: string, dnNumber: string, customerName: string, existingPhoto: any, existingConfirm: any) {
  return pageShell(`ติดตามการส่ง ${dnNumber}`, `
    <div class="header">
      <h1>📦 ${dnNumber}</h1>
      <p>ลูกค้า: ${customerName}</p>
    </div>
    <div class="card">
      <h2 style="font-size:16px;font-weight:700;margin-bottom:16px">เลือกดำเนินการ</h2>
      <a href="/track/${token}/photo" class="icon-box" style="text-decoration:none;color:inherit">
        <div class="emoji">📸</div>
        <div class="text">
          <h3>ถ่ายรูปส่งสินค้า</h3>
          <p>สำหรับพนักงานขนส่ง</p>
        </div>
        ${existingPhoto ? '<span class="badge-done">✓ ถ่ายแล้ว</span>' : '<span class="badge-pending">รอถ่าย</span>'}
      </a>
      <a href="/track/${token}/confirm" class="icon-box" style="text-decoration:none;color:inherit">
        <div class="emoji">✅</div>
        <div class="text">
          <h3>ยืนยันรับสินค้า</h3>
          <p>สำหรับลูกค้า</p>
        </div>
        ${existingConfirm ? '<span class="badge-done">✓ ยืนยันแล้ว</span>' : '<span class="badge-pending">รอยืนยัน</span>'}
      </a>
    </div>`);
}

function photoPage(token: string, dnNumber: string) {
  return pageShell(`ถ่ายรูป ${dnNumber}`, `
    <div class="header" style="background:linear-gradient(135deg,#d97706,#f59e0b)">
      <h1>📸 ถ่ายรูปส่งสินค้า</h1>
      <p>${dnNumber}</p>
    </div>
    <form id="photoForm" class="card" enctype="multipart/form-data">
      <label for="photoInput" class="photo-upload" id="uploadArea">
        <div class="emoji">📷</div>
        <span style="font-weight:600;color:#374151">แตะเพื่อถ่ายรูป / เลือกรูป</span>
      </label>
      <input type="file" id="photoInput" name="photo" accept="image/*" capture="environment">
      <img id="preview" class="preview-img" style="display:none">
      <div style="margin-top:16px">
        <label style="font-size:13px;font-weight:600;color:#374151">หมายเหตุ (ถ้ามี)</label>
        <textarea name="notes" placeholder="เช่น วางไว้หน้าร้าน..."></textarea>
      </div>
      <input type="hidden" name="latitude" id="lat">
      <input type="hidden" name="longitude" id="lng">
      <p class="loc-info" id="locStatus">📍 กำลังหาตำแหน่ง...</p>
      <button type="submit" class="btn btn-orange" style="margin-top:16px" id="submitBtn" disabled>
        📤 ส่งรูป
      </button>
    </form>
    <script>
    const input = document.getElementById('photoInput');
    const preview = document.getElementById('preview');
    const uploadArea = document.getElementById('uploadArea');
    const submitBtn = document.getElementById('submitBtn');

    input.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        preview.src = URL.createObjectURL(file);
        preview.style.display = 'block';
        uploadArea.style.display = 'none';
        submitBtn.disabled = false;
      }
    });

    // Get location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          document.getElementById('lat').value = pos.coords.latitude;
          document.getElementById('lng').value = pos.coords.longitude;
          document.getElementById('locStatus').textContent = '📍 ตำแหน่ง: ' + pos.coords.latitude.toFixed(4) + ', ' + pos.coords.longitude.toFixed(4);
        },
        () => { document.getElementById('locStatus').textContent = '📍 ไม่สามารถระบุตำแหน่งได้'; }
      );
    }

    document.getElementById('photoForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      submitBtn.disabled = true;
      submitBtn.textContent = '⏳ กำลังส่ง...';
      const formData = new FormData(document.getElementById('photoForm'));
      try {
        const res = await fetch('/track/${token}/photo', { method: 'POST', body: formData });
        if (res.ok) {
          document.open();
          document.write(await res.text());
          document.close();
        } else {
          alert('เกิดข้อผิดพลาด กรุณาลองใหม่');
          submitBtn.disabled = false;
          submitBtn.textContent = '📤 ส่งรูป';
        }
      } catch {
        alert('ไม่สามารถเชื่อมต่อ กรุณาลองใหม่');
        submitBtn.disabled = false;
        submitBtn.textContent = '📤 ส่งรูป';
      }
    });
    </script>`);
}

function confirmPage(token: string, dnNumber: string, customerName: string, items: any[], existing: any) {
  if (existing) {
    return pageShell("ยืนยันแล้ว", `
      <div class="header" style="background:linear-gradient(135deg,#059669,#10b981)">
        <h1>✅ ยืนยันรับสินค้าแล้ว</h1>
        <p>${dnNumber}</p>
      </div>
      <div class="card" style="text-align:center">
        <div class="success-icon">🎉</div>
        <p>การรับสินค้าถูกยืนยันเมื่อ ${existing.confirmedAt?.slice(0, 16).replace("T", " ") || "-"}</p>
      </div>`);
  }

  const itemRows = items.map((it, i) => `<tr><td>${i + 1}</td><td>${it.productName}</td><td style="text-align:right">${it.quantity}</td></tr>`).join("");

  return pageShell(`ยืนยันรับ ${dnNumber}`, `
    <div class="header" style="background:linear-gradient(135deg,#059669,#10b981)">
      <h1>✅ ยืนยันรับสินค้า</h1>
      <p>${dnNumber} — ${customerName}</p>
    </div>
    <div class="card">
      <h3 style="font-size:14px;font-weight:700;margin-bottom:8px">รายการสินค้า</h3>
      <table class="items-table">
        <thead><tr><th>#</th><th>สินค้า</th><th style="text-align:right">จำนวน</th></tr></thead>
        <tbody>${itemRows}</tbody>
      </table>
    </div>
    <div class="card">
      <h3 style="font-size:14px;font-weight:700;margin-bottom:12px">ลงลายมือชื่อ</h3>
      <canvas id="sigCanvas" width="400" height="200"></canvas>
      <button type="button" onclick="clearSig()" class="btn btn-outline" style="margin-top:8px;padding:8px;font-size:13px">🗑️ ล้างลายเซ็น</button>
    </div>
    <form id="confirmForm">
      <input type="hidden" name="signature" id="sigData">
      <input type="hidden" name="latitude" id="lat">
      <input type="hidden" name="longitude" id="lng">
      <input type="hidden" name="macAddress" id="mac">
      <p class="loc-info" id="locStatus">📍 กำลังหาตำแหน่ง...</p>
      <button type="submit" class="btn btn-green" id="submitBtn">
        ✅ ยืนยันรับสินค้า
      </button>
    </form>
    <script>
    // Signature canvas
    const canvas = document.getElementById('sigCanvas');
    const ctx = canvas.getContext('2d');
    let drawing = false;
    let hasSig = false;

    // Scale canvas for retina
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);
    ctx.strokeStyle = '#1a202c';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    function getPos(e) {
      const r = canvas.getBoundingClientRect();
      const t = e.touches ? e.touches[0] : e;
      return { x: t.clientX - r.left, y: t.clientY - r.top };
    }

    canvas.addEventListener('mousedown', (e) => { drawing = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); });
    canvas.addEventListener('mousemove', (e) => { if (!drawing) return; hasSig = true; const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); });
    canvas.addEventListener('mouseup', () => { drawing = false; });
    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); drawing = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); });
    canvas.addEventListener('touchmove', (e) => { e.preventDefault(); if (!drawing) return; hasSig = true; const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); });
    canvas.addEventListener('touchend', () => { drawing = false; });

    function clearSig() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      hasSig = false;
    }

    // Location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          document.getElementById('lat').value = pos.coords.latitude;
          document.getElementById('lng').value = pos.coords.longitude;
          document.getElementById('locStatus').textContent = '📍 ตำแหน่ง: ' + pos.coords.latitude.toFixed(4) + ', ' + pos.coords.longitude.toFixed(4);
        },
        () => { document.getElementById('locStatus').textContent = '📍 ไม่สามารถระบุตำแหน่งได้'; }
      );
    }

    // Submit
    document.getElementById('confirmForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!hasSig) { alert('กรุณาลงลายมือชื่อก่อน'); return; }
      const btn = document.getElementById('submitBtn');
      btn.disabled = true;
      btn.textContent = '⏳ กำลังบันทึก...';

      document.getElementById('sigData').value = canvas.toDataURL('image/png');

      const formData = new FormData(document.getElementById('confirmForm'));
      const res = await fetch('/track/${token}/confirm', { method: 'POST', body: formData });
      if (res.ok) {
        document.open();
        document.write(await res.text());
        document.close();
      } else {
        alert('เกิดข้อผิดพลาด กรุณาลองใหม่');
        btn.disabled = false;
        btn.textContent = '✅ ยืนยันรับสินค้า';
      }
    });
    </script>`);
}

export { trackingRoute };
