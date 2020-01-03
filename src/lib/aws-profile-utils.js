// based on https://github.com/aws/aws-sdk-js/blob/cb1604ca89a077ffdb86127884292d3b18c8b4df/lib/shared-ini/ini-loader.js
const os = require("os");
const path = require("path");
const fs = require("fs");

function getProfiles() {
	const sharedCredFile =
		process.env.AWS_SHARED_CREDENTIALS_FILE || getDefaultFilePath(false);
	const configFile = process.env.AWS_CONFIG_FILE || getDefaultFilePath(true);

	const sharedCred = parseFile(sharedCredFile, false);
	const config = parseFile(configFile, true);

	return {
		sharedCred,
		config
	};
}

function replaceProfiles({ sharedCred, config }) {
	const sharedCredFile =
		process.env.AWS_SHARED_CREDENTIALS_FILE || getDefaultFilePath(false);
	const configFile = process.env.AWS_CONFIG_FILE || getDefaultFilePath(true);

	writeFile(sharedCredFile, sharedCred, false);
	writeFile(configFile, config, true);
}

function writeFile(filename, content, isConfig) {
	const profileNames = Object.keys(content);
	const data = profileNames.reduce((acc, name) => {
		acc += isConfig ? `[profile ${name}]\n` : `[${name}]\n`;
		const profile = content[name];
		Object.keys(profile).forEach(field => (acc += `${field} = ${profile[field]}\n`));
		acc += "\n";
		return acc;
	}, "");

	fs.writeFileSync(filename, data);
}

function parseFile(filename, isConfig) {
	const content = parse(fs.readFileSync(filename, "utf-8"));
	const tmpContent = {};
	Object.keys(content).forEach(function(profileName) {
		const profileContent = content[profileName];
		profileName = isConfig ? profileName.replace(/^profile\s/, "") : profileName;
		Object.defineProperty(tmpContent, profileName, {
			value: profileContent,
			enumerable: true,
			writable: true
		});
	});
	return tmpContent;
}

function parse(ini) {
	let currentSection;
	const map = {};
	arrayEach(ini.split(/\r?\n/), function(line) {
		line = line.split(/(^|\s)[;#]/)[0]; // remove comments

		// e.g.
		// line = "[dev]"
		// section = [ '[dev]', 'dev', index: 0, input: '[dev]', groups: undefined ]
		const section = line.match(/^\s*\[([^[\]]+)\]\s*$/);
		if (section) {
			currentSection = section[1];
		} else if (currentSection) {
			// e.g.
			// line = "aws_access_key_id=foo"
			// item = [ 'aws_access_key_id=foo', 'aws_access_key_id', 'foo',
			//          index: 0, input: 'aws_access_key_id=foo', groups: undefined ]
			const item = line.match(/^\s*(.+?)\s*=\s*(.+?)\s*$/);
			if (item) {
				map[currentSection] = map[currentSection] || {};
				map[currentSection][item[1]] = item[2];
			}
		}
	});

	return map;
}

function getDefaultFilePath(isConfig) {
	return path.join(getHomeDir(), ".aws", isConfig ? "config" : "credentials");
}

function getHomeDir() {
	const env = process.env;
	const home =
		env.HOME ||
		env.USERPROFILE ||
		(env.HOMEPATH ? (env.HOMEDRIVE || "C:/") + env.HOMEPATH : null);

	if (home) {
		return home;
	}

	if (typeof os.homedir === "function") {
		return os.homedir();
	}

	throw new Error("Cannot load credentials, HOME path not set");
}

function arrayEach(array, iterFunction) {
	for (const idx in array) {
		if (Object.prototype.hasOwnProperty.call(array, idx)) {
			const ret = iterFunction.call(this, array[idx], parseInt(idx, 10));
			if (ret === {}) {
				break;
			}
		}
	}
}

module.exports = {
	getProfiles,
	replaceProfiles
};
