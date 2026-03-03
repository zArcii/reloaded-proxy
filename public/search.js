"use strict";
/**
 *
 * @param {string} input
 * @param {string} template Template for a search query.
 * @returns {string} Fully qualified URL
 */
function search(input, template) {
	let url = "";

	try {
		// input is a valid URL:
		url = new URL(input).toString();
	} catch (err) {
		try {
			// input is a valid URL when http:// is added to the start:
			const tempUrl = new URL(`http://${input}`);
			// only if the hostname has a TLD/subdomain
			if (tempUrl.hostname.includes(".")) url = tempUrl.toString();
		} catch (err) {
			// input was not valid URL
		}
	}

	// Treat the input as a search query if no URL was found
	if (!url) {
		url = template.replace("%s", encodeURIComponent(input));
	}

	// YouTube Bypass for Render IPs
	// Redirects to yewtu.be (an Invidious instance) to avoid login walls/bot checks
	if (url.includes("youtube.com") || url.includes("youtu.be")) {
		// Replace youtube.com with yewtu.be
		url = url.replace(/youtube\.com|youtu\.be/g, "yewtu.be");
		// Normalize paths for Invidious
		if (url.includes("/watch?v=")) {
			url = url.replace("/watch?v=", "/watch?v="); // Invidious uses the same format
		}
	}

	return url;
}
