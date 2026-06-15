// index.js
// UTS — Personal Finance API
// Web Advanced Development

// =============================================
// Nama: Puti Nafiisah R
// NIM: 24110400033
// =============================================

const express = require("express");
const { PrismaClient } = require("@prisma/client");

const app = express();
const prisma = new PrismaClient();

const PORT = 3000;

//Middleware
app.use(express.json());

// =============================================
// 1a. GET /wallets - urut dari yang paling baru
// =============================================
app.get("/wallets", async (req, res) => {
  try {
    const wallets = await prisma.wallet.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });

    res.status(200).json(wallets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================
// 1b. POST /wallets - walet baru default IDR, 201
// =============================================
app.post("/wallets", async (req, res) => {
  try {
    const { name, currency } = req.body;

    if (!name || name.trim() === "") {
      return res.status(400).json({
        error: "name wajib diisi",
      });
    }

    const wallet = await prisma.wallet.create({
      data: {
        name,
        ...(currency && { currency }),
      },
    });

    res.status(201).json(wallet);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================
// 1c. DELETE /wallets/:id - hapus transaksi lalu walet
// =============================================
app.delete("/wallets/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const wallet = await prisma.wallet.findUnique({
      where: { id },
    });

    if (!wallet) {
      return res.status(404).json({
        error: "Wallet tidak ditemukan",
      });
    }

    await prisma.transaction.deleteMany({
      where: {
        walletId: id,
      },
    });

    await prisma.wallet.delete({
      where: {
        id,
      },
    });

    return res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================
// 2a. GET /wallets/:id/transactions -Filter by walletId, urutan date desc,404
// =============================================
app.get("/wallets/:id/transactions", async (req, res) => {
  try {
    const walletId = parseInt(req.params.id);

    const wallet = await prisma.wallet.findUnique({
      where: {
        id: walletId,
      },
    });

    if (!wallet) {
      return res.status(404).json({
        error: "Wallet tidak ditemukan",
      });
    }

    const transactions = await prisma.transaction.findMany({
      where: {
        walletId,
      },
      orderBy: {
        date: "desc",
      },
    });

    res.status(200).json(transactions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================
// 2b. POST /wallets/:id/transactions - 4 validasi + response 201
// =============================================
app.post("/wallets/:id/transactions", async (req, res) => {
  try {
    const walletId = parseInt(req.params.id);

    const wallet = await prisma.wallet.findUnique({
      where: { id: walletId },
    });

    if (!wallet) {
      return res.status(404).json({
        error: "Wallet tidak ditemukan",
      });
    }

    const { amount, type, category, date, note } = req.body;

    if (
      amount === undefined ||
      type === undefined ||
      category === undefined ||
      date === undefined ||
      amount === "" ||
      type === "" ||
      category === "" ||
      date === ""
    ) {
      return res.status(400).json({
        error: "amount, type, category, dan date wajib diisi",
      });
    }

    if (type !== "income" && type !== "expense") {
      return res.status(400).json({
        error: 'type harus "income" atau "expense"',
      });
    }

    const parsedAmount = Number(amount);

    if (isNaN(parsedAmount)) {
      return res.status(400).json({
        error: "amount harus berupa angka",
      });
    }

    if (parsedAmount <= 0) {
      return res.status(400).json({
        error: "amount harus lebih dari 0",
      });
    }

    const transaction = await prisma.transaction.create({
      data: {
        amount: parsedAmount,
        type,
        category,
        note: note || null,
        date: new Date(date),
        walletId,
      },
    });

    return res.status(201).json(transaction);

  } catch (err) {
    return res.status(500).json({
      error: "Terjadi kesalahan server",
    });
  }
});

// =============================================
// 2c. DELETE /transactions/:id - BONUS 
// =============================================
app.delete("/transactions/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    const transaction = await prisma.transaction.findUnique({
      where: { id },
      include: {
        wallet: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!transaction) {
      return res.status(404).json({
        error: "Transaksi tidak ditemukan",
      });
    }

    await prisma.transaction.delete({
      where: { id },
    });

    const { walletId, wallet, ...data } = transaction;

    return res.status(200).json({
      deleted: {
        ...data,
        wallet: {
          name: wallet.name,
        },
      },
    });

  } catch (err) {
    return res.status(500).json({
      error: "Terjadi kesalahan server",
    });
  }
});

// =============================================
// 3a. GET /wallets/:id/balance - Derived: income, expense, balance
// =============================================
app.get("/wallets/:id/balance", async (req, res) => {
  try {
    const walletId = parseInt(req.params.id);

    const wallet = await prisma.wallet.findUnique({
      where: { id: walletId },
    });

    if (!wallet) {
      return res.status(404).json({
        error: "Wallet tidak ditemukan",
      });
    }

    const transactions = await prisma.transaction.findMany({
      where: { walletId },
    });

    let totalIncome = 0;
    let totalExpense = 0;

    for (const trx of transactions) {
      if (trx.type === "income") {
        totalIncome += trx.amount;
      } else {
        totalExpense += trx.amount;
      }
    }

    res.status(200).json({
      walletId: wallet.id,
      walletName: wallet.name,
      totalIncome,
      totalExpense,
      balance: totalIncome - totalExpense,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================
// 3b. GET /wallets/:id/summary - Derived: per-category avg, count, types
// =============================================
app.get("/wallets/:id/summary", async (req, res) => {
  try {
    const walletId = parseInt(req.params.id);

    const wallet = await prisma.wallet.findUnique({
      where: { id: walletId },
    });

    if (!wallet) {
      return res.status(404).json({
        error: "Wallet tidak ditemukan",
      });
    }

    const transactions = await prisma.transaction.findMany({
      where: { walletId },
    });

    const grouped = {};

    transactions.forEach((trx) => {
      if (!grouped[trx.category]) {
        grouped[trx.category] = {
          category: trx.category,
          count: 0,
          totalAmount: 0,
          types: {
            income: 0,
            expense: 0,
          },
        };
      }

      grouped[trx.category].count++;
      grouped[trx.category].totalAmount += trx.amount;
      grouped[trx.category].types[trx.type]++;
    });

    const summary = Object.values(grouped).map((item) => ({
      category: item.category,
      count: item.count,
      totalAmount: item.totalAmount,
      avgAmount: Number((item.totalAmount / item.count).toFixed(2)),
      types: item.types,
    }));

    res.status(200).json({
      walletId: wallet.id,
      walletName: wallet.name,
      summary,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Start server ───────────────────────────────
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Endpoints:`);

  // Wallet
  console.log(`  GET    /wallets`);
  console.log(`  POST   /wallets`);
  console.log(`  DELETE /wallets/:id`);

  // Transactions
  console.log(`  GET    /wallets/:id/transactions`);
  console.log(`  POST   /wallets/:id/transactions`);
  console.log(`  DELETE /transactions/:id (bonus)`);

  // Analytics
  console.log(`  GET    /wallets/:id/balance`);
  console.log(`  GET    /wallets/:id/summary`);
});