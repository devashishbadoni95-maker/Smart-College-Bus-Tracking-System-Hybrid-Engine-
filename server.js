const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const { spawn } = require("child_process"); // <--- Multi-language support ke liye

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*", }
});

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); 

// --- DATABASE IN MEMORY ---
let lastBusLocation = null;
let studentDatabase = {
    "student01": { id: "student01", stop: "Main Gate", locked: false },
    "student02": { id: "student02", stop: "Hostel A", locked: false }
};

// 🔐 LOGIN API
app.post("/login", (req, res) => {
    const { username, password, role } = req.body;
    
    if ((role === "driver" && username === "driver01" && password === "bus@123") ||
        (role === "student" && (username === "student01" || username === "student02") && password === "std@123") ||
        (role === "admin" && username === "admin01" && password === "admin@123")) {
        
        // C++ Engine ko trigger karna jab Admin login kare
        if(role === "admin") {
            const cppEngine = spawn('./optimizer', ['check']);
            cppEngine.stdout.on('data', (data) => console.log(`C++ Status: ${data}`));
        }

        return res.json({ success: true });
    }
    res.json({ success: false, message: "Invalid credentials" });
});

// 📡 SOCKET.IO LOGIC
io.on("connection", (socket) => {
    console.log(`📡 New Device Connected: ${socket.id}`);

    if (lastBusLocation) socket.emit("bus-moved", lastBusLocation);
    socket.emit("update-admin-dashboard", Object.values(studentDatabase));

    // 1. Driver Side: Location Update + PYTHON ANALYTICS
    socket.on("bus-moved", (data) => {
        if (data && data.lat && data.lng) {
            lastBusLocation = data; 
            io.emit("bus-moved", data);

            // --- PYTHON INTEGRATION START ---
            // Hum Python ko bus ki location aur students ke stops bhej rahe hain
            const pythonProcess = spawn('python', ['analytics.py']);
            
            const payload = JSON.stringify({
                bus_lat: data.lat,
                bus_lng: data.lng,
                students: Object.values(studentDatabase)
            });

            pythonProcess.stdin.write(payload);
            pythonProcess.stdin.end();

            pythonProcess.stdout.on('data', (result) => {
                try {
                    const analysis = JSON.parse(result.toString());
                    // Har student ko uska personal ETA update bhejna
                    io.emit("eta-update", analysis);
                } catch (e) {
                    console.log("Python script error or invalid JSON");
                }
            });
            // --- PYTHON INTEGRATION END ---
        }
    });

    socket.on("student-set-stop", (data) => {
        const { id, stop } = data;
        if (studentDatabase[id]) {
            studentDatabase[id].stop = stop;
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

    socket.on("disconnect", () => {
        console.log(`❌ Device disconnected: ${socket.id}`);
    });
});

const PORT = 3000;
server.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 TRACKING SERVER IS LIVE ON PORT ${PORT}`);
});