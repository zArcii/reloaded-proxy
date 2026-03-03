import { createServer } from "node:http";
import { fileURLToPath } from "url";
import { hostname } from "node:os";
import { server as wisp, logging } from "@mercuryworkshop/wisp-js/server";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";

import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { libcurlPath } from "@mercuryworkshop/libcurl-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";

const publicPath = fileURLToPath(new URL("../public/", import.meta.url));

// Wisp Configuration: Refer to the documentation at https://www.npmjs.com/package/@mercuryworkshop/wisp-js

logging.set_level(logging.NONE);
Object.assign(wisp.options, {
	allow_udp_streams: false,
	hostname_blacklist: [/example\.com/],
	dns_servers: ["1.1.1.3", "1.0.0.3"],
});

import { WebSocketServer } from "ws";

const wss = new WebSocketServer({ noServer: true });
const rooms = new Map(); // roomName -> Set of sockets

wss.on("connection", (ws, req) => {
	let currentRoom = "Public Square";

	ws.on("message", (data) => {
		try {
			const msg = JSON.parse(data.toString());
			if (msg.type === "join") {
				// Remove from old room
				if (rooms.has(currentRoom)) rooms.get(currentRoom).delete(ws);
				currentRoom = msg.room;
				// Add to new room
				if (!rooms.has(currentRoom)) rooms.set(currentRoom, new Set());
				rooms.get(currentRoom).add(ws);
			} else if (msg.type === "chat") {
				const broadcast = JSON.stringify({ type: "chat", user: msg.user, text: msg.text, room: currentRoom });
				if (rooms.has(currentRoom)) {
					for (const client of rooms.get(currentRoom)) {
						if (client.readyState === 1) client.send(broadcast);
					}
				}
			}
		} catch (e) { }
	});

	ws.on("close", () => {
		if (rooms.has(currentRoom)) rooms.get(currentRoom).delete(ws);
	});
});

const fastify = Fastify({
	serverFactory: (handler) => {
		const server = createServer()
			.on("request", (req, res) => {
				res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
				res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
				handler(req, res);
			})
			.on("upgrade", (req, socket, head) => {
				if (req.url.endsWith("/wisp/")) {
					wisp.routeRequest(req, socket, head);
				} else if (req.url.endsWith("/chat")) {
					wss.handleUpgrade(req, socket, head, (ws) => {
						wss.emit("connection", ws, req);
					});
				} else {
					socket.end();
				}
			});
		return server;
	},
});

fastify.register(fastifyStatic, {
	root: publicPath,
	decorateReply: true,
});

fastify.register(fastifyStatic, {
	root: scramjetPath,
	prefix: "/scram/",
	decorateReply: false,
});

fastify.register(fastifyStatic, {
	root: libcurlPath,
	prefix: "/libcurl/",
	decorateReply: false,
});

fastify.register(fastifyStatic, {
	root: baremuxPath,
	prefix: "/baremux/",
	decorateReply: false,
});

fastify.setNotFoundHandler((res, reply) => {
	return reply.code(404).type("text/html").sendFile("404.html");
});

fastify.server.on("listening", () => {
	const address = fastify.server.address();

	// by default we are listening on 0.0.0.0 (every interface)
	// we just need to list a few
	console.log("Listening on:");
	console.log(`\thttp://localhost:${address.port}`);
	console.log(`\thttp://${hostname()}:${address.port}`);
	console.log(
		`\thttp://${address.family === "IPv6" ? `[${address.address}]` : address.address
		}:${address.port}`
	);
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function shutdown() {
	console.log("SIGTERM signal received: closing HTTP server");
	fastify.close();
	process.exit(0);
}

let port = parseInt(process.env.PORT || "");

if (isNaN(port)) port = 8080;

fastify.listen({
	port: port,
	host: "0.0.0.0",
});
