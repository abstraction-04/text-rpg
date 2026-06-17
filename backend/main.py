# talks to local ollama API
import json
import socketio
import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Initialize FastAPI and Socket.IO
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",  # Allow all origins for easy local network testing
)
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

socket_app = socketio.ASGIApp(sio, app)

# In-memory store for active users
# Schema: { sid: { "username": str, "color": str, "avatar": str, "sid": str } }
active_users = {}

# In-memory store for chat history (sliding window memory for Ollama)
chat_history = []

@sio.event
async def connect(sid, environ):
    print(f"Client connected: {sid}")

@sio.event
async def disconnect(sid):
    print(f"Client disconnected: {sid}")
    if sid in active_users:
        user = active_users.pop(sid)
        username = user.get("username", "Someone")
        # Notify room
        await sio.emit("message", {
            "text": f"{username} has left the room.",
            "sender": "System",
            "isSystem": True,
            "isAI": False
        })
        # Broadcast updated user list
        await sio.emit("user_list", list(active_users.values()))

@sio.on("join")
async def handle_join(sid, data):
    username = data.get("username", f"User_{sid[:4]}").strip()
    color = data.get("color", "#a855f7")  # default violet
    avatar = data.get("avatar", "👤")
    
    # Store user info
    active_users[sid] = {
        "sid": sid,
        "username": username,
        "color": color,
        "avatar": avatar
    }
    
    print(f"User joined: {username} ({sid})")
    
    # Send user confirmation of their own details
    await sio.emit("join_success", {"username": username, "color": color, "avatar": avatar}, to=sid)
    
    # Notify room
    await sio.emit("message", {
        "text": f"{username} has joined the room!",
        "sender": "System",
        "isSystem": True,
        "isAI": False
    })
    
    # Broadcast updated user list to everyone
    await sio.emit("user_list", list(active_users.values()))

@sio.on("typing")
async def handle_typing(sid, data):
    is_typing = data.get("isTyping", False)
    user = active_users.get(sid)
    if user:
        # Broadcast who is typing to other clients
        await sio.emit("user_typing", {
            "username": user["username"],
            "isTyping": is_typing
        }, skip_sid=sid)

@sio.on("message")
async def handle_message(sid, data):
    user_text = data.get("text", "").strip()
    if not user_text:
        return
    
    # Get sender info
    user = active_users.get(sid, {"username": "Anonymous", "color": "#cbd5e1", "avatar": "👤"})
    username = user.get("username")
    avatar = user.get("avatar")
    color = user.get("color")
    
    # Check for reset command
    if user_text.lower().startswith("/reset"):
        chat_history.clear()
        await sio.emit("message", {
            "text": "🧙‍♂️ The Dungeon Master's memory has been reset! A new adventure begins...",
            "sender": "System",
            "isSystem": True,
            "isAI": False
        })
        return
    
    # Check if we should trigger Ollama
    # Trigger conditions:
    # 1. Message starts with /ai or /ollama
    # 2. Message mentions @ollama or @ai
    trigger_ai = False
    prompt_content = user_text
    
    if user_text.lower().startswith(("/ai", "/ollama")):
        trigger_ai = True
        prompt_content = user_text[user_text.find(" ") + 1:] if " " in user_text else ""
    elif "@ollama" in user_text.lower() or "@ai" in user_text.lower():
        trigger_ai = True
        prompt_content = user_text.replace("@ollama", "").replace("@ai", "").replace("@Ollama", "").replace("@AI", "").strip()

    if trigger_ai and not prompt_content.strip():
        await sio.emit("message", {
            "text": "Please provide a prompt for Ollama! Example: `@ollama write a story`",
            "sender": "System",
            "isSystem": True,
            "isAI": False
        })
        return

    # Add player message to history
    chat_history.append({"role": "user", "content": f"{username}: {user_text}"})

    # Broadcast user message to everyone
    await sio.emit("message", {
        "text": user_text,
        "sender": username,
        "avatar": avatar,
        "color": color,
        "isSystem": False,
        "isAI": False
    })
    
    if trigger_ai:
        model_name = data.get("model", "llama3.2:3b")
        system_prompt = data.get("systemPrompt", "You are a helpful AI assistant.")
        await stream_ollama_response(prompt_content, model_name, system_prompt)

async def stream_ollama_response(prompt, model_name, system_prompt):
    # Tell the frontend the AI is starting to generate
    await sio.emit("ai_typing", {"status": True})
    
    # Emit an initial empty AI message bubble
    await sio.emit("message", {
        "text": "",
        "sender": f"Ollama ({model_name})",
        "avatar": "🦙",
        "color": "#10b981",  # emerald green
        "isSystem": False,
        "isAI": True,
        "isStreaming": True
    })
    
    full_response = ""
    
    try:
        # Build messages including system prompt and the sliding window history (e.g. last 30 messages)
        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(chat_history[-30:])
        
        # Use httpx to fetch from local Ollama API asynchronously with streaming
        # This keeps the server event loop free to handle other users' chat messages!
        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                "POST",
                "http://localhost:11434/api/chat",
                json={
                    "model": model_name,
                    "messages": messages,
                    "stream": True,
                    "options": {
                        "num_ctx": 8192  # Increase context length to 8k tokens so the DM doesn't forget lore
                    }
                }
            ) as response:
                if response.status_code != 200:
                    raise Exception(f"Ollama API returned status code {response.status_code}")
                    
                async for line in response.aiter_lines():
                    if line:
                        try:
                            chunk = json.loads(line)
                            content = chunk.get("message", {}).get("content", "")
                            if content:
                                full_response += content
                                await sio.emit("message_chunk", {"text": content})
                        except Exception as e:
                            print(f"Error parsing chunk: {e}")
                            
        # Append assistant response to history
        if full_response.strip():
            chat_history.append({"role": "assistant", "content": full_response.strip()})
                        
    except Exception as e:
        print(f"Ollama connection error: {e}")
        # Send error details to user
        await sio.emit("message_chunk", {
            "text": f"⚠️ **Error communicating with Ollama:** {str(e)}\n\nMake sure Ollama is running locally (`ollama run {model_name}`) and listening on `http://localhost:11434`."
        })
        
    # Signal that the AI is done
    await sio.emit("ai_typing", {"status": False})
    await sio.emit("message_chunk_end", {})
