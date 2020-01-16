const { getAWSSDK } = require("./aws");
const Retry = require("async-retry");
const uuid = require("uuid/v4");

const ONE_SECOND = 1000;

const startStateMachine = async (stateMachineArn, input) => {
	const AWS = getAWSSDK();
	const StepFunctions = new AWS.StepFunctions();
	const resp = await StepFunctions.startExecution({
		stateMachineArn: stateMachineArn,
		name: uuid(),
		input: input
	}).promise();

	return resp.executionArn;
};

const waitForStateMachineOutput = async executionArn => {
	const AWS = getAWSSDK();
	const StepFunctions = new AWS.StepFunctions();
	const FailedStates = ["FAILED", "TIMED_OUT", "ABORTED"];

	return await Retry(
		async bail => {
			const resp = await StepFunctions.describeExecution({
				executionArn: executionArn
			}).promise();

			if (FailedStates.includes(resp.status)) {
				bail(new Error(`execution failed [${resp.status}]: ${resp.output}`));
			} else if (resp.status === "SUCCEEDED") {
				return JSON.parse(resp.output);
			} else {
				throw new Error("still running...");
			}
      
			process.stdout.write("\n");
		},
		{
			retries: 10800, // 3 hour
			factor: 1,
			minTimeout: ONE_SECOND,
			maxTimeout: ONE_SECOND,
			onRetry: (_e, attempt) => {
				if (attempt % 10 === 0) {
					process.stdout.write(".");
				}
			}
		}
	);
};

module.exports = {
	startStateMachine,
	waitForStateMachineOutput
};
