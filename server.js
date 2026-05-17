const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const { spawn } = require("child_process");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*" }
});

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); 

// --- 🔐 SECURE ADMIN CONFIGURATION ---
// Ab admin ka password code me nahi, Render dashboard me secure rahega
const ADMIN_USER = process.env.ADMIN_USER || "admin01";
const ADMIN_PASS = process.env.ADMIN_PASS || "admin@123"; // Fallback agar env na mile

// Memory me active sessions track karne ke liye
let activeAdminSessions = new Set();

// Middleware: Jo check karega ki request karne wala asli Admin hai ya nahi
function requireAdmin(req, res, next) {
    // Ye check karega ki kya browser ke paas valid admin session token hai
    const adminToken = req.query.token || req.headers['x-admin-token'];
    
    if (activeAdminSessions.has(adminToken)) {
        next(); // Agar token sahi hai toh page kholne do
    } else {
        // Agar koi seedha URL kholne ki koshish kare toh login page par fek do
        res.status(401).send(`
            <script>
                alert('⚠️ Unauthorized Access! Please login first.');
                window.location.href = '/adminlogin';
            </script>
        `);
    }
}

// Memory me save rakhne ke liye ki kis bache ka kya OTP hai
let otpStore = {};

// --- 🌐 ROUTES ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/studentlogin', (req, res) => res.sendFile(path.join(__dirname, 'studentlogin.html')));
app.get('/driverlogin', (req, res) => res.sendFile(path.join(__dirname, 'driverlogin.html')));
app.get('/adminlogin', (req, res) => res.sendFile(path.join(__dirname, 'adminlogin.html')));

// 🔥 SECURED ROUTE: Ab bina login kiye koi bhi admin.html nahi khol payega
app.get('/admin.html', requireAdmin, (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

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

// --- 🔐 OTP API ---
app.post("/api/send-otp", async (req, res) => {
    const { username, email } = req.body;
    if (!username || !email) return res.json({ success: false, message: "Username and Email are required!" });
    if (!studentDatabase[username]) return res.json({ success: false, message: "Student ID not registered!" });

    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore[username] = { otp: generatedOtp, email: email, expires: Date.now() + 300000 };

    console.log(`🔑 Generated OTP for ${username}: ${generatedOtp}`);
    return res.json({ success: true, message: "OTP generated!", testingOtp: generatedOtp });
});

app.post("/api/verify-otp", (req, res) => {
    const { username, email, otp } = req.body;
    if (!otpStore[username]) return res.json({ success: false, message: "OTP expired!" });
    const session = otpStore[username];

    if (Date.now() > session.expires) {
        delete otpStore[username];
        return res.json({ success: false, message: "OTP has expired!" });
    }

    if (session.otp === otp && session.email === email) {
        delete otpStore[username]; 
        return res.json({ success: true, message: "Login Successful!" });
    } else {
        return res.json({ success: false, message: "Incorrect OTP!" });
    }
});

// --- 🔐 UPDATED LOGIN API FOR ADMIN & DRIVER ---
app.post("/login", (req, res) => {
    const { username, password, role } = req.body;
    
    // 🔥 Secure Admin Login Logic
    if (role === "admin") {
        if (username === ADMIN_USER && password === ADMIN_PASS) {
            // Ek unique secure token generate kiya
            const secureToken = "token_" + Math.random().toString(36).substr(2) + Date.now().toString(36);
            activeAdminSessions.add(secureToken); // Token ko memory me save kiya

            // Frontend ko token bhej rahe hain
            return res.json({ success: true, token: secureToken });
        } else {
            return res.json({ success: false, message: "Wrong Admin Credentials!" });
        }
    }

    // Driver Login
    const validDrivers = { "driver01": "bus@123", "driver02": "bus@456" };
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
