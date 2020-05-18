const _ = require("lodash");
const fs = require("fs");
const { getAWSSDK } = require("../lib/aws");
const humanize = require("humanize");
const { Command, flags } = require("@oclif/command");
const { checkVersion } = require("../lib/version-check");
const async = require("async");
const { track } = require("../lib/analytics");
require("colors");

class S3SelectBatchCommand extends Command {
	async run() {
		const { flags } = this.parse(S3SelectBatchCommand);
		const {
			bucket,
			prefix,
			expression,
			concurrency,
			region,
			profile,
			httpProxy
		} = flags;
		const { fileType, compressionType, csvConfig, jsonConfig } = flags;
		const { outputCsvConfig, outputJsonConfig, outputFile } = flags;

		global.region = region;
		global.profile = profile;
		global.httpProxy = httpProxy;

		checkVersion();

		track("s3-select-batch", { region, concurrency });

		this.log(`finding objects with prefix of [${prefix}] in the bucket [${bucket}]`);
		const { keys, totalSize } = await this.getObjectKeys(bucket, prefix);

		if (_.isEmpty(keys)) {
			this.log("no objects found, skipped...");
			return;
		}

		this.log(
			`found ${keys.length} objects, with a total size of ${humanize.filesize(
				totalSize
			)}`
		);

		this.log(`running S3 Select with concurrency of [${concurrency}]...`);

		const inputSerialization = { CompressionType: compressionType };
		const outputSerialization = {};
		switch (fileType) {
			case "CSV":
				inputSerialization.CSV = JSON.parse(csvConfig);
				outputSerialization.CSV = JSON.parse(outputCsvConfig);
				break;
			case "JSON":
				inputSerialization.JSON = JSON.parse(jsonConfig);
				outputSerialization.JSON = JSON.parse(outputJsonConfig);
				break;
			case "Parquet":
				inputSerialization.Parquet = {};
				break;
		}

		await this.runS3Select(
			bucket,
			keys,
			expression,
			inputSerialization,
			outputSerialization,
			outputFile,
			concurrency
		);

		this.log("all done!".green);
	}

	async getObjectKeys(Bucket, Prefix) {
		const AWS = getAWSSDK();
		const S3 = new AWS.S3();

		let allKeys = [];
		let totalSize = 0;
		let response = {};
		do {
			const params = response.ContinuationToken
				? { Bucket, Prefix, ContinuationToken: response.ContinuationToken }
				: { Bucket, Prefix };
			response = await S3.listObjectsV2(params).promise();

			const keys = response.Contents.map(x => x.Key);
			allKeys = allKeys.concat(keys);
			totalSize += _.sumBy(response.Contents, x => x.Size);
		} while (response.ContinuationToken);

		return {
			keys: allKeys,
			totalSize
		};
	}

	async runS3Select(
		bucket,
		keys,
		expression,
		inputSerialization,
		outputSerialization,
		outputFile,
		concurrency
	) {
		const AWS = getAWSSDK();
		const S3 = new AWS.S3();

		const request = {
			Bucket: bucket,
			Expression: expression,
			ExpressionType: "SQL",
			InputSerialization: inputSerialization,
			OutputSerialization: outputSerialization
		};

		this.log(
			`
NOTE: you might have to customize the 'InputSerialization' and 'OutputSerialization' 
based on the files you are trying to query.
run 'lumigo-cli s3-select-batch -h' to see the available config options.
see https://amzn.to/2R8Ba2z for more details on S3 Select query parameters.
`.yellow
		);
		this.log(JSON.stringify(request, null, 2));
		this.log("\n------------------------------------\n");

		// function to write the Buffer payload
		let writeRecord, finalize;
		if (outputFile) {
			const fd = fs.openSync(outputFile, "w");
			writeRecord = r => fs.writeSync(fd, r + "\n");
			finalize = () => fs.closeSync(fd);
		} else {
			writeRecord = r => this.log(r);
			finalize = () => {};
		}

		const asyncQueue = async.queue(async key => {
			try {
				const resp = await S3.selectObjectContent(
					Object.assign({}, request, { Key: key })
				).promise();

				const eventStream = resp.Payload;
				await new Promise((resolve, reject) => {
					eventStream.on("data", function(event) {
						if (event.Records) {
							const data = event.Records.Payload.toString("utf8");
							writeRecord(data);
						}
					});
					eventStream.on("error", err => reject(err));
					eventStream.on("end", () => resolve());
				});
			} catch (error) {
				console.error(error);
			}
		}, concurrency);

		keys.forEach(key => asyncQueue.push(key));
		await asyncQueue.drain();

		finalize();
	}
}

S3SelectBatchCommand.description =
	"Runs S3 Select on a batch of S3 objects, e.g. by prefix";
S3SelectBatchCommand.flags = {
	bucket: flags.string({
		char: "b",
		description: "name of the S3 bucket",
		required: true
	}),
	prefix: flags.string({
		char: "x",
		description: "object prefix",
		required: true
	}),
	concurrency: flags.integer({
		char: "c",
		description: "how many concurrent S3 Select operations to run",
		required: false,
		default: 10
	}),
	expression: flags.string({
		char: "e",
		description: "the expression used to query each object",
		required: true
	}),
	fileType: flags.string({
		char: "f",
		description: "What format are the files in? CSV, JSON, or Parquet",
		options: ["CSV", "JSON", "Parquet"],
		required: true
	}),
	csvConfig: flags.string({
		description: "JSON config on how to parse CSV files",
		exclusive: ["jsonConfig"],
		required: false,
		default: "{}"
	}),
	jsonConfig: flags.string({
		description: "JSON config on how to parse JSON files",
		exclusive: ["csvConfig"],
		required: false,
		default: '{"Type": "DOCUMENT"}'
	}),
	outputFile: flags.string({
		char: "o",
		description:
			"output filename, if omitted, records would be printed in the console",
		required: false
	}),
	outputCsvConfig: flags.string({
		description: "JSON config on how to format the output file in CSV",
		exclusive: ["outputJsonConfig"],
		required: false,
		default: "{}"
	}),
	outputJsonConfig: flags.string({
		description: "JSON config on how to format the output file in JSON",
		exclusive: ["outputCsvConfig"],
		required: false,
		default: "{}"
	}),
	compressionType: flags.enum({
		description: "the objects' compression format - NONE, GZIP or BZIP2",
		options: ["NONE", "GZIP", "BZIP2"],
		default: "NONE"
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
	httpProxy: flags.string({
		description: "URL of the http/https proxy (when running in a corporate network)",
		required: false
	})
};

module.exports = S3SelectBatchCommand;
