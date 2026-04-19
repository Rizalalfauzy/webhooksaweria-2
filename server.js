const express    = require("express");
const cors       = require("cors");

const app  = express();
const PORT = process.env.PORT || 3000;

const EXPIRE_MS = 30000;

let latestDonation = null;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/", (req, res) => res.send("Saweria webhook server running"));

app.post("/saweria-webhook", (req, res) => {
    console.log("RAW PAYLOAD:", JSON.stringify(req.body));

    const d = req.body || {};

    latestDonation = {
        id:       d.id || (Date.now().toString() + "_" + Math.random().toString(36).slice(2, 8)),
        username: d.donator_name || "Guest",
        amount:   Number(d.amount_raw) || 0,
        message:  d.message || "",
        expireAt: Date.now() + EXPIRE_MS,
    };

    console.log("Stored:", latestDonation);
    res.status(200).json({ success: true });
});

app.get("/lastsawer", (req, res) => {
    if (latestDonation && Date.now() < latestDonation.expireAt) {
        res.json({ newSawer: true, data: latestDonation });
    } else {
        latestDonation = null;
        res.json({ newSawer: false });
    }
});

app.get("/status", (req, res) => {
    res.json({
        hasData:   latestDonation !== null,
        donation:  latestDonation,
        remaining: latestDonation
            ? Math.max(0, latestDonation.expireAt - Date.now()) + "ms"
            : null,
    });
});

app.listen(PORT, () => console.log(`Saweria webhook server running on port ${PORT}`));
