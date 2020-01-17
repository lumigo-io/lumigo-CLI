const _ = require("lodash");
const { getAWSSDK } = require("../lib/aws");
const Table = require("cli-table");
const { Command, flags } = require("@oclif/command");
const { checkVersion } = require("../lib/version-check");
const Kinesis = require("../lib/kinesis");
const uuid = require("uuid");
const { getStreamsInRegion } = require("../lib/kinesis");
const { track } = require("../lib/analytics");
require("colors");

const FIVE_MIN_IN_SECONDS = 60 * 5;
const MAX_RECORDS_PER_SHARD_WRITE = 1000;
const MAX_RECORDS_PER_SHARD_READ = 2000;
const BYTES_INCOMING_PER_SHARD = 1024 * 1024;
const BYTES_OUTGOING_PER_SHARD = 2048 * 1024;

const formatFloat = num => {
	return Number.parseFloat(num).toFixed(2);
};

class ListKinesisStreamsCommand extends Command {
	async run() {
		const { flags } = this.parse(ListKinesisStreamsCommand);
		const { region, profile } = flags;

		global.profile = profile;

		checkVersion();
    
		track("list-kinesis-streams", { region });

		let streamsDescription = [];
		if (region) {
			this.log(`Checking Kinesis streams in [${region}]`);
			streamsDescription = await this.getStreamsDescriptionFromRegion(region);
		} else {
			this.log("Checking Kinesis streams in all regions");
			streamsDescription = await this.getStreamsDescriptionFromAllRegions();
		}
		this.show(streamsDescription);
	}

	async getStreamsDescriptionFromRegion(region) {
		const streamNames = await getStreamsInRegion(region);

		const usageStats = await this.getUsageMetrics(streamNames, region);
		return this.describeStreams(streamNames, region, usageStats);
	}

	async getStreamsDescriptionFromAllRegions() {
		const promises = Kinesis.regions.map(region =>
			this.getStreamsDescriptionFromRegion(region)
		);
		const results = await Promise.all(promises);
		return _.flatMap(results);
	}

	async describeStreams(streams, region, usageStats) {
		const streamsDescription = [];
		for (const stream of streams) {
			streamsDescription.push(
				this.describeStream(stream, region, usageStats[stream])
			);
		}

		return Promise.all(streamsDescription);
	}

	async describeStream(streamName, region, streamStat) {
		const AWS = getAWSSDK();
		const Kinesis = new AWS.Kinesis({ region });
		const resp = await Kinesis.describeStream({
			StreamName: streamName
		}).promise();

		const numberOfShards = resp.StreamDescription.Shards.length;

		const outgoingBytesForAllShardPerFiveMinute =
			numberOfShards * BYTES_OUTGOING_PER_SHARD * FIVE_MIN_IN_SECONDS;

		const outgoingRecordsForAllShardPerFiveMinute =
			numberOfShards * MAX_RECORDS_PER_SHARD_READ * FIVE_MIN_IN_SECONDS;

		const incomingBytesForAllShardsPerFiveMinute =
			numberOfShards * BYTES_INCOMING_PER_SHARD * FIVE_MIN_IN_SECONDS;

		const incomingRecordsForAllShardsPerFiveMinute =
			numberOfShards * MAX_RECORDS_PER_SHARD_WRITE * FIVE_MIN_IN_SECONDS;

		return {
			streamName: streamName,
			region: region,
			status: resp.StreamDescription.StreamStatus,
			shards: resp.StreamDescription.Shards,
			outgoingMbPercentage: formatFloat(
				(streamStat["GetRecords.BytesSum"] /
					outgoingBytesForAllShardPerFiveMinute) *
					100
			),
			outgoingRecordPercentage: formatFloat(
				(streamStat["GetRecords.RecordsSum"] /
					outgoingRecordsForAllShardPerFiveMinute) *
					100
			),
			incomingMbPercentage: formatFloat(
				(streamStat.IncomingBytesSum / incomingBytesForAllShardsPerFiveMinute) *
					100
			),
			incomingRecordPercentage: formatFloat(
				(streamStat.IncomingRecordsSum /
					incomingRecordsForAllShardsPerFiveMinute) *
					100
			)
		};
	}

	prepareMetricsQueries(streamNames) {
		const metricNames = [
			["IncomingBytes", "Sum"],
			["IncomingRecords", "Sum"],
			["GetRecords.Bytes", "Sum"],
			["GetRecords.Records", "Sum"]
		];

		return _.flatMap(streamNames, streamName =>
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
					Period: FIVE_MIN_IN_SECONDS,
					Stat: stat
				},
				ReturnData: true
			}))
		);
	}

	async getUsageMetrics(streamNames, region) {
		const AWS = getAWSSDK();
		const CloudWatch = new AWS.CloudWatch({ region });

		const fiveMinuteAgo = new Date();
		fiveMinuteAgo.setMinutes(fiveMinuteAgo.getMinutes() - 5);

		const queries = this.prepareMetricsQueries(streamNames);

		// each GetMetricData request can send as many as 100 queries
		const chunks = _.chunk(queries, 100);
		const promises = chunks.map(async metricDataQueries => {
			const resp = await CloudWatch.getMetricData({
				StartTime: fiveMinuteAgo,
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
	}

	show(streamsDetails) {
		const table = new Table({
			head: [
				"Stream name",
				"Region",
				"Shards",
				"Read utilization",
				"Write utilization",
				"Status"
			]
		});

		streamsDetails.forEach(x => {
			table.push([
				x.streamName,
				x.region,
				x.shards.length,
				`${x.outgoingMbPercentage}% (MB)\n${x.outgoingRecordPercentage}% (Records)`,
				`${x.incomingMbPercentage}% (MB)\n${x.incomingRecordPercentage}% (Records)`,
				x.status
			]);
		});

		this.log(`Total [${streamsDetails.length}] streams`);
		this.log(table.toString());
		this.log(`
  Each shard can at most input ${BYTES_INCOMING_PER_SHARD /
		1024} KB of data and up to ${MAX_RECORDS_PER_SHARD_WRITE} records per second.
  Each shard can at most output ${BYTES_OUTGOING_PER_SHARD /
		1024} KB of data and up to ${MAX_RECORDS_PER_SHARD_READ} records per second.
  Read and write utilization are for the last ${FIVE_MIN_IN_SECONDS / 60} minutes. 
    `);
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

module.exports = ListKinesisStreamsCommand;
