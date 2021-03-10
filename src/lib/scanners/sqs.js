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

const getSqsQueuesInRegion = async region => {
	const AWS = getAWSSDK();
	const SQS = new AWS.SQS({
		region,
		maxRetries: 15
	});

	const resp = await SQS.listQueues({}).promise();

	const { QueueUrls } = resp;

	return await Async.mapLimit(QueueUrls, 5, async queueUrl => {
		const { Attributes } = await SQS.getQueueAttributes({
			QueueUrl: queueUrl,
			AttributeNames: ["All"]
		}).promise();

		const { Tags } = await SQS.listQueueTags({
			QueueUrl: queueUrl
		}).promise();

		const { queueUrls } = await SQS.listDeadLetterSourceQueues({
			QueueUrl: queueUrl
		}).promise();

		return {
			Region: region,
			QueueUrl: queueUrl,
			Attributes,
			Tags,
			SourceQueues: queueUrls
		};
	});
};

const getSqsQueues = async () => {
	const promises = regions.map(region =>
		getSqsQueuesInRegion(region)
			.then(queues => {
				if (queues.length > 0) {
					console.debug("found SQS queues", { region, count: queues.length });
				}

				return queues;
			})
			.catch(err => {
				console.error("failed to get SQS queues, skipped...", { region }, err);
				return [];
			})
	);
	return {
		sqs: _.flatten(await Promise.all(promises))
	};
};

module.exports = {
	getSqsQueues
};
