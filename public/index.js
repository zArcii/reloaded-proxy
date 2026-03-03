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
		// Show home screen (Browser home)
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
			try {
				const title = t.frame.frame.contentDocument.title;
				if (title) t.tabEl.querySelector(".tab-title").textContent = title;
			} catch (e) { }
		} else {
			t.container.classList.remove("active");
			t.tabEl.classList.remove("active");
		}
	});
}

window.closeTab = function (id) {
	const index = tabs.findIndex((t) => t.id === id);
	if (index === -1) return;

	const tab = tabs[index];
	tab.container.remove();
	tab.tabEl.remove();
	tabs.splice(index, 1);

	if (activeTabId === id) {
		if (tabs.length > 0) {
			switchTab(tabs[tabs.length - 1].id);
		} else {
			switchTab(null);
		}
	}
};

addTabBtn.onclick = () => {
	switchTab(null);
	address.focus();
};

form.addEventListener("submit", async (event) => {
	event.preventDefault();

	try {
		await registerSW();
	} catch (err) {
		error.textContent = "Failed to register service worker.";
		errorCode.textContent = err.toString();
		throw err;
	}

	const url = search(address.value, searchEngine.value);
	await setupTransport();

	createTab(url);
	address.value = "";
});

// Chat Logic
const chatMessages = document.getElementById("chat-messages");
const msgInput = document.getElementById("msg-input");
const sendBtn = document.querySelector(".btn-send");
const roomItems = document.querySelectorAll(".room-item");

let currentRoom = "Public Square";
let chatData = {
	"Public Square": [{ user: "System", text: "Welcome to the Public Square!" }],
	"Gaming Room": [{ user: "System", text: "Welcome to the Gaming Room!" }],
	"Dev Chat": [{ user: "System", text: "Welcome to the Dev Chat!" }]
};

function renderMessages() {
	chatMessages.innerHTML = `<div style="opacity: 0.5; font-size: 0.8rem; text-align: center;">Welcome to Reloaded ${currentRoom}</div>`;
	(chatData[currentRoom] || []).forEach(msg => {
		const div = document.createElement("div");
		div.style.padding = "5px 10px";
		div.style.borderRadius = "10px";
		div.style.background = "rgba(255,255,255,0.05)";
		div.style.marginBottom = "5px";
		div.innerHTML = `<span style="color: var(--accent-color); font-weight: 600;">${msg.user}:</span> ${msg.text}`;
		chatMessages.appendChild(div);
	});
	chatMessages.scrollTop = chatMessages.scrollHeight;
}

sendBtn.onclick = sendMessage;
msgInput.onkeypress = (e) => { if (e.key === "Enter") sendMessage(); };

function sendMessage() {
	const text = msgInput.value.trim();
	if (!text) return;

	if (!chatData[currentRoom]) chatData[currentRoom] = [];
	chatData[currentRoom].push({ user: "You", text });
	msgInput.value = "";
	renderMessages();
}

roomItems.forEach(item => {
	item.onclick = () => {
		if (item.textContent.includes("+")) {
			const name = prompt("Enter private room name:");
			if (name) {
				const newRoom = document.createElement("div");
				newRoom.className = "room-item";
				newRoom.textContent = name;
				newRoom.onclick = () => selectRoom(newRoom, name);
				item.parentElement.insertBefore(newRoom, item);
				chatData[name] = [{ user: "System", text: `Private room ${name} created.` }];
				selectRoom(newRoom, name);
			}
			return;
		}
		selectRoom(item, item.textContent);
	};
});

function selectRoom(el, name) {
	document.querySelectorAll(".room-item").forEach(i => i.classList.remove("active"));
	el.classList.add("active");
	currentRoom = name;
	renderMessages();
}
