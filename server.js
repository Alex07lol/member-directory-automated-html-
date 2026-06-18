const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change';
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        const dir = path.join(__dirname, 'members');
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: function(req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'photo-' + uniqueSuffix + ext);
    }
});
const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: function(req, file, cb) {
        const filetypes = /jpeg|jpg|png|gif|webp/i;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname));
        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error("Only image files are allowed!"));
    }
});

const dbPath = path.join(__dirname, 'members.json');
const csvPath = path.join(__dirname, 'members.csv');
if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, '[]', 'utf8');
}
if (!fs.existsSync(csvPath)) {
    fs.writeFileSync(csvPath, '', 'utf8');
}

const usersDb = {
    "user": {
        role: "user",
        passwordHash: bcrypt.hashSync("user123", 10)
    },
    "admin": {
        role: "admin",
        passwordHash: bcrypt.hashSync("admin123", 10)
    }
};
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    console.log(`\n[LOGIN ATTEMPT] Username received: '${username}'`);
    const user = usersDb[username];
    if (!user) {
        console.log(`[LOGIN FAILED] User '${username}' does not exist.`);
        return res.status(401).json({ error: "Invalid credentials" });
    }
    const isValidPassword = bcrypt.compareSync(password, user.passwordHash);

    if (!isValidPassword) {
        console.log(`[LOGIN FAILED] Incorrect password for user '${username}'.`);
        return res.status(401).json({ error: "Invalid credentials" });
    }
    const token = jwt.sign({ username: username, role: user.role },
        JWT_SECRET, { expiresIn: '2h' }
    );
    console.log(`[LOGIN SUCCESS] User '${username}' logged in successfully.`);
    res.json({
        message: "Login successful",
        role: user.role,
        token: token
    });
});

const verifyAdmin = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'admin') {
            return res.status(403).json({ error: "Forbidden: Admins only" });
        }
        next();
    } catch (e) {
        return res.status(401).json({ error: "Invalid token" });
    }
};

const syncCsv = async(membersDb) => {
    if (!membersDb || !membersDb.length) return;
    try {
        const headers = Object.keys(membersDb[0]);
        const rows = membersDb.map(member => headers.map(key => `"${String(member[key] !== undefined ? member[key] : '').replace(/"/g, '""')}"`).join(','));
        const csvContent = [headers.join(','), ...rows].join('\n');
        await fs.promises.writeFile(csvPath, csvContent, 'utf8');
    } catch (e) {
        console.error("Failed to sync CSV:", e);
    }
};

app.get('/api/members', async(req, res) => {
    const authHeader = req.headers.authorization;
    let isLoggedIn = false;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
            jwt.verify(token, JWT_SECRET);
            isLoggedIn = true;
        } catch (e) {}
    }

    try {
        const membersData = await fs.promises.readFile(dbPath, 'utf8');
        const membersDb = JSON.parse(membersData);
        const responseData = membersDb.map(member => {
            if (isLoggedIn) {
                return member;
            } else {
                const { bloodType, vehicle, address, ...publicData } = member;
                return publicData;
            }
        });
        res.json(responseData);
    } catch (err) {
        res.status(500).json({ error: "Unable to load members" });
    }
});

app.get('/api/members/csv', verifyAdmin, (req, res) => {
    res.download(csvPath);
});

app.post('/api/upload', verifyAdmin, (req, res) => {
    upload.single('photo')(req, res, function(err) {
        if (err) {
            return res.status(400).json({ error: err.message });
        }
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }
        res.json({ photoUrl: `members/${req.file.filename}` });
    });
});

app.post('/api/members', verifyAdmin, async(req, res) => {
    try {
        const membersDb = JSON.parse(await fs.promises.readFile(dbPath, 'utf8'));
        const newMember = req.body;
        newMember.id = membersDb.length ? Math.max(...membersDb.map(m => m.id)) + 1 : 1;
        membersDb.push(newMember);
        await fs.promises.writeFile(dbPath, JSON.stringify(membersDb, null, 4));
        await syncCsv(membersDb);
        res.json({ message: "Member added successfully", member: newMember });
    } catch (err) {
        res.status(500).json({ error: "Server error" });
    }
});

app.put('/api/members/:id', verifyAdmin, async(req, res) => {
    try {
        const membersDb = JSON.parse(await fs.promises.readFile(dbPath, 'utf8'));
        const index = membersDb.findIndex(m => m.id == req.params.id);
        if (index === -1) return res.status(404).json({ error: "Not found" });

        membersDb[index] = {...membersDb[index], ...req.body, id: membersDb[index].id };
        await fs.promises.writeFile(dbPath, JSON.stringify(membersDb, null, 4));
        await syncCsv(membersDb);
        res.json({ message: "Member updated successfully" });
    } catch (err) {
        res.status(500).json({ error: "Server error" });
    }
});

app.delete('/api/members/:id', verifyAdmin, async(req, res) => {
    try {
        let membersDb = JSON.parse(await fs.promises.readFile(dbPath, 'utf8'));
        const initialLen = membersDb.length;
        membersDb = membersDb.filter(m => m.id != req.params.id);
        if (membersDb.length === initialLen) return res.status(404).json({ error: "Not found" });

        await fs.promises.writeFile(dbPath, JSON.stringify(membersDb, null, 4));
        await syncCsv(membersDb);
        res.json({ message: "Member deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: "Server error" });
    }
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'home.html'));
});
app.listen(PORT, '127.0.0.1', () => {
    console.log(`Server securely running on http://localhost:${PORT}`);
    console.log(`User Login  -> username: user  | password: user123`);
    console.log(`Admin Login -> username: admin | password: admin123`);
});