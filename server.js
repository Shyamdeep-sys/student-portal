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

// In-memory OTP storage for forgot password recovery
const recoveryOTPs = {};

// 1. Admin Registration (Stage 1 + Stage 2 combined on server)
app.post('/api/admin/register', (req, res) => {
    const { name, designation, email, proofName, proofBase64, username, password } = req.body;
    
    if (!name || !designation || !email || !proofBase64 || !username || !password) {
        return res.status(400).json({ success: false, message: "Missing required registration details." });
    }

    // Verify Gmail email requirement
    if (!email.toLowerCase().endsWith('@gmail.com')) {
        return res.status(400).json({ success: false, message: "Faculty registration requires a valid @gmail.com address." });
    }

    const db = readDB();
    
    // Check if username already exists
    const existingUsername = db.admins.find(a => a.username.toLowerCase() === username.toLowerCase());
    if (existingUsername) {
        return res.status(400).json({ success: false, message: "Username already exists. Please choose a different one." });
    }

    // Check if email already exists
    const existingEmail = db.admins.find(a => a.email && a.email.toLowerCase() === email.toLowerCase());
    if (existingEmail) {
        return res.status(400).json({ success: false, message: "Gmail address is already registered." });
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
    const { username, password } = req.body; // username represents the Gmail Address entered in login
    
    if (!username || !password) {
        return res.status(400).json({ success: false, message: "Gmail address and password are required." });
    }

    const db = readDB();
    // Allow login by either matching email (gmail) or username
    const admin = db.admins.find(a => 
        ((a.email && a.email.toLowerCase() === username.toLowerCase()) || 
         (a.username && a.username.toLowerCase() === username.toLowerCase())) && 
        a.password === password
    );
    
    if (!admin) {
        return res.status(401).json({ success: false, message: "Invalid Gmail address or password." });
    }

    res.json({ 
        success: true, 
        message: "Step 1 Verification Complete!",
        admin: {
            username: admin.username,
            email: admin.email,
            name: admin.name,
            designation: admin.designation
        }
    });
});

// 2b. OTP Password Recovery Initiation
app.post('/api/admin/forgot-password', (req, res) => {
    const { gmail } = req.body;
    if (!gmail) {
        return res.status(400).json({ success: false, message: "Gmail address is required." });
    }

    const db = readDB();
    const admin = db.admins.find(a => a.email && a.email.toLowerCase() === gmail.toLowerCase());
    if (!admin) {
        return res.status(404).json({ success: false, message: "This Gmail address is not registered under any Faculty account." });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    recoveryOTPs[gmail.toLowerCase()] = {
        otp,
        expires: Date.now() + 10 * 60 * 1000 // 10 minutes expiry
    };

    // Print OTP to Node console beautifully
    console.log(`\n\x1b[36m┌────────────────────────────────────────────────────────┐\x1b[0m`);
    console.log(`\x1b[36m│              ELLENKI PASSWORD RECOVERY OTP             │\x1b[0m`);
    console.log(`\x1b[36m├────────────────────────────────────────────────────────┤\x1b[0m`);
    console.log(`\x1b[36m│  Gmail:  %-45s │\x1b[0m`, gmail);
    console.log(`\x1b[36m│  Username: %-44s │\x1b[0m`, admin.username);
    console.log(`\x1b[36m│  OTP:    \x1b[1;32m%-45s\x1b[0;36m │\x1b[0m`, otp);
    console.log(`\x1b[36m└────────────────────────────────────────────────────────┘\n\x1b[0m`);

    res.json({ success: true, message: "Recovery OTP sent to Gmail successfully!", devOtp: otp });
});

// 2c. OTP Password Recovery Verification
app.post('/api/admin/verify-otp', (req, res) => {
    const { gmail, otp } = req.body;
    if (!gmail || !otp) {
        return res.status(400).json({ success: false, message: "Gmail and OTP are required." });
    }

    const record = recoveryOTPs[gmail.toLowerCase()];
    if (!record) {
        return res.status(400).json({ success: false, message: "No OTP request found for this Gmail." });
    }

    if (Date.now() > record.expires) {
        delete recoveryOTPs[gmail.toLowerCase()];
        return res.status(400).json({ success: false, message: "OTP has expired. Please request a new one." });
    }

    if (record.otp !== otp) {
        return res.status(400).json({ success: false, message: "Incorrect OTP. Please try again." });
    }

    res.json({ success: true, message: "OTP verified successfully!" });
});

// 2d. OTP Password Recovery Reset Action
app.post('/api/admin/reset-password', (req, res) => {
    const { gmail, otp, newPassword } = req.body;
    if (!gmail || !otp || !newPassword) {
        return res.status(400).json({ success: false, message: "Gmail, OTP, and new password are required." });
    }

    const record = recoveryOTPs[gmail.toLowerCase()];
    if (!record || record.otp !== otp || Date.now() > record.expires) {
        return res.status(400).json({ success: false, message: "Invalid or expired OTP session." });
    }

    const db = readDB();
    const adminIndex = db.admins.findIndex(a => a.email && a.email.toLowerCase() === gmail.toLowerCase());
    
    if (adminIndex === -1) {
        return res.status(404).json({ success: false, message: "Account not found." });
    }

    // Update password
    db.admins[adminIndex].password = newPassword;
    writeDB(db);

    // Clear OTP record
    delete recoveryOTPs[gmail.toLowerCase()];

    res.json({ success: true, message: "Password updated successfully! You can now log in." });
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
    const now = new Date();
    
    // Construct local ISO date format (YYYY-MM-DD) for clean filtering
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const isoDate = `${year}-${month}-${day}`;
    
    const newRecord = {
        id: "publish_" + Date.now(),
        type,
        title,
        content,
        fileName: fileName || null,
        fileType: fileType || null,
        createdBy,
        date: now.toLocaleString(),
        isoDate: isoDate
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