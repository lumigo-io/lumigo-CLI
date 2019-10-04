const _ = require("lodash");
const AWS = require("aws-sdk");
const {Command, flags} = require("@oclif/command");
const {checkVersion} = require("../lib/version-check");
require("colors");

class TailDynamodbCommand extends Command {
	async run() {
		const {flags} = this.parse(TailDynamodbCommand);
		const {tableName, region, profile} = flags;

		AWS.config.region = region;
		if (profile) {
			const credentials = new AWS.SharedIniFileCredentials({ profile });
			AWS.config.credentials = credentials;
		}
    
		checkVersion();

		this.log(`checking DynamoDB table [${tableName}] in [${region}]`);
		const streamArn = await getStreamArn(tableName);
    
		if (!streamArn) {
			this.log("table doesn't have a stream, exiting...");
			this.exit();
		}
    
		this.log(`stream arn is: ${streamArn}`);
		this.log(`checking DynamoDB stream [${streamArn}] in [${region}]`);
		const stream = await describeStream(streamArn);
    
		this.log(`polling DynamoDB stream for table [${tableName}] (${stream.shardIds.length} shards)...`);
		this.log("press <any key> to stop");
		await pollDynamoDBStreams(streamArn, stream.shardIds);
    
		process.exit(0);
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
	})
};

const getStreamArn = async (tableName) => {
	const DynamoDB = new AWS.DynamoDB();
	const resp = await DynamoDB.describeTable({
		TableName: tableName
	}).promise();
  
	return resp.Table.LatestStreamArn;
};

const describeStream = async (streamArn) => {
	const DynamoDBStreams = new AWS.DynamoDBStreams();
	const resp = await DynamoDBStreams.describeStream({
		StreamArn: streamArn
	}).promise();
  
	return {
		arn: resp.StreamDescription.StreamArn,
		status: resp.StreamDescription.StreamStatus,
		viewType: resp.StreamDescription.StreamViewType,
		shardIds: resp.StreamDescription.Shards.map(x => x.ShardId)
	};
};

const pollDynamoDBStreams = async (streamArn, shardIds) => {
	const DynamoDBStreams = new AWS.DynamoDBStreams();
  
	let polling = true;
	const readline = require("readline");
	readline.emitKeypressEvents(process.stdin);
	process.stdin.setRawMode(true);
	const stdin = process.openStdin();
	stdin.once("keypress", () => {
		polling = false;
		console.log("stopping...");
	});

	const promises = shardIds.map(async (shardId) => {
		const iteratorResp = await DynamoDBStreams.getShardIterator({
			ShardId: shardId,
			StreamArn: streamArn,
			ShardIteratorType: "LATEST"
		}).promise();
    
		let shardIterator = iteratorResp.ShardIterator;
    
		// eslint-disable-next-line no-constant-condition
		while (polling) {
			const resp = await DynamoDBStreams.getRecords({
				ShardIterator: shardIterator,
				Limit: 10
			}).promise();
      
			if (!_.isEmpty(resp.Records)) {
				resp.Records.forEach(record => {
					const timestamp = new Date().toJSON().grey.bold.bgWhite;
					console.log(timestamp, "\n", JSON.stringify(record, undefined, 2));
				});
			}
      
			shardIterator = resp.NextShardIterator;
		}
	});

	await Promise.all(promises);
  
	console.log("stopped");
};

module.exports = TailDynamodbCommand;
