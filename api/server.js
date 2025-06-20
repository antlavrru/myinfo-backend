// backend/server.js
require('dotenv').config(); // Загружает переменные из .env файла

const express = require('express');
const admin = require('firebase-admin');
const crypto = require('crypto'); // Для проверки Telegram initData

// --- КОНФИГУРАЦИЯ ---
// ТОКЕН ТВОЕГО БОТА ИЗ BOTFATHER
// Теперь он будет читаться из переменной окружения Vercel
const BOT_TOKEN = process.env.BOT_TOKEN; // <--- Читаем из переменной окружения Vercel

// Инициализация Firebase Admin SDK
// Содержимое файла сервисного аккаунта Firebase теперь будет читаться из переменной окружения Vercel
// Для локальной разработки, ты можешь создать файл .env с этой переменной (позже)
if (!admin.apps.length) { // Добавил проверку, чтобы избежать повторной инициализации
    try {
        const firebaseServiceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY; //
        if (!firebaseServiceAccountJson) {
            throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY environment variable is not set.'); //
        }
        const serviceAccount = JSON.parse(firebaseServiceAccountJson); //

        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount) //
        });
        console.log("Firebase Admin SDK initialized successfully.");
    } catch (error) {
        console.error('Failed to initialize Firebase Admin SDK:', error.message); //
        console.error('Ensure FIREBASE_SERVICE_ACCOUNT_KEY environment variable is correctly set and is valid JSON.'); //
        // В продакшене лучше не запускать сервер, если Firebase не инициализирован
        // process.exit(1); // Эту строку можно раскомментировать, если ты хочешь, чтобы сервер падал при ошибке инициализации Firebase.
    }
}


const db = admin.firestore(); // Получаем экземпляр Cloud Firestore

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json()); // Для парсинга JSON-тел запросов

// --- Функция для проверки Telegram initData ---
function validateTelegramInitData(initData) {
    console.log('--- STARTING initData VALIDATION ---'); // NEW LOG
    console.log('Input initData string:', initData); // NEW LOG

    const items = initData.split('&').map(item => item.split('='));
    console.log('Parsed items (key=value pairs):', items); // NEW LOG

    const dataCheckString = items
        .filter(([key]) => key !== 'hash')
        .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
        .map(([key, value]) => {
            const decodedValue = decodeURIComponent(value);
            console.log(`  Processing: ${key}=${value} -> Decoded: ${key}=${decodedValue}`); // NEW LOG
            return `${key}=${decodedValue}`;
        })
        .join('\n'); // Соединяем строки с символом новой строки

    console.log('dataCheckString (for hash calculation):'); // NEW LOG
    console.log(dataCheckString); // NEW LOG
    console.log('--- END dataCheckString ---'); // NEW LOG

    const hash = items.find(([key]) => key === 'hash')[1];
    console.log('Extracted hash from initData:', hash); // NEW LOG

    // Вычисляем секретный ключ
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    console.log('Secret Key (HMAC SHA256 "WebAppData" with BOT_TOKEN, digest hex):', secretKey.toString('hex')); // NEW LOG

    // Вычисляем хэш данных
    const checkHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    console.log('Calculated checkHash:', checkHash); // NEW LOG

    const isValid = checkHash === hash;
    console.log('Validation Result (checkHash === hash):', isValid); // NEW LOG
    console.log('--- ENDING initData VALIDATION ---'); // NEW LOG
    return isValid;
}

// --- Маршрут для сохранения отзыва ---
app.post('/submit-review', async (req, res) => { //
    // Добавь эти строки для отладки:
    console.log('*** ПОЛУЧЕН POST ЗАПРОС НА /submit-review ***');
    console.log('Headers:', req.headers);
    console.log('Body:', req.body);

    try {
        const { initData, reviewText } = req.body; //

         console.log('Received initData:', initData);
        if (initData) {
            console.log('BOT_TOKEN (на бэкенде):', BOT_TOKEN ? 'Установлен' : 'НЕ установлен или пуст');
            const isValid = validateTelegramInitData(initData);
            console.log('Is initData valid?', isValid);
        }

        if (!initData || !validateTelegramInitData(initData)) { //
            console.warn('Invalid or missing initData received.'); //
            return res.status(401).send('Unauthorized: Invalid Telegram data.'); //
        }

        const initDataParams = new URLSearchParams(initData); //
        const userJson = initDataParams.get('user'); //
        if (!userJson) { //
            console.warn('User data not found in validated initData.'); //
            return res.status(400).send('Bad Request: User data missing.'); //
        }
        const user = JSON.parse(userJson); //

        if (!user.id || !reviewText) { //
            return res.status(400).send('Missing required fields: userId or reviewText.'); //
        }

        const userId = user.id; //
        const userName = `${user.first_name || ''} ${user.last_name || ''}`.trim(); //
        const userUsername = user.username || null; //
        const userPhotoUrl = user.photo_url || null; //

        const docRef = await db.collection('reviews').add({ //
            userId: userId, //
            userName: userName, //
            userUsername: userUsername, //
            userPhotoUrl: userPhotoUrl, //
            reviewText: reviewText, //
            timestamp: admin.firestore.FieldValue.serverTimestamp() // Время на сервере
        });

        console.log(`Review submitted by user ${userId}: ${reviewText.substring(0, 50)}...`); //
        res.status(200).send({ message: 'Review submitted successfully', reviewId: docRef.id }); //

    } catch (error) {
        console.error('Error submitting review in POST /submit-review:', error); // Обновил сообщение об ошибке для ясности
        res.status(500).send('Error submitting review. Please try again later.'); //
    }
});

// Простой GET маршрут для проверки работы бэкенда
app.get('/', (req, res) => { //
    res.send('Backend for MyInfo Telegram Mini App is running!'); //
});

app.listen(port, () => { //
    console.log(`Backend server listening at http://localhost:${port}`); //
    console.log(`To test locally, you'll need to set BOT_TOKEN and FIREBASE_SERVICE_ACCOUNT_KEY environment variables.`); //
});

// ВАЖНО: Для Vercel Serverless Function, Express-приложение должно быть экспортировано
module.exports = app;