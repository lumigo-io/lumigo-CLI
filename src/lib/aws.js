process.env.AWS_NODEJS_CONNECTION_REUSE_ENABLED = "1";
const _ = require("lodash");

const getAWSSDK = (options) => {
	const AWS = require("aws-sdk");

	if (_.get(options, "region")) {
		AWS.config.region = options.region;
	} else if (global.region) {
		AWS.config.region = global.region;
	}

	if (_.get(options, "profile")) {
		const credentials = new AWS.SharedIniFileCredentials({
			profile: options.profile
		});
		AWS.config.credentials = credentials;
	} else if (global.profile) {
		const credentials = new AWS.SharedIniFileCredentials({
			profile: global.profile
		});
		AWS.config.credentials = credentials;
	}

	return AWS;
};

module.exports = {
	getAWSSDK
};
