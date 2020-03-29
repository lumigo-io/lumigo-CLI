const { getAWSSDK } = require("../lib/aws");

const getTopicArn = async (topicName, options) => {
	const AWS = getAWSSDK(options);
	const SNS = new AWS.SNS();
	const loop = async nextToken => {
		const resp = await SNS.listTopics({
			NextToken: nextToken
		}).promise();

		const matchingTopic = resp.Topics.find(x => x.TopicArn.endsWith(":" + topicName));
		if (matchingTopic) {
			return matchingTopic.TopicArn;
		}

		if (resp.NextToken) {
			return await loop(resp.NextToken);
		} else {
			throw new Error(`cannot find the SNS topic [${topicName}]!`);
		}
	};

	return loop();
};

module.exports = {
	getTopicArn
};
