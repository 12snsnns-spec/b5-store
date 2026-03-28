const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const app = express();
const PORT = 8080;

// --- 1. إعدادات متجر b5 والبوت ---
const CLIENT_ID = '1487185802386735266';
const CLIENT_SECRET = 'KuJLAUlUpqfZDdDJMD9KXAnXJkGN8iqW';
const CALLBACK_URL = 'http://localhost:8080/auth/discord/callback';
const BOT_TOKEN = 'MTQ4NzE4NTgwMjM4NjczNTI2Ng.Gzk-47.c0bFcxuRhV_iAsnsahiBqiHzkk87D6bbBw573w';
const LOG_CHANNEL_ID = '1487179938762199070';

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages]
});
client.login(BOT_TOKEN);

// --- 2. إعدادات الملفات والرفع ---
app.use(express.static(__dirname));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));

const storage = multer.diskStorage({
    destination: 'uploads/',
    filename: (req, file, cb) => { cb(null, Date.now() + '-' + file.originalname); }
});
const upload = multer({ storage: storage });
const uploadFields = upload.fields([{ name: 'img1', maxCount: 1 }, { name: 'img2', maxCount: 1 }]);

if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

// --- 3. نظام الجلسات والدخول ---
app.use(session({ secret: 'b5-secure-key', resave: false, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(new DiscordStrategy({
    clientID: CLIENT_ID, clientSecret: CLIENT_SECRET, callbackURL: CALLBACK_URL, scope: ['identify']
}, (at, rt, profile, done) => done(null, profile)));

// --- 4. المسارات (Routes) ---
app.get('/', (req, res) => {
    try {
        const products = JSON.parse(fs.readFileSync('products.json', 'utf-8'));
        res.render('index', { products, user: req.user });
    } catch (e) { res.send("تأكد من وجود ملف products.json"); }
});

app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => res.redirect('/'));

// إرسال الطلب مع الأزرار والصور
app.post('/order', uploadFields, async (req, res) => {
    if (!req.isAuthenticated()) return res.send("<h1>سجل دخول أولاً!</h1>");

    try {
        const channel = await client.channels.fetch(LOG_CHANNEL_ID);
        const img1 = req.files['img1'] ? req.files['img1'][0].path : null;
        const img2 = req.files['img2'] ? req.files['img2'][0].path : null;
        const pName = req.body.productName || "منتج غير معروف";

        const embed = new EmbedBuilder()
            .setTitle('🔵 طلب شراء جديد - b5 Store')
            .setColor(0x2cc9ff)
            .addFields(
                { name: '👤 العميل', value: `<@${req.user.id}>`, inline: true },
                { name: '📦 المنتج', value: pName, inline: true }
            )
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`approve_${req.user.id}_${pName.replace(/\s+/g, '-')}`)
                .setLabel('قبول ✅')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('reject_order')
                .setLabel('رفض ❌')
                .setStyle(ButtonStyle.Danger)
        );

        await channel.send({ embeds: [embed], components: [row], files: [img1, img2].filter(Boolean) });
        res.send("<h1 style='text-align:center; color:#2cc9ff; margin-top:50px;'>✅ تم إرسال طلبك بنجاح!</h1>");
    } catch (err) {
        console.error(err);
        res.status(500).send("خطأ في السيرفر.");
    }
});

// --- 5. معالج الأزرار الذكي ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    if (interaction.customId.startsWith('approve_')) {
        // الرد الفوري لمنع رسالة "Interaction Failed"
        await interaction.deferReply({ ephemeral: true });

        const parts = interaction.customId.split('_');
        const userId = parts[1];
        const pName = parts[2].replace(/-/g, ' ');

        try {
            const products = JSON.parse(fs.readFileSync('products.json', 'utf-8'));
            const product = products.find(p => p.name === pName);
            const link = product ? product.download : "الرابط غير متاح";

            const user = await client.users.fetch(userId);
            await user.send(`✅ **متجر b5**\nتم قبول طلبك لـ: **${pName}**\n🔗 الرابط: ${link}`);

            await interaction.editReply({ content: `✅ تم إرسال الرابط لـ <@${userId}>` });
        } catch (e) {
            await interaction.editReply({ content: `❌ فشل الإرسال (الخاص مقفل).` });
        }
    } else if (interaction.customId === 'reject_order') {
        await interaction.reply({ content: '❌ تم رفض الطلب.', ephemeral: true });
    }
});

app.listen(PORT, () => console.log(`🚀 السيرفر شغال: http://localhost:${PORT}`));
