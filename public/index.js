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
// Tab system
addTabBtn.onclick = () => {
	switchTab(null);
	address.focus();
};

function updateTabTitles() {
	tabs.forEach(t => {
		try {
			// Try to get the title from the iframe
			const title = t.frame.frame.contentWindow ? t.frame.frame.contentDocument.title : null;
			if (title && title !== "" && title !== "Scramjet") {
				const titleEl = t.tabEl.querySelector(".tab-title");
				if (titleEl && titleEl.textContent !== title) {
					titleEl.textContent = title;
				}
			}
		} catch (e) {
			// Probably a cross-origin or loading issue, ignore
		}
	});
}

setInterval(updateTabTitles, 1000);

form.addEventListener("submit", async (event) => {
	event.preventDefault();
	if (!address.value.trim()) return;

	try {
		await registerSW();
	} catch (err) {
		console.error("SW failed:", err);
	}

	const url = search(address.value, searchEngine.value);
	await setupTransport();
	createTab(url);
	address.value = "";
});
