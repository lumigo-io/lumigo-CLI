const _ = require("lodash");
const { getAWSSDK } = require("./../aws");
const Async = require("async");

const regions = [
	"us-east-1",
	"us-east-2",
	"us-west-1",
	"us-west-2",
	// "ap-south-1",
	// "ap-northeast-1",
	// "ap-northeast-2",
	// "ap-southeast-1",
	// "ap-southeast-2",
	// "ca-central-1",
	"eu-central-1",
	"eu-west-1",
	"eu-west-2"
	// "eu-west-3",
	// "eu-south-1",
	// "eu-north-1",
	// "sa-east-1"
];

const getSnsTopicsInRegion = async region => {
	const AWS = getAWSSDK({ region });
	const SNS = new AWS.SNS({
		region,
		maxRetries: 15
	});

	const getAllTopicArns = async () => {
		const loop = async (acc = [], nextToken) => {
			const resp = await SNS.listTopics({
				NextToken: nextToken
			}).promise();

			const arns = resp.Topics.map(x => x.TopicArn);

			if (resp.NextToken) {
				return await loop(acc.concat(arns), resp.NextToken);
			} else {
				return acc.concat(arns);
			}
		};

		return loop();
	};

	const arns = await getAllTopicArns();

	return await Async.mapLimit(arns, 5, async topicArn => {
		const { Attributes } = await SNS.getTopicAttributes({
			TopicArn: topicArn
		}).promise();

		const getTagsResp = await SNS.listTagsForResource({
			ResourceArn: topicArn
		}).promise();
		// turn arrays [{"Key", "Value"}] to object {"Key":"Value"}
		const tags = _.mapValues(_.keyBy(getTagsResp.Tags || [], "Key"), "Value");

		const { Subscriptions } = await SNS.listSubscriptionsByTopic({
			TopicArn: topicArn
		}).promise();

		for (const sub of Subscriptions) {
			const getSubAttrsResp = await SNS.getSubscriptionAttributes({
				SubscriptionArn: sub.SubscriptionArn
			}).promise();

			sub.Attributes = getSubAttrsResp.Attributes;
		}

		return {
			Region: region,
			Arn: topicArn,
			Attributes,
			Tags: tags,
			Subscriptions
		};
	});
};

const getSnsTopics = async () => {
	const promises = regions.map(region =>
		getSnsTopicsInRegion(region)
			.then(topics => {
				if (topics.length > 0) {
					console.debug("found SNS topics", { region, count: topics.length });
				}

				return topics;
			})
			.catch(err => {
				console.error("failed to get SNS topics, skipped...", { region }, err);
				return [];
			})
	);
	return {
		sns: _.flatten(await Promise.all(promises))
	};
};

module.exports = {
	getSnsTopics
};
