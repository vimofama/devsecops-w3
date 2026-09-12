const express = require("express");

const app = express();

const payments = [
  {
    id: 1,
    student_id: "1024",
    amount: 350.0,
    payment_date: "2026-08-01",
    receipt_url: "https://aulapay.example/receipts/1024-001.pdf",
  },
  {
    id: 2,
    student_id: "2048",
    amount: 420.5,
    payment_date: "2026-08-03",
    receipt_url: "https://aulapay.example/receipts/2048-001.pdf",
  },
];

const db = {
  async query(sql) {
    const match = sql.match(/WHERE student_id = (.+)$/);
    const rawValue = match ? match[1].trim() : "";
    const rows = payments.filter((p) => p.student_id === rawValue);
    return { rows };
  },
};

function authenticateUser(req, res, next) {
  const studentId = req.header("x-student-id");
  if (!studentId) {
    return res.status(401).json({ error: "No autenticado" });
  }
  req.user = { studentId };
  next();
}

app.get("/api/payments/:studentId", authenticateUser, async (req, res) => {
  const studentId = req.params.studentId;

  if (req.user.studentId !== studentId) {
    return res.status(403).json({ error: "Forbidden: no tiene acceso a este recurso" });
  }

  const query =
      "SELECT id, student_id, amount, payment_date, receipt_url " +
      "FROM payments WHERE student_id = $1";

  const result = await db.query(query, [studentId]);

  res.json(result.rows);
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`AulaPay payments API escuchando en puerto ${port}`);
  });
}

module.exports = app;

