const { getAWSSDK } = require("../lib/aws");

const getQueueUrl = async (queueName, options) => {
	const AWS = getAWSSDK(options);
	const SQS = new AWS.SQS();
	const resp = await SQS.listQueues({
		QueueNamePrefix: queueName
	}).promise();

	return resp.QueueUrls.find(url => {
		const segments = url.split("/");
		// find the exact match
		return segments[segments.length - 1] === queueName;
	});
};

module.exports = {
	getQueueUrl
};
