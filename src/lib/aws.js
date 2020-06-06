process.env.AWS_NODEJS_CONNECTION_REUSE_ENABLED = "1";
process.env.AWS_SDK_LOAD_CONFIG = "1";
const _ = require("lodash");
const inquirer = require("inquirer");

const cache = {};

const getAWSSDK = options => {
	const key = JSON.stringify({
		region: _.get(options, "region"),
		profile: _.get(options, "profile"),
		httpProxy: _.get(options, "httpProxy")
	});
	if (cache[key]) {
		return cache[key];
	}

	const AWS = require("aws-sdk");

	if (_.get(options, "region")) {
		AWS.config.region = options.region;
	} else if (global.region) {
		AWS.config.region = global.region;
	}

	const tokenCodeFn = (mfaSerial, cb) => {
		inquirer
			.prompt({
				name: "token",
				type: "input",
				message: `Enter MFA code for ${mfaSerial}:`
			})
			.then(result => {
				cb(null, result.token);
			});
	};

	if (_.get(options, "profile")) {
		const credentials = new AWS.SharedIniFileCredentials({
			profile: options.profile,
			tokenCodeFn
		});
		AWS.config.credentials = credentials;
	} else if (global.profile) {
		const credentials = new AWS.SharedIniFileCredentials({
			profile: global.profile,
			tokenCodeFn
		});
		AWS.config.credentials = credentials;
	}

	const httpProxy = _.get(options, "httpProxy", global.httpProxy);
	if (httpProxy) {
		const ProxyAgent = require("proxy-agent");
		AWS.config.update({
			httpOptions: { agent: new ProxyAgent(httpProxy) }
		});
	}

	cache[key] = AWS;
	return AWS;
};

module.exports = {
	getAWSSDK
};
