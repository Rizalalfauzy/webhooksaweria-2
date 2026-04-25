const express = require("express");
const cors    = require("cors");
const app     = express();
const PORT    = process.env.PORT || 3000;
const EXPIRE_MS = 60000; // naikin jadi 60 detik

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// FIX 1: Queue array, bukan single variable
let donationQueue = [];

app.get("/", (req, res) => res.send("Saweria webhook server running"));

app.post("/saweria-webhook", (req, res) => {
    console.log("RAW PAYLOAD:", JSON.stringify(req.body));
    const d = req.body || {};

    const id = d.id || (Date.now().toString() + "_" + Math.random().toString(36).slice(2, 8));

    // FIX 2: Cek duplikat sebelum push
    const alreadyQueued = donationQueue.some(item => item.id === id);
    if (!alreadyQueued) {
        donationQueue.push({
            id:       id,
            username: d.donator_name || "Guest",
            amount:   Number(d.amount_raw) || 0,
            message:  d.message || "",
            expireAt: Date.now() + EXPIRE_MS,
        });
        console.log("Queued:", id, "| Queue size:", donationQueue.length);
    } else {
        console.log("Duplicate ignored:", id);
    }

    res.status(200).json({ success: true });
});

app.get("/lastsawer", (req, res) => {
    // Buang yang expired dulu
    donationQueue = donationQueue.filter(d => Date.now() < d.expireAt);

    if (donationQueue.length > 0) {
        // FIX 3: Ambil satu, JANGAN hapus dulu
        // Roblox yang akan konfirmasi sudah diproses
        const next = donationQueue[0];
        res.json({ newSawer: true, data: next });
    } else {
        res.json({ newSawer: false });
    }
});

// FIX 4: Endpoint baru — Roblox confirm setelah berhasil proses
app.post("/confirm/:id", (req, res) => {
    const id = req.params.id;
    const before = donationQueue.length;
    donationQueue = donationQueue.filter(d => d.id !== id);
    console.log("Confirmed:", id, "| Removed:", before - donationQueue.length);
    res.json({ success: true });
});

app.get("/status", (req, res) => {
    res.json({
        queueSize:  donationQueue.length,
        queue:      donationQueue,
    });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
