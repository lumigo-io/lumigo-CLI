const _ = require("lodash");
const AWS = require("aws-sdk");
const Table = require("cli-table");
const {Command, flags} = require("@oclif/command");
const {checkVersion} = require("../lib/version-check");

class ListKinesisShardsCommand extends Command {
	async run() {
		const {flags} = this.parse(ListKinesisShardsCommand);
		const {streamName, region, profile} = flags;
    
		AWS.config.region = region;
		if (profile) {
			const credentials = new AWS.SharedIniFileCredentials({ profile });
			AWS.config.credentials = credentials;
		}

		checkVersion();

		this.log(`checking Kinesis stream [${streamName}] in [${region}]`);
		const stream = await describeStream(streamName);

		this.log(`arn: ${stream.arn}`);
		this.log(`status: ${stream.status}`);
		this.log("shards:");    
		show(stream.shards);
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

const describeStream = async (streamName) => {
	const Kinesis = new AWS.Kinesis();
	const resp = await Kinesis.describeStream({
		StreamName: streamName
	}).promise();
  
	return {
		arn: resp.StreamDescription.StreamARN,
		status: resp.StreamDescription.StreamStatus,
		shards: resp.StreamDescription.Shards//.map(x => ({
	};
};

const show = (shards) => {
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
  
	console.log(table.toString());
};

module.exports = ListKinesisShardsCommand;
