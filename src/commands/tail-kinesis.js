const _ = require("lodash");
const zlib = require("zlib");
const AWS = require("aws-sdk");
const {Command, flags} = require("@oclif/command");
const {checkVersion} = require("../lib/version-check");
require("colors");

// let isZipped;

class TailKinesisCommand extends Command {
	async run() {
		const {flags} = this.parse(TailKinesisCommand);
		const {streamName, region, profile} = flags;

		AWS.config.region = region;
		if (profile) {
			const credentials = new AWS.SharedIniFileCredentials({ profile });
			AWS.config.credentials = credentials;
		}
    
		checkVersion();

		this.log(`checking Kinesis stream [${streamName}] in [${region}]`);
		const stream = await describeStream(streamName);
    
		this.log(`polling Kinesis stream [${streamName}] (${stream.shardIds.length} shards)...`);
		this.log("press <any key> to stop");
		await pollKinesis(streamName, stream.shardIds);
    
		process.exit(0);
	}
}

TailKinesisCommand.description = "Tails the records going into a Kinesis stream";
TailKinesisCommand.flags = {
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

const describeStream = async (streamName) => {
	const Kinesis = new AWS.Kinesis();
	const resp = await Kinesis.describeStream({
		StreamName: streamName
	}).promise();
  
	return {
		arn: resp.StreamDescription.StreamARN,
		status: resp.StreamDescription.StreamStatus,
		shardIds: resp.StreamDescription.Shards.map(x => x.ShardId)
	};
};

const pollKinesis = async (streamName, shardIds) => {
	const Kinesis = new AWS.Kinesis({
		maxRetries: 20,
		// lots more retries, always 250ms apart so not to be retrying
		// too quickly as Kinesis only gives you 5 reads per sec per shard
		// and if you have lots of Lambda functions reading from the stream
		// already then it's likely you'll have to retry a lot to get
		// records from the stream
		retryDelayOptions: { 
			base: 250,
			customBackoff: () => 250
		}
	});
  
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
		const iteratorResp = await Kinesis.getShardIterator({
			ShardId: shardId,
			StreamName: streamName,
			ShardIteratorType: "LATEST"
		}).promise();
    
		let shardIterator = iteratorResp.ShardIterator;
    
		// eslint-disable-next-line no-constant-condition
		while (polling) {
			const resp = await Kinesis.getRecords({
				ShardIterator: shardIterator,
				Limit: 10
			}).promise();

			if (!_.isEmpty(resp.Records)) {
				resp.Records.forEach(show);
			}
      
			shardIterator = resp.NextShardIterator;
		}
	});

	await Promise.all(promises);
  
	console.log("stopped");
};

const show = (record) => {
	const timestamp = new Date().toJSON().grey.bold.bgWhite;
	console.log(timestamp);
  
	const buffer = Buffer.from(record.Data, "base64");

	let data;
	try {
		data = zlib.gunzipSync(buffer).toString("utf8");
	} catch (_error) {
		data = buffer.toString("utf8");
	}
      
	try {
		const obj = JSON.parse(data);
		console.log(JSON.stringify(obj, undefined, 2));
	} catch (_error) {
		console.log(data);  
	}
};

module.exports = TailKinesisCommand;
