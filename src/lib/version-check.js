const childProcess = require("child_process");
const semver = require("semver");

const checkVersion = async () => {
	const packageJson = require("../../package.json");
	const version = packageJson.version;
	const npmVersion = childProcess.execSync("npm show lumigo-cli version").toString().trim();
  
	if (semver.gt(npmVersion, version)) {
		console.log(`
===============================================================
     v${npmVersion} of this CLI is now available on NPM.
       Please run "npm i -g lumigo-cli" to update :-)
===============================================================
    `);
	}
};

module.exports = {
	checkVersion
};
