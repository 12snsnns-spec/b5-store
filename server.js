const express = require('express');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const axios = require('axios'); // المكتبة اللي ثبتناها
const app = express();

// --- إعدادات الويبهوك (حط رابطك هنا) ---
const DISCORD_WEBHOOK_URL = 'رابط_الويبهوك_الخاص_بك';

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));

// إعدادات رفع الصور
const storage = multer.diskStorage({
    destination: './uploads/',
    filename: (req, file, cb) => {
        cb(null, 'b5-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

const DATA_FILE = './products.json';
const ORDERS_FILE = './orders.json';

// إنشاء ملفات البيانات لو مو موجودة
if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, '[]');

function getProducts() { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')); }
function getOrders() { return JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf-8')); }

// الويب الأول (المتجر للزبائن)
app.get('/', (req, res) => {
    res.render('index', { products: getProducts() });
});

// استقبال الطلب
app.post('/order', upload.fields([{ name: 'img1' }, { name: 'img2' }]), (req, res) => {
    const orders = getOrders();
    const newOrder = {
        id: Date.now(),
        productName: req.body.productName,
        customerDiscord: req.body.discordName,
        transferImg: req.files['img1'][0].filename,
        accountImg: req.files['img2'][0].filename,
        status: 'قيد الانتظار ⏳',
        date: new Date().toLocaleString('ar-SA')
    };
    orders.push(newOrder);
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
    res.send('<h1 style="text-align:center;">✅ تم استلام طلبك بنجاح! سيتم مراجعته وإرسال الرابط لك في الديسكورد.</h1>');
});

// الويب الثاني (لوحة التحكم)
app.get('/admin', (req, res) => {
    res.render('admin', { products: getProducts(), orders: getOrders() });
});

// زر القبول وإرسال المنتج عبر الويبهوك
app.post('/admin/approve/:id', async (req, res) => {
    let orders = getOrders();
    let products = getProducts();
    const order = orders.find(o => o.id == req.params.id);

    if (order && order.status !== 'تم التسليم ✅') {
        const prod = products.find(p => p.name === order.productName);
        if (prod) {
            try {
                // إرسال الرسالة للديسكورد
                await axios.post(DISCORD_WEBHOOK_URL, {
                    content: `📦 **طلب جديد مقبول لمتجر b5**\n👤 **الزبون:** ${order.customerDiscord}\n🛒 **المنتج:** ${prod.name}\n🔗 **رابط التحميل:** ${prod.link}\n\nشكراً لتعاملك مع b5 Store!`
                });
                order.status = 'تم التسليم ✅';
                fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
            } catch (err) { console.log("خطأ في الويبهوك"); }
        }
    }
    res.redirect('/admin');
});

app.listen(3000, () => console.log('🚀 متجر b5 شغال: http://localhost:3000'));