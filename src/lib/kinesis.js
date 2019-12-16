const { getAWSSDK } = require("../lib/aws");
const Retry = require("async-retry");

const regions = [
	"us-east-1",
	"us-east-2",
	"us-west-1",
	"us-west-2",
	"ca-central-1",
	"eu-north-1",
	"eu-west-1",
	"eu-west-2",
	"eu-west-3",
	"eu-central-1",
	"ap-northeast-1",
	"ap-northeast-2",
	"ap-southeast-1",
	"ap-southeast-2",
	"ap-south-1",
	"sa-east-1"
];

const getStreamsInRegion = async region => {
	const AWS = getAWSSDK();
	const Kinesis = new AWS.Kinesis({ region });
	let streamDetails = await Retry(() => Kinesis.listStreams({ Limit: 100 }).promise());
	let streamNames = streamDetails.StreamNames;

	while (streamDetails.HasMoreStreams) {
		streamDetails = await Retry(() =>
			Kinesis.listStreams({
				Limit: 100,
				ExclusiveStartStreamName: streamDetails.slice(-1)[0]
			}).promise()
		);
		streamNames.concat(streamDetails.StreamNames);
	}

	return streamNames;
};

module.exports = {
	regions,
	getStreamsInRegion
};
