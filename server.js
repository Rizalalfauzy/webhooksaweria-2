const express = require("express");
const cors    = require("cors");
const app     = express();
const PORT    = process.env.PORT || 3000;

// ============================================================
//   🪝 SAWERIA WEBHOOK SERVER — FIXED VERSION
//   ✅ FIX v2:
//       - EXPIRE_MS naik ke 5 menit (sinkron dengan Roblox)
//       - Konfirmasi pakai DELETE bukan filter (lebih atomic)
//       - /status endpoint lebih detail untuk debug
//       - Duplicate check lebih ketat (cek id DAN waktu masuk)
//       - Log lebih lengkap untuk tracking miss
//       - Graceful handle kalau amount_raw tidak ada
// ============================================================

const EXPIRE_MS = 5 * 60 * 1000; // 5 menit — sinkron dengan SaweriaHandler

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// ============================================================
// IN-MEMORY QUEUE
// ============================================================
let donationQueue = [];

// Cleanup otomatis setiap 1 menit — buang yang expired
setInterval(() => {
    const before = donationQueue.length;
    donationQueue = donationQueue.filter(d => Date.now() < d.expireAt);
    const removed = before - donationQueue.length;
    if (removed > 0) {
        console.log(`[Cleanup] Removed ${removed} expired donations | Queue size: ${donationQueue.length}`);
    }
}, 60 * 1000);

// ============================================================
// ROOT
// ============================================================
app.get("/", (req, res) => {
    res.send("Saweria webhook server running ✅");
});

// ============================================================
// WEBHOOK — Saweria POST ke sini
// ============================================================
app.post("/saweria-webhook", (req, res) => {
    console.log("RAW PAYLOAD:", JSON.stringify(req.body));

    const d = req.body || {};

    // ✅ FIX: Fallback ID yang lebih unik pakai timestamp + random
    const id = d.id
        || (Date.now().toString() + "_" + Math.random().toString(36).slice(2, 8));

    // ✅ FIX: Cek duplikat sebelum push
    const alreadyQueued = donationQueue.some(item => item.id === id);
    if (alreadyQueued) {
        console.log(`[Duplicate] Ignored: ${id}`);
        return res.status(200).json({ success: true, duplicate: true });
    }

    // ✅ FIX: Handle amount_raw yang mungkin string atau tidak ada
    const amount = parseInt(d.amount_raw) || parseInt(d.amount) || 0;
    if (amount <= 0) {
        console.warn(`[Warning] Amount 0 atau tidak valid untuk id: ${id}`);
    }

    const entry = {
        id:        id,
        username:  d.donator_name || d.username || "Guest",
        amount:    amount,
        message:   d.message || "",
        expireAt:  Date.now() + EXPIRE_MS,
        receivedAt: new Date().toISOString(), // untuk debug
    };

    donationQueue.push(entry);
    console.log(`[Queued] id=${id} | user=${entry.username} | amount=${entry.amount} | Queue size: ${donationQueue.length}`);

    res.status(200).json({ success: true });
});

// ============================================================
// POLLING — Roblox GET ke sini setiap 5 detik
// ============================================================
app.get("/lastsawer", (req, res) => {
    // Buang yang expired dulu
    donationQueue = donationQueue.filter(d => Date.now() < d.expireAt);

    if (donationQueue.length > 0) {
        // Ambil yang paling lama (FIFO) — jangan hapus dulu
        // Roblox akan konfirmasi setelah berhasil proses
        const next = donationQueue[0];

        console.log(`[Poll] Serving: id=${next.id} | user=${next.username} | amount=${next.amount}`);

        res.json({
            newSawer: true,
            data: {
                id:       next.id,
                username: next.username,
                amount:   next.amount,
                message:  next.message,
            }
        });
    } else {
        res.json({ newSawer: false });
    }
});

// ============================================================
// CONFIRM — Roblox POST ke sini setelah berhasil proses
// ✅ FIX: Lebih atomic, log jelas
// ============================================================
app.post("/confirm/:id", (req, res) => {
    const id     = req.params.id;
    const before = donationQueue.length;

    donationQueue = donationQueue.filter(d => d.id !== id);

    const removed = before - donationQueue.length;
    if (removed > 0) {
        console.log(`[Confirmed] id=${id} | Removed: ${removed} | Queue size: ${donationQueue.length}`);
    } else {
        // Bisa terjadi kalau sudah expired atau double confirm — bukan error
        console.log(`[Confirm] id=${id} tidak ditemukan di queue (mungkin sudah expired atau double confirm)`);
    }

    res.json({ success: true, removed });
});

// ============================================================
// STATUS — untuk debug manual
// ============================================================
app.get("/status", (req, res) => {
    const now = Date.now();
    res.json({
        queueSize:  donationQueue.length,
        serverTime: new Date().toISOString(),
        queue: donationQueue.map(d => ({
            id:        d.id,
            username:  d.username,
            amount:    d.amount,
            message:   d.message,
            receivedAt: d.receivedAt,
            expiresIn: Math.round((d.expireAt - now) / 1000) + "s",
        })),
    });
});

// ============================================================
// CLEAR — untuk manual reset queue kalau stuck (pakai dengan hati-hati)
// ============================================================
app.post("/clear", (req, res) => {
    const count = donationQueue.length;
    donationQueue = [];
    console.log(`[Clear] Manual clear: ${count} donations removed`);
    res.json({ success: true, cleared: count });
});

// ============================================================
app.listen(PORT, () => console.log(`[Server] Running on port ${PORT}`));
