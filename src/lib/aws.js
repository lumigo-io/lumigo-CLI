process.env.AWS_NODEJS_CONNECTION_REUSE_ENABLED = "1";

const getAWSSDK = () => {
	const AWS = require("aws-sdk");

	if (global.region) {
		AWS.config.region = global.region;
	}

	if (global.profile) {
		const credentials = new AWS.SharedIniFileCredentials({
			profile: global.profile
		});
		AWS.config.credentials = credentials;
	}

	return AWS;
};

const getRegionFromARN = arn => {
	const arnParts = arn.split(":");
	// Something simple for now
	if (arnParts.length < 3) {
		throw Error(`Invalid ARN ${arn}`);
	}

	return arnParts[2];
};

module.exports = {
	getAWSSDK,
	getRegionFromARN
};
