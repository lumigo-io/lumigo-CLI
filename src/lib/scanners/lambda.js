const _ = require("lodash");
const { getAWSSDK } = require("./../aws");
const Async = require("async");
const Retry = require("async-retry");

const regions = [
	"us-east-1",
	"us-east-2",
	"us-west-1",
	"us-west-2",
	// "ap-south-1",
	// "ap-northeast-1",
	// "ap-northeast-2",
	// "ap-southeast-1",
	// "ap-southeast-2",
	// "ca-central-1",
	"eu-central-1",
	"eu-west-1",
	"eu-west-2"
	// "eu-west-3",
	// "eu-south-1",
	// "eu-north-1",
	// "sa-east-1"
];

const getLambdaFunctionsInRegion = async region => {
	const AWS = getAWSSDK({ region });
	const Lambda = new AWS.Lambda({
		region,
		maxRetries: 15
	});

	const getFunctions = async () => {
		const loop = async (acc = [], marker) => {
			const resp = await Retry(() =>
				Lambda.listFunctions({
					Marker: marker,
					MaxItems: 50
				}).promise()
			);

			if (_.isEmpty(resp.Functions)) {
				return acc;
			}

			for (const func of resp.Functions) {
				const functionDetails = {
					region: region,
					functionArn: func.FunctionArn,
					functionName: func.FunctionName,
					runtime: func.Runtime,
					memorySize: func.MemorySize,
					codeSize: func.CodeSize,
					lastModified: func.LastModified,
					timeout: func.Timeout
				};

				acc.push(functionDetails);
			}

			if (resp.NextMarker) {
				return await loop(acc, resp.NextMarker);
			} else {
				return acc;
			}
		};

		return loop();
	};

	const functions = await getFunctions();
	return await Async.mapLimit(functions, 3, async ({ functionArn, functionName }) => {
		const { Code, Configuration, Concurrency, Tags } = await Retry(() =>
			Lambda.getFunction({
				FunctionName: functionName
			}).promise()
		);

		const { EventSourceMappings } = await Retry(() =>
			Lambda.listEventSourceMappings({
				FunctionName: functionName
			}).promise()
		);

		const {
			FunctionEventInvokeConfigs
		} = await Lambda.listFunctionEventInvokeConfigs({
			FunctionName: functionName
		})
			.promise()
			.catch(() => {
				return { FunctionEventInvokeConfigs: [] };
			});

		const Policy = await Lambda.getPolicy({
			FunctionName: functionName
		})
			.promise()
			.catch(() => {
				return undefined;
			});

		const {
			ProvisionedConcurrencyConfigs
		} = await Lambda.listProvisionedConcurrencyConfigs({
			FunctionName: functionName
		})
			.promise()
			.catch(() => {
				return { ProvisionedConcurrencyConfigs: [] };
			});

		return {
			Region: region,
			Arn: functionArn,
			Concurrency,
			Code,
			Configuration,
			Tags,
			EventSourceMappings,
			EventInvokeConfig: _.get(FunctionEventInvokeConfigs, "[0]"),
			Policy,
			ProvisionedConcurrencyConfigs
		};
	});
};

const getLambdaFunctions = async () => {
	const promises = regions.map(region =>
		getLambdaFunctionsInRegion(region)
			.then(funcs => {
				if (funcs.length > 0) {
					console.debug("found Lambda functions", {
						region,
						count: funcs.length
					});
				}

				return funcs;
			})
			.catch(err => {
				console.error(
					"failed to get Lambda functions, skipped...",
					{ region },
					err
				);
				return [];
			})
	);
	return {
		lambda: _.flatten(await Promise.all(promises))
	};
};

module.exports = {
	getLambdaFunctions
};
