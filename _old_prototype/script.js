const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');

const app = express();
app.use(cors());
app.use(express.json());

// Подключение к базе данных MySQL
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root', // ваш юзер MySQL
    password: 'password', // ваш пароль от MySQL
    database: 'food_advisor_db' // имя вашей БД
});

db.connect((err) => {
    if (err) throw err;
    console.log('✅ Connected to MySQL Database!');
});

// Простой API, который отдает список ресторанов на фронтенд
app.get('/api/restaurants', (req, res) => {
    const sql = "SELECT * FROM restaurants";
    db.query(sql, (err, results) => {
        if (err) res.status(500).send(err);
        res.json(results);
    });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
