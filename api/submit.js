import { createClient } from "@supabase/supabase-js";
import { PDFDocument, StandardFonts } from "pdf-lib";

// ✅ CORS (PRE-FLIGHT dahil)
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-API-Key");
  // bazı ortamlarda faydalı
  res.setHeader("Access-Control-Max-Age", "86400");
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function sanitizeFileName(s) {
  return String(s || "dilekce")
    .replace(/[^\p{L}\p{N}_-]+/gu, "_")
    .slice(0, 80);
}

async function buildPdf(data) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = 800;
  const x = 50;

  const write = (txt, size = 11, isBold = false) => {
    page.drawText(String(txt || ""), { x, y, size, font: isBold ? bold : font });
    y -= size + 6;
  };

  const today = new Date().toLocaleDateString("tr-TR");

  write(`Tarih: ${today}`, 11);
  y -= 10;

  page.drawText("T.C.", { x: 280, y, size: 12, font: bold }); y -= 18;
  page.drawText("YILDIZ TEKNİK ÜNİVERSİTESİ", { x: 175, y, size: 12, font: bold }); y -= 18;
  page.drawText("İSTATİSTİK BÖLÜM BAŞKANLIĞINA", { x: 155, y, size: 12, font: bold }); y -= 30;

  write(`Ben ${data.ad} ${data.soyad} (Öğrenci No: ${data.ogrno}), ${data.bolum} bölümünde öğrenim görmekteyim.`);
  write("Çakışan ders sınavları nedeniyle mazeret sınavına alınmayı talep ediyorum.");
  y -= 10;

  write("Ders Bilgileri:", 11, true);
  y -= 6;

  const blocks = Array.isArray(data.dersler) ? data.dersler : [];
  blocks.forEach((b, i) => {
    const alinan = `Alınan: ${b.alinanAdKod || "-"} | Grup: ${b.alinanGrup || "-"} | Hoca: ${b.alinanHoca || "-"} | ${b.alinanTarihSaat || "-"}`;
    const cakisan = `Çakışan: ${b.cakisanAdKod || "-"} | Grup: ${b.cakisanGrup || "-"} | Hoca: ${b.cakisanHoca || "-"} | ${b.cakisanTarihSaat || "-"}`;
    write(`${i + 1}) ${alinan}`, 9);
    write(`   ${cakisan}`, 9);
    y -= 4;
  });

  y -= 6;
  write("Açıklama:", 11, true);
  write(String(data.aciklama || "-"));
  y -= 10;

  write("Gereğini arz ederim.");
  y -= 30;

  write("İletişim:", 11, true);
  write(`YTÜ Mail: ${data.mail || "-"}`);
  write(`Telefon: ${data.telefon || "-"}`);
  y -= 20;

  write(`${data.ad} ${data.soyad} - İmza`);

  return await pdfDoc.save();
}

export default async function handler(req, res) {
  setCors(res);

  // ✅ Preflight (OPTIONS) burada kesin dönmeli
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  try {
    if (req.method !== "POST") {
      return res.status(405).send("Method not allowed");
    }

    // Opsiyonel API key kontrolü
    const apiKey = process.env.API_KEY;
    if (apiKey && req.headers["x-api-key"] !== apiKey) {
      return res.status(401).send("Unauthorized");
    }

    const supabaseUrl = requireEnv("SUPABASE_URL");
    const supabaseServiceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});

    const data = {
      ad: body.ad || "",
      soyad: body.soyad || "",
      ogrno: body.ogrno || "",
      mail: body.mail || "",
      telefon: body.telefon || "",
      bolum: body.bolum || "",
      aciklama: body.aciklama || "",
      dersler: Array.isArray(body.dersler) ? body.dersler : []
    };

    // ✅ Supabase kayıt
    const ins = await supabase.from("basvurular").insert([{
      ad: data.ad,
      soyad: data.soyad,
      ogrno: data.ogrno,
      mail: data.mail,
      telefon: data.telefon,
      bolum: data.bolum,
      aciklama: data.aciklama,
      dersler_json: data.dersler
    }]);

    if (ins.error) {
      return res.status(500).send("Supabase insert error: " + ins.error.message);
    }

    // ✅ PDF üret
    const pdfBytes = await buildPdf(data);
    const fileName = `Dilekce_${sanitizeFileName(`${data.ogrno}_${data.ad}_${data.soyad}`)}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.status(200).send(Buffer.from(pdfBytes));
  } catch (err) {
    return res.status(500).send(String(err?.stack || err));
  }
}
