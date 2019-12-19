const _ = require("lodash");
const { getAWSSDK } = require("../lib/aws");
const { Command, flags } = require("@oclif/command");
const { checkVersion } = require("../lib/version-check");
require("colors");

class TailDynamodbCommand extends Command {
	async run() {
		const { flags } = this.parse(TailDynamodbCommand);
		const { tableName, region, profile, endpoint } = flags;

		global.region = region;
		global.profile = profile;
		global.endpoint = endpoint;

		checkVersion();

		this.log(`checking DynamoDB table [${tableName}] in [${region}]`);
		const streamArn = await this.getStreamArn(tableName);

		if (!streamArn) {
			this.log("table doesn't have a stream, exiting...");
			this.exit();
		}

		this.log(`stream arn is: ${streamArn}`);
		this.log(`checking DynamoDB stream [${streamArn}] in [${region}]`);
		const stream = await this.describeStream(streamArn);

		this.log(
			`polling DynamoDB stream for table [${tableName}] (${stream.shardIds.length} shards)...`
		);
		this.log("press <any key> to stop");
		await this.pollDynamoDBStreams(streamArn, stream.shardIds);
	}
  
	getDynamoDBClient() {
		const AWS = getAWSSDK();
		if (global.endpoint) {
			return new AWS.DynamoDB({ endpoint: global.endpoint });
		} else {
			return new AWS.DynamoDB();
		}
	}
  
	getDynamoDBStreamsClient() {
		const AWS = getAWSSDK();
		if (global.endpoint) {
			return new AWS.DynamoDBStreams({ endpoint: global.endpoint });
		} else {
			return new AWS.DynamoDBStreams();
		}
	}
  
	async getStreamArn(tableName) {
		const DynamoDB = this.getDynamoDBClient();
  
		const resp = await DynamoDB.describeTable({
			TableName: tableName
		}).promise();
  
		return resp.Table.LatestStreamArn;
	}
  
	async describeStream(streamArn) {
		const DynamoDBStreams = this.getDynamoDBStreamsClient();
  
		const resp = await DynamoDBStreams.describeStream({
			StreamArn: streamArn
		}).promise();
  
		return {
			arn: resp.StreamDescription.StreamArn,
			status: resp.StreamDescription.StreamStatus,
			viewType: resp.StreamDescription.StreamViewType,
			shardIds: resp.StreamDescription.Shards.map(x => x.ShardId)
		};
	}
  
	async pollDynamoDBStreams(streamArn, shardIds) {
		const DynamoDBStreams = this.getDynamoDBStreamsClient();
  
		let polling = true;
		const readline = require("readline");
		readline.emitKeypressEvents(process.stdin);
		process.stdin.setRawMode(true);
		const stdin = process.openStdin();
		stdin.once("keypress", () => {
			polling = false;
			this.log("stopping...");
		});
  
		const promises = shardIds.map(async shardId => {
			const iteratorResp = await DynamoDBStreams.getShardIterator({
				ShardId: shardId,
				StreamArn: streamArn,
				ShardIteratorType: "LATEST"
			}).promise();
  
			let shardIterator = iteratorResp.ShardIterator;
  
			// eslint-disable-next-line no-constant-condition
			while (polling) {
				let resp;
  
				if (!shardIterator) {
					break;
				}
  
				try {
					resp = await DynamoDBStreams.getRecords({
						ShardIterator: shardIterator,
						Limit: 10
					}).promise();
				} catch (e) {
					this.error(
						`Error while getting records for shard (${shardIterator.yellow}): ${e.message.red}`
					);
  
					break;
				}
  
				if (resp && !_.isEmpty(resp.Records)) {
					resp.Records.forEach(record => {
						const timestamp = new Date().toJSON().grey.bold.bgWhite;
						this.log(timestamp, "\n", JSON.stringify(record, undefined, 2));
					});
				}
  
				shardIterator = resp.NextShardIterator;
			}
		});
  
		await Promise.all(promises);
  
		this.log("stopped");
	}
}

TailDynamodbCommand.description = "Tails the records going into a DynamoDB stream";
TailDynamodbCommand.flags = {
	tableName: flags.string({
		char: "n",
		description: "name of the DynamoDB table, e.g. users-dev",
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
	}),
	endpoint: flags.string({
		char: "e",
		description: "DynamoDB endpoint (for when using dynamodb-local)",
		required: false
	})
};

module.exports = TailDynamodbCommand;
