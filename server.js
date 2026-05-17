const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const { spawn } = require("child_process");
const nodemailer = require("nodemailer"); // Added for Gmail OTP

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*" }
});

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); 

// --- ⚙️ GMAIL CONFIGURATION ---
const EMAIL_USER = process.env.EMAIL_USER; 
const EMAIL_PASS = process.env.EMAIL_PASS; 

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS
    }
});

// Memory me save rakhne ke liye ki kis bache ka kya OTP hai
let otpStore = {};

// --- 🌐 ROUTES ---

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/studentlogin', (req, res) => res.sendFile(path.join(__dirname, 'studentlogin.html')));
app.get('/driverlogin', (req, res) => res.sendFile(path.join(__dirname, 'driverlogin.html')));
app.get('/adminlogin', (req, res) => res.sendFile(path.join(__dirname, 'adminlogin.html')));

app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/student.html', (req, res) => res.sendFile(path.join(__dirname, 'student.html')));
app.get('/driver.html', (req, res) => res.sendFile(path.join(__dirname, 'driver.html')));

// --- 📊 DATABASE IN MEMORY ---

let busLocations = {
    "BUS-01": { lat: null, lng: null, status: "Offline" },
    "BUS-02": { lat: null, lng: null, status: "Offline" }
};

let studentDatabase = {};
for (let i = 1; i <= 30; i++) {
    let id = `student${i < 10 ? '0' + i : i}`;
    studentDatabase[id] = { 
        id: id, 
        stop: "Not Set", 
        busSelected: "BUS-01", 
        locked: false 
    };
}

// --- 🔐 NEW OTP API (CAPTCHA REMOVED) ---

// 1. API: Send OTP to Student Gmail
app.post("/api/send-otp", async (req, res) => {
    const { username, email } = req.body; // Captcha destructive verification removed

    if (!username || !email) {
        return res.json({ success: false, message: "Username and Email are required!" });
    }

    // Validation: Check if student exists in database
    if (!studentDatabase[username]) {
        return res.json({ success: false, message: "Student ID not registered in system!" });
    }

    // 6-Digit random OTP generation
    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store OTP in memory with 5 minutes expiry
    otpStore[username] = {
        otp: generatedOtp,
        email: email,
        expires: Date.now() + 300000 // 5 Mins
    };

    // Mail send options
    const mailOptions = {
        from: EMAIL_USER,
        to: email,
        subject: "🔑 Shivalik Bus Tracker - Your Login OTP",
        html: `<h3>Hello ${username},</h3>
               <p>Your 6-Digit OTP for Shivalik College Bus Tracking System is:</p>
               <h1 style="color: #3498db; letter-spacing: 2px;">${generatedOtp}</h1>
               <p>This OTP is valid for 5 minutes only. Do not share it with anyone.</p>`
    };

    try {
        await transporter.sendMail(mailOptions);
        return res.json({ success: true, message: "OTP sent successfully!" });
    } catch (error) {
        console.error("Mail Error:", error);
        return res.json({ success: false, message: "Gmail system configuration error. Check Render Environment Variables." });
    }
});

// 2. API: Verify OTP Entered by Student
app.post("/api/verify-otp", (req, res) => {
    const { username, email, otp } = req.body;

    if (!otpStore[username]) {
        return res.json({ success: false, message: "OTP session expired or not requested!" });
    }

    const session = otpStore[username];

    // Check if OTP is expired
    if (Date.now() > session.expires) {
        delete otpStore[username];
        return res.json({ success: false, message: "OTP has expired! Please request a new one." });
    }

    // Match OTP and Email
    if (session.otp === otp && session.email === email) {
        delete otpStore[username]; // Verification ke baad delete karein security ke liye
        return res.json({ success: true, message: "Login Successful!" });
    } else {
        return res.json({ success: false, message: "Incorrect OTP! Please try again." });
    }
});


// --- 🔐 ADMIN & DRIVER ORIGINAL LOGIN API ---
app.post("/login", (req, res) => {
    const { username, password, role } = req.body;
    
    // Admin Login
    if (role === "admin" && username === "admin01" && password === "admin@123") {
        return res.json({ success: true });
    }

    // Driver Login
    const validDrivers = {
        "driver01": "bus@123", 
        "driver02": "bus@456"  
    };
    if (role === "driver" && validDrivers[username] === password) {
        return res.json({ success: true });
    }

    res.json({ success: false, message: "Invalid username or password" });
});

// --- 📡 SOCKET.IO LOGIC ---
io.on("connection", (socket) => {
    console.log(`📡 Connected: ${socket.id}`);

    socket.emit("update-all-buses", busLocations);
    socket.emit("update-admin-dashboard", Object.values(studentDatabase));

    socket.on("bus-moved", (data) => {
        const { busId, lat, lng } = data;
        if (busId && busLocations[busId]) {
            busLocations[busId] = { lat, lng, status: "Online" };
            
            io.emit("bus-moved", data); 

            const pythonProcess = spawn('python3', ['analytics.py']);
            const payload = JSON.stringify({
                bus_lat: lat,
                bus_lng: lng,
                bus_id: busId,
                students: Object.values(studentDatabase).filter(s => s.busSelected === busId)
            });

            pythonProcess.stdin.write(payload);
            pythonProcess.stdin.end();

            pythonProcess.stdout.on('data', (result) => {
                try {
                    const analysis = JSON.parse(result.toString());
                    io.emit("eta-update", { busId, analysis });
                } catch (e) { console.log("Python error"); }
            });
        }
    });

    socket.on("student-set-stop", (data) => {
        const { id, stop, busSelected } = data;
        if (studentDatabase[id]) {
            studentDatabase[id].stop = stop;
            studentDatabase[id].busSelected = busSelected || "BUS-01";
            studentDatabase[id].locked = true;
            io.emit("update-admin-dashboard", Object.values(studentDatabase));
        }
    });

    socket.on("admin-reset-student", (studentId) => {
        if (studentDatabase[studentId]) {
            studentDatabase[studentId].stop = "Not Set";
            studentDatabase[studentId].locked = false;
            io.emit("stop-updated-for-student", { id: studentId, newStop: null });
            io.emit("update-admin-dashboard", Object.values(studentDatabase));
        }
    });

    socket.on("disconnect", () => console.log(`❌ Disconnected: ${socket.id}`));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 MULTI-USER SERVER LIVE ON PORT ${PORT}`);
});
