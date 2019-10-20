process.env.AWS_NODEJS_CONNECTION_REUSE_ENABLED = "1";

const getAWSSDK = () => {
	const AWS = require("aws-sdk");
	if (global.profile) {
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
