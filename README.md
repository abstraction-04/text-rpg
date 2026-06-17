# 🦙 OllaChat — Real-Time AI Roleplay & D&D Chatroom

OllaChat is a modern, full-stack real-time multiplayer chatroom designed for tabletop roleplaying (TTRPG) and D&D campaigns. It allows a group of players to connect over the internet and play together with a local **Ollama AI model** serving as the **Dungeon Master**.

The application features a sleek dark-mode user interface, live typing indicators, custom player avatars, and persistent DM conversational memory.

---

## 🌟 Key Features

* **🧙‍♂️ Dynamic Dungeon Master Memory**: Integrates sliding-window conversational memory (remembers the last 30 messages in the room). The backend automatically prefixes player messages with their usernames, giving the AI full context on *who* did *what*.
* **⚡ Optimized Context Size**: Configures Ollama's `num_ctx` to **8,192 tokens** so the Dungeon Master doesn't forget campaign lore, inventory items, or character sheets during long sessions.
* **💬 Real-Time Multiplayer**: Built with Socket.IO and FastAPI for instant message broadcasting, active player lists, and user typing notifications.
* **🎨 Customizable Player Profiles**: Choose from 14 avatars and 6 chat colors to represent your character in the lobby.
* **🔮 Live Streaming Responses**: Watch the Dungeon Master write their descriptions character-by-character in real-time.
* **🔄 Memory Reset Command**: Simply type `/reset` in the chatbox to clear the Dungeon Master's memory and start a new campaign.

---

## 🛠️ Tech Stack

* **Frontend**: Next.js (React 19), TailwindCSS, Socket.IO Client.
* **Backend**: Python 3, FastAPI, Python-SocketIO, HTTPX (for asynchronous, non-blocking Ollama API requests).
* **AI Model Engine**: Ollama (runs locally on your machine).

---

## 🚀 Getting Started

### Prerequisites
* [Node.js](https://nodejs.org/) (v18+ recommended)
* [Python 3.10+](https://www.python.org/)
* [Ollama](https://ollama.com/) (installed and running locally)

---

### Step 1: Set Up & Run Ollama
1. Open your terminal and run Ollama:
   ```bash
   ollama run llama3.2:3b
   ```
   *(You can use any model, such as `llama3`, `mistral`, or `gemma`)*

---

### Step 2: Set Up the Backend
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create and activate a Python virtual environment:
   ```bash
   python3 -m venv myenv
   source myenv/bin/activate  # On Windows, use: myenv\Scripts\activate
   ```
3. Install the required libraries:
   ```bash
   pip install fastapi uvicorn python-socketio httpx
   ```
4. Start the FastAPI Socket.IO server:
   ```bash
   uvicorn main:socket_app --host 0.0.0.0 --port 8000 --reload
   ```

---

### Step 3: Set Up the Frontend
1. Open a new terminal tab and navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the production application (recommended for stable multiplayer/tunnel connections):
   ```bash
   npm run build
   ```
4. Start the server:
   ```bash
   npm run start
   ```
   *(Your app will now be running locally at http://localhost:3000)*

---

## 🌐 Playing with Friends (Exposing the Tunnels)

Since Ollama runs on your local machine using your GPU, you should host the servers locally and tunnel them to invite friends.

We recommend **Cloudflare Quick Tunnels** (TryCloudflare) because they are free, secure (`https`), and **do not show interstitial warning pages** that block WebSocket handshakes.

1. **Tunnel the Backend (Port 8000)**:
   ```bash
   npx cloudflared tunnel --url http://localhost:8000
   ```
   *Copy the secure TryCloudflare URL generated (e.g., `https://xxxx.trycloudflare.com`).*

2. **Tunnel the Frontend (Port 3000)**:
   ```bash
   npx cloudflared tunnel --url http://localhost:3000
   ```
   *Copy the frontend TryCloudflare URL and send it to your friends.*

3. **Connecting**:
   * Open the frontend URL in your browser.
   * Paste the **Backend Tunnel URL** (starting with `https://`) into the **Backend Server URL** input field on the welcome screen.
   * Enter your username, choose an avatar, and click **Connect**!

---

## 🎮 Campaign Commands

* **`/reset`**: Clears the DM's memory history for the lobby so you can start a fresh adventure.
* **`/ai <your prompt>`** or **`@ollama <your prompt>`**: Explicitly summons the Dungeon Master to respond to the conversation.
* **Auto-Respond Mode**: Toggle "Auto-Respond" in the UI sidebar to make the Dungeon Master respond automatically to every message sent in the chat.