const _ = require("lodash");
const { getAWSSDK } = require("../lib/aws");
const Retry = require("async-retry");
const { ClearResult } = require("./utils");

const regions = [
	"us-east-1",
	"us-east-2",
	"us-west-1",
	"us-west-2",
	"ap-south-1",
	"ap-northeast-1",
	"ap-northeast-2",
	"ap-southeast-1",
	"ap-southeast-2",
	"ca-central-1",
	"eu-central-1",
	"eu-west-1",
	"eu-west-2",
	"eu-west-3",
	"eu-north-1",
	"sa-east-1"
];

const getFunctionInRegion = async (functionName, region) => {
	const AWS = getAWSSDK();
	const Lambda = new AWS.Lambda({ region });

	const resp = await Lambda.getFunctionConfiguration({
		FunctionName: functionName
	}).promise();

	return {
		region,
		functionName: resp.FunctionName,
		runtime: resp.Runtime,
		memorySize: resp.MemorySize,
		codeSize: resp.CodeSize,
		lastModified: resp.LastModified,
		timeout: resp.Timeout
	};
};

const getFunctionsInRegion = async (region, AWS) => {
	const Lambda = new AWS.Lambda({ region });

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

const getAllFunctionsCount = async AWS => {
	const allFunctionsPromises = regions.map(region => getFunctionsInRegion(region, AWS));
	const allFunctions = await Promise.all(allFunctionsPromises);

	return _.flatten(allFunctions).length;
};

const deleteFunction = async (functionDetails, AWS) => {
	const Lambda = new AWS.Lambda({ region: functionDetails.region });
	await Lambda.deleteFunction({ FunctionName: functionDetails.functionName }).promise();
};

const deleteAllFunctions = async AWS => {
	const allFunctionsPromises = regions.map(region => getFunctionsInRegion(region, AWS));
	const allFunctions = await Promise.all(allFunctionsPromises);
	const deletionPromises = _.flatten(allFunctions).map(async functionDetails => {
		try {
			await deleteFunction(functionDetails, AWS);
			process.stdout.write(".".green);
			return ClearResult.getSuccess(functionDetails.functionName, functionDetails.region);
		} catch (e) {
			process.stdout.write("F".red);
			return ClearResult.getFailed(functionDetails.functionName, functionDetails.region, e);
		}
	});

	return await Promise.all(deletionPromises);
};

module.exports = {
	regions,
	getFunctionInRegion,
	getFunctionsInRegion,
	getAllFunctionsCount: getAllFunctionsCount,
	deleteAllFunctions: deleteAllFunctions
};
