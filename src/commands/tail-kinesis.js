const _ = require("lodash");
const AWS = require("aws-sdk");
const {Command, flags} = require("@oclif/command");

class TailKinesisCommand extends Command {
	async run() {
		const {flags} = this.parse(TailKinesisCommand);
		const {streamName, region} = flags;

		AWS.config.region = region;

		this.log(`checking Kinesis stream [${streamName}] in [${region}]`);
		const stream = await describeStream(streamName);
    
		this.log(`polling Kinesis stream [${streamName}] (${stream.shardIds.length} shards)...`);
		await pollKinesis(streamName, stream.shardIds);
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
	const Kinesis = new AWS.Kinesis();
	const promises = shardIds.map(async (shardId) => {
		const iteratorResp = await Kinesis.getShardIterator({
			ShardId: shardId,
			StreamName: streamName,
			ShardIteratorType: "LATEST"
		}).promise();
    
		let shardIterator = iteratorResp.ShardIterator;
    
		// eslint-disable-next-line no-constant-condition
		while (true) {
			const resp = await Kinesis.getRecords({
				ShardIterator: shardIterator,
				Limit: 10
			}).promise();
      
			if (!_.isEmpty(resp.Records)) {
				resp.Records.forEach(record => {
					const data = Buffer.from(record.Data, "base64").toString("utf-8");
					console.log(data);
				});
			}
      
			shardIterator = resp.NextShardIterator;
		}
	});

	await Promise.all(promises);
};

module.exports = TailKinesisCommand;
