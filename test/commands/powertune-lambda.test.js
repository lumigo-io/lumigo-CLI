const _ = require("lodash");
const { expect, test } = require("@oclif/test");
const AWS = require("aws-sdk");
const fs = require("fs");
const inquirer = require("inquirer");
const childProcess = require("child_process");

const mockListApplicationVersions = jest.fn();
AWS.ServerlessApplicationRepository.prototype.listApplicationVersions = mockListApplicationVersions;
const mockCreateCloudFormationTemplate = jest.fn();
AWS.ServerlessApplicationRepository.prototype.createCloudFormationTemplate = mockCreateCloudFormationTemplate;
const mockGetCloudFormationTemplate = jest.fn();
AWS.ServerlessApplicationRepository.prototype.getCloudFormationTemplate = mockGetCloudFormationTemplate;
const mockDescribeStacks = jest.fn();
AWS.CloudFormation.prototype.describeStacks = mockDescribeStacks;
const mockCreateStack = jest.fn();
AWS.CloudFormation.prototype.createStack = mockCreateStack;
const mockUpdateStack = jest.fn();
AWS.CloudFormation.prototype.updateStack = mockUpdateStack;
const mockStartExecution = jest.fn();
AWS.StepFunctions.prototype.startExecution = mockStartExecution;
const mockDescribeExecution = jest.fn();
AWS.StepFunctions.prototype.describeExecution = mockDescribeExecution;
const mockReadFileSync = jest.fn();
const mockWriteFileSync = jest.fn();
const mockPrompt = jest.fn();
inquirer.prompt = mockPrompt;
const mockExecSync = jest.fn();
childProcess.execSync = mockExecSync;

const consoleLog = jest.fn();
console.log = consoleLog;

const fileContent = JSON.stringify({
	foo: "bar"
});

beforeEach(() => {
	mockCreateCloudFormationTemplate.mockReturnValueOnce({
		promise: () =>
			Promise.resolve({
				TemplateId: "template-id"
			})
	});

	mockCreateStack.mockReturnValueOnce({
		promise: () => Promise.resolve({})
	});

	mockUpdateStack.mockReturnValueOnce({
		promise: () => Promise.resolve({})
	});

	mockStartExecution.mockReturnValueOnce({
		promise: () =>
			Promise.resolve({
				executionArn: "execution-arn"
			})
	});

	mockReadFileSync.mockReturnValueOnce(fileContent);
	mockWriteFileSync.mockReturnValueOnce();
	mockPrompt.mockImplementation(() => ({ visualize: "no" }));
	mockExecSync.mockImplementation(() => "");
});

afterEach(() => {
	mockListApplicationVersions.mockReset();
	mockCreateCloudFormationTemplate.mockReset();
	mockGetCloudFormationTemplate.mockReset();
	mockDescribeStacks.mockReset();
	mockCreateStack.mockReset();
	mockUpdateStack.mockReset();
	mockStartExecution.mockReset();
	mockDescribeExecution.mockReset();
	consoleLog.mockReset();
	mockReadFileSync.mockReset();
	mockWriteFileSync.mockReset();
	mockPrompt.mockReset();
	mockExecSync.mockReset();
});

const stateMachineArn = "arn:aws:states:us-east-1:123:execution:powerTuningStateMachine";

describe("powertune-lambda", () => {
	const command = [
		"powertune-lambda",
		"-n",
		"my-function",
		"-s",
		"speed",
		"-r",
		"us-east-1"
	];

	describe("if there are more than one page of versions", () => {
		beforeEach(() => {
			givenListAppVersionsReturns(["0.0.1", "0.1.0", "1.0.0"], true);
			givenListAppVersionsReturns(["1.0.1"]);
			givenDescribeStacksReturns("CREATE_COMPLETE", "1.0.1", stateMachineArn);
			givenDescribeExecutionReturns("SUCCEEDED", {});
		});

		test.stdout()
			.command(command)
			.it("fetches all pages and pick the highest versions", () => {
				expect(mockListApplicationVersions.mock.calls).to.have.length(2);

				// if it picked the highest version, and then the current stack returns the same
				// version then we wouldn't try to deploy the SAR again
				expect(mockCreateCloudFormationTemplate.mock.calls).to.be.empty;
			});
	});

	describe("if SAR has not been deployed before", () => {
		beforeEach(() => {
			givenListAppVersionsReturns(["0.0.1", "0.1.0", "1.0.0"]);
			givenDescribeStacksThrows(); // check SAR is deployed
			givenDescribeStacksReturns("CREATE_COMPLETE", "1.0.0", stateMachineArn); // when deploying SAR
			givenGetCloudFormationTemplateReturns("ACTIVE");
			givenDescribeExecutionReturns("SUCCEEDED", {});
		});

		test.stdout()
			.command(command)
			.it("deploys latest version of SAR", () => {
				expect(mockListApplicationVersions.mock.calls).to.have.length(1);
				expect(mockCreateCloudFormationTemplate.mock.calls).to.have.length(1);
				expect(mockCreateStack.mock.calls).to.have.length(1);
				expect(mockUpdateStack.mock.calls).to.be.empty;
				expect(mockGetCloudFormationTemplate.mock.calls).to.have.length(1);
			});
	});

	describe("if SAR has been deployed but is an old version", () => {
		beforeEach(() => {
			givenListAppVersionsReturns(["0.0.1", "0.1.0", "1.0.0"]);
			givenDescribeStacksReturns("CREATE_COMPLETE", "0.1.0", stateMachineArn); // check SAR is deployed
			givenDescribeStacksReturns("UPDATE_COMPLETE", "1.0.0", stateMachineArn); // when deploying SAR
			givenGetCloudFormationTemplateReturns("ACTIVE");
			givenDescribeExecutionReturns("SUCCEEDED", {});
		});

		test.stdout()
			.command(command)
			.it("deploys latest version of SAR", () => {
				expect(mockListApplicationVersions.mock.calls).to.have.length(1);
				expect(mockCreateCloudFormationTemplate.mock.calls).to.have.length(1);
				expect(mockCreateStack.mock.calls).to.be.empty;
				expect(mockUpdateStack.mock.calls).to.have.length(1);
				expect(mockGetCloudFormationTemplate.mock.calls).to.have.length(1);
			});
	});

	describe("when the SAR CloudFormation template is not ready yet", () => {
		beforeEach(() => {
			givenListAppVersionsReturns(["0.0.1", "0.1.0", "1.0.0"]);
			givenDescribeStacksThrows(); // check SAR is deployed
			givenDescribeStacksReturns("CREATE_COMPLETE", "1.0.0", stateMachineArn); // when deploying SAR
			givenGetCloudFormationTemplateReturns("PREPARING");
			givenGetCloudFormationTemplateReturns("ACTIVE");
			givenDescribeExecutionReturns("SUCCEEDED", {});
		});

		test.stdout()
			.command(command)
			.it("retries after 1s", () => {
				expect(mockListApplicationVersions.mock.calls).to.have.length(1);
				expect(mockCreateCloudFormationTemplate.mock.calls).to.have.length(1);
				expect(mockCreateStack.mock.calls).to.have.length(1);
				expect(mockGetCloudFormationTemplate.mock.calls).to.have.length(2);
			});
	});

	describe("when the CloudFormation create is not finished yet", () => {
		beforeEach(() => {
			givenListAppVersionsReturns(["0.0.1", "0.1.0", "1.0.0"]);
			givenDescribeStacksThrows(); // check SAR is deployed
			givenDescribeStacksReturns("CREATE_IN_PROGRESS"); // when deploying SAR
			givenDescribeStacksReturns("CREATE_COMPLETE", "1.0.0", stateMachineArn); // when deploying SAR
			givenGetCloudFormationTemplateReturns("ACTIVE");
			givenDescribeExecutionReturns("SUCCEEDED", {});
		});

		test.stdout()
			.command(command)
			.it("retries after 1s", () => {
				expect(mockListApplicationVersions.mock.calls).to.have.length(1);
				expect(mockCreateCloudFormationTemplate.mock.calls).to.have.length(1);
				expect(mockCreateStack.mock.calls).to.have.length(1);
				expect(mockDescribeStacks.mock.calls).to.have.length(3);
				expect(mockGetCloudFormationTemplate.mock.calls).to.have.length(1);
			});
	});

	describe("when the state machine execution is not finished yet", () => {
		beforeEach(() => {
			givenListAppVersionsReturns(["0.0.1", "0.1.0", "1.0.0"]);
			givenDescribeStacksThrows(); // check SAR is deployed
			givenDescribeStacksReturns("CREATE_COMPLETE", "1.0.0", stateMachineArn); // when deploying SAR
			givenGetCloudFormationTemplateReturns("ACTIVE");
			givenDescribeExecutionReturns("RUNNING", {});
			givenDescribeExecutionReturns("SUCCEEDED", {});
		});

		test.stdout()
			.command(command)
			.it("retries after 1s", () => {
				expect(mockListApplicationVersions.mock.calls).to.have.length(1);
				expect(mockCreateCloudFormationTemplate.mock.calls).to.have.length(1);
				expect(mockCreateStack.mock.calls).to.have.length(1);
				expect(mockGetCloudFormationTemplate.mock.calls).to.have.length(1);
				expect(mockDescribeExecution.mock.calls).to.have.length(2);
			});
	});

	describe("when the CloudFormation deployment errs", () => {
		beforeEach(() => {
			givenListAppVersionsReturns(["0.0.1", "0.1.0", "1.0.0"]);
			givenDescribeStacksThrows(); // check SAR is deployed
			givenDescribeStacksReturns("ROLLBACK_COMPLETE"); // when deploying SAR
			givenGetCloudFormationTemplateReturns("ACTIVE");
		});

		test.stdout()
			.command(command)
			.catch("deployment failed, stack is in [ROLLBACK_COMPLETE] status")
			.it("rethrows the error", () => {
				expect(mockListApplicationVersions.mock.calls).to.have.length(1);
				expect(mockCreateCloudFormationTemplate.mock.calls).to.have.length(1);
				expect(mockGetCloudFormationTemplate.mock.calls).to.have.length(1);
				expect(mockCreateStack.mock.calls).to.have.length(1);
			});
	});

	describe("when the state machine execution errs", () => {
		beforeEach(() => {
			givenListAppVersionsReturns(["0.0.1", "0.1.0", "1.0.0"]);
			givenDescribeStacksThrows(); // check SAR is deployed
			givenDescribeStacksReturns("CREATE_COMPLETE", "1.0.0", stateMachineArn); // when deploying SAR
			givenGetCloudFormationTemplateReturns("ACTIVE");
			givenDescribeExecutionReturns("FAILED", {});
		});

		test.stdout()
			.command(command)
			.catch("execution failed [FAILED]: {}")
			.it("rethrows the error", () => {
				expect(mockListApplicationVersions.mock.calls).to.have.length(1);
				expect(mockCreateCloudFormationTemplate.mock.calls).to.have.length(1);
				expect(mockGetCloudFormationTemplate.mock.calls).to.have.length(1);
				expect(mockCreateStack.mock.calls).to.have.length(1);
				expect(mockDescribeExecution.mock.calls).to.have.length(1);
			});
	});

	describe("when the user provides a file as payload", () => {
		beforeEach(() => {
			// not sure why, but if I monkeypatch fs in global then all the tests
			// fail with "globby.sync is not a function"
			// hence why I'm monkeypatching in the test instead
			fs.readFileSync = mockReadFileSync;
			givenListAppVersionsReturns(["0.0.1", "0.1.0", "1.0.0"]);
			givenDescribeStacksReturns("CREATE_COMPLETE", "1.0.0", stateMachineArn);
			givenDescribeExecutionReturns("SUCCEEDED", {});
		});

		test.stdout()
			.command([
				"powertune-lambda",
				"-n",
				"my-function",
				"-s",
				"speed",
				"-r",
				"us-east-1",
				"-f",
				"input.json"
			])
			.it("sends the file content as payload instead", () => {
				expect(mockReadFileSync.mock.calls).to.have.length(1);
				const [req] = mockStartExecution.mock.calls[0];
				const input = JSON.parse(req.input);
				expect(input.payload).to.equal(fileContent);
			});
	});

	describe("when the user provides a file as output", () => {
		beforeEach(() => {
			// not sure why, but if I monkeypatch fs in global then all the tests
			// fail with "globby.sync is not a function"
			// hence why I'm monkeypatching in the test instead
			fs.writeFileSync = mockWriteFileSync;
			givenListAppVersionsReturns(["0.0.1", "0.1.0", "1.0.0"]);
			givenDescribeStacksReturns("CREATE_COMPLETE", "1.0.0", stateMachineArn);
			givenDescribeExecutionReturns("SUCCEEDED", {});
		});

		test.stdout()
			.command([
				"powertune-lambda",
				"-n",
				"my-function",
				"-s",
				"speed",
				"-r",
				"us-east-1",
				"-o",
				"output.json"
			])
			.it("writes the response to file", () => {
				expect(mockWriteFileSync.mock.calls).to.have.length(1);
			});
	});

	describe("when user chooses to visualize the result", () => {
		beforeEach(() => {
			givenListAppVersionsReturns(["0.0.1", "0.1.0", "1.0.0"]);
			givenDescribeStacksReturns("CREATE_COMPLETE", "1.0.0", stateMachineArn);
			givenDescribeExecutionReturns("SUCCEEDED", {
				stateMachine: {
					visualization: "https://lambda-power-tuning.show/#123"
				}
			});
			givenUserChooseToVisualizeResult();
		});

		test.stdout()
			.command([
				"powertune-lambda",
				"-n",
				"my-function",
				"-s",
				"speed",
				"-r",
				"us-east-1"
			])
			.it("opens the browser with Python", () => {
				const commands = _.flatMap(mockExecSync.mock.calls).join("\n");
				expect(commands).to.contain([
					'python -m webbrowser "https://lambda-power-tuning.show/#123"'
				]);
			});

		describe("if python is not available", () => {
			beforeEach(() => {
				givenListAppVersionsReturns(["0.0.1", "0.1.0", "1.0.0"]);
				givenDescribeStacksReturns("CREATE_COMPLETE", "1.0.0", stateMachineArn);
				givenDescribeExecutionReturns("SUCCEEDED", {
					stateMachine: {
						visualization: "https://lambda-power-tuning.show/#123"
					}
				});
				givenUserChooseToVisualizeResult();
				mockExecSync.mockImplementation(cmd => {
					if (cmd.startsWith("python")) {
						throw new Error("python: command not found");
					} else {
						return "";
					}
				});
			});

			test.stdout()
				.command([
					"powertune-lambda",
					"-n",
					"my-function",
					"-s",
					"speed",
					"-r",
					"us-east-1"
				])
				.it("opens the browser with native 'open' command", () => {
					const commands = _.flatMap(mockExecSync.mock.calls).join("\n");
					expect(commands).to.contain([
						'open "https://lambda-power-tuning.show/#123"'
					]);
				});
		});
	});
});

function givenListAppVersionsReturns(versions, hasMore = false) {
	const versionDetails = versions.map(v => ({
		SemanticVersion: v
	}));
	mockListApplicationVersions.mockReturnValueOnce({
		promise: () =>
			Promise.resolve({
				Versions: versionDetails,
				NextToken: hasMore ? "more" : undefined
			})
	});
}

function givenDescribeStacksThrows() {
	mockDescribeStacks.mockReturnValueOnce({
		promise: () => Promise.reject(new Error())
	});
}

function givenDescribeStacksReturns(status, version, stateMachineARN) {
	const tags = [];
	const outputs = [];

	if (version) {
		tags.push({
			Key: "serverlessrepo:semanticVersion",
			Value: version
		});
	}

	if (stateMachineARN) {
		outputs.push({
			OutputKey: "StateMachineARN",
			OutputValue: stateMachineARN
		});
	}

	mockDescribeStacks.mockReturnValueOnce({
		promise: () =>
			Promise.resolve({
				Stacks: [
					{
						StackStatus: status,
						Tags: tags,
						Outputs: outputs
					}
				]
			})
	});
}

function givenGetCloudFormationTemplateReturns(status) {
	mockGetCloudFormationTemplate.mockReturnValueOnce({
		promise: () =>
			Promise.resolve({
				Status: status,
				TemplateUrl: "http://template-url.com"
			})
	});
}

function givenDescribeExecutionReturns(status, output) {
	mockDescribeExecution.mockReturnValueOnce({
		promise: () =>
			Promise.resolve({
				status: status,
				output: JSON.stringify(output)
			})
	});
}

function givenUserChooseToVisualizeResult() {
	mockPrompt.mockImplementation(() => ({ visualize: "yes" }));
}
