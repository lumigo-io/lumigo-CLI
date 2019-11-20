const _ = require("lodash");
const AWS = require("aws-sdk");
const Table = require("cli-table");
const { Command, flags } = require("@oclif/command");
const { checkVersion } = require("../lib/version-check");
const Lambda = require("../lib/lambda");
require("colors");
const uuid = require("uuid");

const ONE_MIN_IN_SECONDS = 60;
const MAX_RECORDS_PER_SHARD = 1000;
const BYTES_INCOMING_PER_SHARD = 1024 * 1024;
const BYTES_OUTGOING_PER_SHARD = 2048 * 1024;

const formatFloat = num => {
	return Number.parseFloat(num).toFixed(3);
};

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
	const usageStats = await getUsageMetrics(streamNames, region);
	return describeStreams(streamNames, region, usageStats);
};

const getStreamsDescriptionFromAllRegions = async () => {
	const promises = Lambda.regions.map(region =>
		getStreamsDescriptionFromRegion(region)
	);
	const results = await Promise.all(promises);
	return _.flatMap(results);
};

const describeStreams = async (streams, region, usageStats) => {
	const streamsDescription = [];
	for (const stream of streams) {
		streamsDescription.push(await describeStream(stream, region, usageStats[stream]));
	}

	return streamsDescription;
};

const describeStream = async (streamName, region, streamStat) => {
	const Kinesis = new AWS.Kinesis({ region });
	const resp = await Kinesis.describeStream({
		StreamName: streamName
	}).promise();

	return {
		streamName: streamName,
		arn: resp.StreamDescription.StreamARN,
		status: resp.StreamDescription.StreamStatus,
		shards: resp.StreamDescription.Shards,
		readMbPercentage: formatFloat(
			(streamStat["GetRecords.BytesSum"] /
				(resp.StreamDescription.Shards.length *
					BYTES_OUTGOING_PER_SHARD *
					ONE_MIN_IN_SECONDS)) *
				100
		),
		readRecordPercentage: formatFloat(
			(streamStat["GetRecords.RecordsSum"] /
				(resp.StreamDescription.Shards.length *
					MAX_RECORDS_PER_SHARD *
					ONE_MIN_IN_SECONDS)) *
				100
		),
		writeMbPercentage: formatFloat(
			(streamStat.IncomingBytesSum /
				(resp.StreamDescription.Shards.length *
					BYTES_INCOMING_PER_SHARD *
					ONE_MIN_IN_SECONDS)) *
				100
		),
		writeRecordPercentage: formatFloat(
			(streamStat.IncomingRecordsSum /
				(resp.StreamDescription.Shards.length *
					MAX_RECORDS_PER_SHARD *
					ONE_MIN_IN_SECONDS)) *
				100
		)
	};
};

const getUsageMetrics = async (streamNames, region) => {
	const CloudWatch = new AWS.CloudWatch({ region });
	const metricNames = [
		["IncomingBytes", "Sum"],
		["IncomingRecords", "Sum"],
		["GetRecords.Bytes", "Sum"],
		["GetRecords.Records", "Sum"]
	];

	const oneMinuteAgo = new Date();
	oneMinuteAgo.setMinutes(oneMinuteAgo.getMinutes() - 1);

	const queries = _.flatMap(streamNames, streamName =>
		metricNames.map(([metricName, stat]) => ({
			Id:
				metricName.replace(".", "").toLowerCase() +
				uuid()
					.replace(/-/g, "")
					.substr(0, 5),
			Label: `${streamName}:${metricName}:${stat}`,
			MetricStat: {
				Metric: {
					Dimensions: [
						{
							Name: "StreamName",
							Value: streamName
						}
					],
					MetricName: metricName,
					Namespace: "AWS/Kinesis"
				},
				Period: ONE_MIN_IN_SECONDS,
				Stat: stat
			},
			ReturnData: true
		}))
	);

	// each GetMetricData request can send as many as 100 queries
	const chunks = _.chunk(queries, 100);
	const promises = chunks.map(async metricDataQueries => {
		const resp = await CloudWatch.getMetricData({
			StartTime: oneMinuteAgo,
			EndTime: new Date(),
			MetricDataQueries: metricDataQueries
		}).promise();

		return resp.MetricDataResults.map(res => {
			const [name, metricName] = res.Label.split(":");
			const dataPoint = res.Values[0] || 0;
			return {
				name,
				metricName: metricName + "Sum",
				dataPoint
			};
		});
	});

	// array of {shardId, metricName, dataPoint}
	const results = _.flatMap(await Promise.all(promises));
	const byShardId = _.groupBy(results, res => res.name);
	return _.mapValues(byShardId, shardMetrics => {
		const kvp = shardMetrics.map(({ metricName, dataPoint }) => [
			metricName,
			dataPoint
		]);
		return _.fromPairs(kvp);
	});
};

const show = streamsDetails => {
	const table = new Table({
		head: [
			"Stream name",
			"ARN",
			"# of Shard",
			"Avg Kinesis Read Capacity (MB/Records) %",
			"Avg Kinesis Write Capacity (MB/Records) %",
			"Status"
		]
	});

	streamsDetails.forEach(x => {
		table.push([
			x.streamName,
			x.arn,
			x.shards.length,
			`${x.readMbPercentage}/${x.readRecordPercentage}`,
			`${x.writeMbPercentage}/${x.writeRecordPercentage}`,
			x.status
		]);
	});

	console.log(`Total [${streamsDetails.length}] streams`);
	console.log(table.toString());
};

module.exports = ListKinesisStreamsCommand;
