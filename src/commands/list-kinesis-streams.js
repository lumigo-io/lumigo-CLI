const _ = require("lodash");
const AWS = require("aws-sdk");
const Table = require("cli-table");
const { Command, flags } = require("@oclif/command");
const { checkVersion } = require("../lib/version-check");
const Lambda = require("../lib/lambda");
require("colors");

class ListKinesisStreamsCommand extends Command {
	async run() {
		const { flags } = this.parse(ListKinesisStreamsCommand);
		const { region, profile } = flags;

		AWS.config.region = region;
		if (profile) {
			AWS.config.credentials = new AWS.SharedIniFileCredentials({ profile });
		}

		checkVersion();
		let streamsDescription = [];
		if (region) {
			this.log(`Checking Kinesis streams in [${region}]`);
			streamsDescription = await getStreamsDescriptionFromRegion(region);
		} else {
			this.log("Checking Kinesis streams in all regions");
			streamsDescription = await getStreamsDescriptionFromAllRegions();
		}

		//const metrics = await getUsageMetrics(streamName, shardIds);

		//this.log(`arn: ${stream.arn}`);
		//this.log("status:", stream.status.green.bold);
		show(streamsDescription);
	}
}

ListKinesisStreamsCommand.description = "Lists the Kinesis streams";
ListKinesisStreamsCommand.flags = {
	region: flags.string({
		char: "r",
		description: "AWS region, e.g. us-east-1",
		required: false
	}),
	profile: flags.string({
		char: "p",
		description: "AWS CLI profile name",
		required: false
	})
};

const getStreamsDescriptionFromRegion = async region => {
	const Kinesis = new AWS.Kinesis({ region });
	let streamDetails = await Kinesis.listStreams({ Limit: 100 }).promise();
	let streamNames = streamDetails.StreamNames;
	while (streamDetails.HasMoreStreams) {
		streamDetails = await Kinesis.listStreams({
			Limit: 100,
			ExclusiveStartStreamName: streamDetails.slice(-1)[0]
		}).promise();
		streamNames = streamDetails.StreamNames;
	}
	return describeStreams(streamNames, region);
};

const getStreamsDescriptionFromAllRegions = async () => {
	const promises = Lambda.regions.map(region =>
		getStreamsDescriptionFromRegion(region)
	);
	const results = await Promise.all(promises);
	return _.flatMap(results);
};

const describeStreams = async (streams, region) => {
	const streamsDescription = [];
	for (const stream of streams) {
		streamsDescription.push(await describeStream(stream, region));
	}

	return streamsDescription;
};

const describeStream = async (streamName, region) => {
	const Kinesis = new AWS.Kinesis({ region });
	const resp = await Kinesis.describeStream({
		StreamName: streamName
	}).promise();

	return {
		streamName: streamName,
		arn: resp.StreamDescription.StreamARN,
		status: resp.StreamDescription.StreamStatus,
		shards: resp.StreamDescription.Shards
	};
};


const show = streamsDetails => {
	const table = new Table({
		head: ["Stream name", "ARN", "# of Shard", "Status"]
	});

	streamsDetails.forEach(x => {
		table.push([x.streamName, x.arn, x.shards.length, x.status]);
	});

	console.log(`Total [${streamsDetails.length}] streams`);
	console.log(table.toString());
};

module.exports = ListKinesisStreamsCommand;
