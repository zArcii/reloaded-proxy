"use strict";

const form = document.getElementById("sj-form");
const address = document.getElementById("sj-address");
const searchEngine = document.getElementById("sj-search-engine");
const error = document.getElementById("sj-error");
const errorCode = document.getElementById("sj-error-code");
const framesContainer = document.getElementById("frames-container");
const tabsList = document.getElementById("tabs-list");
const mainContent = document.getElementById("main-content");
const addTabBtn = document.getElementById("add-tab");

const { ScramjetController } = $scramjetLoadController();
const scramjet = new ScramjetController({
	files: {
		wasm: "/scram/scramjet.wasm.wasm",
		all: "/scram/scramjet.all.js",
		sync: "/scram/scramjet.sync.js",
	},
});

scramjet.init();
const connection = new BareMux.BareMuxConnection("/baremux/worker.js");

let tabs = [];
let activeTabId = null;

async function setupTransport() {
	let wispUrl = "wss://reloadedproxy.onrender.com/wisp/";
	if ((await connection.getTransport()) !== "/libcurl/index.mjs") {
		await connection.setTransport("/libcurl/index.mjs", [{ websocket: wispUrl }]);
	}
}

function createTab(url = null) {
	const id = Date.now().toString();
	const frameObj = scramjet.createFrame();
	frameObj.frame.classList.add("frame-overlay");

	const container = document.createElement("div");
	container.id = `container-${id}`;
	container.className = "frame-container";
	container.appendChild(frameObj.frame);
	framesContainer.appendChild(container);

	const tabEl = document.createElement("div");
	tabEl.id = `tab-${id}`;
	tabEl.className = "tab";
	tabEl.innerHTML = `
        <span class="tab-title">New Tab</span>
        <span class="tab-close" onclick="event.stopPropagation(); closeTab('${id}')">&times;</span>
    `;
	tabEl.onclick = () => switchTab(id);
	tabsList.appendChild(tabEl);

	const tabData = { id, frame: frameObj, container, tabEl };
	tabs.push(tabData);

	if (url) {
		frameObj.go(url);
	}

	switchTab(id);
	return tabData;
}

function switchTab(id) {
	if (id === null) {
		activeTabId = null;
		mainContent.classList.remove("hidden");
		tabs.forEach(t => {
			t.container.classList.remove("active");
			t.tabEl.classList.remove("active");
		});
		return;
	}

	activeTabId = id;
	mainContent.classList.add("hidden");

	tabs.forEach((t) => {
		if (t.id === id) {
			t.container.classList.add("active");
			t.tabEl.classList.add("active");
		} else {
			t.container.classList.remove("active");
			t.tabEl.classList.remove("active");
		}
	});
}

window.closeTab = function (id) {
	const index = tabs.findIndex((t) => t.id === id);
	if (index === -1) return;
	tabs[index].container.remove();
	tabs[index].tabEl.remove();
	tabs.splice(index, 1);
	if (activeTabId === id) switchTab(tabs.length > 0 ? tabs[tabs.length - 1].id : null);
};

addTabBtn.onclick = () => { switchTab(null); address.focus(); };

form.addEventListener("submit", async (event) => {
	event.preventDefault();
	try { await registerSW(); } catch (err) { }
	const url = search(address.value, searchEngine.value);
	await setupTransport();
	createTab(url);
	address.value = "";
});

// REAL CHAT LOGIC via WebSockets
const chatMessages = document.getElementById("chat-messages");
const msgInput = document.getElementById("msg-input");
const sendBtn = document.querySelector(".btn-send");
const roomItems = document.querySelectorAll(".room-item");

let currentRoom = "Public Square";
let ws;
let username = localStorage.getItem("reloaded-user") || "User" + Math.floor(Math.random() * 1000);

function connectChat() {
	const protocol = location.protocol === "https:" ? "wss:" : "ws:";
	// Point to Render backend for chat
	ws = new WebSocket(`${protocol}//reloadedproxy.onrender.com/chat`);

	ws.onopen = () => {
		ws.send(JSON.stringify({ type: "join", room: currentRoom }));
	};

	ws.onmessage = (event) => {
		const msg = JSON.parse(event.data);
		if (msg.type === "chat" && msg.room === currentRoom) {
			appendMessage(msg.user, msg.text);
		}
	};

	ws.onclose = () => {
		setTimeout(connectChat, 3000); // Reconnect
	};
}

function appendMessage(user, text) {
	const div = document.createElement("div");
	div.style.padding = "8px 15px";
	div.style.borderRadius = "15px";
	div.style.background = "rgba(255,255,255,0.03)";
	div.style.marginBottom = "8px";
	div.style.alignSelf = user === username ? "flex-end" : "flex-start";
	div.style.maxWidth = "80%";
	div.innerHTML = `<span style="color: var(--accent-color); font-weight: 600; font-size: 0.8rem; display: block; margin-bottom: 2px;">${user}</span>${text}`;
	chatMessages.appendChild(div);
	chatMessages.scrollTop = chatMessages.scrollHeight;
}

function sendMessage() {
	const text = msgInput.value.trim();
	if (!text || ws.readyState !== 1) return;

	ws.send(JSON.stringify({ type: "chat", user: username, text: text }));
	msgInput.value = "";
}

sendBtn.onclick = sendMessage;
msgInput.onkeypress = (e) => { if (e.key === "Enter") sendMessage(); };

roomItems.forEach(item => {
	item.addEventListener("click", () => {
		if (item.textContent.includes("+")) {
			const name = prompt("Enter private room name:");
			if (name) createRoom(name);
			return;
		}
		selectRoom(item, item.textContent);
	});
});

function createRoom(name) {
	const newRoom = document.createElement("div");
	newRoom.className = "room-item";
	newRoom.textContent = name;
	newRoom.onclick = () => selectRoom(newRoom, name);
	document.querySelector(".chat-sidebar").insertBefore(newRoom, document.querySelector(".chat-sidebar > div:last-child"));
	selectRoom(newRoom, name);
}

function selectRoom(el, name) {
	document.querySelectorAll(".room-item").forEach(i => i.classList.remove("active"));
	el.classList.add("active");
	currentRoom = name;
	chatMessages.innerHTML = `<div style="opacity: 0.3; font-size: 0.7rem; text-align: center; margin-bottom: 20px;">Connected to # ${name}</div>`;
	if (ws && ws.readyState === 1) {
		ws.send(JSON.stringify({ type: "join", room: currentRoom }));
	}
}

// Ask for username on first chat visit
window.addEventListener("load", () => {
	connectChat();
	if (!localStorage.getItem("reloaded-user")) {
		const val = prompt("Enter a username for chat:");
		if (val) {
			username = val;
			localStorage.setItem("reloaded-user", val);
		}
	}
});
