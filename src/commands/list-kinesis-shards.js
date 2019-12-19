const _ = require("lodash");
const AWS = require("aws-sdk");
const Table = require("cli-table");
const { Command, flags } = require("@oclif/command");
const { checkVersion } = require("../lib/version-check");
const uuid = require("uuid/v4");
require("colors");

const ONE_HOUR_IN_SECONDS = 60 * 60;

class ListKinesisShardsCommand extends Command {
	async run() {
		const { flags } = this.parse(ListKinesisShardsCommand);
		const { streamName, region, profile } = flags;

		AWS.config.region = region;
		if (profile) {
			const credentials = new AWS.SharedIniFileCredentials({ profile });
			AWS.config.credentials = credentials;
		}

		checkVersion();

		this.log(`checking Kinesis stream [${streamName}] in [${region}]`);
		const stream = await this.describeStream(streamName);

		if (_.isEmpty(stream.enhancedMonitoring)) {
			this.log("enhanced monitoring is", "disabled".red.bold);
			this.log(
				"hint: enable enhanced monitoring to see shard level metrics".italic
			);
		} else {
			this.log("enhanced monitoring is", "enabled".green.bold);
			const shardIds = stream.shards.map(x => x.ShardId);
			const metrics = await this.getUsageMetrics(streamName, shardIds);
			stream.shards.forEach(shard => {
				shard.LastHourMetrics = _.get(metrics, shard.ShardId);
			});
		}

		this.log(`arn: ${stream.arn}`);
		this.log("status:", stream.status.green.bold);
		this.show(stream.shards);
	}
  
	async describeStream(streamName) {
		const Kinesis = new AWS.Kinesis();
		const resp = await Kinesis.describeStream({
			StreamName: streamName
		}).promise();
  
		return {
			arn: resp.StreamDescription.StreamARN,
			status: resp.StreamDescription.StreamStatus,
			shards: resp.StreamDescription.Shards,
			enhancedMonitoring: resp.StreamDescription.EnhancedMonitoring[0].ShardLevelMetrics
		};
	}
  
	async getUsageMetrics(streamName, shardsIds) {
		const CloudWatch = new AWS.CloudWatch();
		const metricNames = [
			["IncomingBytes", "Average"],
			["IncomingRecords", "Average"],
			["OutgoingRecords", "Average"],
			["OutgoingBytes", "Average"],
			["ReadProvisionedThroughputExceeded", "Sum"],
			["WriteProvisionedThroughputExceeded", "Sum"],
			["IteratorAgeMilliseconds", "Average"]
		];
  
		const oneHourAgo = new Date();
		oneHourAgo.setHours(oneHourAgo.getHours() - 1);
  
		const queries = _.flatMap(shardsIds, shardId =>
			metricNames.map(([metricName, stat]) => ({
				Id:
          metricName.toLowerCase() +
          uuid()
          	.replace(/-/g, "")
          	.substr(0, 5),
				Label: `${shardId}:${metricName}:${stat}`,
				MetricStat: {
					Metric: {
						Dimensions: [
							{
								Name: "StreamName",
								Value: streamName
							},
							{
								Name: "ShardId",
								Value: shardId
							}
						],
						MetricName: metricName,
						Namespace: "AWS/Kinesis"
					},
					Period: ONE_HOUR_IN_SECONDS,
					Stat: stat
				},
				ReturnData: true
			}))
		);
  
		// each GetMetricData request can send as many as 100 queries
		const chunks = _.chunk(queries, 100);
		const promises = chunks.map(async metricDataQueries => {
			const resp = await CloudWatch.getMetricData({
				StartTime: oneHourAgo,
				EndTime: new Date(),
				MetricDataQueries: metricDataQueries
			}).promise();
  
			return resp.MetricDataResults.map(res => {
				const [shardId, metricName, stat] = res.Label.split(":");
				const dataPoint = res.Values[0] || 0;
				if (stat === "Sum") {
					return {
						shardId,
						metricName: metricName + "Count",
						dataPoint
					};
				} else {
					// convert from per min average to per second
					const perSecAverage = dataPoint / 60.0;
					return {
						shardId,
						metricName: metricName + "PerSecond",
						dataPoint: perSecAverage
					};
				}
			});
		});
  
		// array of {shardId, metricName, dataPoint}
		const results = _.flatMap(await Promise.all(promises));
		const byShardId = _.groupBy(results, res => res.shardId);
		return _.mapValues(byShardId, shardMetrics => {
			const kvp = shardMetrics.map(({ metricName, dataPoint }) => [
				metricName,
				dataPoint
			]);
			return _.fromPairs(kvp);
		});
	}
  
	show(shards) {
		const table = new Table({
			head: ["ShardId", "Details"]
		});
  
		shards.forEach(x => {
			const details = _.clone(x);
			delete details.ShardId;
			table.push([
				x.ShardId.replace("shardId-", ""),
				JSON.stringify(details, undefined, 2)
			]);
		});
  
		this.log(table.toString());
	}
}

ListKinesisShardsCommand.description = "Lists the shards of a Kinesis stream";
ListKinesisShardsCommand.flags = {
	streamName: flags.string({
		char: "n",
		description: "name of the Kinesis stream, e.g. event-stream-dev",
		required: true
	}),
	region: flags.string({
		char: "r",
		description: "AWS region, e.g. us-east-1",
		required: true
	}),
	profile: flags.string({
		char: "p",
		description: "AWS CLI profile name",
		required: false
	})
};

module.exports = ListKinesisShardsCommand;
