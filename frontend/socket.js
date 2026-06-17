"use client";

import { io } from "socket.io-client";

// 1. Determine the correct backend host dynamically
const getBackendUrl = () => {
    // Prevent execution breaks during Next.js server-side compilation
    if (typeof window === "undefined") {
        return "http://localhost:8000";
    }

    // Extract the hostname (e.g., 'localhost' or '192.168.29.112')
    const hostname = window.location.hostname;

    // Point to your FastAPI port running on that same host machine
    return `http://${hostname}:8000`;
};

// 2. Initialize the single socket instance dynamically
export const socket = io(getBackendUrl(), {
    path: "/socket.io/",
    transports: ["websocket"],
    reconnection: true,
    reconnectionAttempts: 5,
});