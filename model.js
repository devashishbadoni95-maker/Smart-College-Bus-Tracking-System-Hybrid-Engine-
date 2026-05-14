const mongoose = require('mongoose');

// 1. User Schema (For Login)
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }, // Isse hum bcrypt se hash karenge
    role: { type: String, enum: ['driver', 'student'], required: true },
    assignedBus: { type: String }, // Agar driver hai toh
    stopLocation: { 
        lat: Number, 
        lng: Number,
        name: String 
    } // Agar student hai toh
});

// 2. Bus Location Schema (History ke liye)
const busLogSchema = new mongoose.Schema({
    busId: String,
    route: String,
    lastLocation: { lat: Number, lng: Number },
    lastUpdated: { type: Date, default: Date.now }
});

module.exports = {
    User: mongoose.model('User', userSchema),
    BusLog: mongoose.model('BusLog', busLogSchema)
};