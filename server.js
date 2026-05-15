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

// --- 🌐 ROUTES ---

// Home Page: Ab ye index.html dikhayega (Choice Page)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Login Pages
app.get('/studentlogin', (req, res) => res.sendFile(path.join(__dirname, 'studentlogin.html')));
app.get('/driverlogin', (req, res) => res.sendFile(path.join(__dirname, 'driverlogin.html')));
app.get('/adminlogin', (req, res) => res.sendFile(path.join(__dirname, 'adminlogin.html')));

// Dashboards
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/student.html', (req, res) => res.sendFile(path.join(__dirname, 'student.html')));
app.get('/driver.html', (req, res) => res.sendFile(path.join(__dirname, 'driver.html')));

// --- 📊 DATABASE IN MEMORY ---

// 1. Multiple Buses Storage
let busLocations = {
    "BUS-01": { lat: null, lng: null, status: "Offline" },
    "BUS-02": { lat: null, lng: null, status: "Offline" }
};

// 2. Auto-Generate 30 Students (student01 to student30)
let studentDatabase = {};
for (let i = 1; i <= 30; i++) {
    let id = `student${i < 10 ? '0' + i : i}`;
    studentDatabase[id] = { 
        id: id, 
        stop: "Not Set", 
        busSelected: "BUS-01", // Default bus
        locked: false 
    };
}

// --- 🔐 LOGIN API ---
app.post("/login", (req, res) => {
    const { username, password, role } = req.body;
    
    // Admin Login
    if (role === "admin" && username === "admin01" && password === "admin@123") {
        return res.json({ success: true });
    }

    // Driver Login (Multi-Driver Support)
    const validDrivers = {
        "driver01": "bus@123", // For BUS-01
        "driver02": "bus@456"  // For BUS-02
    };
    if (role === "driver" && validDrivers[username] === password) {
        return res.json({ success: true });
    }

    // Student Login (Validates any of the 30 students)
    if (role === "student" && studentDatabase[username] && password === "std@123") {
        return res.json({ success: true });
    }

    res.json({ success: false, message: "Invalid username or password" });
});

// --- 📡 SOCKET.IO LOGIC ---
io.on("connection", (socket) => {
    console.log(`📡 Connected: ${socket.id}`);

    // Naye user ko current data bhejna
    socket.emit("update-all-buses", busLocations);
    socket.emit("update-admin-dashboard", Object.values(studentDatabase));

    // Jab koi bus move kare (Driver side se)
    socket.on("bus-moved", (data) => {
        // Expected data: { busId: "BUS-01", lat: 12.3, lng: 45.6 }
        const { busId, lat, lng } = data;
        if (busId && busLocations[busId]) {
            busLocations[busId] = { lat, lng, status: "Online" };
            
            // Sabko updated locations bhejna
            io.emit("bus-moved", data); 

            // Python Analytics trigger karna
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

    // Student stop set kare
    socket.on("student-set-stop", (data) => {
        const { id, stop, busSelected } = data;
        if (studentDatabase[id]) {
            studentDatabase[id].stop = stop;
            studentDatabase[id].busSelected = busSelected || "BUS-01";
            studentDatabase[id].locked = true;
            io.emit("update-admin-dashboard", Object.values(studentDatabase));
        }
    });

    // Admin reset kare
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
