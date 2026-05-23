const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = 3000;

// Database File Path
const DB_PATH = path.join(__dirname, 'db.json');

// Initialize Database if not exists
function initDB() {
    if (!fs.existsSync(DB_PATH)) {
        const initialData = {
            admins: [],
            portalData: []
        };
        fs.writeFileSync(DB_PATH, JSON.stringify(initialData, null, 4));
    }
}
initDB();

// Read Database helper
function readDB() {
    initDB();
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data);
}

// Write Database helper
function writeDB(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 4));
}

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'views')));

// --- HTML Route Endpoints ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/admin-login', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'admin-login.html'));
});

app.get('/admin-dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'admin-dashboard.html'));
});

app.get('/student-login', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'student-login.html'));
});

app.get('/student-dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'student-dashboard.html'));
});


// --- REST API Endpoints ---

// 1. Admin Registration (Stage 1 + Stage 2 combined on server)
app.post('/api/admin/register', (req, res) => {
    const { name, designation, email, proofName, proofBase64, username, password } = req.body;
    
    if (!name || !designation || !email || !proofBase64 || !username || !password) {
        return res.status(400).json({ success: false, message: "Missing required registration details." });
    }

    const db = readDB();
    
    // Check if username already exists
    const existing = db.admins.find(a => a.username.toLowerCase() === username.toLowerCase());
    if (existing) {
        return res.status(400).json({ success: false, message: "Username already exists. Please choose a different one." });
    }

    // Save admin
    const newAdmin = {
        username,
        password,
        name,
        designation,
        email,
        proofName: proofName || "proof_file",
        proofBase64 // stored for HOD/Principal validation review if necessary
    };

    db.admins.push(newAdmin);
    writeDB(db);

    res.json({ success: true, message: "Admin account verified and created successfully!" });
});

// 2. Admin Login
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ success: false, message: "Username and password are required." });
    }

    const db = readDB();
    const admin = db.admins.find(a => a.username.toLowerCase() === username.toLowerCase() && a.password === password);
    
    if (!admin) {
        return res.status(401).json({ success: false, message: "Invalid username or password." });
    }

    res.json({ 
        success: true, 
        message: "Login successful!",
        admin: {
            username: admin.username,
            name: admin.name,
            designation: admin.designation
        }
    });
});

// 3. Student Login (Strict checking of C7 series in roll number)
app.post('/api/student/login', (req, res) => {
    const { rollNumber } = req.body;
    
    if (!rollNumber) {
        return res.status(400).json({ success: false, message: "Roll number is required." });
    }

    // Checking if roll number contains "C7" or "c7"
    const rollUpper = rollNumber.toUpperCase();
    if (!rollUpper.includes("C7")) {
        return res.status(400).json({ 
            success: false, 
            message: "Invalid Login! Access is restricted. Roll number must belong to the 'C7' series (e.g. 24C71A05I8)." 
        });
    }

    res.json({ 
        success: true, 
        message: "Login successful!",
        student: {
            rollNumber: rollUpper
        }
    });
});

// 4. Get Published Data (Common for Admin & Student)
app.get('/api/portal/data', (req, res) => {
    const db = readDB();
    // Sort descending by date (newest first)
    const sortedData = [...db.portalData].reverse();
    res.json({ success: true, data: sortedData });
});

// 5. Admin Publish Content
app.post('/api/admin/publish', (req, res) => {
    const { type, title, content, fileName, fileType, createdBy } = req.body;
    
    if (!type || !title || !content || !createdBy) {
        return res.status(400).json({ success: false, message: "Missing required fields for publishing." });
    }

    const db = readDB();
    
    const newRecord = {
        id: "publish_" + Date.now(),
        type,
        title,
        content,
        fileName: fileName || null,
        fileType: fileType || null,
        createdBy,
        date: new Date().toLocaleString()
    };

    db.portalData.push(newRecord);
    writeDB(db);

    res.json({ success: true, message: "Post published successfully!", record: newRecord });
});

// 6. Admin Delete Content
app.delete('/api/admin/publish/:id', (req, res) => {
    const { id } = req.params;
    const db = readDB();
    
    const index = db.portalData.findIndex(item => item.id === id);
    if (index === -1) {
        return res.status(404).json({ success: false, message: "Record not found." });
    }

    db.portalData.splice(index, 1);
    writeDB(db);
    
    res.json({ success: true, message: "Record deleted successfully." });
});

// Start Server
app.listen(PORT, () => {
    console.log(`ELLENKI Student Portal Server is running at http://localhost:${PORT}`);
});